"use client";

import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { cn, formatCompact } from "@/lib/utils";
import { clusterColor, type ModuleFlowNode } from "./graph-types";

/**
 * A module in the architecture graph. Change status is encoded with both
 * color and shape (badge glyphs / ring styles) so it survives color-blind
 * viewing and grayscale printing.
 */
function ModuleNodeComponent({ data }: NodeProps<ModuleFlowNode>) {
  const color = clusterColor(data.paletteSlot);
  const d = data.diameter;

  return (
    <div
      className={cn(
        "group relative",
        data.entering && "cc-node-enter",
        data.exiting && "cc-node-exit",
      )}
      style={{ width: d, height: d, opacity: data.dimmed ? 0.14 : 1, transition: "opacity var(--dur-slow) var(--ease-out)" }}
      aria-label={`Module ${data.path}: ${formatCompact(data.loc)} lines, ${data.fileCount} files${data.status !== "stable" ? `, ${data.status} in this period` : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!pointer-events-none !opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!pointer-events-none !opacity-0" />

      <div
        className={cn("absolute inset-0 rounded-full", data.selected && "outline-2 outline-offset-4 outline-accent")}
        style={{
          background: `color-mix(in srgb, ${color} ${data.status === "removed" ? 8 : 20}%, transparent)`,
          border: `1.5px ${data.isTest ? "dashed" : "solid"} color-mix(in srgb, ${color} 62%, transparent)`,
          boxShadow:
            data.status === "added"
              ? "0 0 0 3px var(--add-soft), 0 0 0 1.5px var(--add)"
              : data.status === "modified"
                ? "0 0 0 3px var(--warn-soft)"
                : undefined,
          transition:
            "width var(--dur-graph) var(--ease-in-out), height var(--dur-graph) var(--ease-in-out), box-shadow var(--dur-slow) var(--ease-out)",
        }}
      />

      {/* Inner dot scales with churn to show activity without relying on hue */}
      {data.churn > 0 && (
        <div
          className="absolute rounded-full"
          style={{
            width: Math.min(d * 0.42, 8 + Math.sqrt(data.churn) * 0.6),
            height: Math.min(d * 0.42, 8 + Math.sqrt(data.churn) * 0.6),
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            background: `color-mix(in srgb, ${color} 80%, var(--ink-1))`,
            opacity: 0.75,
          }}
        />
      )}

      {data.status === "added" && (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-add text-[10px] leading-none font-bold text-[#0b0b10]"
        >
          +
        </span>
      )}
      {data.status === "modified" && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-0 bg-warn"
        />
      )}

      <div
        className="pointer-events-none absolute top-full left-1/2 mt-1 w-max max-w-[120px] -translate-x-1/2 truncate text-center font-mono text-[10px] leading-tight text-ink-2"
        style={{ textShadow: "0 1px 3px var(--surface-0)" }}
      >
        {data.label}
      </div>

      {/* Hover details */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-max max-w-56 -translate-x-1/2 rounded-[var(--radius-md)] border border-line-1 bg-surface-3 px-2.5 py-2 text-left shadow-xl shadow-black/40 group-hover:block">
        <div className="font-mono text-[11px] font-medium text-ink-1">{data.path}</div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-ink-2">
          <span>{formatCompact(data.loc)} lines</span>
          <span>{data.fileCount} file{data.fileCount === 1 ? "" : "s"}</span>
          {data.language && <span>{data.language}</span>}
          {data.complexity !== null && <span>cx {data.complexity}</span>}
          {data.churn > 0 && (
            <span className="col-span-2 text-warn">
              {formatCompact(data.churn)} lines churned this period
            </span>
          )}
        </div>
        <div className="mt-1 text-[10px] text-ink-3">Click to inspect</div>
      </div>
    </div>
  );
}

export const ModuleNode = React.memo(ModuleNodeComponent);
