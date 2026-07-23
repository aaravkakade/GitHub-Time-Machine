import { describe, expect, it } from "vitest";
import { analyzeHistory } from "@/domains/analysis/engine";
import { RepositoryAnalysisSchema } from "@/domains/schemas";
import { generateHistory } from "@/domains/demo/scenario";
import { orbitScenario } from "@/domains/demo/scenarios/orbit";
import { diffSnapshots } from "@/domains/snapshots/diff";

describe("analysis engine end-to-end (orbit scenario)", () => {
  const input = generateHistory(orbitScenario);
  const analysis = analyzeHistory(input);

  it("produces a schema-valid RepositoryAnalysis", () => {
    expect(() => RepositoryAnalysisSchema.parse(analysis)).not.toThrow();
  });

  it("is deterministic for the same input", () => {
    const second = analyzeHistory(generateHistory(orbitScenario));
    expect(second.commits.length).toBe(analysis.commits.length);
    expect(second.milestones.map((m) => m.id)).toEqual(
      analysis.milestones.map((m) => m.id),
    );
    expect(second.snapshots.map((s) => s.sha)).toEqual(
      analysis.snapshots.map((s) => s.sha),
    );
  });

  it("orders snapshots by date with growing architecture", () => {
    const dates = analysis.snapshots.map((s) => s.date);
    expect([...dates].sort()).toEqual(dates);
    const first = analysis.snapshots[0];
    const last = analysis.snapshots[analysis.snapshots.length - 1];
    expect(last.nodes.length).toBeGreaterThan(first.nodes.length);
    expect(last.metrics.loc).toBeGreaterThan(first.metrics.loc);
  });

  it("detects the scripted story: tests, CI, extraction, releases", () => {
    const categories = new Set(analysis.milestones.map((m) => m.category));
    for (const expected of ["founding", "framework-adoption", "testing", "ci-cd", "extraction", "release"]) {
      expect(categories, `missing milestone category ${expected}`).toContain(expected);
    }
  });

  it("every milestone signal cites commits that exist in the analysis", () => {
    const shas = new Set(analysis.commits.map((c) => c.sha));
    for (const milestone of analysis.milestones) {
      for (const signal of milestone.signals) {
        for (const sha of signal.evidence) {
          expect(shas.has(sha), `evidence ${sha} not in commits`).toBe(true);
        }
      }
    }
  });

  it("surfaces the scripted debt spiral", () => {
    const types = new Set(analysis.debtSignals.map((s) => s.type));
    expect(types).toContain("dependency-cycle");
    expect(types).toContain("oversized-file");
    expect(analysis.refactorOpportunities.length).toBeGreaterThan(0);
    for (const signal of analysis.debtSignals) {
      expect(signal.methodology.length).toBeGreaterThan(10);
    }
  });

  it("keeps node identity stable across snapshots (UI selection survives scrubbing)", () => {
    const idsAcross = new Map<string, number>();
    for (const snap of analysis.snapshots) {
      for (const node of snap.nodes) {
        idsAcross.set(node.id, (idsAcross.get(node.id) ?? 0) + 1);
        expect(analysis.modules[node.id]).toBeDefined();
      }
    }
    const persistent = [...idsAcross.values()].filter((n) => n > 5);
    expect(persistent.length).toBeGreaterThan(3);
  });

  it("diffs two snapshots with sensible module deltas", () => {
    const first = analysis.snapshots[0];
    const last = analysis.snapshots[analysis.snapshots.length - 1];
    const diff = diffSnapshots(analysis, first.id, last.id)!;
    expect(diff.addedModules.length).toBeGreaterThan(0);
    expect(diff.commitsBetween.length).toBeGreaterThan(100);
    expect(diff.milestonesBetween.length).toBeGreaterThan(3);
    // Order-insensitive: reversed arguments produce the same normalized diff.
    const reversed = diffSnapshots(analysis, last.id, first.id)!;
    expect(reversed.before.id).toBe(diff.before.id);
  });
});
