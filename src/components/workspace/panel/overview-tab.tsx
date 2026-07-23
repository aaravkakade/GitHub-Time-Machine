"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import type { RepositoryAnalysis } from "@/domains/schemas";
import { useWorkspaceStore } from "@/store/workspace-store";
import { Sparkline } from "@/components/charts/sparkline";
import { formatCompact } from "@/lib/utils";
import { SectionLabel } from "./panel-utils";

const METRIC_CARDS: {
  seriesId: string;
  label: string;
  pick: (
    m: RepositoryAnalysis["snapshots"][number]["metrics"],
  ) => number | null;
  format?: (v: number) => string;
}[] = [
  { seriesId: "loc", label: "Lines of code", pick: (m) => m.loc },
  { seriesId: "files", label: "Files", pick: (m) => m.files },
  { seriesId: "modules", label: "Modules", pick: (m) => m.modules },
  { seriesId: "dependencies", label: "Dependencies", pick: (m) => m.dependencyCount },
  {
    seriesId: "complexity",
    label: "Avg. complexity",
    pick: (m) => m.avgComplexity,
    format: (v) => v.toFixed(1),
  },
  {
    seriesId: "test-ratio",
    label: "Test ratio",
    pick: (m) => m.testRatio,
    format: (v) => v.toFixed(2),
  },
];

export function OverviewTab({ analysis }: { analysis: RepositoryAnalysis }) {
  const snapshotIndex = useWorkspaceStore((s) => s.snapshotIndex);
  const timeMs = useWorkspaceStore((s) => s.timeMs);
  const snapshot = analysis.snapshots[snapshotIndex];
  const prev = snapshotIndex > 0 ? analysis.snapshots[snapshotIndex - 1] : null;
  const [showDisclosures, setShowDisclosures] = React.useState(false);

  const contributorsSoFar = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of analysis.commits) {
      if (+new Date(c.date) > timeMs) break;
      counts.set(c.author.login, (counts.get(c.author.login) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [analysis.commits, timeMs]);

  return (
    <div className="space-y-5 p-4">
      <div>
        <SectionLabel>State at this point</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {METRIC_CARDS.map((card) => {
            const value = card.pick(snapshot.metrics);
            if (value === null) return null;
            const prevValue = prev ? card.pick(prev.metrics) : null;
            const delta =
              prevValue !== null && prevValue !== 0
                ? ((value - prevValue) / Math.abs(prevValue)) * 100
                : null;
            const series = analysis.metricSeries.find(
              (s) => s.id === card.seriesId,
            );
            const fmt = card.format ?? formatCompact;
            return (
              <div
                key={card.seriesId}
                className="rounded-[var(--radius-md)] border border-line-0 bg-surface-2/50 p-2.5"
              >
                <p className="text-[10px] text-ink-3">{card.label}</p>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="font-mono text-base font-semibold text-ink-1">
                    {fmt(value)}
                  </span>
                  {delta !== null && Math.abs(delta) >= 0.5 && (
                    <span
                      className={`text-[10px] font-medium ${delta > 0 ? "text-add" : "text-remove"}`}
                    >
                      {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
                    </span>
                  )}
                </div>
                {series && (
                  <div className="mt-1.5">
                    <Sparkline
                      points={series.points}
                      currentMs={timeMs}
                      width={128}
                      height={26}
                      label={card.label}
                      formatValue={fmt}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <SectionLabel>Contributors so far ({contributorsSoFar.length})</SectionLabel>
        <div className="space-y-1">
          {contributorsSoFar.slice(0, 6).map(([login, commits]) => {
            const max = contributorsSoFar[0][1];
            return (
              <div key={login} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate font-mono text-ink-2">{login}</span>
                <span
                  className="h-2 rounded-sm bg-chart-1/70"
                  style={{ width: `${Math.max(3, (commits / max) * 130)}px` }}
                  aria-hidden
                />
                <span className="text-[10px] text-ink-3">{formatCompact(commits)}</span>
              </div>
            );
          })}
          {contributorsSoFar.length > 6 && (
            <p className="text-[10px] text-ink-3">
              + {contributorsSoFar.length - 6} more
            </p>
          )}
        </div>
      </div>

      {snapshot.packages.length > 0 && (
        <div>
          <SectionLabel>Dependencies at this point</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {snapshot.packages.slice(0, 24).map((pkg) => (
              <span
                key={pkg}
                className="rounded-[var(--radius-sm)] border border-line-0 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
              >
                {pkg}
              </span>
            ))}
            {snapshot.packages.length > 24 && (
              <span className="px-1.5 py-0.5 text-[10px] text-ink-3">
                +{snapshot.packages.length - 24} more
              </span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-[var(--radius-md)] border border-line-0 bg-surface-2/40">
        <button
          onClick={() => setShowDisclosures((v) => !v)}
          aria-expanded={showDisclosures}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-medium text-ink-2 hover:text-ink-1"
        >
          How to read this analysis
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${showDisclosures ? "rotate-180" : ""}`}
          />
        </button>
        {showDisclosures && (
          <ul className="space-y-1.5 px-3 pb-3 text-[11px] leading-relaxed text-ink-3">
            {analysis.disclosures.map((d, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden>·</span>
                {d}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
