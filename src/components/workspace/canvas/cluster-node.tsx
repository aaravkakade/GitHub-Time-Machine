"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { clusterColor, type ClusterFlowNode } from "./graph-types";

/** Soft region behind a cluster's modules, labeled with the directory name. */
function ClusterNodeComponent({ data }: NodeProps<ClusterFlowNode>) {
  const color = clusterColor(data.paletteSlot);
  return (
    <div
      aria-hidden
      className="rounded-[28px]"
      style={{
        width: data.width,
        height: data.height,
        background: `color-mix(in srgb, ${color} 5%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 16%, transparent)`,
        opacity: data.dimmed ? 0.25 : 1,
        transition:
          "width var(--dur-graph) var(--ease-in-out), height var(--dur-graph) var(--ease-in-out), opacity var(--dur-slow) var(--ease-out)",
      }}
    >
      <span
        className="absolute top-2.5 left-4 font-mono text-[11px] tracking-wide"
        style={{ color: `color-mix(in srgb, ${color} 75%, var(--ink-2))` }}
      >
        {data.label}
      </span>
    </div>
  );
}

export const ClusterNode = React.memo(ClusterNodeComponent);
