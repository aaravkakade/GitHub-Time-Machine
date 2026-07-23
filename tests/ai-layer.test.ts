import { describe, expect, it } from "vitest";
import { analyzeHistory } from "@/domains/analysis/engine";
import { generateHistory } from "@/domains/demo/scenario";
import { orbitScenario } from "@/domains/demo/scenarios/orbit";
import { buildInsightRequest } from "@/domains/ai/evidence";
import { fallbackInsight } from "@/domains/ai/fallback";
import { InsightOutputSchema } from "@/domains/ai/provider";

const analysis = analyzeHistory(generateHistory(orbitScenario));

describe("InsightOutputSchema", () => {
  it("accepts a valid structured output", () => {
    const parsed = InsightOutputSchema.safeParse({
      summary: "A grounded summary.",
      classification: "refactor",
      evidenceIds: ["abc1234"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects outputs without citations or with bad classification", () => {
    expect(
      InsightOutputSchema.safeParse({
        summary: "No citations",
        classification: null,
        evidenceIds: [],
      }).success,
    ).toBe(false);
    expect(
      InsightOutputSchema.safeParse({
        summary: "Bad class",
        classification: "revolution",
        evidenceIds: ["x"],
      }).success,
    ).toBe(false);
  });
});

describe("evidence bundles", () => {
  it("builds milestone evidence with signals, commits and metrics", () => {
    const milestone = analysis.milestones.find((m) => m.category === "extraction")!;
    const request = buildInsightRequest(analysis, "milestone", milestone.id)!;
    expect(request.evidence.length).toBeGreaterThan(2);
    const kinds = new Set(request.evidence.map((e) => e.kind));
    expect(kinds).toContain("signal");
    expect(kinds).toContain("commit");
    expect(request.question).toContain(milestone.title);
    // Every commit id in the bundle resolves to a real commit.
    for (const item of request.evidence.filter((e) => e.kind === "commit")) {
      expect(analysis.commits.some((c) => c.sha.startsWith(item.id))).toBe(true);
    }
  });

  it("builds comparison evidence between two snapshots", () => {
    const [first, last] = [
      analysis.snapshots[0],
      analysis.snapshots[analysis.snapshots.length - 1],
    ];
    const request = buildInsightRequest(
      analysis,
      "comparison",
      `${first.id}..${last.id}`,
    )!;
    expect(request.evidence.some((e) => e.id === "metric:loc")).toBe(true);
    expect(request.evidence.some((e) => e.id === "signal:modules-added")).toBe(true);
  });

  it("returns null for unknown subjects", () => {
    expect(buildInsightRequest(analysis, "milestone", "ms:nope")).toBeNull();
    expect(buildInsightRequest(analysis, "comparison", "junk")).toBeNull();
  });
});

describe("deterministic fallback", () => {
  it("always yields schema-valid, grounded output", () => {
    for (const milestone of analysis.milestones.slice(0, 5)) {
      const request = buildInsightRequest(analysis, "milestone", milestone.id)!;
      const output = fallbackInsight(request);
      expect(() => InsightOutputSchema.parse(output)).not.toThrow();
      const validIds = new Set(request.evidence.map((e) => e.id));
      for (const id of output.evidenceIds) {
        expect(validIds.has(id), `fallback cited unknown id ${id}`).toBe(true);
      }
      expect(output.summary).not.toMatch(/undefined|NaN/);
    }
  });

  it("is marked as measurement-based for comparisons", () => {
    const [a, b] = [analysis.snapshots[0], analysis.snapshots[2]];
    const request = buildInsightRequest(analysis, "comparison", `${a.id}..${b.id}`)!;
    const output = fallbackInsight(request);
    expect(output.summary).toContain("Measured changes");
  });
});
