import type { RepositoryAnalysis } from "@/domains/schemas";
import { clamp } from "@/lib/utils";

/**
 * Union layout: positions are computed once over the union of every
 * snapshot's modules, so a module keeps its place for the whole timeline.
 * Time travel then only animates size, emphasis and presence — the
 * architecture appears to grow and shrink in place instead of re-shuffling.
 *
 * Clusters sit on a ring (largest at the center); inside a cluster, modules
 * follow a golden-angle spiral ordered by first appearance, so newly added
 * modules materialize at the growing edge of their region.
 */

export interface NodeLayout {
  x: number;
  y: number;
  /** Maximum diameter this node ever reaches (used for spacing). */
  maxDiameter: number;
}

export interface ClusterLayout {
  id: string;
  cx: number;
  cy: number;
  radius: number;
  /** 1-based slot in the categorical palette (wraps after 8). */
  paletteSlot: number;
  members: string[];
}

export interface UnionLayout {
  nodes: Map<string, NodeLayout>;
  clusters: ClusterLayout[];
}

const GOLDEN_ANGLE = 2.399963229728653;

export function diameterForLoc(loc: number): number {
  return clamp(16 + 15 * Math.sqrt(loc / 250), 22, 96);
}

export function computeUnionLayout(analysis: RepositoryAnalysis): UnionLayout {
  // Union of nodes with max size and first-appearance order.
  const maxLoc = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  for (let s = 0; s < analysis.snapshots.length; s++) {
    for (const node of analysis.snapshots[s].nodes) {
      maxLoc.set(node.id, Math.max(maxLoc.get(node.id) ?? 0, node.loc));
      if (!firstSeen.has(node.id)) firstSeen.set(node.id, s * 10000 + firstSeen.size);
    }
  }

  // Group by cluster, ordered by first appearance of the cluster.
  const clusterMembers = new Map<string, string[]>();
  const clusterOrder: string[] = [];
  const ids = [...maxLoc.keys()].sort(
    (a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0),
  );
  for (const id of ids) {
    const cluster = analysis.modules[id]?.cluster ?? "root";
    if (!clusterMembers.has(cluster)) {
      clusterMembers.set(cluster, []);
      clusterOrder.push(cluster);
    }
    clusterMembers.get(cluster)!.push(id);
  }

  // Local spiral layout per cluster.
  const localPositions = new Map<string, { x: number; y: number }>();
  const clusterRadius = new Map<string, number>();
  for (const [cluster, members] of clusterMembers) {
    const avgDiameter =
      members.reduce((s, id) => s + diameterForLoc(maxLoc.get(id) ?? 0), 0) /
      members.length;
    const spacing = avgDiameter * 1.05 + 26;
    let radius = 0;
    members.forEach((id, j) => {
      const r = j === 0 ? 0 : spacing * Math.sqrt(j);
      const angle = j * GOLDEN_ANGLE;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      localPositions.set(id, { x, y });
      radius = Math.max(radius, r + diameterForLoc(maxLoc.get(id) ?? 0) / 2);
    });
    clusterRadius.set(cluster, radius + 42);
  }

  // Cluster placement: largest cluster in the middle, the rest on a ring
  // sized so neighbouring clusters don't collide.
  const sortedClusters = [...clusterOrder].sort(
    (a, b) =>
      clusterMembers.get(b)!.length - clusterMembers.get(a)!.length ||
      clusterOrder.indexOf(a) - clusterOrder.indexOf(b),
  );
  const centerCluster = sortedClusters[0];
  const ringClusters = clusterOrder.filter((c) => c !== centerCluster);

  const centers = new Map<string, { cx: number; cy: number }>();
  centers.set(centerCluster, { cx: 0, cy: 0 });
  if (ringClusters.length > 0) {
    const circumference = ringClusters.reduce(
      (s, c) => s + 2 * clusterRadius.get(c)! + 36,
      0,
    );
    const ringR = Math.max(
      clusterRadius.get(centerCluster)! +
        Math.max(...ringClusters.map((c) => clusterRadius.get(c)!)) +
        56,
      circumference / (2 * Math.PI),
    );
    ringClusters.forEach((cluster, i) => {
      const angle = (i / ringClusters.length) * 2 * Math.PI - Math.PI / 2;
      centers.set(cluster, {
        cx: Math.cos(angle) * ringR,
        cy: Math.sin(angle) * ringR,
      });
    });
  }

  const nodes = new Map<string, NodeLayout>();
  const clusters: ClusterLayout[] = clusterOrder.map((cluster, index) => {
    const { cx, cy } = centers.get(cluster)!;
    const members = clusterMembers.get(cluster)!;
    for (const id of members) {
      const local = localPositions.get(id)!;
      nodes.set(id, {
        x: cx + local.x,
        y: cy + local.y,
        maxDiameter: diameterForLoc(maxLoc.get(id) ?? 0),
      });
    }
    return {
      id: cluster,
      cx,
      cy,
      radius: clusterRadius.get(cluster)!,
      paletteSlot: (index % 8) + 1,
      members,
    };
  });

  return { nodes, clusters };
}
