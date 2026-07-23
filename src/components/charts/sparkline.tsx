"use client";

import * as React from "react";
import type { MetricPoint } from "@/domains/schemas";
import { formatCompact, formatDate } from "@/lib/utils";

interface SparklineProps {
  points: MetricPoint[];
  width?: number;
  height?: number;
  /** Highlight everything after this time as "future" (dimmed). */
  currentMs?: number;
  color?: string;
  unit?: string;
  label: string;
  formatValue?: (v: number) => string;
}

/**
 * Single-series sparkline with a crosshair + tooltip hover layer.
 * The series is named by its surrounding label, so no legend is rendered.
 */
export function Sparkline({
  points,
  width = 132,
  height = 36,
  currentMs,
  color = "var(--chart-1)",
  unit = "",
  label,
  formatValue = formatCompact,
}: SparklineProps) {
  const [hover, setHover] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  if (points.length < 2) return null;

  const pad = 3;
  const t0 = +new Date(points[0].t);
  const t1 = +new Date(points[points.length - 1].t);
  const vMax = Math.max(...points.map((p) => p.v));
  const vMin = Math.min(...points.map((p) => p.v), 0);
  const x = (t: number) =>
    pad + ((t - t0) / Math.max(1, t1 - t0)) * (width - pad * 2);
  const y = (v: number) =>
    height - pad - ((v - vMin) / Math.max(1e-9, vMax - vMin)) * (height - pad * 2);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(+new Date(p.t)).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join("");
  const area = `${path}L${x(t1).toFixed(1)},${height - pad}L${x(t0).toFixed(1)},${height - pad}Z`;

  const currentX =
    currentMs !== undefined && currentMs >= t0 && currentMs < t1
      ? x(currentMs)
      : null;

  const onMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(+new Date(p.t)) - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHover(nearest);
  };

  const hovered = hover !== null ? points[hover] : null;

  return (
    <div className="relative inline-block" style={{ width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label={`${label}: ${formatValue(points[points.length - 1].v)}${unit ? ` ${unit}` : ""}, ${points.length} points from ${formatDate(points[0].t)} to ${formatDate(points[points.length - 1].t)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="block touch-none"
      >
        <path d={area} fill={color} opacity={0.12} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {currentX !== null && (
          <line
            x1={currentX}
            x2={currentX}
            y1={0}
            y2={height}
            stroke="var(--ink-3)"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}
        {hovered && (
          <g>
            <line
              x1={x(+new Date(hovered.t))}
              x2={x(+new Date(hovered.t))}
              y1={0}
              y2={height}
              stroke="var(--line-2)"
              strokeWidth={1}
            />
            <circle
              cx={x(+new Date(hovered.t))}
              cy={y(hovered.v)}
              r={4}
              fill={color}
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
      {hovered && (
        <div
          role="status"
          className="pointer-events-none absolute -top-9 z-40 -translate-x-1/2 rounded-[var(--radius-sm)] border border-line-1 bg-surface-3 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-ink-1 shadow-md"
          style={{
            left: Math.min(width - 8, Math.max(8, x(+new Date(hovered.t)))),
          }}
        >
          {formatValue(hovered.v)}
          {unit ? ` ${unit}` : ""}{" "}
          <span className="text-ink-3">{formatDate(hovered.t)}</span>
        </div>
      )}
    </div>
  );
}
