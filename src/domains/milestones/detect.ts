import type {
  Commit,
  Milestone,
  MilestoneCategory,
  MilestoneSignal,
  Release,
} from "@/domains/schemas";
import { isCiPath, isTestPath } from "@/domains/analysis/classify";
import { formatMonthYear, shortSha } from "@/lib/utils";

const FRAMEWORKS: Record<string, string> = {
  react: "React", "react-dom": "React", next: "Next.js", vue: "Vue",
  svelte: "Svelte", angular: "Angular", express: "Express", fastify: "Fastify",
  koa: "Koa", django: "Django", flask: "Flask", fastapi: "FastAPI",
  rails: "Rails", webpack: "webpack", vite: "Vite", rollup: "Rollup",
  esbuild: "esbuild", typescript: "TypeScript", redux: "Redux",
  "@tanstack/react-query": "TanStack Query", graphql: "GraphQL",
  prisma: "Prisma", sequelize: "Sequelize", sqlalchemy: "SQLAlchemy",
  celery: "Celery", tailwindcss: "Tailwind CSS",
};

const TEST_FRAMEWORKS = new Set([
  "jest", "vitest", "mocha", "jasmine", "pytest", "cypress",
  "@playwright/test", "playwright", "ava", "tape", "karma", "nose", "tox",
]);

interface Candidate {
  sha: string;
  date: string;
  category: MilestoneCategory;
  title: string;
  signal: MilestoneSignal;
  affectedPaths: string[];
  strength: number; // 0–1 how strong this individual signal is
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Deterministic milestone detection. Every candidate is backed by a
 * measurable signal with commit evidence; nearby candidates merge into a
 * single milestone whose confidence grows with corroborating signals.
 */
export function detectMilestones(
  commits: Commit[], // oldest → newest
  releases: Release[],
): Milestone[] {
  if (commits.length === 0) return [];
  const candidates: Candidate[] = [];
  const churns = commits.map((c) => c.additions + c.deletions);
  const churnMedian = Math.max(1, median(churns.filter((c) => c > 0)));

  // Founding commit.
  candidates.push({
    sha: commits[0].sha,
    date: commits[0].date,
    category: "founding",
    title: "Repository founded",
    signal: {
      type: "founding-commit",
      description: `First analyzed commit ${shortSha(commits[0].sha)} (“${firstLine(commits[0].message)}”)`,
      evidence: [commits[0].sha],
    },
    affectedPaths: commits[0].files.slice(0, 8).map((f) => f.path),
    strength: 1,
  });

  const seenTest = { done: false };
  const seenCi = { done: false };
  const seenPackages = { done: false };

  for (const c of commits) {
    const churn = c.additions + c.deletions;

    // Unusually large commits (≥ 8× median churn).
    if (churn >= churnMedian * 8 && churn > 400) {
      const deletionsDominate = c.deletions > c.additions * 2 && c.deletions > 500;
      candidates.push({
        sha: c.sha,
        date: c.date,
        category: deletionsDominate ? "mass-deletion" : "refactor",
        title: deletionsDominate ? "Large code removal" : "Major code change",
        signal: {
          type: "commit-size",
          description: `${churn.toLocaleString()} lines changed (${Math.round(churn / churnMedian)}× the median commit)`,
          value: churn,
          evidence: [c.sha],
        },
        affectedPaths: topDirs(c),
        strength: Math.min(1, churn / (churnMedian * 20)),
      });
    }

    // Folder restructuring: many renames/moves spanning multiple top dirs
    // (both origin and destination directories count).
    const renames = c.files.filter((f) => f.status === "renamed").length;
    const structural = c.files.filter((f) => f.status !== "modified").length;
    const dirs = new Set(
      c.files.flatMap((f) =>
        [f.path, f.previousPath]
          .filter((p): p is string => !!p)
          .map((p) => p.split("/")[0]),
      ),
    );
    if ((renames >= 8 || structural >= 20) && dirs.size >= 2) {
      candidates.push({
        sha: c.sha,
        date: c.date,
        category: "restructure",
        title: "Directory restructuring",
        signal: {
          type: "folder-restructure",
          description: `${structural} files added/moved/removed across ${dirs.size} top-level directories`,
          value: structural,
          evidence: [c.sha],
        },
        affectedPaths: topDirs(c),
        strength: Math.min(1, structural / 60),
      });
    }

    // Monorepo / package extraction.
    if (
      !seenPackages.done &&
      c.files.some(
        (f) => f.status === "added" && /^packages\/[^/]+\//.test(f.path),
      )
    ) {
      seenPackages.done = true;
      candidates.push({
        sha: c.sha,
        date: c.date,
        category: "extraction",
        title: "Package structure introduced",
        signal: {
          type: "package-extraction",
          description: "First packages/ workspace directory appeared",
          evidence: [c.sha],
        },
        affectedPaths: ["packages/"],
        strength: 0.8,
      });
    }

    // Framework adoption / dependency shifts.
    const frameworks = c.dependenciesAdded.filter((d) => FRAMEWORKS[d]);
    const testFrameworks = c.dependenciesAdded.filter((d) =>
      TEST_FRAMEWORKS.has(d),
    );
    if (frameworks.length > 0) {
      candidates.push({
        sha: c.sha,
        date: c.date,
        category: "framework-adoption",
        title: `${frameworks.map((f) => FRAMEWORKS[f]).join(", ")} adopted`,
        signal: {
          type: "framework-adoption",
          description: `Manifest gained ${frameworks.join(", ")}`,
          evidence: [c.sha],
        },
        affectedPaths: c.files
          .filter((f) => /package\.json|pyproject|requirements/.test(f.path))
          .map((f) => f.path),
        strength: 0.85,
      });
    }
    const depDelta = c.dependenciesAdded.length + c.dependenciesRemoved.length;
    if (depDelta >= 3 && frameworks.length === 0) {
      candidates.push({
        sha: c.sha,
        date: c.date,
        category: "dependency-shift",
        title: "Dependency overhaul",
        signal: {
          type: "dependency-shift",
          description: `${c.dependenciesAdded.length} dependencies added, ${c.dependenciesRemoved.length} removed in one commit`,
          value: depDelta,
          evidence: [c.sha],
        },
        affectedPaths: [],
        strength: Math.min(1, depDelta / 8),
      });
    }

    // Testing infrastructure.
    const addsTests = c.files.some(
      (f) => f.status === "added" && isTestPath(f.path),
    );
    if (!seenTest.done && (addsTests || testFrameworks.length > 0)) {
      seenTest.done = true;
      candidates.push({
        sha: c.sha,
        date: c.date,
        category: "testing",
        title: "Test infrastructure introduced",
        signal: {
          type: "testing-introduced",
          description: testFrameworks.length
            ? `Test framework ${testFrameworks.join(", ")} added alongside first test files`
            : "First test files committed",
          evidence: [c.sha],
        },
        affectedPaths: c.files
          .filter((f) => isTestPath(f.path))
          .slice(0, 6)
          .map((f) => f.path),
        strength: 0.75,
      });
    }

    // CI/CD introduction.
    if (
      !seenCi.done &&
      c.files.some((f) => f.status === "added" && isCiPath(f.path))
    ) {
      seenCi.done = true;
      candidates.push({
        sha: c.sha,
        date: c.date,
        category: "ci-cd",
        title: "Continuous integration introduced",
        signal: {
          type: "ci-introduced",
          description: "First CI workflow configuration committed",
          evidence: [c.sha],
        },
        affectedPaths: c.files
          .filter((f) => isCiPath(f.path))
          .map((f) => f.path),
        strength: 0.7,
      });
    }
  }

  // Commit clusters: 14-day windows with churn ≥ 6× the typical window.
  candidates.push(...detectBursts(commits, churnMedian));

  // Contributor surges: month where distinct authors ≥ 2× previous peak.
  candidates.push(...detectContributorSurges(commits));

  // Major releases.
  const bySha = new Map(commits.map((c) => [c.sha, c]));
  for (const r of releases) {
    if (!/^v?\d+\.0\.0$/.test(r.tag)) continue;
    const commit = r.sha ? bySha.get(r.sha) : undefined;
    candidates.push({
      sha: commit?.sha ?? r.sha ?? commits[commits.length - 1].sha,
      date: r.date,
      category: "release",
      title: `${r.tag} released`,
      signal: {
        type: "major-release",
        description: `Release tag ${r.tag}${r.name && r.name !== r.tag ? ` (“${r.name}”)` : ""}`,
        evidence: commit ? [commit.sha] : [],
      },
      affectedPaths: [],
      strength: 0.9,
    });
  }

  const merged = mergeCandidates(candidates);

  // Long histories produce many candidates; keep the timeline readable by
  // retaining the highest-confidence milestones (founding + majors always).
  const CAP = 40;
  if (merged.length <= CAP) return merged;
  const keep = new Set(
    merged
      .filter((m) => m.category === "founding" || m.category === "release")
      .map((m) => m.id),
  );
  for (const m of [...merged].sort((a, b) => b.confidence - a.confidence)) {
    if (keep.size >= CAP) break;
    keep.add(m.id);
  }
  return merged.filter((m) => keep.has(m.id));
}

function firstLine(message: string): string {
  const line = message.split("\n")[0];
  return line.length > 72 ? line.slice(0, 69) + "…" : line;
}

function topDirs(c: Commit): string[] {
  const counts = new Map<string, number>();
  for (const f of c.files) {
    const dir = f.path.includes("/")
      ? f.path.split("/").slice(0, 2).join("/")
      : f.path;
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([dir]) => dir);
}

function detectBursts(commits: Commit[], churnMedian: number): Candidate[] {
  const out: Candidate[] = [];
  const WINDOW = 14 * 24 * 3600 * 1000;
  const windows: { start: number; churn: number; commits: Commit[] }[] = [];
  let wStart = +new Date(commits[0].date);
  let current = { start: wStart, churn: 0, commits: [] as Commit[] };
  for (const c of commits) {
    const t = +new Date(c.date);
    while (t >= current.start + WINDOW) {
      windows.push(current);
      wStart = current.start + WINDOW;
      current = { start: wStart, churn: 0, commits: [] };
    }
    current.churn += c.additions + c.deletions;
    current.commits.push(c);
  }
  windows.push(current);
  const active = windows.filter((w) => w.commits.length > 0);
  const typical = Math.max(churnMedian * 3, median(active.map((w) => w.churn)));
  for (const w of active) {
    if (w.churn >= typical * 6 && w.commits.length >= 5) {
      const peak = w.commits.reduce((a, b) =>
        a.additions + a.deletions >= b.additions + b.deletions ? a : b,
      );
      out.push({
        sha: peak.sha,
        date: peak.date,
        category: "growth-surge",
        title: "Intense development burst",
        signal: {
          type: "commit-cluster",
          description: `${w.commits.length} commits and ${w.churn.toLocaleString()} changed lines within two weeks (${Math.round(w.churn / typical)}× typical)`,
          value: w.churn,
          evidence: w.commits.slice(0, 8).map((c) => c.sha),
        },
        affectedPaths: topDirs(peak),
        strength: Math.min(1, w.churn / (typical * 12)),
      });
    }
  }
  return out;
}

function detectContributorSurges(commits: Commit[]): Candidate[] {
  const out: Candidate[] = [];
  const byMonth = new Map<string, { authors: Set<string>; first: Commit }>();
  for (const c of commits) {
    const month = c.date.slice(0, 7);
    const entry = byMonth.get(month) ?? { authors: new Set(), first: c };
    entry.authors.add(c.author.login);
    byMonth.set(month, entry);
  }
  const months = [...byMonth.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  let peak = 1;
  for (const [, entry] of months.slice(0, 2)) {
    peak = Math.max(peak, entry.authors.size);
  }
  for (const [, entry] of months.slice(2)) {
    const n = entry.authors.size;
    if (n >= Math.max(4, peak * 2)) {
      out.push({
        sha: entry.first.sha,
        date: entry.first.date,
        category: "growth-surge",
        title: "Contributor surge",
        signal: {
          type: "contributor-surge",
          description: `${n} distinct authors active in ${formatMonthYear(entry.first.date)} (previous peak: ${peak})`,
          value: n,
          evidence: [entry.first.sha],
        },
        affectedPaths: [],
        strength: Math.min(1, n / (peak * 4)),
      });
    }
    peak = Math.max(peak, n);
  }
  return out;
}

/**
 * Merge nearby candidates into single milestones. The merge window scales
 * with the repository's active time span so a 15-year history doesn't drown
 * in markers (min 3 days, ~1/120th of the span, max 45 days).
 */
function mergeCandidates(candidates: Candidate[]): Milestone[] {
  const sorted = [...candidates].sort((a, b) => a.date.localeCompare(b.date));
  const groups: Candidate[][] = [];
  const DAY = 24 * 3600 * 1000;
  const span =
    sorted.length > 1
      ? +new Date(sorted[sorted.length - 1].date) - +new Date(sorted[0].date)
      : 0;
  const MERGE_WINDOW = Math.min(45 * DAY, Math.max(3 * DAY, span / 120));
  for (const cand of sorted) {
    const last = groups[groups.length - 1];
    if (
      last &&
      +new Date(cand.date) - +new Date(last[last.length - 1].date) <=
        MERGE_WINDOW
    ) {
      last.push(cand);
    } else {
      groups.push([cand]);
    }
  }

  // When several signals merge, the most *descriptive* category should name
  // the milestone (a restructure beats a generic "big commit" at the same
  // moment), with strength breaking ties.
  const categoryPrecedence: Partial<Record<MilestoneCategory, number>> = {
    founding: 0,
    restructure: 1,
    extraction: 1,
    migration: 1,
    "framework-adoption": 2,
    testing: 2,
    "ci-cd": 2,
    release: 3,
    "dependency-shift": 4,
    "mass-deletion": 4,
  };

  return groups.map((group) => {
    const lead = group.reduce((a, b) => {
      const pa = categoryPrecedence[a.category] ?? 5;
      const pb = categoryPrecedence[b.category] ?? 5;
      if (pa !== pb) return pb < pa ? b : a;
      return b.strength > a.strength ? b : a;
    });
    const signals = group.map((c) => c.signal);
    const confidence = Math.min(
      0.95,
      0.4 + lead.strength * 0.3 + (group.length - 1) * 0.12,
    );
    const affected = [...new Set(group.flatMap((c) => c.affectedPaths))].slice(
      0,
      8,
    );
    return {
      id: `ms:${lead.sha}:${lead.category}`,
      sha: lead.sha,
      date: lead.date,
      title: lead.title,
      category: lead.category,
      confidence: Math.round(confidence * 100) / 100,
      signals,
      summary:
        group.length === 1
          ? lead.signal.description
          : `${lead.signal.description}; ${group.length - 1} corroborating signal${group.length > 2 ? "s" : ""} detected in the same period`,
      affectedPaths: affected,
    } satisfies Milestone;
  });
}
