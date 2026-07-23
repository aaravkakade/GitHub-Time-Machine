"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import type {
  AnalysisJob,
  RepositoryAnalysis,
} from "@/domains/schemas";
import { RepositoryAnalysisSchema } from "@/domains/schemas";
import { Button } from "@/components/ui/button";
import { Workspace } from "./workspace";

const STAGES: { key: string; label: string }[] = [
  { key: "history", label: "Reading repository history" },
  { key: "milestones", label: "Detecting important milestones" },
  { key: "graph", label: "Reconstructing module relationships" },
  { key: "metrics", label: "Measuring codebase change" },
  { key: "snapshots", label: "Generating architectural snapshots" },
  { key: "finalize", label: "Preparing the timeline" },
];

type LoaderState =
  | { phase: "starting" }
  | { phase: "running"; job: AnalysisJob }
  | { phase: "ready"; analysis: RepositoryAnalysis }
  | { phase: "error"; message: string; hint?: string };

export function LiveRepoLoader({
  owner,
  repo,
}: {
  owner: string;
  repo: string;
}) {
  const [state, setState] = React.useState<LoaderState>({ phase: "starting" });
  const reducedMotion = useReducedMotion() ?? false;

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fail = (message: string, hint?: string) => {
      if (!cancelled) setState({ phase: "error", message, hint });
    };

    const fetchData = async () => {
      const res = await fetch(
        `/api/repositories/${owner}/${repo}/data`,
      );
      if (!res.ok) {
        fail("Analysis finished but its results could not be loaded.");
        return;
      }
      const body = await res.json();
      const parsed = RepositoryAnalysisSchema.safeParse(body.analysis);
      if (!parsed.success) {
        fail("Analysis results were malformed.", parsed.error.issues[0]?.message);
        return;
      }
      if (!cancelled) setState({ phase: "ready", analysis: parsed.data });
    };

    const poll = async () => {
      try {
        const res = await fetch(`/api/repositories/${owner}/${repo}/status`);
        if (!res.ok) {
          fail("Could not read analysis status.");
          return;
        }
        const body = (await res.json()) as { job: AnalysisJob | null };
        if (!body.job) {
          fail("The analysis job disappeared — please retry.");
          return;
        }
        if (cancelled) return;
        if (body.job.status === "failed") {
          const message = body.job.error ?? "Analysis failed.";
          // The engine now reports the real cause (rate limit, not-found, …).
          // Only add the generic hint when the message doesn't explain itself.
          const explained = /rate limit|not found|private|GITHUB_TOKEN/i.test(
            message,
          );
          fail(
            message,
            explained
              ? undefined
              : "Lightweight mode reads the recent history via the GitHub API. For private repositories or very large histories, run the deep-analysis worker locally (see the README).",
          );
          return;
        }
        if (body.job.status === "completed") {
          await fetchData();
          return;
        }
        setState({ phase: "running", job: body.job });
        timer = setTimeout(poll, 900);
      } catch {
        fail("Network error while tracking analysis progress.");
      }
    };

    const start = async () => {
      try {
        const res = await fetch("/api/repositories/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: `${owner}/${repo}` }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          fail(
            body.error ?? "This repository could not be analyzed.",
            body.hint,
          );
          return;
        }
        poll();
      } catch {
        fail("Could not reach the analysis service.");
      }
    };

    start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [owner, repo]);

  if (state.phase === "ready") return <Workspace analysis={state.analysis} />;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-0 px-6">
      <div className="w-full max-w-md">
        <p className="mb-1 text-center font-mono text-xs text-ink-3">
          {owner}/{repo}
        </p>

        {state.phase === "error" ? (
          <div className="mt-4 rounded-[var(--radius-lg)] border border-remove/30 bg-remove-soft p-5 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-remove" aria-hidden />
            <h1 className="mt-3 text-sm font-semibold text-ink-1">
              {state.message}
            </h1>
            {state.hint && (
              <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{state.hint}</p>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => location.reload()}>
                Retry
              </Button>
              <Link href="/explore">
                <Button size="sm" variant="outline">Back to explore</Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-center text-lg font-semibold text-ink-1">
              Analyzing repository
            </h1>
            <p className="mt-1 text-center text-xs text-ink-3">
              Lightweight analysis via the GitHub API — larger repositories are
              sampled.
            </p>
            <ol className="mt-6 space-y-2.5" aria-label="Analysis progress">
              {STAGES.map((stage, i) => {
                const job = state.phase === "running" ? state.job : null;
                const latest = job?.progress[job.progress.length - 1];
                const currentIndex = latest
                  ? STAGES.findIndex((s) => s.key === latest.stage)
                  : -1;
                const status =
                  currentIndex > i || latest?.stage === "done"
                    ? "done"
                    : currentIndex === i
                      ? "active"
                      : "pending";
                return (
                  <motion.li
                    key={stage.key}
                    initial={reducedMotion ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reducedMotion ? 0 : i * 0.06 }}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line-0 bg-surface-1 px-3 py-2.5"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {status === "done" ? (
                        <Check className="h-4 w-4 text-add" aria-hidden />
                      ) : status === "active" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-line-2" aria-hidden />
                      )}
                    </span>
                    <span
                      className={`text-xs ${
                        status === "pending" ? "text-ink-3" : "text-ink-1"
                      }`}
                    >
                      {stage.label}
                    </span>
                    {status === "active" &&
                      state.phase === "running" &&
                      state.job.progress[state.job.progress.length - 1]?.detail && (
                        <span className="ml-auto font-mono text-[10px] text-ink-3">
                          {state.job.progress[state.job.progress.length - 1].detail}
                        </span>
                      )}
                  </motion.li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
