"use client";

import * as React from "react";
import type { RepositoryAnalysis } from "@/domains/schemas";
import { useWorkspaceStore } from "@/store/workspace-store";

/** Full-history playback duration at 1× speed (ms of wall clock). */
const BASE_TOUR_MS = 45_000;
/** Cinematic pause at each milestone. */
const MILESTONE_PAUSE_MS = 1_500;

/**
 * Cinematic playback: advances the scrub position with rAF and pauses
 * briefly at each milestone, selecting it so the insight panel narrates the
 * tour. Returns the milestone currently being "visited", if any.
 */
export function usePlayback(analysis: RepositoryAnalysis): string | null {
  const playing = useWorkspaceStore((s) => s.playing);
  const speed = useWorkspaceStore((s) => s.speed);
  const [visiting, setVisiting] = React.useState<string | null>(null);

  const milestonesRef = React.useRef(
    [...analysis.milestones].sort((a, b) => a.date.localeCompare(b.date)),
  );
  React.useEffect(() => {
    milestonesRef.current = [...analysis.milestones].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [analysis]);

  React.useEffect(() => {
    if (!playing) {
      setVisiting(null);
      return;
    }
    let raf = 0;
    let last = performance.now();
    let pausedUntil = 0;
    const visited = new Set<string>();

    const tick = (now: number) => {
      const store = useWorkspaceStore.getState();
      const { timeMs, rangeStartMs, rangeEndMs } = store;
      const dt = now - last;
      last = now;

      if (now < pausedUntil) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setVisiting(null);

      const span = rangeEndMs - rangeStartMs;
      const next = timeMs + (span / BASE_TOUR_MS) * store.speed * dt;

      // Pause at the first unvisited milestone we cross this frame.
      const crossed = milestonesRef.current.find((m) => {
        const t = +new Date(m.date);
        return t > timeMs && t <= next && !visited.has(m.id);
      });
      if (crossed) {
        visited.add(crossed.id);
        store.setTime(+new Date(crossed.date));
        store.select({ type: "milestone", id: crossed.id });
        setVisiting(crossed.id);
        pausedUntil = now + MILESTONE_PAUSE_MS / Math.sqrt(store.speed);
        raf = requestAnimationFrame(tick);
        return;
      }

      if (next >= rangeEndMs) {
        store.setTime(rangeEndMs);
        store.setPlaying(false);
        return;
      }
      store.setTime(next);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  return visiting;
}
