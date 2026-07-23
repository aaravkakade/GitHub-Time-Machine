import type { Commit, FileRecord } from "@/domains/schemas";
import { isAnalyzable } from "./classify";

interface Tracker {
  path: string;
  createdAt: string;
  createdSha: string;
  deletedAt: string | null;
  renamedFrom: string[];
  totalChurn: number;
  commitCount: number;
  authors: Map<string, number>;
  commitChurn: { sha: string; churn: number }[];
  coChanged: Map<string, number>;
  churnByMonth: Map<string, number>;
}

/**
 * Reconstruct per-file histories from the commit stream, following renames.
 * Only the most active files are kept so the payload stays compact.
 */
export function buildFileRecords(
  commits: Commit[], // oldest → newest
  keep = 80,
): FileRecord[] {
  const trackers = new Map<string, Tracker>();

  for (const c of commits) {
    const touched = c.files.filter((f) => isAnalyzable(f.path));
    for (const fc of touched) {
      let tracker = trackers.get(fc.path);

      if (fc.status === "renamed" && fc.previousPath) {
        const prev = trackers.get(fc.previousPath);
        if (prev) {
          trackers.delete(fc.previousPath);
          prev.renamedFrom.push(fc.previousPath);
          prev.path = fc.path;
          trackers.set(fc.path, prev);
          tracker = prev;
        }
      }

      if (!tracker) {
        tracker = {
          path: fc.path,
          createdAt: c.date,
          createdSha: c.sha,
          deletedAt: null,
          renamedFrom: [],
          totalChurn: 0,
          commitCount: 0,
          authors: new Map(),
          commitChurn: [],
          coChanged: new Map(),
          churnByMonth: new Map(),
        };
        trackers.set(fc.path, tracker);
      }

      const churn = fc.additions + fc.deletions;
      tracker.totalChurn += churn;
      tracker.commitCount += 1;
      tracker.authors.set(
        c.author.login,
        (tracker.authors.get(c.author.login) ?? 0) + 1,
      );
      tracker.commitChurn.push({ sha: c.sha, churn });
      const month = c.date.slice(0, 7);
      tracker.churnByMonth.set(
        month,
        (tracker.churnByMonth.get(month) ?? 0) + churn,
      );
      tracker.deletedAt = fc.status === "removed" ? c.date : null;

      for (const other of touched) {
        if (other.path === fc.path) continue;
        tracker.coChanged.set(
          other.path,
          (tracker.coChanged.get(other.path) ?? 0) + 1,
        );
      }
    }
  }

  return [...trackers.values()]
    .sort((a, b) => b.totalChurn - a.totalChurn)
    .slice(0, keep)
    .map((t) => ({
      path: t.path,
      createdAt: t.createdAt,
      createdSha: t.createdSha,
      deletedAt: t.deletedAt,
      renamedFrom: t.renamedFrom,
      totalChurn: t.totalChurn,
      commitCount: t.commitCount,
      authors: [...t.authors.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([login, count]) => ({ login, commits: count })),
      majorCommits: [...t.commitChurn]
        .sort((a, b) => b.churn - a.churn)
        .slice(0, 6)
        .map((e) => e.sha),
      coChanged: [...t.coChanged.entries()]
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([path, count]) => ({ path, count })),
      churnSeries: [...t.churnByMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, v]) => ({ t: `${month}-15`, v })),
    }));
}
