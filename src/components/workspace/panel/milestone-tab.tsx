"use client";

import * as React from "react";
import type { Milestone, RepositoryAnalysis } from "@/domains/schemas";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { MILESTONE_META, DEFAULT_MILESTONE_META } from "../milestone-meta";
import { AiInsightBlock } from "./ai-insight";
import { CommitChip, SectionLabel } from "./panel-utils";

export function MilestoneTab({
  analysis,
  milestone,
}: {
  analysis: RepositoryAnalysis;
  milestone: Milestone;
}) {
  const meta = MILESTONE_META[milestone.category] ?? DEFAULT_MILESTONE_META;
  const Icon = meta.icon;
  const confidencePct = Math.round(milestone.confidence * 100);

  return (
    <div className="space-y-5 p-4" data-testid="milestone-detail">
      <div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-accent-soft">
            <Icon className="h-3.5 w-3.5 text-accent-strong" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-1">{milestone.title}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
              <span>{formatDate(milestone.date)}</span>
              <Badge tone="neutral">{meta.label}</Badge>
              <CommitChip analysis={analysis} sha={milestone.sha} />
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-2">{milestone.summary}</p>
      </div>

      <div>
        <SectionLabel>Detection confidence</SectionLabel>
        <div className="flex items-center gap-2">
          <div
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={confidencePct}
            aria-label="Milestone detection confidence"
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${confidencePct}%` }}
            />
          </div>
          <span className="font-mono text-[11px] text-ink-2">{confidencePct}%</span>
        </div>
        <p className="mt-1 text-[10px] text-ink-3">
          Confidence reflects how many independent measurable signals detected
          this moment — it is not an AI judgment.
        </p>
      </div>

      <div>
        <SectionLabel>
          Detected signals ({milestone.signals.length})
        </SectionLabel>
        <ul className="space-y-2">
          {milestone.signals.map((signal, i) => (
            <li
              key={i}
              className="rounded-[var(--radius-md)] border border-line-0 bg-surface-2/50 p-2.5"
            >
              <p className="font-mono text-[10px] text-ink-3">{signal.type}</p>
              <p className="mt-0.5 text-xs text-ink-1">{signal.description}</p>
              {signal.evidence.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {signal.evidence.slice(0, 6).map((sha) => (
                    <CommitChip key={sha} analysis={analysis} sha={sha} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {milestone.affectedPaths.length > 0 && (
        <div>
          <SectionLabel>Affected areas</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {milestone.affectedPaths.map((p) => (
              <span
                key={p}
                className="rounded-[var(--radius-sm)] border border-line-0 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      <AiInsightBlock
        analysis={analysis}
        subjectType="milestone"
        subjectId={milestone.id}
      />
    </div>
  );
}
