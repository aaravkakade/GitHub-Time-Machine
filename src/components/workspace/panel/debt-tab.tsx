"use client";

import * as React from "react";
import { ChevronDown, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { DebtSignal, RepositoryAnalysis } from "@/domains/schemas";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/charts/sparkline";
import { useWorkspaceStore } from "@/store/workspace-store";
import { CommitChip, SectionLabel } from "./panel-utils";

const severityTone = { high: "remove", medium: "warn", low: "neutral" } as const;

function TrendIcon({ trend }: { trend: DebtSignal["trend"] }) {
  const Icon =
    trend === "rising" ? TrendingUp : trend === "falling" ? TrendingDown : Minus;
  return <Icon className="h-3 w-3" aria-hidden />;
}

export function DebtTab({ analysis }: { analysis: RepositoryAnalysis }) {
  const timeMs = useWorkspaceStore((s) => s.timeMs);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  return (
    <div className="space-y-5 p-4" data-testid="debt-tab">
      <p className="rounded-[var(--radius-md)] border border-warn/25 bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-ink-2">
        These are <strong className="text-ink-1">indicators of maintenance risk</strong>,
        not definitive proof of technical debt. Every signal shows how it was
        measured — judge it against your knowledge of the project.
      </p>

      <div>
        <SectionLabel>
          Debt signals ({analysis.debtSignals.length})
        </SectionLabel>
        {analysis.debtSignals.length === 0 && (
          <p className="text-xs text-ink-3">
            No debt signals crossed their thresholds in the analyzed history.
          </p>
        )}
        <ul className="space-y-2">
          {analysis.debtSignals.map((signal) => {
            const open = expanded === signal.id;
            return (
              <li
                key={signal.id}
                className="rounded-[var(--radius-md)] border border-line-0 bg-surface-2/50"
              >
                <button
                  onClick={() => setExpanded(open ? null : signal.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                >
                  <Badge tone={severityTone[signal.severity]}>
                    {signal.severity}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-1">
                    {signal.title}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-ink-3">
                    <TrendIcon trend={signal.trend} />
                    {signal.trend}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && (
                  <div className="space-y-2.5 border-t border-line-0 px-3 py-2.5">
                    <p className="text-xs leading-relaxed text-ink-2">
                      {signal.description}
                    </p>
                    {signal.series.length >= 2 && (
                      <Sparkline
                        points={signal.series}
                        currentMs={timeMs}
                        width={280}
                        height={36}
                        label={signal.title}
                        color="var(--warn)"
                      />
                    )}
                    <div>
                      <p className="text-[10px] font-semibold tracking-wide text-ink-3 uppercase">
                        How it was measured
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">
                        {signal.methodology}
                      </p>
                    </div>
                    {(signal.evidence.files.length > 0 ||
                      signal.evidence.commits.length > 0) && (
                      <div className="flex flex-wrap items-center gap-1">
                        {signal.evidence.files.map((f) => (
                          <span
                            key={f}
                            className="rounded-[var(--radius-sm)] border border-line-0 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
                          >
                            {f}
                          </span>
                        ))}
                        {signal.evidence.commits.map((sha) => (
                          <CommitChip key={sha} analysis={analysis} sha={sha} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <SectionLabel>
          Likely refactor opportunities ({analysis.refactorOpportunities.length})
        </SectionLabel>
        <p className="mb-2 text-[10px] text-ink-3">
          Suggestions derived from current measurable patterns — not
          predictions of the future.
        </p>
        <ul className="space-y-2">
          {analysis.refactorOpportunities.map((op) => (
            <li
              key={op.id}
              className="rounded-[var(--radius-md)] border border-line-0 bg-surface-2/50 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-1">
                  {op.title}
                </span>
                <Badge
                  tone={op.confidence === "high" ? "accent" : "neutral"}
                >
                  {op.confidence} confidence
                </Badge>
              </div>
              <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-ink-3">
                {op.evidence.map((e, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span aria-hidden>·</span>
                    {e}
                  </li>
                ))}
              </ul>
              <div className="mt-2 grid gap-1.5 text-[11px] sm:grid-cols-2">
                <p>
                  <span className="font-medium text-add">Benefit: </span>
                  <span className="text-ink-2">{op.benefit}</span>
                </p>
                <p>
                  <span className="font-medium text-warn">Risk: </span>
                  <span className="text-ink-2">{op.risk}</span>
                </p>
              </div>
              <p className="mt-2 rounded-[var(--radius-sm)] bg-surface-3/70 px-2 py-1.5 text-[11px] text-ink-2">
                <span className="font-medium text-ink-1">First step: </span>
                {op.firstStep}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
