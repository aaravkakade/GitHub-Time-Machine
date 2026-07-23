import type {
  ArchitectureSnapshot,
  Commit,
  DependencyEdge,
  ModuleMeta,
  SnapshotNode,
  TreeSample,
} from "@/domains/schemas";
import { isAnalyzable, isSourceFile, isTestPath } from "@/domains/analysis/classify";
import {
  deriveModules,
  moduleIdForPath,
  planModules,
  type ModulePlan,
} from "@/domains/analysis/modules";

export interface BuiltSnapshots {
  snapshots: ArchitectureSnapshot[];
  /** Union of module metadata across all snapshots. */
  modules: Record<string, ModuleMeta>;
  plan: ModulePlan;
}

/**
 * Build architecture snapshots from sampled trees.
 *
 * Change status and churn per node are derived from the commits that landed
 * between consecutive samples, so scrubbing the timeline highlights what
 * actually moved in each period.
 */
export function buildSnapshots(
  samples: TreeSample[], // oldest → newest
  commits: Commit[], // oldest → newest
  reasons: Map<string, ArchitectureSnapshot["reason"]>,
  contributorsAt: (dateIso: string) => number,
): BuiltSnapshots {
  const allPaths = new Set<string>();
  for (const sample of samples)
    for (const f of sample.files) allPaths.add(f.path);
  const plan = planModules([...allPaths]);

  const modules: Record<string, ModuleMeta> = {};
  const snapshots: ArchitectureSnapshot[] = [];

  let prevNodeIds = new Set<string>();
  let prevSampleDate: string | null = null;

  for (const sample of samples) {
    const derived = deriveModules(
      sample.files.map((f) => f.path),
      plan,
    );
    for (const [id, meta] of derived.metas) {
      if (!modules[id]) modules[id] = meta;
    }

    // Aggregate file metrics into module nodes.
    const acc = new Map<
      string,
      { loc: number; files: number; complexity: number; complexityCount: number; todo: number }
    >();
    let totalLoc = 0;
    let testLoc = 0;
    let sourceLoc = 0;
    let fileCount = 0;
    let todoTotal = 0;
    let hasTodoData = false;
    for (const f of sample.files) {
      if (!isAnalyzable(f.path)) continue;
      const loc = f.loc ?? 0;
      totalLoc += loc;
      fileCount += 1;
      if (isSourceFile(f.path)) {
        if (isTestPath(f.path)) testLoc += loc;
        else sourceLoc += loc;
      }
      if (typeof f.todoCount === "number") {
        hasTodoData = true;
        todoTotal += f.todoCount;
      }
      const id = derived.fileToModule.get(f.path);
      if (!id) continue;
      const entry = acc.get(id) ?? {
        loc: 0,
        files: 0,
        complexity: 0,
        complexityCount: 0,
        todo: 0,
      };
      entry.loc += loc;
      entry.files += 1;
      if (typeof f.complexity === "number") {
        entry.complexity += f.complexity;
        entry.complexityCount += 1;
      }
      acc.set(id, entry);
    }

    // Churn per module from commits since the previous sample.
    const churn = new Map<string, number>();
    const windowCommits = commits.filter(
      (c) =>
        c.date <= sample.date &&
        (prevSampleDate === null || c.date > prevSampleDate),
    );
    for (const c of windowCommits) {
      for (const fc of c.files) {
        const id = moduleIdForPath(fc.path, plan);
        if (!id) continue;
        churn.set(id, (churn.get(id) ?? 0) + fc.additions + fc.deletions);
      }
    }

    const nodes: SnapshotNode[] = [];
    for (const [id, entry] of acc) {
      const isNew = !prevNodeIds.has(id) && snapshots.length > 0;
      const moduleChurn = churn.get(id) ?? 0;
      nodes.push({
        id,
        loc: entry.loc,
        fileCount: entry.files,
        complexity:
          entry.complexityCount > 0
            ? Math.round((entry.complexity / entry.complexityCount) * 10) / 10
            : null,
        status: isNew
          ? "added"
          : moduleChurn > Math.max(80, entry.loc * 0.15)
            ? "modified"
            : "stable",
        churn: moduleChurn,
      });
    }
    nodes.sort((a, b) => b.loc - a.loc);

    // Module-level edges from file-level imports.
    const edgeMap = new Map<string, DependencyEdge>();
    if (sample.imports && sample.imports.length > 0) {
      for (const imp of sample.imports) {
        const source = derived.fileToModule.get(imp.from);
        const target = derived.fileToModule.get(imp.to);
        if (!source || !target || source === target) continue;
        const key = `${source}->${target}`;
        const existing = edgeMap.get(key);
        if (existing) existing.weight += 1;
        else edgeMap.set(key, { source, target, kind: "import", weight: 1 });
      }
    } else {
      // Fallback when no import analysis is available: containment edges
      // between a cluster's largest module and its siblings (labeled
      // "structure" in the UI so inferred relationships are never oversold).
      const byCluster = new Map<string, SnapshotNode[]>();
      for (const n of nodes) {
        const cluster = modules[n.id].cluster;
        const list = byCluster.get(cluster) ?? [];
        list.push(n);
        byCluster.set(cluster, list);
      }
      for (const list of byCluster.values()) {
        if (list.length < 2) continue;
        const hub = list[0]; // largest by loc (nodes pre-sorted)
        for (const n of list.slice(1)) {
          edgeMap.set(`${hub.id}->${n.id}`, {
            source: hub.id,
            target: n.id,
            kind: "structure",
            weight: 1,
          });
        }
      }
    }

    const complexityNodes = nodes.filter((n) => n.complexity !== null);
    snapshots.push({
      id: `snap:${sample.sha}`,
      sha: sample.sha,
      date: sample.date,
      reason: reasons.get(sample.sha) ?? "interval",
      nodes,
      edges: [...edgeMap.values()],
      metrics: {
        files: fileCount,
        loc: totalLoc,
        modules: nodes.length,
        edges: edgeMap.size,
        avgComplexity:
          complexityNodes.length > 0
            ? Math.round(
                (complexityNodes.reduce((s, n) => s + (n.complexity ?? 0), 0) /
                  complexityNodes.length) *
                  10,
              ) / 10
            : null,
        testRatio:
          sourceLoc > 0 ? Math.round((testLoc / sourceLoc) * 1000) / 1000 : null,
        dependencyCount: sample.packages?.length ?? 0,
        contributors: contributorsAt(sample.date),
        todoCount: hasTodoData ? todoTotal : null,
      },
      packages: sample.packages ?? [],
    });

    prevNodeIds = new Set(nodes.map((n) => n.id));
    prevSampleDate = sample.date;
  }

  return { snapshots, modules, plan };
}
