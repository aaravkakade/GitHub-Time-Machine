"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import type { AIInsight, RepositoryAnalysis } from "@/domains/schemas";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CommitChip } from "./panel-utils";

interface AiInsightBlockProps {
  analysis: RepositoryAnalysis;
  subjectType: "milestone" | "file" | "overview" | "comparison";
  subjectId: string;
}

/**
 * Evidence-grounded AI summary. The server returns either a model-generated
 * insight (evidence-verified) or a deterministic fallback when no API key is
 * configured — both are labeled honestly.
 */
export function AiInsightBlock({
  analysis,
  subjectType,
  subjectId,
}: AiInsightBlockProps) {
  const [insight, setInsight] = React.useState<AIInsight | null>(null);
  const [state, setState] = React.useState<"loading" | "done" | "error">(
    "loading",
  );

  React.useEffect(() => {
    let cancelled = false;
    setState("loading");
    setInsight(null);
    fetch("/api/ai/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoId: analysis.repository.id,
        mode: analysis.mode,
        subjectType,
        subjectId,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`insight request failed: ${res.status}`);
        return res.json();
      })
      .then((data: { insight: AIInsight }) => {
        if (cancelled) return;
        setInsight(data.insight);
        setState("done");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [analysis.repository.id, analysis.mode, subjectType, subjectId]);

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-accent-soft/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-accent-strong" aria-hidden />
        <span className="text-[11px] font-semibold text-accent-strong">
          {insight?.isFallback ? "Deterministic summary" : "AI interpretation"}
        </span>
        {insight && !insight.isFallback && (
          <Badge tone="outline">{insight.model}</Badge>
        )}
        {insight?.classification && (
          <Badge tone="accent">{insight.classification}</Badge>
        )}
      </div>

      {state === "loading" && (
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      )}
      {state === "error" && (
        <p className="text-xs text-ink-3">
          Summary unavailable right now — the measurable signals above are the
          source of truth either way.
        </p>
      )}
      {state === "done" && insight && (
        <>
          <p className="text-xs leading-relaxed text-ink-1">{insight.summary}</p>
          {insight.evidenceIds.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-ink-3">Evidence:</span>
              {insight.evidenceIds.slice(0, 6).map((id) =>
                /^[0-9a-f]{7,40}$/.test(id) ? (
                  <CommitChip key={id} analysis={analysis} sha={id} />
                ) : (
                  <span key={id} className="font-mono text-[10px] text-ink-3">
                    {id}
                  </span>
                ),
              )}
            </div>
          )}
          <p className="mt-2 text-[10px] text-ink-3">
            {insight.isFallback
              ? "Generated from measured signals only — configure an AI key for interpretive summaries."
              : "AI summaries can be imperfect. Every cited commit is verifiable above."}
          </p>
        </>
      )}
    </div>
  );
}
