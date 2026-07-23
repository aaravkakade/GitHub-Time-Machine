import type { Commit, Release } from "@/domains/schemas";

export interface SnapshotPoint {
  sha: string;
  date: string;
  reason:
    | "initial"
    | "release"
    | "milestone"
    | "interval"
    | "structure-change"
    | "dependency-change"
    | "latest";
}

/**
 * Choose which commits deserve a full architectural snapshot.
 *
 * Analyzing every commit is too expensive; instead we snapshot the commits
 * that most likely changed the architecture, then fill remaining budget with
 * evenly spaced interval points so scrubbing always has nearby data.
 */
export function selectSnapshotPoints(
  commits: Commit[], // oldest → newest
  releases: Release[],
  budget = 16,
): SnapshotPoint[] {
  if (commits.length === 0) return [];
  const bySha = new Map(commits.map((c) => [c.sha, c]));
  const picked = new Map<string, SnapshotPoint>();

  const add = (sha: string, reason: SnapshotPoint["reason"]) => {
    const commit = bySha.get(sha);
    if (!commit || picked.has(sha)) return;
    picked.set(sha, { sha, date: commit.date, reason });
  };

  add(commits[0].sha, "initial");
  add(commits[commits.length - 1].sha, "latest");

  // Major + first releases.
  const releaseShas = releases
    .filter((r) => r.sha && bySha.has(r.sha))
    .sort((a, b) => a.date.localeCompare(b.date));
  const majors = releaseShas.filter((r) => /^v?\d+\.0\.0/.test(r.tag));
  for (const r of [...majors, ...releaseShas.slice(0, 1)]) add(r.sha!, "release");

  // Structure changes: many adds/moves/removes across distinct top-level dirs.
  for (const c of commits) {
    const structuralFiles = c.files.filter((f) => f.status !== "modified");
    const dirs = new Set(
      structuralFiles.flatMap((f) =>
        [f.path, f.previousPath]
          .filter((p): p is string => !!p)
          .map((p) => p.split("/")[0]),
      ),
    );
    if (dirs.size >= 2 && structuralFiles.length >= 12) {
      add(c.sha, "structure-change");
    }
  }

  // Dependency shifts.
  for (const c of commits) {
    if (c.dependenciesAdded.length + c.dependenciesRemoved.length >= 2) {
      add(c.sha, "dependency-change");
    }
  }

  // High-churn commits (top 5 by additions+deletions).
  [...commits]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, 5)
    .forEach((c) => add(c.sha, "milestone"));

  // Trim to budget, always keeping initial + latest, preferring
  // higher-priority reasons, then even temporal spread.
  const priority: Record<SnapshotPoint["reason"], number> = {
    initial: 0,
    latest: 0,
    release: 1,
    "structure-change": 2,
    "dependency-change": 3,
    milestone: 4,
    interval: 5,
  };
  let points = [...picked.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  while (points.length > budget) {
    // Drop the lowest-priority point that is temporally closest to a neighbor.
    let dropIndex = -1;
    let dropScore = -Infinity;
    for (let i = 1; i < points.length - 1; i++) {
      const gap =
        Math.min(
          +new Date(points[i].date) - +new Date(points[i - 1].date),
          +new Date(points[i + 1].date) - +new Date(points[i].date),
        ) || 1;
      const score = priority[points[i].reason] * 1e12 - gap;
      if (score > dropScore) {
        dropScore = score;
        dropIndex = i;
      }
    }
    if (dropIndex === -1) break;
    points.splice(dropIndex, 1);
  }

  // Fill remaining budget with interval points in the largest time gaps.
  while (points.length < Math.min(budget, commits.length)) {
    let gapIndex = -1;
    let gapSize = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const gap = +new Date(points[i + 1].date) - +new Date(points[i].date);
      if (gap > gapSize) {
        gapSize = gap;
        gapIndex = i;
      }
    }
    if (gapIndex === -1) break;
    const midDate = +new Date(points[gapIndex].date) + gapSize / 2;
    // Nearest commit to the middle of the gap not already picked.
    let best: Commit | null = null;
    let bestDist = Infinity;
    for (const c of commits) {
      if (picked.has(c.sha)) continue;
      const dist = Math.abs(+new Date(c.date) - midDate);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    if (!best || bestDist > gapSize / 2) break;
    add(best.sha, "interval");
    points = [...picked.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  return points;
}

/** Index of the snapshot active at a given time (nearest at-or-before). */
export function snapshotIndexForTime(
  snapshotDates: string[], // ascending
  timeMs: number,
): number {
  let index = 0;
  for (let i = 0; i < snapshotDates.length; i++) {
    if (+new Date(snapshotDates[i]) <= timeMs) index = i;
    else break;
  }
  return index;
}
