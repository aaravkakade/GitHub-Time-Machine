"use client";

import * as React from "react";
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useReducedMotion } from "framer-motion";
import type { RepositoryAnalysis } from "@/domains/schemas";
import type { UnionLayout } from "@/domains/visualization/layout";
import { ModuleNode } from "@/components/workspace/canvas/module-node";
import { ClusterNode } from "@/components/workspace/canvas/cluster-node";
import { useGraphElements } from "@/components/workspace/canvas/use-graph-elements";

const nodeTypes = { module: ModuleNode, cluster: ClusterNode };

function CompareCanvasInner({
  analysis,
  layout,
  snapshotIndex,
  label,
}: {
  analysis: RepositoryAnalysis;
  layout: UnionLayout;
  snapshotIndex: number;
  label: string;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const { nodes, edges, summary } = useGraphElements({
    analysis,
    layout,
    snapshotIndex,
    clusterFilter: null,
    changedOnly: false,
    focusModuleId: null,
    selectedModuleId: null,
    reducedMotion,
  });

  return (
    <div className="relative h-full w-full" data-testid={`compare-canvas-${label}`}>
      <span className="sr-only">{summary}</span>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.08}
        maxZoom={2}
        nodesConnectable={false}
        nodesDraggable={false}
        edgesFocusable={false}
        className="!bg-transparent"
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--line-1)" />
      </ReactFlow>
    </div>
  );
}

export function CompareCanvas(props: {
  analysis: RepositoryAnalysis;
  layout: UnionLayout;
  snapshotIndex: number;
  label: string;
}) {
  return (
    <ReactFlowProvider>
      <CompareCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
