import type { InsightOutput, InsightRequest } from "./provider";

const CLASSIFICATION_BY_CATEGORY: Record<string, InsightOutput["classification"]> = {
  founding: "feature",
  restructure: "refactor",
  "framework-adoption": "migration",
  "dependency-shift": "migration",
  testing: "infra",
  "ci-cd": "infra",
  extraction: "refactor",
  migration: "migration",
  release: "feature",
  "growth-surge": "feature",
  "mass-deletion": "cleanup",
  refactor: "refactor",
  hotspot: "mixed",
};

/**
 * Deterministic summary used when no AI key is configured (or the provider
 * fails). Composed purely from measured signals, so it is always available
 * and never speculative.
 */
export function fallbackInsight(request: InsightRequest): InsightOutput {
  const { analysis, subjectType, subjectId, evidence } = request;

  if (subjectType === "milestone") {
    const milestone = analysis.milestones.find((m) => m.id === subjectId);
    if (milestone) {
      const signalList = milestone.signals
        .map((s) => s.description)
        .slice(0, 3)
        .join("; ");
      const affected =
        milestone.affectedPaths.length > 0
          ? ` The change concentrated in ${milestone.affectedPaths.slice(0, 3).join(", ")}.`
          : "";
      return {
        summary: `This moment was flagged by ${milestone.signals.length} measurable signal${milestone.signals.length > 1 ? "s" : ""}: ${signalList}.${affected} Detection confidence is ${Math.round(milestone.confidence * 100)}% based on signal strength and corroboration.`,
        classification: CLASSIFICATION_BY_CATEGORY[milestone.category] ?? null,
        evidenceIds: evidence.slice(0, 5).map((e) => e.id),
      };
    }
  }

  if (subjectType === "file") {
    const fileEvidence = evidence.filter((e) => e.kind === "file");
    return {
      summary:
        fileEvidence.length > 0
          ? `Measured history for this module: ${fileEvidence[0].text}. The commit list above is the authoritative record of why it changed.`
          : "No detailed history is retained for this module — only the most active files are tracked in depth.",
      classification: null,
      evidenceIds: evidence.slice(0, 4).map((e) => e.id),
    };
  }

  if (subjectType === "comparison") {
    const metricFacts = evidence
      .filter((e) => e.kind === "metric")
      .slice(0, 4)
      .map((e) => e.text.toLowerCase())
      .join("; ");
    const milestones = evidence.filter((e) =>
      e.text.startsWith("Milestone in this range"),
    );
    return {
      summary: `Measured changes across this range: ${metricFacts || "no metric deltas available"}. ${milestones.length > 0 ? `${milestones.length} milestone${milestones.length > 1 ? "s were" : " was"} detected in between — see the list below for the evidence.` : "No milestones were detected between these two points."}`,
      classification: null,
      evidenceIds: evidence.slice(0, 6).map((e) => e.id),
    };
  }

  // overview
  const milestoneCount = analysis.milestones.length;
  const first = analysis.snapshots[0];
  const last = analysis.snapshots[analysis.snapshots.length - 1];
  return {
    summary: `${analysis.repository.id} grew from ${first.metrics.loc.toLocaleString()} to ${last.metrics.loc.toLocaleString()} analyzable lines across ${analysis.commits.length.toLocaleString()} analyzed commits, with ${milestoneCount} detected milestones and ${analysis.debtSignals.length} active debt signals. Explore the timeline markers for the moments that shaped the architecture.`,
    classification: null,
    evidenceIds: evidence.slice(0, 5).map((e) => e.id),
  };
}
