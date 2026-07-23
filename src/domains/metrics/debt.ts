import type {
  ArchitectureSnapshot,
  Commit,
  DebtSignal,
  FileRecord,
  MetricSeries,
  ModuleMeta,
  TreeSample,
} from "@/domains/schemas";
import { isSourceFile, isTestPath } from "@/domains/analysis/classify";

export interface DebtInput {
  commits: Commit[];
  snapshots: ArchitectureSnapshot[];
  fileRecords: FileRecord[];
  modules: Record<string, ModuleMeta>;
  latestTree: TreeSample;
  metricSeries: MetricSeries[];
}

/**
 * Debt signals are observable proxies, never a single opaque score.
 * Each signal carries its computation method and concrete evidence so users
 * can audit every claim.
 */
export function computeDebtSignals(input: DebtInput): DebtSignal[] {
  const signals: DebtSignal[] = [
    ...churnConcentration(input),
    ...complexityGrowth(input),
    ...coupling(input),
    ...dependencyCycles(input),
    ...oversizedFiles(input),
    ...bugfixDensity(input),
    ...testRatioDecline(input),
    ...revertFrequency(input),
    ...ownershipConcentration(input),
    ...abandonedModules(input),
    ...todoGrowth(input),
    ...volatileSubsystems(input),
  ];
  const rank = { high: 0, medium: 1, low: 2 };
  return signals.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function slope(points: { t: string; v: number }[]): number {
  if (points.length < 2) return 0;
  const half = Math.floor(points.length / 2);
  const early = points.slice(0, half).reduce((s, p) => s + p.v, 0) / half;
  const late =
    points.slice(half).reduce((s, p) => s + p.v, 0) / (points.length - half);
  if (early === 0) return late > 0 ? 1 : 0;
  return (late - early) / Math.abs(early);
}

function churnConcentration({ commits, fileRecords }: DebtInput): DebtSignal[] {
  const totalChurn = commits.reduce((s, c) => s + c.additions + c.deletions, 0);
  if (totalChurn === 0) return [];
  const hot = fileRecords.filter(
    (f) =>
      !f.deletedAt &&
      f.commitCount >= 6 &&
      f.totalChurn / totalChurn > 0.06 &&
      isSourceFile(f.path) &&
      !isTestPath(f.path),
  );
  if (hot.length === 0) return [];
  const share = hot.reduce((s, f) => s + f.totalChurn, 0) / totalChurn;
  return [
    {
      id: "debt:high-churn",
      type: "high-churn",
      title: "Churn concentrated in a few files",
      description: `${hot.length} file${hot.length > 1 ? "s" : ""} absorbed ${Math.round(share * 100)}% of all line changes — repeated modification of the same code is a classic maintenance-risk proxy.`,
      severity: share > 0.35 ? "high" : share > 0.2 ? "medium" : "low",
      trend: "stable",
      methodology:
        "Per-file additions+deletions summed across analyzed commits; flagged when a single file exceeds 6% of total churn with ≥6 commits.",
      evidence: {
        commits: hot.flatMap((f) => f.majorCommits.slice(0, 2)).slice(0, 8),
        files: hot.map((f) => f.path).slice(0, 6),
      },
      series: [],
    },
  ];
}

function complexityGrowth({ metricSeries }: DebtInput): DebtSignal[] {
  const series = metricSeries.find((s) => s.id === "complexity");
  if (!series || series.points.length < 3) return [];
  const growth = slope(series.points);
  if (growth < 0.15) return [];
  return [
    {
      id: "debt:complexity-growth",
      type: "complexity-growth",
      title: "Average complexity is rising",
      description: `Mean module complexity grew ~${Math.round(growth * 100)}% between the first and second half of the analyzed period.`,
      severity: growth > 0.5 ? "high" : growth > 0.3 ? "medium" : "low",
      trend: "rising",
      methodology:
        "Approximate cyclomatic complexity (branch/loop/handler count) averaged per snapshot; compared between the first and second half of snapshots.",
      evidence: { commits: [], files: [] },
      series: series.points,
      since: series.points[Math.floor(series.points.length / 2)].t,
    },
  ];
}

function coupling({ snapshots, modules }: DebtInput): DebtSignal[] {
  const latest = snapshots[snapshots.length - 1];
  const importEdges = latest.edges.filter((e) => e.kind === "import");
  if (importEdges.length === 0) return [];
  const fan = new Map<string, number>();
  for (const e of importEdges) {
    fan.set(e.source, (fan.get(e.source) ?? 0) + 1);
    fan.set(e.target, (fan.get(e.target) ?? 0) + 1);
  }
  const mean = [...fan.values()].reduce((s, v) => s + v, 0) / fan.size;
  const hubs = [...fan.entries()]
    .filter(([, degree]) => degree >= Math.max(5, mean * 2.5))
    .sort((a, b) => b[1] - a[1]);
  if (hubs.length === 0) return [];
  return [
    {
      id: "debt:coupling",
      type: "coupling",
      title: "Dependency concentration around hub modules",
      description: `${hubs.map(([id]) => modules[id]?.path ?? id).slice(0, 3).join(", ")} ${hubs.length > 1 ? "are" : "is"} connected to ${hubs[0][1]}+ modules — changes there ripple widely.`,
      severity: hubs[0][1] >= mean * 4 ? "high" : "medium",
      trend: "stable",
      methodology: `Module in/out-degree on the latest import graph; flagged at ≥2.5× the mean degree (mean: ${mean.toFixed(1)}).`,
      evidence: {
        commits: [],
        files: hubs.slice(0, 4).map(([id]) => modules[id]?.path ?? id),
      },
      series: [],
    },
  ];
}

function dependencyCycles({ snapshots, modules }: DebtInput): DebtSignal[] {
  const latest = snapshots[snapshots.length - 1];
  const adj = new Map<string, string[]>();
  for (const e of latest.edges) {
    if (e.kind !== "import") continue;
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
  }
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const stack: string[] = [];

  const dfs = (node: string) => {
    if (cycles.length >= 4) return;
    visiting.add(node);
    stack.push(node);
    for (const next of adj.get(node) ?? []) {
      if (visiting.has(next)) {
        cycles.push(stack.slice(stack.indexOf(next)));
      } else if (!done.has(next)) {
        dfs(next);
      }
    }
    stack.pop();
    visiting.delete(node);
    done.add(node);
  };
  for (const node of adj.keys()) if (!done.has(node)) dfs(node);
  if (cycles.length === 0) return [];

  const shortest = cycles.reduce((a, b) => (b.length < a.length ? b : a));
  return [
    {
      id: "debt:dependency-cycle",
      type: "dependency-cycle",
      title: `${cycles.length} circular dependenc${cycles.length > 1 ? "ies" : "y"} between modules`,
      description: `E.g. ${shortest.map((id) => modules[id]?.path ?? id).join(" → ")} → back to start. Cycles make modules impossible to change or test in isolation.`,
      severity: cycles.length > 2 || shortest.length === 2 ? "high" : "medium",
      trend: "stable",
      methodology:
        "Depth-first search over the latest module import graph; each reported path is an actual back-edge cycle.",
      evidence: {
        commits: [],
        files: shortest.map((id) => modules[id]?.path ?? id),
      },
      series: [],
    },
  ];
}

function oversizedFiles({ latestTree, fileRecords }: DebtInput): DebtSignal[] {
  const big = latestTree.files
    .filter(
      (f) =>
        isSourceFile(f.path) &&
        !isTestPath(f.path) &&
        (f.loc ?? 0) >= 450,
    )
    .sort((a, b) => (b.loc ?? 0) - (a.loc ?? 0));
  if (big.length === 0) return [];
  const churnByPath = new Map(fileRecords.map((f) => [f.path, f.totalChurn]));
  const worst = big[0];
  return [
    {
      id: "debt:oversized-file",
      type: "oversized-file",
      title: `${big.length} oversized source file${big.length > 1 ? "s" : ""}`,
      description: `${worst.path} is ${worst.loc?.toLocaleString()} lines${(churnByPath.get(worst.path) ?? 0) > 500 ? " and among the most-edited files" : ""}. Large files tend to accumulate mixed responsibilities.`,
      severity: (worst.loc ?? 0) > 900 ? "high" : big.length > 2 ? "medium" : "low",
      trend: "stable",
      methodology:
        "Line count per source file in the most recent tree snapshot; threshold 450 lines (excludes tests, vendored and generated files).",
      evidence: { commits: [], files: big.slice(0, 5).map((f) => f.path) },
      series: [],
    },
  ];
}

function bugfixDensity({ commits }: DebtInput): DebtSignal[] {
  const recent = commits.slice(-Math.max(20, Math.floor(commits.length / 4)));
  const fixes = recent.filter((c) =>
    /\b(fix(es|ed)?|bug|hotfix|regression)\b/i.test(c.message.split("\n")[0]),
  );
  const ratio = fixes.length / Math.max(1, recent.length);
  if (ratio < 0.3 || fixes.length < 5) return [];
  return [
    {
      id: "debt:bugfix-density",
      type: "bugfix-density",
      title: "High share of bug-fix commits recently",
      description: `${Math.round(ratio * 100)}% of the ${recent.length} most recent analyzed commits are fixes — sustained fix pressure often follows rushed feature work.`,
      severity: ratio > 0.45 ? "high" : "medium",
      trend: "rising",
      methodology:
        "Commit subjects matched against fix/bug/hotfix/regression keywords over the most recent quarter of analyzed commits.",
      evidence: {
        commits: fixes.slice(0, 8).map((c) => c.sha),
        files: [],
      },
      series: [],
      since: recent[0]?.date,
    },
  ];
}

function testRatioDecline({ metricSeries }: DebtInput): DebtSignal[] {
  const series = metricSeries.find((s) => s.id === "test-ratio");
  if (!series || series.points.length < 3) return [];
  const decline = slope(series.points);
  if (decline > -0.15) return [];
  return [
    {
      id: "debt:test-ratio-decline",
      type: "test-ratio-decline",
      title: "Test coverage proxy is falling behind",
      description: `Test-to-source line ratio dropped ~${Math.round(-decline * 100)}% between the first and second half of the analyzed period — source code is growing faster than its tests.`,
      severity: decline < -0.4 ? "high" : "medium",
      trend: "falling",
      methodology:
        "Test LOC ÷ source LOC per snapshot (path-based test detection); compared between the first and second half of snapshots. A proxy — it says nothing about test quality.",
      evidence: { commits: [], files: [] },
      series: series.points,
    },
  ];
}

function revertFrequency({ commits }: DebtInput): DebtSignal[] {
  const reverts = commits.filter((c) => /^revert\b/i.test(c.message));
  if (reverts.length < 3) return [];
  return [
    {
      id: "debt:revert-frequency",
      type: "revert-frequency",
      title: `${reverts.length} reverts in analyzed history`,
      description:
        "Frequent reverts suggest changes ship before their impact is understood.",
      severity: reverts.length / commits.length > 0.05 ? "high" : "low",
      trend: "stable",
      methodology: "Commit subjects beginning with “Revert”.",
      evidence: {
        commits: reverts.slice(0, 8).map((c) => c.sha),
        files: [],
      },
      series: [],
    },
  ];
}

function ownershipConcentration({ fileRecords }: DebtInput): DebtSignal[] {
  const risky = fileRecords.filter((f) => {
    if (f.deletedAt || f.commitCount < 8 || f.authors.length === 0) return false;
    const top = f.authors[0];
    return top.commits / f.commitCount >= 0.85 && isSourceFile(f.path);
  });
  if (risky.length < 2) return [];
  return [
    {
      id: "debt:ownership-concentration",
      type: "ownership-concentration",
      title: "Single-owner hotspots",
      description: `${risky.length} heavily-edited files have ≥85% of their commits from one author — a bus-factor risk for the knowledge they contain.`,
      severity: risky.length > 4 ? "medium" : "low",
      trend: "stable",
      methodology:
        "Top-author share of commits per file, over files with ≥8 analyzed commits.",
      evidence: {
        commits: [],
        files: risky.slice(0, 5).map((f) => f.path),
      },
      series: [],
    },
  ];
}

function abandonedModules({
  commits,
  snapshots,
  modules,
}: DebtInput): DebtSignal[] {
  if (snapshots.length < 3 || commits.length < 20) return [];
  const latest = snapshots[snapshots.length - 1];
  const spanMs =
    +new Date(commits[commits.length - 1].date) - +new Date(commits[0].date);
  if (spanMs <= 0) return [];
  const cutoff = +new Date(commits[commits.length - 1].date) - spanMs * 0.35;
  const lastTouch = new Map<string, number>();
  for (const c of commits) {
    for (const f of c.files) {
      for (const [id, meta] of Object.entries(modules)) {
        if (f.path.startsWith(meta.path + "/") || f.path === meta.path) {
          lastTouch.set(id, +new Date(c.date));
        }
      }
    }
  }
  const stale = latest.nodes.filter((n) => {
    const touch = lastTouch.get(n.id);
    return touch !== undefined && touch < cutoff && n.loc > 300 && !modules[n.id]?.isTest;
  });
  if (stale.length === 0) return [];
  return [
    {
      id: "debt:abandoned-module",
      type: "abandoned-module",
      title: `${stale.length} sizeable module${stale.length > 1 ? "s" : ""} untouched for a long period`,
      description: `${stale.slice(0, 3).map((n) => modules[n.id]?.path ?? n.id).join(", ")} still ship${stale.length === 1 ? "s" : ""} significant code but received no commits in the last third of the analyzed period.`,
      severity: "low",
      trend: "stable",
      methodology:
        "Modules >300 LOC in the latest snapshot whose last analyzed commit predates 35% of the repository’s active time span. May simply mean the code is finished and stable.",
      evidence: {
        commits: [],
        files: stale.slice(0, 5).map((n) => modules[n.id]?.path ?? n.id),
      },
      series: [],
    },
  ];
}

function todoGrowth({ metricSeries }: DebtInput): DebtSignal[] {
  const series = metricSeries.find((s) => s.id === "todos");
  if (!series || series.points.length < 3) return [];
  const first = series.points[0].v;
  const last = series.points[series.points.length - 1].v;
  if (last < Math.max(10, first * 1.8)) return [];
  return [
    {
      id: "debt:todo-growth",
      type: "todo-growth",
      title: "TODO/FIXME markers accumulating",
      description: `In-code TODO markers grew from ${first} to ${last} across the analyzed period — deferred work is piling up faster than it is resolved.`,
      severity: last > first * 3 ? "medium" : "low",
      trend: "rising",
      methodology: "Count of TODO/FIXME/HACK markers per snapshot tree.",
      evidence: { commits: [], files: [] },
      series: series.points,
    },
  ];
}

function volatileSubsystems({ commits, modules }: DebtInput): DebtSignal[] {
  const recent = commits.slice(-Math.max(30, Math.floor(commits.length / 3)));
  if (recent.length < 15) return [];
  const touches = new Map<string, { count: number; shas: string[] }>();
  const moduleList = Object.values(modules);
  for (const c of recent) {
    const touched = new Set<string>();
    for (const f of c.files) {
      const meta = moduleList.find(
        (m) => f.path === m.path || f.path.startsWith(m.path + "/"),
      );
      if (meta) touched.add(meta.path);
    }
    for (const path of touched) {
      const entry = touches.get(path) ?? { count: 0, shas: [] };
      entry.count += 1;
      if (entry.shas.length < 8) entry.shas.push(c.sha);
      touches.set(path, entry);
    }
  }
  const volatile = [...touches.entries()]
    .filter(([path, e]) => e.count / recent.length > 0.35 && !isTestPath(path + "/"))
    .sort((a, b) => b[1].count - a[1].count);
  if (volatile.length === 0) return [];
  const [path, entry] = volatile[0];
  return [
    {
      id: "debt:volatile-subsystem",
      type: "volatile-subsystem",
      title: `${path} changes in most recent commits`,
      description: `${path} was touched in ${Math.round((entry.count / recent.length) * 100)}% of the last ${recent.length} analyzed commits — a subsystem everything keeps flowing through.`,
      severity: entry.count / recent.length > 0.5 ? "high" : "medium",
      trend: "rising",
      methodology: `Share of the most recent ${recent.length} commits touching each module.`,
      evidence: { commits: entry.shas, files: [path] },
      series: [],
    },
  ];
}
