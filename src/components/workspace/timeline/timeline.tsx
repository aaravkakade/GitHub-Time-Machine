"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { RepositoryAnalysis } from "@/domains/schemas";
import { useWorkspaceStore, type PlaybackSpeed } from "@/store/workspace-store";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { clamp, formatDate } from "@/lib/utils";
import { MILESTONE_META, DEFAULT_MILESTONE_META } from "../milestone-meta";
import { usePlayback } from "./use-playback";

const TRACK_HEIGHT = 96;
const PAD_X = 14;
const DENSITY_TOP = 30;
const DENSITY_BOTTOM = 76;

export function Timeline({ analysis }: { analysis: RepositoryAnalysis }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(800);

  const timeMs = useWorkspaceStore((s) => s.timeMs);
  const rangeStartMs = useWorkspaceStore((s) => s.rangeStartMs);
  const rangeEndMs = useWorkspaceStore((s) => s.rangeEndMs);
  const playing = useWorkspaceStore((s) => s.playing);
  const speed = useWorkspaceStore((s) => s.speed);
  const selection = useWorkspaceStore((s) => s.selection);
  const setTime = useWorkspaceStore((s) => s.setTime);
  const setPlaying = useWorkspaceStore((s) => s.setPlaying);
  const setSpeed = useWorkspaceStore((s) => s.setSpeed);
  const select = useWorkspaceStore((s) => s.select);

  const visitingMilestone = usePlayback(analysis);

  // Zoom window (defaults to the full range).
  const [view, setView] = React.useState<[number, number] | null>(null);
  const viewStart = view?.[0] ?? rangeStartMs;
  const viewEnd = view?.[1] ?? rangeEndMs;

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const x = React.useCallback(
    (t: number) =>
      PAD_X +
      ((t - viewStart) / Math.max(1, viewEnd - viewStart)) *
        (width - PAD_X * 2),
    [viewStart, viewEnd, width],
  );
  const xToTime = React.useCallback(
    (px: number) =>
      viewStart +
      ((px - PAD_X) / Math.max(1, width - PAD_X * 2)) * (viewEnd - viewStart),
    [viewStart, viewEnd, width],
  );

  // Commit density buckets for the visible window.
  const buckets = React.useMemo(() => {
    const count = Math.max(24, Math.min(160, Math.floor(width / 7)));
    const out = new Array<number>(count).fill(0);
    const span = viewEnd - viewStart;
    for (const c of analysis.commits) {
      const t = +new Date(c.date);
      if (t < viewStart || t > viewEnd) continue;
      const i = Math.min(count - 1, Math.floor(((t - viewStart) / span) * count));
      out[i] += 1;
    }
    const max = Math.max(1, ...out);
    return { values: out, max };
  }, [analysis.commits, viewStart, viewEnd, width]);

  // Year/quarter axis labels.
  const axisTicks = React.useMemo(() => {
    const ticks: { t: number; label: string }[] = [];
    const start = new Date(viewStart);
    const end = new Date(viewEnd);
    const spanYears = (viewEnd - viewStart) / (365 * 24 * 3600 * 1000);
    const startYear = start.getUTCFullYear();
    for (let y = startYear; y <= end.getUTCFullYear() + 1; y++) {
      if (spanYears > 2.2) {
        ticks.push({ t: +Date.UTC(y, 0, 1), label: String(y) });
      } else {
        for (let q = 0; q < 12; q += spanYears > 0.8 ? 3 : 1) {
          const t = +Date.UTC(y, q, 1);
          ticks.push({
            t,
            label:
              q === 0
                ? String(y)
                : new Date(t).toLocaleDateString("en-US", { month: "short" }),
          });
        }
      }
    }
    return ticks.filter((tk) => tk.t >= viewStart && tk.t <= viewEnd);
  }, [viewStart, viewEnd]);

  const milestones = analysis.milestones;
  const sortedMilestones = React.useMemo(
    () => [...milestones].sort((a, b) => a.date.localeCompare(b.date)),
    [milestones],
  );

  /* --------------------------- interactions --------------------------- */

  const dragging = React.useRef(false);
  const scrubFromEvent = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTime(xToTime(e.clientX - rect.left));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Ignore clicks on milestone markers (they have their own handlers).
    if ((e.target as HTMLElement).closest("[data-marker]")) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPlaying(false);
    scrubFromEvent(e);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current) scrubFromEvent(e);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  const stepMilestone = (direction: 1 | -1) => {
    setPlaying(false);
    const current = timeMs;
    const target =
      direction === 1
        ? sortedMilestones.find((m) => +new Date(m.date) > current + 1000)
        : [...sortedMilestones]
            .reverse()
            .find((m) => +new Date(m.date) < current - 1000);
    if (target) {
      setTime(+new Date(target.date));
      select({ type: "milestone", id: target.id });
    }
  };

  const onSliderKeyDown = (e: React.KeyboardEvent) => {
    const WEEK = 7 * 24 * 3600 * 1000;
    const MONTH = 30 * 24 * 3600 * 1000;
    switch (e.key) {
      case "ArrowRight":
        setTime(timeMs + (e.shiftKey ? MONTH : WEEK));
        break;
      case "ArrowLeft":
        setTime(timeMs - (e.shiftKey ? MONTH : WEEK));
        break;
      case "Home":
        setTime(rangeStartMs);
        break;
      case "End":
        setTime(rangeEndMs);
        break;
      case "PageUp":
        stepMilestone(-1);
        break;
      case "PageDown":
        stepMilestone(1);
        break;
      case " ":
      case "Enter":
        setPlaying(!playing);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const zoom = (factor: number) => {
    const span = (viewEnd - viewStart) * factor;
    const fullSpan = rangeEndMs - rangeStartMs;
    if (span >= fullSpan) {
      setView(null);
      return;
    }
    const center = clamp(timeMs, viewStart, viewEnd);
    const minSpan = 14 * 24 * 3600 * 1000;
    const nextSpan = Math.max(minSpan, span);
    let start = center - nextSpan / 2;
    let end = center + nextSpan / 2;
    if (start < rangeStartMs) {
      end += rangeStartMs - start;
      start = rangeStartMs;
    }
    if (end > rangeEndMs) {
      start -= end - rangeEndMs;
      end = rangeEndMs;
    }
    setView([Math.max(rangeStartMs, start), Math.min(rangeEndMs, end)]);
  };

  const scrubX = clamp(x(timeMs), PAD_X, width - PAD_X);
  const currentDateLabel = formatDate(timeMs);

  return (
    <div className="border-t border-line-0 bg-surface-1">
      {/* Controls row */}
      <div className="flex items-center gap-1.5 px-3 pt-2 sm:gap-2">
        <Button
          size="icon"
          variant={playing ? "primary" : "secondary"}
          aria-label={playing ? "Pause playback" : "Play history"}
          data-testid="playback-toggle"
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button size="icon" variant="ghost" aria-label="Previous milestone" onClick={() => stepMilestone(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Next milestone" onClick={() => stepMilestone(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Segmented
          ariaLabel="Playback speed"
          value={String(speed)}
          onChange={(v) => setSpeed(Number(v) as PlaybackSpeed)}
          options={[
            { value: "0.5", label: "0.5×" },
            { value: "1", label: "1×" },
            { value: "2", label: "2×" },
            { value: "4", label: "4×" },
          ]}
          className="hidden sm:inline-flex"
        />
        <div
          className="ml-auto flex items-center gap-2 font-mono text-xs text-ink-2"
          data-testid="timeline-date"
          aria-live="off"
        >
          <span className="text-ink-1">{currentDateLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Zoom timeline in" onClick={() => zoom(0.5)}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom timeline out"
            onClick={() => zoom(2)}
            disabled={view === null}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Track */}
      <div
        ref={containerRef}
        className="relative mx-1 cursor-crosshair touch-none select-none"
        style={{ height: TRACK_HEIGHT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid="timeline-track"
      >
        <svg width="100%" height={TRACK_HEIGHT} className="block">
          {/* Density bars */}
          {buckets.values.map((v, i) => {
            if (v === 0) return null;
            const bw = (width - PAD_X * 2) / buckets.values.length;
            const h = Math.max(2, (v / buckets.max) * (DENSITY_BOTTOM - DENSITY_TOP));
            const bx = PAD_X + i * bw;
            const past = bx <= scrubX;
            return (
              <rect
                key={i}
                x={bx + 0.5}
                y={DENSITY_BOTTOM - h}
                width={Math.max(1.5, bw - 1.5)}
                height={h}
                rx={1}
                fill={past ? "var(--chart-1)" : "var(--line-2)"}
                opacity={past ? 0.75 : 0.6}
              />
            );
          })}

          {/* Baseline + axis */}
          <line x1={PAD_X} x2={width - PAD_X} y1={DENSITY_BOTTOM + 0.5} y2={DENSITY_BOTTOM + 0.5} stroke="var(--line-1)" />
          {axisTicks.map((tick) => (
            <g key={tick.t}>
              <line x1={x(tick.t)} x2={x(tick.t)} y1={DENSITY_BOTTOM} y2={DENSITY_BOTTOM + 4} stroke="var(--line-2)" />
              <text
                x={x(tick.t)}
                y={DENSITY_BOTTOM + 15}
                textAnchor="middle"
                className="fill-ink-3 font-mono"
                fontSize={9.5}
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Snapshot ticks */}
          {analysis.snapshots.map((s) => (
            <circle
              key={s.id}
              cx={x(+new Date(s.date))}
              cy={DENSITY_BOTTOM + 0.5}
              r={2.2}
              fill="var(--surface-1)"
              stroke="var(--ink-3)"
              strokeWidth={1}
            />
          ))}

          {/* Releases (labels are decluttered; every release keeps its tick) */}
          {(() => {
            let lastLabelX = -Infinity;
            return analysis.releases.map((r) => {
              const rx = x(+new Date(r.date));
              if (rx < PAD_X - 4 || rx > width - PAD_X + 4) return null;
              const showLabel = rx - lastLabelX >= 34;
              if (showLabel) lastLabelX = rx;
              return (
                <g key={`${r.tag}-${r.date}`}>
                  <line x1={rx} x2={rx} y1={showLabel ? 22 : DENSITY_TOP} y2={DENSITY_BOTTOM} stroke="var(--accent-line)" strokeDasharray="2 3" opacity={showLabel ? 1 : 0.4} />
                  {showLabel && (
                    <text x={rx + 3} y={DENSITY_TOP - 2} className="fill-ink-3 font-mono" fontSize={9}>
                      {r.tag}
                    </text>
                  )}
                </g>
              );
            });
          })()}

          {/* Scrub cursor */}
          <line x1={scrubX} x2={scrubX} y1={8} y2={DENSITY_BOTTOM + 6} stroke="var(--accent)" strokeWidth={1.5} />
        </svg>

        {/* Milestone markers (HTML for focus/hover behavior) */}
        {milestones.map((m) => {
          const mx = x(+new Date(m.date));
          if (mx < PAD_X - 6 || mx > width - PAD_X + 6) return null;
          const meta = MILESTONE_META[m.category] ?? DEFAULT_MILESTONE_META;
          const Icon = meta.icon;
          const active =
            (selection?.type === "milestone" && selection.id === m.id) ||
            visitingMilestone === m.id;
          return (
            <button
              key={m.id}
              data-marker
              data-testid={`milestone-marker-${m.category}`}
              aria-label={`Milestone, ${formatDate(m.date)}: ${m.title}`}
              title={`${m.title} — ${formatDate(m.date)}`}
              onClick={() => {
                setPlaying(false);
                setTime(+new Date(m.date));
                select({ type: "milestone", id: m.id });
              }}
              className={`absolute top-1 z-10 flex h-[18px] w-[18px] -translate-x-1/2 rotate-45 cursor-pointer items-center justify-center rounded-[4px] border transition-all duration-[var(--dur-fast)] ${
                active
                  ? "scale-125 border-accent bg-accent"
                  : "border-line-2 bg-surface-2 hover:border-accent hover:bg-surface-3"
              }`}
              style={{ left: mx }}
            >
              <Icon
                className={`h-2.5 w-2.5 -rotate-45 ${active ? "text-[#0b0b10]" : "text-ink-2"}`}
              />
            </button>
          );
        })}

        {/* Slider handle */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Time travel position"
          aria-valuemin={rangeStartMs}
          aria-valuemax={rangeEndMs}
          aria-valuenow={timeMs}
          aria-valuetext={currentDateLabel}
          data-testid="timeline-handle"
          onKeyDown={onSliderKeyDown}
          className="absolute z-20 h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-accent bg-surface-0 shadow-md transition-shadow hover:shadow-lg active:cursor-grabbing"
          style={{ left: scrubX, top: DENSITY_BOTTOM - 2 }}
        />
      </div>
    </div>
  );
}
