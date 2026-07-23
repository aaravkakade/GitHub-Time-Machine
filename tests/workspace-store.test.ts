import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceStore } from "@/store/workspace-store";
import { analyzeHistory } from "@/domains/analysis/engine";
import { generateHistory } from "@/domains/demo/scenario";
import { orbitScenario } from "@/domains/demo/scenarios/orbit";

const analysis = analyzeHistory(generateHistory(orbitScenario));

describe("workspace store", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ analysisId: null });
    useWorkspaceStore.getState().init(analysis);
  });

  it("initializes at the end of history", () => {
    const state = useWorkspaceStore.getState();
    expect(state.snapshotIndex).toBe(analysis.snapshots.length - 1);
    expect(state.timeMs).toBe(state.rangeEndMs);
    expect(state.rangeStartMs).toBeLessThan(state.rangeEndMs);
  });

  it("clamps setTime into the analyzed range and tracks the snapshot index", () => {
    const { rangeStartMs, rangeEndMs } = useWorkspaceStore.getState();
    useWorkspaceStore.getState().setTime(rangeStartMs - 1e12);
    expect(useWorkspaceStore.getState().timeMs).toBe(rangeStartMs);
    expect(useWorkspaceStore.getState().snapshotIndex).toBe(0);

    useWorkspaceStore.getState().setTime(rangeEndMs + 1e12);
    expect(useWorkspaceStore.getState().timeMs).toBe(rangeEndMs);
    expect(useWorkspaceStore.getState().snapshotIndex).toBe(
      analysis.snapshots.length - 1,
    );

    const midDate = +new Date(analysis.snapshots[3].date) + 1000;
    useWorkspaceStore.getState().setTime(midDate);
    expect(useWorkspaceStore.getState().snapshotIndex).toBe(3);
  });

  it("steps between snapshots and stops playback", () => {
    useWorkspaceStore.getState().stepSnapshots(-1);
    useWorkspaceStore.setState({ playing: true });
    useWorkspaceStore.getState().stepSnapshots(-1);
    const state = useWorkspaceStore.getState();
    expect(state.snapshotIndex).toBe(analysis.snapshots.length - 3);
    expect(state.playing).toBe(false);
    // Never below zero.
    for (let i = 0; i < 50; i++) useWorkspaceStore.getState().stepSnapshots(-1);
    expect(useWorkspaceStore.getState().snapshotIndex).toBe(0);
  });

  it("restarts playback from the beginning when starting at the end", () => {
    useWorkspaceStore.getState().setPlaying(true);
    const state = useWorkspaceStore.getState();
    expect(state.playing).toBe(true);
    expect(state.timeMs).toBe(state.rangeStartMs);
  });

  it("selection opens the panel and re-init is idempotent per analysis", () => {
    useWorkspaceStore.getState().setPanelOpen(false);
    useWorkspaceStore.getState().select({ type: "milestone", id: "ms:x" });
    expect(useWorkspaceStore.getState().panelOpen).toBe(true);
    const before = useWorkspaceStore.getState().selection;
    useWorkspaceStore.getState().init(analysis); // same analysis → no reset
    expect(useWorkspaceStore.getState().selection).toBe(before);
  });
});
