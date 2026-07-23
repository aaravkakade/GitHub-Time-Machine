import type {
  ArchitectureSnapshot,
  Commit,
  Milestone,
  RepositoryAnalysis,
} from "@/domains/schemas";

export interface ModuleDelta {
  id: string;
  path: string;
  locBefore: number;
  locAfter: number;
}

export interface SnapshotDiff {
  before: ArchitectureSnapshot;
  after: ArchitectureSnapshot;
  addedModules: ModuleDelta[];
  removedModules: ModuleDelta[];
  grownModules: ModuleDelta[]; // sorted by |delta| desc, includes shrunk
  addedEdges: { source: string; target: string }[];
  removedEdges: { source: string; target: string }[];
  packagesAdded: string[];
  packagesRemoved: string[];
  metrics: {
    key: string;
    label: string;
    before: number | null;
    after: number | null;
  }[];
  commitsBetween: Commit[];
  milestonesBetween: Milestone[];
  authorsBetween: { login: string; commits: number }[];
}

/** Deterministic comparison of two architectural snapshots. */
export function diffSnapshots(
  analysis: RepositoryAnalysis,
  beforeId: string,
  afterId: string,
): SnapshotDiff | null {
  let before = analysis.snapshots.find((s) => s.id === beforeId);
  let after = analysis.snapshots.find((s) => s.id === afterId);
  if (!before || !after) return null;
  if (before.date > after.date) [before, after] = [after, before];

  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));
  const pathOf = (id: string) => analysis.modules[id]?.path ?? id;

  const addedModules: ModuleDelta[] = [];
  const removedModules: ModuleDelta[] = [];
  const grownModules: ModuleDelta[] = [];

  for (const [id, node] of afterNodes) {
    const prev = beforeNodes.get(id);
    if (!prev) {
      addedModules.push({ id, path: pathOf(id), locBefore: 0, locAfter: node.loc });
    } else if (Math.abs(node.loc - prev.loc) >= Math.max(40, prev.loc * 0.15)) {
      grownModules.push({
        id,
        path: pathOf(id),
        locBefore: prev.loc,
        locAfter: node.loc,
      });
    }
  }
  for (const [id, node] of beforeNodes) {
    if (!afterNodes.has(id)) {
      removedModules.push({ id, path: pathOf(id), locBefore: node.loc, locAfter: 0 });
    }
  }
  grownModules.sort(
    (a, b) =>
      Math.abs(b.locAfter - b.locBefore) - Math.abs(a.locAfter - a.locBefore),
  );

  const edgeKey = (e: { source: string; target: string }) =>
    `${e.source}->${e.target}`;
  const beforeEdges = new Set(before.edges.map(edgeKey));
  const afterEdges = new Set(after.edges.map(edgeKey));
  const addedEdges = after.edges.filter((e) => !beforeEdges.has(edgeKey(e)));
  const removedEdges = before.edges.filter((e) => !afterEdges.has(edgeKey(e)));

  const beforePkgs = new Set(before.packages);
  const afterPkgs = new Set(after.packages);

  const commitsBetween = analysis.commits.filter(
    (c) => c.date > before.date && c.date <= after.date,
  );
  const milestonesBetween = analysis.milestones.filter(
    (m) => m.date > before.date && m.date <= after.date,
  );
  const authorCounts = new Map<string, number>();
  for (const c of commitsBetween) {
    authorCounts.set(c.author.login, (authorCounts.get(c.author.login) ?? 0) + 1);
  }

  return {
    before,
    after,
    addedModules,
    removedModules,
    grownModules,
    addedEdges: addedEdges.map((e) => ({ source: pathOf(e.source), target: pathOf(e.target) })),
    removedEdges: removedEdges.map((e) => ({ source: pathOf(e.source), target: pathOf(e.target) })),
    packagesAdded: [...afterPkgs].filter((p) => !beforePkgs.has(p)),
    packagesRemoved: [...beforePkgs].filter((p) => !afterPkgs.has(p)),
    metrics: [
      { key: "loc", label: "Lines of code", before: before.metrics.loc, after: after.metrics.loc },
      { key: "files", label: "Files", before: before.metrics.files, after: after.metrics.files },
      { key: "modules", label: "Modules", before: before.metrics.modules, after: after.metrics.modules },
      { key: "edges", label: "Relationships", before: before.metrics.edges, after: after.metrics.edges },
      { key: "complexity", label: "Avg. complexity", before: before.metrics.avgComplexity, after: after.metrics.avgComplexity },
      { key: "test-ratio", label: "Test ratio", before: before.metrics.testRatio, after: after.metrics.testRatio },
      { key: "deps", label: "Dependencies", before: before.metrics.dependencyCount, after: after.metrics.dependencyCount },
    ],
    commitsBetween,
    milestonesBetween,
    authorsBetween: [...authorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([login, commits]) => ({ login, commits })),
  };
}
