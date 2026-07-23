import * as React from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Timeline } from "@/components/workspace/timeline/timeline";
import { useWorkspaceStore } from "@/store/workspace-store";
import { analyzeHistory } from "@/domains/analysis/engine";
import { generateHistory } from "@/domains/demo/scenario";
import { orbitScenario } from "@/domains/demo/scenarios/orbit";
import { formatDate } from "@/lib/utils";

const analysis = analyzeHistory(generateHistory(orbitScenario));

describe("Timeline", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ analysisId: null, playing: false });
    useWorkspaceStore.getState().init(analysis);
  });

  it("renders the scrub handle as an accessible slider with the current date", () => {
    render(<Timeline analysis={analysis} />);
    const slider = screen.getByRole("slider", { name: /time travel position/i });
    expect(slider).toHaveAttribute("aria-valuetext", formatDate(useWorkspaceStore.getState().timeMs));
  });

  it("moves back a week with ArrowLeft and a month with Shift+ArrowLeft", () => {
    render(<Timeline analysis={analysis} />);
    const slider = screen.getByTestId("timeline-handle");
    const start = useWorkspaceStore.getState().timeMs;

    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    const afterWeek = useWorkspaceStore.getState().timeMs;
    expect(start - afterWeek).toBe(7 * 24 * 3600 * 1000);

    fireEvent.keyDown(slider, { key: "ArrowLeft", shiftKey: true });
    expect(afterWeek - useWorkspaceStore.getState().timeMs).toBe(30 * 24 * 3600 * 1000);
  });

  it("jumps to range boundaries with Home/End", () => {
    render(<Timeline analysis={analysis} />);
    const slider = screen.getByTestId("timeline-handle");
    fireEvent.keyDown(slider, { key: "Home" });
    expect(useWorkspaceStore.getState().timeMs).toBe(useWorkspaceStore.getState().rangeStartMs);
    fireEvent.keyDown(slider, { key: "End" });
    expect(useWorkspaceStore.getState().timeMs).toBe(useWorkspaceStore.getState().rangeEndMs);
  });

  it("navigates milestones with PageUp/PageDown and selects them", () => {
    render(<Timeline analysis={analysis} />);
    const slider = screen.getByTestId("timeline-handle");
    fireEvent.keyDown(slider, { key: "PageUp" }); // previous milestone from the end
    const state = useWorkspaceStore.getState();
    expect(state.selection?.type).toBe("milestone");
    const selected = analysis.milestones.find((m) => m.id === state.selection?.id);
    expect(selected).toBeDefined();
    expect(state.timeMs).toBe(+new Date(selected!.date));
  });

  it("selects a milestone when its marker is clicked", () => {
    render(<Timeline analysis={analysis} />);
    const marker = screen.getAllByTestId(/milestone-marker-/)[0];
    fireEvent.click(marker);
    expect(useWorkspaceStore.getState().selection?.type).toBe("milestone");
  });

  it("toggles playback from the play button and space key", () => {
    render(<Timeline analysis={analysis} />);
    fireEvent.click(screen.getByTestId("playback-toggle"));
    expect(useWorkspaceStore.getState().playing).toBe(true);
    fireEvent.click(screen.getByTestId("playback-toggle"));
    expect(useWorkspaceStore.getState().playing).toBe(false);

    const slider = screen.getByTestId("timeline-handle");
    fireEvent.keyDown(slider, { key: " " });
    expect(useWorkspaceStore.getState().playing).toBe(true);
  });

  it("scrubs on pointer interaction with the track", () => {
    render(<Timeline analysis={analysis} />);
    const track = screen.getByTestId("timeline-track");
    track.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 96, right: 800, bottom: 96, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerDown(track, { clientX: 400, clientY: 50, pointerId: 1 });
    const { timeMs, rangeStartMs, rangeEndMs } = useWorkspaceStore.getState();
    expect(timeMs).toBeGreaterThan(rangeStartMs);
    expect(timeMs).toBeLessThan(rangeEndMs);
  });
});
