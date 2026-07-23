"use client";

import * as React from "react";
import type { RepositoryAnalysis } from "@/domains/schemas";
import { useWorkspaceStore } from "@/store/workspace-store";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CommitRow, EmptyNote, SectionLabel } from "./panel-utils";

const PAGE = 40;

/** Commits inside the currently viewed period (previous snapshot → cursor). */
export function ChangesTab({ analysis }: { analysis: RepositoryAnalysis }) {
  const snapshotIndex = useWorkspaceStore((s) => s.snapshotIndex);
  const timeMs = useWorkspaceStore((s) => s.timeMs);
  const [limit, setLimit] = React.useState(PAGE);

  const windowStart =
    snapshotIndex > 0
      ? +new Date(analysis.snapshots[snapshotIndex - 1].date)
      : -Infinity;

  const commits = React.useMemo(() => {
    const upper = Math.max(timeMs, +new Date(analysis.snapshots[snapshotIndex].date));
    return analysis.commits
      .filter((c) => {
        const t = +new Date(c.date);
        return t > windowStart && t <= upper;
      })
      .reverse();
  }, [analysis, windowStart, timeMs, snapshotIndex]);

  React.useEffect(() => setLimit(PAGE), [snapshotIndex]);

  return (
    <div className="p-4">
      <SectionLabel>
        {commits.length} commit{commits.length === 1 ? "" : "s"} in this period
        {windowStart > -Infinity && (
          <span className="ml-1 normal-case">
            (since {formatDate(windowStart)})
          </span>
        )}
      </SectionLabel>
      {commits.length === 0 ? (
        <EmptyNote>No analyzed commits in this window.</EmptyNote>
      ) : (
        <>
          {commits.slice(0, limit).map((c) => (
            <CommitRow key={c.sha} analysis={analysis} commit={c} />
          ))}
          {commits.length > limit && (
            <div className="pt-3 text-center">
              <Button size="sm" variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, commits.length - limit)} more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
