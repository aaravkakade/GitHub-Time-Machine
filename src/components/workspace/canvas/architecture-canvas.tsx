"use client";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useReducedMotion } from "framer-motion";
import { Crosshair, Maximize2, X } from "lucide-react";
import type { RepositoryAnalysis } from "@/domains/schemas";
import { computeUnionLayout } from "@/domains/visualization/layout";
import { useWorkspaceStore } from "@/store/workspace-store";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { ModuleNode } from "./module-node";
import { ClusterNode } from "./cluster-node";
import { useGraphElements } from "./use-graph-elements";
import type { WorkspaceNode } from "./graph-types";

const nodeTypes = { module: ModuleNode, cluster: ClusterNode };

function CanvasInner({ analysis }: { analysis: RepositoryAnalysis }) {
  const reducedMotion = useReducedMotion() ?? false;
  const { fitView } = useReactFlow();

  const snapshotIndex = useWorkspaceStore((s) => s.snapshotIndex);
  const selection = useWorkspaceStore((s) => s.selection);
  const focusModuleId = useWorkspaceStore((s) => s.focusModuleId);
  const clusterFilter = useWorkspaceStore((s) => s.clusterFilter);
  const changedOnly = useWorkspaceStore((s) => s.changedOnly);
  const select = useWorkspaceStore((s) => s.select);
  const setFocusModule = useWorkspaceStore((s) => s.setFocusModule);
  const setClusterFilter = useWorkspaceStore((s) => s.setClusterFilter);
  const setChangedOnly = useWorkspaceStore((s) => s.setChangedOnly);

  const layout = React.useMemo(() => computeUnionLayout(analysis), [analysis]);

  const { nodes, edges, summary } = useGraphElements({
    analysis,
    layout,
    snapshotIndex,
    clusterFilter,
    changedOnly,
    focusModuleId,
    selectedModuleId: selection?.type === "module" ? selection.id : null,
    reducedMotion,
  });

  const onNodeClick: NodeMouseHandler<WorkspaceNode> = (_event, node) => {
    if (node.type !== "module") return;
    select({ type: "module", id: node.id });
  };
  const onNodeDoubleClick: NodeMouseHandler<WorkspaceNode> = (_e, node) => {
    if (node.type !== "module") return;
    setFocusModule(focusModuleId === node.id ? null : node.id);
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFocusModule(null);
        setClusterFilter(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setFocusModule, setClusterFilter]);

  const clusters = layout.clusters;

  return (
    <div className="relative h-full w-full" data-testid="architecture-canvas">
      <span className="sr-only" role="status">
        {summary}
      </span>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={() => {
          setFocusModule(null);
        }}
        fitView
        fitViewOptions={{ padding: 0.15, duration: reducedMotion ? 0 : 500 }}
        minZoom={0.12}
        maxZoom={2.2}
        proOptions={{ hideAttribution: false }}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
        onlyRenderVisibleElements={nodes.length > 120}
        className="!bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={26}
          size={1}
          color="var(--line-1)"
        />
        <MiniMap
          className="!hidden lg:!block !border !border-line-1 !rounded-[var(--radius-md)] !overflow-hidden"
          nodeColor={(n) =>
            n.type === "module"
              ? `var(--cluster-${(n.data as { paletteSlot?: number }).paletteSlot ?? 1})`
              : "transparent"
          }
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="cluster-filter">
          Filter by area
        </label>
        <select
          id="cluster-filter"
          value={clusterFilter ?? ""}
          onChange={(e) => setClusterFilter(e.target.value || null)}
          className="h-7 rounded-[var(--radius-md)] border border-line-1 bg-surface-1 px-2 font-mono text-[11px] text-ink-2 hover:border-line-2"
        >
          <option value="">All areas</option>
          {clusters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id}
            </option>
          ))}
        </select>
        <Segmented
          ariaLabel="Node filter"
          value={changedOnly ? "changed" : "all"}
          onChange={(v) => setChangedOnly(v === "changed")}
          options={[
            { value: "all", label: "All" },
            { value: "changed", label: "Changed", title: "Only modules that changed in this period" },
          ]}
        />
        <Button
          size="icon"
          variant="secondary"
          aria-label="Fit graph to screen"
          title="Fit to screen"
          onClick={() => fitView({ padding: 0.15, duration: reducedMotion ? 0 : 500 })}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        {focusModuleId && (
          <Button size="sm" variant="outline" onClick={() => setFocusModule(null)}>
            <Crosshair className="h-3 w-3" />
            {analysis.modules[focusModuleId]?.label}
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Legend */}
      <div
        className="absolute bottom-3 left-3 z-10 hidden items-center gap-3 rounded-[var(--radius-md)] border border-line-0 bg-surface-1/85 px-3 py-1.5 text-[10px] text-ink-3 backdrop-blur-sm md:flex"
        aria-hidden
      >
        <span className="flex items-center gap-1.5">
          <span className="flex h-3 w-3 items-center justify-center rounded-full bg-add text-[8px] font-bold text-[#0b0b10]">+</span>
          added
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-warn" />
          modified
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-dashed border-ink-3" />
          tests
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t border-dashed border-ink-3" />
          structure
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-ink-3" />
          imports
        </span>
      </div>
    </div>
  );
}

export default function ArchitectureCanvas({
  analysis,
}: {
  analysis: RepositoryAnalysis;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner analysis={analysis} />
    </ReactFlowProvider>
  );
}
