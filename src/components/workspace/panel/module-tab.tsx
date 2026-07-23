"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, Crosshair } from "lucide-react";
import type { ModuleMeta, RepositoryAnalysis } from "@/domains/schemas";
import { useWorkspaceStore } from "@/store/workspace-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/charts/sparkline";
import { formatCompact, formatDate } from "@/lib/utils";
import { CommitChip, EmptyNote, SectionLabel } from "./panel-utils";

/**
 * "Why did this file change?" — the historical evolution of the selected
 * module: creation, churn timeline, authors, co-change partners, renames.
 */
export function ModuleTab({
  analysis,
  moduleMeta,
}: {
  analysis: RepositoryAnalysis;
  moduleMeta: ModuleMeta;
}) {
  const snapshotIndex = useWorkspaceStore((s) => s.snapshotIndex);
  const timeMs = useWorkspaceStore((s) => s.timeMs);
  const setFocusModule = useWorkspaceStore((s) => s.setFocusModule);
  const focusModuleId = useWorkspaceStore((s) => s.focusModuleId);
  const snapshot = analysis.snapshots[snapshotIndex];
  const node = snapshot.nodes.find((n) => n.id === moduleMeta.id);

  const inModule = React.useCallback(
    (path: string) =>
      path === moduleMeta.path || path.startsWith(moduleMeta.path + "/"),
    [moduleMeta.path],
  );

  const records = React.useMemo(
    () => analysis.fileRecords.filter((f) => inModule(f.path)),
    [analysis.fileRecords, inModule],
  );

  const moduleChurnSeries = React.useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const r of records) {
      for (const p of r.churnSeries) {
        byMonth.set(p.t, (byMonth.get(p.t) ?? 0) + p.v);
      }
    }
    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([t, v]) => ({ t, v }));
  }, [records]);

  const authors = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of records) {
      for (const a of r.authors) {
        counts.set(a.login, (counts.get(a.login) ?? 0) + a.commits);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [records]);

  const dependencies = React.useMemo(() => {
    const out: { path: string; kind: string }[] = [];
    const inbound: { path: string; kind: string }[] = [];
    for (const e of snapshot.edges) {
      if (e.source === moduleMeta.id) {
        const meta = analysis.modules[e.target];
        if (meta) out.push({ path: meta.path, kind: e.kind });
      }
      if (e.target === moduleMeta.id) {
        const meta = analysis.modules[e.source];
        if (meta) inbound.push({ path: meta.path, kind: e.kind });
      }
    }
    return { out, inbound };
  }, [snapshot.edges, moduleMeta.id, analysis.modules]);

  const earliest = records.reduce<string | null>(
    (min, r) => (min === null || r.createdAt < min ? r.createdAt : min),
    null,
  );
  const renames = records.flatMap((r) =>
    r.renamedFrom.map((from) => ({ from, to: r.path })),
  );
  const coChanged = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of records) {
      for (const c of r.coChanged) {
        if (inModule(c.path)) continue;
        counts.set(c.path, (counts.get(c.path) ?? 0) + c.count);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [records, inModule]);

  const majorCommitShas = React.useMemo(() => {
    const shas = new Set<string>();
    for (const r of records) for (const sha of r.majorCommits) shas.add(sha);
    return analysis.commits
      .filter((c) => shas.has(c.sha))
      .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
      .slice(0, 5);
  }, [records, analysis.commits]);

  return (
    <div className="space-y-5 p-4" data-testid="module-detail">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate font-mono text-sm font-semibold text-ink-1">
              {moduleMeta.path}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
              {moduleMeta.language && <Badge tone="neutral">{moduleMeta.language}</Badge>}
              {moduleMeta.isTest && <Badge tone="outline">tests</Badge>}
              {node ? (
                <Badge tone={node.status === "added" ? "add" : node.status === "modified" ? "warn" : "neutral"}>
                  {node.status} in this period
                </Badge>
              ) : (
                <Badge tone="remove">not present at this point</Badge>
              )}
            </p>
          </div>
          <Button
            size="sm"
            variant={focusModuleId === moduleMeta.id ? "primary" : "outline"}
            onClick={() =>
              setFocusModule(focusModuleId === moduleMeta.id ? null : moduleMeta.id)
            }
          >
            <Crosshair className="h-3 w-3" />
            Focus
          </Button>
        </div>
        {node && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "lines", value: formatCompact(node.loc) },
              { label: "files", value: String(node.fileCount) },
              {
                label: "churn now",
                value: node.churn > 0 ? formatCompact(node.churn) : "—",
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-[var(--radius-md)] border border-line-0 bg-surface-2/50 py-2">
                <p className="font-mono text-sm font-semibold text-ink-1">{stat.value}</p>
                <p className="text-[10px] text-ink-3">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {moduleChurnSeries.length >= 2 && (
        <div>
          <SectionLabel>Change activity over time</SectionLabel>
          <Sparkline
            points={moduleChurnSeries}
            currentMs={timeMs}
            width={300}
            height={44}
            label={`Churn in ${moduleMeta.path}`}
            unit="lines/mo"
          />
          {earliest && (
            <p className="mt-1 text-[10px] text-ink-3">
              First tracked activity {formatDate(earliest)}
            </p>
          )}
        </div>
      )}

      {(dependencies.out.length > 0 || dependencies.inbound.length > 0) && (
        <div>
          <SectionLabel>Relationships at this point</SectionLabel>
          <div className="space-y-1 text-xs">
            {dependencies.out.map((d) => (
              <div key={`out-${d.path}`} className="flex items-center gap-1.5 text-ink-2">
                <ArrowUpRight className="h-3 w-3 shrink-0 text-ink-3" aria-hidden />
                <span className="sr-only">depends on</span>
                <span className="truncate font-mono text-[11px]">{d.path}</span>
                {d.kind === "structure" && <span className="text-[9px] text-ink-3">(structure)</span>}
              </div>
            ))}
            {dependencies.inbound.map((d) => (
              <div key={`in-${d.path}`} className="flex items-center gap-1.5 text-ink-2">
                <ArrowDownLeft className="h-3 w-3 shrink-0 text-ink-3" aria-hidden />
                <span className="sr-only">used by</span>
                <span className="truncate font-mono text-[11px]">{d.path}</span>
                {d.kind === "structure" && <span className="text-[9px] text-ink-3">(structure)</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {renames.length > 0 && (
        <div>
          <SectionLabel>Rename history</SectionLabel>
          {renames.slice(0, 4).map((r) => (
            <p key={r.from} className="font-mono text-[10px] text-ink-3">
              {r.from} <span className="text-ink-2">→</span> {r.to}
            </p>
          ))}
        </div>
      )}

      {authors.length > 0 && (
        <div>
          <SectionLabel>Main authors</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {authors.slice(0, 6).map(([login, commits]) => (
              <Badge key={login} tone="neutral">
                {login} · {formatCompact(commits)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {coChanged.length > 0 && (
        <div>
          <SectionLabel>Changes together with</SectionLabel>
          <div className="space-y-1">
            {coChanged.map(([path, count]) => (
              <p key={path} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-mono text-ink-2">{path}</span>
                <span className="shrink-0 text-ink-3">{count}×</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {majorCommitShas.length > 0 && (
        <div>
          <SectionLabel>Defining commits</SectionLabel>
          <div className="space-y-1.5">
            {majorCommitShas.map((c) => (
              <div key={c.sha} className="flex items-center gap-2 text-[11px]">
                <CommitChip analysis={analysis} sha={c.sha} />
                <span className="truncate text-ink-2">{c.message.split("\n")[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {records.length === 0 && (
        <EmptyNote>
          No per-file history retained for this module (only the most active
          files are tracked in detail).
        </EmptyNote>
      )}
    </div>
  );
}
