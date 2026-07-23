"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { RepositoryAnalysis } from "@/domains/schemas";
import { diffSnapshots } from "@/domains/snapshots/diff";
import { computeUnionLayout } from "@/domains/visualization/layout";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { AiInsightBlock } from "@/components/workspace/panel/ai-insight";
import { CommitRow, SectionLabel } from "@/components/workspace/panel/panel-utils";
import { MILESTONE_META, DEFAULT_MILESTONE_META } from "@/components/workspace/milestone-meta";
import { formatCompact, formatDate } from "@/lib/utils";

const CompareCanvas = dynamic(
  () => import("./compare-canvas").then((m) => m.CompareCanvas),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  },
);

function SnapshotSelect({
  analysis,
  value,
  onChange,
  id,
  label,
}: {
  analysis: RepositoryAnalysis;
  value: string;
  onChange: (v: string) => void;
  id: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-[10px] font-semibold tracking-wide text-ink-3 uppercase">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={id}
        className="h-8 max-w-52 rounded-[var(--radius-md)] border border-line-1 bg-surface-1 px-2 font-mono text-xs text-ink-1 hover:border-line-2"
      >
        {analysis.snapshots.map((s) => (
          <option key={s.id} value={s.id}>
            {formatDate(s.date)} · {s.reason}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Compact for large values, two decimals for small ones (e.g. test ratio). */
function fmtMetric(v: number): string {
  return Math.abs(v) < 10 ? String(Math.round(v * 100) / 100) : formatCompact(v);
}

function Delta({ before, after }: { before: number | null; after: number | null }) {
  if (before === null || after === null) return <span className="text-ink-3">—</span>;
  const delta = after - before;
  if (Math.abs(delta) < 0.005) return <span className="text-ink-3">±0</span>;
  const pct = before !== 0 ? ` (${delta > 0 ? "+" : ""}${Math.round((delta / Math.abs(before)) * 100)}%)` : "";
  return (
    <span className={delta > 0 ? "text-add" : "text-remove"}>
      {delta > 0 ? "▲" : "▼"} {fmtMetric(Math.abs(delta))}
      {pct}
    </span>
  );
}

export function CompareWorkspace({ analysis }: { analysis: RepositoryAnalysis }) {
  const snapshots = analysis.snapshots;
  const [beforeId, setBeforeId] = React.useState(snapshots[0].id);
  const [afterId, setAfterId] = React.useState(snapshots[snapshots.length - 1].id);
  const [mode, setMode] = React.useState<"split" | "morph">("split");
  const [morphSide, setMorphSide] = React.useState<"before" | "after">("before");

  const layout = React.useMemo(() => computeUnionLayout(analysis), [analysis]);
  const diff = React.useMemo(
    () => diffSnapshots(analysis, beforeId, afterId),
    [analysis, beforeId, afterId],
  );

  const indexOf = (id: string) => snapshots.findIndex((s) => s.id === id);
  const repo = analysis.repository;

  return (
    <div className="flex min-h-dvh flex-col bg-surface-0" data-testid="compare-workspace">
      <header className="flex h-12 shrink-0 flex-wrap items-center gap-3 border-b border-line-0 bg-surface-1 px-3 sm:px-4">
        <Link
          href={`/repo/${repo.owner}/${repo.name}`}
          className="flex items-center gap-1.5 text-xs text-ink-2 transition-colors hover:text-ink-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          <span className="font-mono">
            {repo.owner}/{repo.name}
          </span>
        </Link>
        <div className="h-4 w-px bg-line-1" aria-hidden />
        <h1 className="text-sm font-semibold text-ink-1">Compare two moments</h1>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <SnapshotSelect analysis={analysis} value={beforeId} onChange={setBeforeId} id="compare-before" label="A" />
          <ArrowRight className="h-3.5 w-3.5 text-ink-3" aria-hidden />
          <SnapshotSelect analysis={analysis} value={afterId} onChange={setAfterId} id="compare-after" label="B" />
          <Segmented
            ariaLabel="Comparison view mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "split", label: "Side by side" },
              { value: "morph", label: "Morph" },
            ]}
          />
        </div>
      </header>

      {/* Canvases */}
      <div className="grid h-[46dvh] min-h-[320px] shrink-0 grid-cols-1 divide-y divide-line-0 md:grid-cols-2 md:divide-x md:divide-y-0">
        {mode === "split" ? (
          <>
            <div className="relative">
              <span className="absolute top-2 left-3 z-10 rounded-full border border-line-1 bg-surface-1/90 px-2 py-0.5 font-mono text-[10px] text-ink-2">
                A · {diff ? formatDate(diff.before.date) : ""}
              </span>
              <CompareCanvas analysis={analysis} layout={layout} snapshotIndex={indexOf(diff?.before.id ?? beforeId)} label="before" />
            </div>
            <div className="relative hidden md:block">
              <span className="absolute top-2 left-3 z-10 rounded-full border border-[var(--accent-line)] bg-surface-1/90 px-2 py-0.5 font-mono text-[10px] text-accent-strong">
                B · {diff ? formatDate(diff.after.date) : ""}
              </span>
              <CompareCanvas analysis={analysis} layout={layout} snapshotIndex={indexOf(diff?.after.id ?? afterId)} label="after" />
            </div>
          </>
        ) : (
          <div className="relative md:col-span-2">
            <div className="absolute top-2 left-3 z-10">
              <Segmented
                ariaLabel="Morph between the two moments"
                value={morphSide}
                onChange={setMorphSide}
                options={[
                  { value: "before", label: `A · ${diff ? formatDate(diff.before.date) : ""}` },
                  { value: "after", label: `B · ${diff ? formatDate(diff.after.date) : ""}` },
                ]}
              />
            </div>
            <CompareCanvas
              analysis={analysis}
              layout={layout}
              snapshotIndex={indexOf(
                morphSide === "before" ? (diff?.before.id ?? beforeId) : (diff?.after.id ?? afterId),
              )}
              label="morph"
            />
          </div>
        )}
      </div>

      {/* Diff details */}
      {diff && (
        <div className="grid flex-1 gap-6 border-t border-line-0 bg-surface-1/40 p-4 md:grid-cols-3 md:p-6">
          <section>
            <SectionLabel>Measured change</SectionLabel>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] text-ink-3 uppercase">
                  <th className="pb-1 font-medium">Metric</th>
                  <th className="pb-1 text-right font-medium">A</th>
                  <th className="pb-1 text-right font-medium">B</th>
                  <th className="pb-1 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {diff.metrics.map((m) => (
                  <tr key={m.key} className="border-t border-line-0">
                    <td className="py-1.5 text-ink-2">{m.label}</td>
                    <td className="py-1.5 text-right font-mono text-ink-2">
                      {m.before === null ? "—" : fmtMetric(m.before)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-ink-1">
                      {m.after === null ? "—" : fmtMetric(m.after)}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      <Delta before={m.before} after={m.after} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(diff.packagesAdded.length > 0 || diff.packagesRemoved.length > 0) && (
              <div className="mt-4">
                <SectionLabel>Dependency changes</SectionLabel>
                <div className="flex flex-wrap gap-1">
                  {diff.packagesAdded.map((p) => (
                    <Badge key={`+${p}`} tone="add">+ {p}</Badge>
                  ))}
                  {diff.packagesRemoved.map((p) => (
                    <Badge key={`-${p}`} tone="remove">− {p}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <SectionLabel>Contributors in this range ({diff.authorsBetween.length})</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {diff.authorsBetween.slice(0, 8).map((a) => (
                  <Badge key={a.login} tone="neutral">
                    {a.login} · {formatCompact(a.commits)}
                  </Badge>
                ))}
              </div>
            </div>
          </section>

          <section>
            <SectionLabel>Architecture diff</SectionLabel>
            <div className="space-y-3 text-xs">
              <div>
                <p className="mb-1 text-[10px] text-ink-3">
                  Modules added ({diff.addedModules.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {diff.addedModules.length === 0 && <span className="text-ink-3">none</span>}
                  {diff.addedModules.map((m) => (
                    <Badge key={m.id} tone="add">{m.path}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] text-ink-3">
                  Modules removed ({diff.removedModules.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {diff.removedModules.length === 0 && <span className="text-ink-3">none</span>}
                  {diff.removedModules.map((m) => (
                    <Badge key={m.id} tone="remove">{m.path}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] text-ink-3">
                  Hotspots (largest size changes)
                </p>
                <div className="space-y-1">
                  {diff.grownModules.slice(0, 6).map((m) => (
                    <p key={m.id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                      <span className="truncate text-ink-2">{m.path}</span>
                      <span className={m.locAfter >= m.locBefore ? "text-add" : "text-remove"}>
                        {m.locAfter >= m.locBefore ? "+" : "−"}
                        {formatCompact(Math.abs(m.locAfter - m.locBefore))} loc
                      </span>
                    </p>
                  ))}
                  {diff.grownModules.length === 0 && <span className="text-ink-3">none</span>}
                </div>
              </div>
              {(diff.addedEdges.length > 0 || diff.removedEdges.length > 0) && (
                <div>
                  <p className="mb-1 text-[10px] text-ink-3">Relationship changes</p>
                  <div className="space-y-0.5 font-mono text-[11px]">
                    {diff.addedEdges.slice(0, 5).map((e, i) => (
                      <p key={`+${i}`} className="truncate text-add">+ {e.source} → {e.target}</p>
                    ))}
                    {diff.removedEdges.slice(0, 5).map((e, i) => (
                      <p key={`-${i}`} className="truncate text-remove">− {e.source} → {e.target}</p>
                    ))}
                  </div>
                </div>
              )}
              {diff.milestonesBetween.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] text-ink-3">
                    Milestones between ({diff.milestonesBetween.length})
                  </p>
                  <div className="space-y-1">
                    {diff.milestonesBetween.map((m) => {
                      const meta = MILESTONE_META[m.category] ?? DEFAULT_MILESTONE_META;
                      const Icon = meta.icon;
                      return (
                        <p key={m.id} className="flex items-center gap-1.5 text-[11px] text-ink-2">
                          <Icon className="h-3 w-3 shrink-0 text-accent-strong" aria-hidden />
                          <span className="truncate">{m.title}</span>
                          <span className="ml-auto shrink-0 text-ink-3">{formatDate(m.date)}</span>
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section>
            <SectionLabel>
              {formatCompact(diff.commitsBetween.length)} commits between
            </SectionLabel>
            <div className="max-h-56 overflow-y-auto pr-1">
              {[...diff.commitsBetween]
                .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
                .slice(0, 12)
                .map((c) => (
                  <CommitRow key={c.sha} analysis={analysis} commit={c} />
                ))}
            </div>
            <div className="mt-4">
              <AiInsightBlock
                analysis={analysis}
                subjectType="comparison"
                subjectId={`${diff.before.id}..${diff.after.id}`}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
