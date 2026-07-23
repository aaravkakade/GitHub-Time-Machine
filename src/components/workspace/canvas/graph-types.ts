import type { Node, Edge } from "@xyflow/react";
import type { ChangeStatus } from "@/domains/schemas";

export interface ModuleNodeData extends Record<string, unknown> {
  label: string;
  path: string;
  paletteSlot: number;
  diameter: number;
  status: ChangeStatus;
  loc: number;
  fileCount: number;
  churn: number;
  complexity: number | null;
  language: string | null;
  isTest: boolean;
  dimmed: boolean;
  entering: boolean;
  exiting: boolean;
  selected: boolean;
}

export interface ClusterNodeData extends Record<string, unknown> {
  label: string;
  paletteSlot: number;
  width: number;
  height: number;
  dimmed: boolean;
}

export type ModuleFlowNode = Node<ModuleNodeData, "module">;
export type ClusterFlowNode = Node<ClusterNodeData, "cluster">;
export type WorkspaceNode = ModuleFlowNode | ClusterFlowNode;
export type WorkspaceEdge = Edge;

export function clusterColor(slot: number): string {
  return `var(--cluster-${slot})`;
}
