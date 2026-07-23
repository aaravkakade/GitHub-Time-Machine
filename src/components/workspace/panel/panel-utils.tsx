"use client";

import * as React from "react";
import type { Commit, RepositoryAnalysis } from "@/domains/schemas";
import { formatDate, shortSha } from "@/lib/utils";

/** Fictional demo repos have no real GitHub URL to link to. */
export function commitUrl(
  analysis: RepositoryAnalysis,
  sha: string,
): string | null {
  if (analysis.mode === "demo" && analysis.repository.owner === "chronicle-demo") {
    return null;
  }
  return `${analysis.repository.url}/commit/${sha}`;
}

export function CommitChip({
  analysis,
  sha,
}: {
  analysis: RepositoryAnalysis;
  sha: string;
}) {
  const url = commitUrl(analysis, sha);
  const label = shortSha(sha);
  const commit = React.useMemo(
    () => analysis.commits.find((c) => c.sha === sha),
    [analysis, sha],
  );
  const title = commit
    ? `${commit.message.split("\n")[0]} — ${formatDate(commit.date)}`
    : undefined;
  const className =
    "inline-flex items-center rounded-[var(--radius-sm)] border border-line-1 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2 hover:border-line-2 hover:text-ink-1";
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" title={title} className={className}>
      {label}
    </a>
  ) : (
    <span title={title} className={className}>
      {label}
    </span>
  );
}

export function CommitRow({
  analysis,
  commit,
}: {
  analysis: RepositoryAnalysis;
  commit: Commit;
}) {
  return (
    <div className="flex items-start gap-2 border-b border-line-0 py-2 last:border-b-0">
      <CommitChip analysis={analysis} sha={commit.sha} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-ink-1" title={commit.message.split("\n")[0]}>
          {commit.message.split("\n")[0]}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-ink-3">
          <span>{commit.author.login}</span>
          <span>{formatDate(commit.date)}</span>
          {commit.pullRequest !== null && <span>#{commit.pullRequest}</span>}
          <span>
            <span className="text-add">+{commit.additions}</span>{" "}
            <span className="text-remove">−{commit.deletions}</span>
          </span>
        </p>
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
      {children}
    </h3>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-xs text-ink-3">{children}</p>;
}
