"use client";

import * as React from "react";
import type { RepositoryAnalysis, SnapshotNode } from "@/domains/schemas";
import type { UnionLayout } from "@/domains/visualization/layout";
import { diameterForLoc } from "@/domains/visualization/layout";
import type {
  ClusterFlowNode,
  ModuleFlowNode,
  WorkspaceEdge,
  WorkspaceNode,
} from "./graph-types";

interface GraphOptions {
  analysis: RepositoryAnalysis;
  layout: UnionLayout;
  snapshotIndex: number;
  clusterFilter: string | null;
  changedOnly: boolean;
  focusModuleId: string | null;
  selectedModuleId: string | null;
  reducedMotion: boolean;
}

interface ExitingEntry {
  node: SnapshotNode;
  sinceIndex: number;
}

/**
 * Builds React Flow nodes/edges for the active snapshot. Nodes removed since
 * the previous snapshot linger briefly with an exit animation so time travel
 * reads as evolution, not replacement. All positions come from the stable
 * union layout.
 */
export function useGraphElements({
  analysis,
  layout,
  snapshotIndex,
  clusterFilter,
  changedOnly,
  focusModuleId,
  selectedModuleId,
  reducedMotion,
}: GraphOptions): {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  summary: string;
} {
  const snapshot = analysis.snapshots[snapshotIndex];
  const prevIdsRef = React.useRef<Set<string> | null>(null);
  const [exiting, setExiting] = React.useState<Map<string, ExitingEntry>>(
    new Map(),
  );

  // Track removed nodes for exit animation.
  React.useEffect(() => {
    const currentIds = new Set(snapshot.nodes.map((n) => n.id));
    const prev = prevIdsRef.current;
    prevIdsRef.current = currentIds;
    if (!prev || reducedMotion) return;

    const prevSnapshots = analysis.snapshots.filter((s) =>
      s.nodes.some((n) => prev.has(n.id) && !currentIds.has(n.id)),
    );
    if (prevSnapshots.length === 0) return;
    const removed = new Map<string, ExitingEntry>();
    for (const s of analysis.snapshots) {
      for (const n of s.nodes) {
        if (prev.has(n.id) && !currentIds.has(n.id)) {
          removed.set(n.id, { node: n, sinceIndex: snapshotIndex });
        }
      }
    }
    if (removed.size === 0) return;
    setExiting(removed);
    const timer = setTimeout(() => setExiting(new Map()), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotIndex]);

  const enteringIds = React.useMemo(() => {
    if (snapshotIndex === 0) return new Set<string>();
    const prevSnapshot = analysis.snapshots[snapshotIndex - 1];
    const prevIds = new Set(prevSnapshot.nodes.map((n) => n.id));
    return new Set(
      snapshot.nodes.filter((n) => !prevIds.has(n.id)).map((n) => n.id),
    );
  }, [analysis, snapshot, snapshotIndex]);

  return React.useMemo(() => {
    const neighborIds = new Set<string>();
    if (focusModuleId) {
      neighborIds.add(focusModuleId);
      for (const e of snapshot.edges) {
        if (e.source === focusModuleId) neighborIds.add(e.target);
        if (e.target === focusModuleId) neighborIds.add(e.source);
      }
    }

    const paletteByCluster = new Map(
      layout.clusters.map((c) => [c.id, c.paletteSlot]),
    );

    const isDimmed = (id: string, status: SnapshotNode["status"]): boolean => {
      const meta = analysis.modules[id];
      if (focusModuleId && !neighborIds.has(id)) return true;
      if (clusterFilter && meta?.cluster !== clusterFilter) return true;
      if (changedOnly && status === "stable") return true;
      return false;
    };

    const moduleNodes: ModuleFlowNode[] = [];
    const presentByCluster = new Map<string, string[]>();

    const pushModule = (
      n: SnapshotNode,
      flags: { entering: boolean; exiting: boolean },
    ) => {
      const meta = analysis.modules[n.id];
      const pos = layout.nodes.get(n.id);
      if (!meta || !pos) return;
      const d = diameterForLoc(n.loc);
      const dimmed = isDimmed(n.id, n.status);
      moduleNodes.push({
        id: n.id,
        type: "module",
        position: { x: pos.x - d / 2, y: pos.y - d / 2 },
        zIndex: 2,
        data: {
          label: meta.label,
          path: meta.path,
          paletteSlot: paletteByCluster.get(meta.cluster) ?? 1,
          diameter: d,
          status: flags.exiting ? "removed" : n.status,
          loc: n.loc,
          fileCount: n.fileCount,
          churn: n.churn,
          complexity: n.complexity,
          language: meta.language,
          isTest: meta.isTest,
          dimmed,
          entering: flags.entering && !flags.exiting,
          exiting: flags.exiting,
          selected: selectedModuleId === n.id,
        },
      });
      if (!flags.exiting) {
        const members = presentByCluster.get(meta.cluster) ?? [];
        members.push(n.id);
        presentByCluster.set(meta.cluster, members);
      }
    };

    for (const n of snapshot.nodes) {
      pushModule(n, {
        entering: enteringIds.has(n.id) && !reducedMotion,
        exiting: false,
      });
    }
    for (const [id, entry] of exiting) {
      if (snapshot.nodes.some((n) => n.id === id)) continue;
      pushModule(entry.node, { entering: false, exiting: true });
    }

    // Cluster regions behind present members.
    const clusterNodes: ClusterFlowNode[] = [];
    for (const cluster of layout.clusters) {
      const members = presentByCluster.get(cluster.id);
      if (!members || members.length === 0) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of members) {
        const pos = layout.nodes.get(id)!;
        const half = layout.nodes.get(id)!.maxDiameter / 2;
        minX = Math.min(minX, pos.x - half);
        minY = Math.min(minY, pos.y - half);
        maxX = Math.max(maxX, pos.x + half);
        maxY = Math.max(maxY, pos.y + half);
      }
      const PAD = 34;
      clusterNodes.push({
        id: `cluster:${cluster.id}`,
        type: "cluster",
        position: { x: minX - PAD, y: minY - PAD - 8 },
        zIndex: 0,
        draggable: false,
        selectable: false,
        focusable: false,
        data: {
          label: cluster.id,
          paletteSlot: cluster.paletteSlot,
          width: maxX - minX + PAD * 2,
          height: maxY - minY + PAD * 2 + 8,
          dimmed: clusterFilter !== null && cluster.id !== clusterFilter,
        },
      });
    }

    const edges: WorkspaceEdge[] = snapshot.edges.map((e) => {
      const focused =
        focusModuleId !== null &&
        (e.source === focusModuleId || e.target === focusModuleId);
      const dimmedByFocus = focusModuleId !== null && !focused;
      const sourceSlot =
        paletteByCluster.get(analysis.modules[e.source]?.cluster ?? "") ?? 1;
      return {
        id: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        type: "straight",
        style: {
          stroke: focused
            ? `var(--cluster-${sourceSlot})`
            : "var(--line-2)",
          strokeWidth: e.kind === "import" ? Math.min(3, 1 + Math.log2(e.weight + 1) * 0.6) : 1,
          strokeDasharray: e.kind === "structure" ? "4 4" : undefined,
          opacity: dimmedByFocus ? 0.06 : e.kind === "structure" ? 0.35 : focused ? 0.95 : 0.5,
        },
      };
    });

    const changed = snapshot.nodes.filter((n) => n.status !== "stable");
    const summary =
      `Architecture graph as of ${snapshot.date.slice(0, 10)}: ` +
      `${snapshot.nodes.length} modules in ${clusterNodes.length} regions, ${snapshot.edges.length} dependencies. ` +
      (changed.length > 0
        ? `${changed.filter((n) => n.status === "added").length} modules added and ${changed.filter((n) => n.status === "modified").length} heavily modified in this period.`
        : "No structural changes in this period.");

    return { nodes: [...clusterNodes, ...moduleNodes], edges, summary };
  }, [
    analysis,
    layout,
    snapshot,
    enteringIds,
    exiting,
    clusterFilter,
    changedOnly,
    focusModuleId,
    selectedModuleId,
    reducedMotion,
  ]);
}
