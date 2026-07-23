"use client";

import Link from "next/link";
import { ArrowLeftRight, ExternalLink, GitFork, History, Star } from "lucide-react";
import type { RepositoryAnalysis } from "@/domains/schemas";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { formatCompact, formatDate, formatMonthYear } from "@/lib/utils";

export function RepoHeader({ analysis }: { analysis: RepositoryAnalysis }) {
  const repo = analysis.repository;
  const first = analysis.commits[0];
  const last = analysis.commits[analysis.commits.length - 1];
  const isFictional = analysis.mode === "demo" && repo.owner === "chronicle-demo";

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line-0 bg-surface-1 px-3 sm:px-4">
      <Link
        href="/explore"
        className="font-mono text-xs font-semibold tracking-tight text-ink-2 transition-colors hover:text-ink-1"
        aria-label="CodeChronicle home"
      >
        cc<span className="text-accent">/</span>
      </Link>
      <div className="h-4 w-px bg-line-1" aria-hidden />
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate font-mono text-sm text-ink-1">
          <span className="text-ink-3">{repo.owner}/</span>
          <span className="font-semibold">{repo.name}</span>
        </h1>
        {repo.primaryLanguage && (
          <Badge tone="neutral" className="hidden sm:inline-flex">
            {repo.primaryLanguage}
          </Badge>
        )}
        <Tooltip
          label={
            isFictional
              ? `Fictional demo dataset generated for CodeChronicle (analyzed ${formatDate(analysis.analyzedAt)})`
              : analysis.mode === "demo"
                ? `Pre-analyzed snapshot of the real repository, captured ${formatDate(analysis.analyzedAt)}`
                : `Live ${analysis.mode} analysis, ${formatDate(analysis.analyzedAt)}`
          }
        >
          <Badge tone="accent">
            {analysis.mode === "demo" ? "demo data" : analysis.mode}
          </Badge>
        </Tooltip>
      </div>

      <p className="hidden min-w-0 flex-1 truncate text-xs text-ink-3 lg:block">
        {repo.description}
      </p>

      <div className="ml-auto flex shrink-0 items-center gap-3 text-[11px] text-ink-3">
        {repo.stars > 0 && (
          <span className="hidden items-center gap-1 sm:flex" title={`${repo.stars} stars`}>
            <Star className="h-3 w-3" aria-hidden />
            {formatCompact(repo.stars)}
          </span>
        )}
        {repo.forks > 0 && (
          <span className="hidden items-center gap-1 md:flex" title={`${repo.forks} forks`}>
            <GitFork className="h-3 w-3" aria-hidden />
            {formatCompact(repo.forks)}
          </span>
        )}
        <span className="hidden items-center gap-1 md:flex" title="Analyzed commits and range">
          <History className="h-3 w-3" aria-hidden />
          {formatCompact(analysis.commits.length)} commits ·{" "}
          {first && formatMonthYear(first.date)}–{last && formatMonthYear(last.date)}
        </span>
        <Link
          href={`/repo/${repo.owner}/${repo.name}/compare`}
          className="flex items-center gap-1 rounded-[var(--radius-md)] border border-line-1 px-2 py-1 text-ink-2 transition-colors hover:border-line-2 hover:text-ink-1"
          data-testid="compare-link"
        >
          <ArrowLeftRight className="h-3 w-3" aria-hidden />
          <span className="hidden sm:inline">Compare</span>
        </Link>
        {!isFictional && (
          <a
            href={repo.url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open on GitHub"
            className="flex items-center gap-1 text-ink-3 transition-colors hover:text-ink-1"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
    </header>
  );
}
