"use client";

import { create } from "zustand";
import type { RepositoryAnalysis } from "@/domains/schemas";
import { snapshotIndexForTime } from "@/domains/snapshots/select";

export type Selection =
  | { type: "module"; id: string }
  | { type: "milestone"; id: string }
  | null;

export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

interface WorkspaceState {
  analysisId: string | null;
  /** Current scrub position (ms epoch). */
  timeMs: number;
  /** Snapshot dates (ascending) for fast index lookup. */
  snapshotDates: string[];
  snapshotIndex: number;
  rangeStartMs: number;
  rangeEndMs: number;
  playing: boolean;
  speed: PlaybackSpeed;
  selection: Selection;
  focusModuleId: string | null;
  clusterFilter: string | null;
  changedOnly: boolean;
  panelOpen: boolean;

  init: (analysis: RepositoryAnalysis) => void;
  setTime: (ms: number) => void;
  stepSnapshots: (delta: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  select: (selection: Selection) => void;
  setFocusModule: (id: string | null) => void;
  setClusterFilter: (cluster: string | null) => void;
  setChangedOnly: (value: boolean) => void;
  setPanelOpen: (open: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  analysisId: null,
  timeMs: 0,
  snapshotDates: [],
  snapshotIndex: 0,
  rangeStartMs: 0,
  rangeEndMs: 1,
  playing: false,
  speed: 1,
  selection: null,
  focusModuleId: null,
  clusterFilter: null,
  changedOnly: false,
  panelOpen: true,

  init: (analysis) => {
    const id = analysis.repository.id + ":" + analysis.analyzedAt;
    if (get().analysisId === id) return;
    const dates = analysis.snapshots.map((s) => s.date);
    const start = Math.min(
      +new Date(analysis.commits[0]?.date ?? dates[0]),
      +new Date(dates[0]),
    );
    const end = Math.max(
      +new Date(analysis.commits[analysis.commits.length - 1]?.date ?? dates[dates.length - 1]),
      +new Date(dates[dates.length - 1]),
    );
    set({
      analysisId: id,
      snapshotDates: dates,
      rangeStartMs: start,
      rangeEndMs: end,
      timeMs: end,
      snapshotIndex: dates.length - 1,
      playing: false,
      selection: null,
      focusModuleId: null,
      clusterFilter: null,
      changedOnly: false,
    });
  },

  setTime: (ms) => {
    const { rangeStartMs, rangeEndMs, snapshotDates, snapshotIndex } = get();
    const clamped = Math.min(rangeEndMs, Math.max(rangeStartMs, ms));
    const index = snapshotIndexForTime(snapshotDates, clamped);
    if (index !== snapshotIndex) set({ timeMs: clamped, snapshotIndex: index });
    else set({ timeMs: clamped });
  },

  stepSnapshots: (delta) => {
    const { snapshotDates, snapshotIndex } = get();
    const next = Math.min(
      snapshotDates.length - 1,
      Math.max(0, snapshotIndex + delta),
    );
    set({
      snapshotIndex: next,
      timeMs: +new Date(snapshotDates[next]),
      playing: false,
    });
  },

  setPlaying: (playing) => {
    const { timeMs, rangeEndMs, rangeStartMs } = get();
    // Restart from the beginning when playback is started at the end.
    if (playing && rangeEndMs - timeMs < (rangeEndMs - rangeStartMs) * 0.02) {
      const index = snapshotIndexForTime(get().snapshotDates, rangeStartMs);
      set({ playing, timeMs: rangeStartMs, snapshotIndex: index });
    } else {
      set({ playing });
    }
  },
  setSpeed: (speed) => set({ speed }),
  select: (selection) => set({ selection, panelOpen: true }),
  setFocusModule: (id) => set({ focusModuleId: id }),
  setClusterFilter: (cluster) => set({ clusterFilter: cluster }),
  setChangedOnly: (value) => set({ changedOnly: value }),
  setPanelOpen: (open) => set({ panelOpen: open }),
}));
