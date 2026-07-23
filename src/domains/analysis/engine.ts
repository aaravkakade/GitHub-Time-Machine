import type {
  AnalysisProgress,
  AnalysisStage,
  Contributor,
  HistoryInput,
  RepositoryAnalysis,
} from "@/domains/schemas";
import { HistoryInputSchema } from "@/domains/schemas";
import { detectMilestones } from "@/domains/milestones/detect";
import { buildSnapshots } from "@/domains/snapshots/build";
import { computeMetricSeries } from "@/domains/metrics/series";
import { computeDebtSignals } from "@/domains/metrics/debt";
import { computeRefactorOpportunities } from "@/domains/metrics/refactor";
import { buildFileRecords } from "./file-records";

export type ProgressReporter = (progress: AnalysisProgress) => void;

const STAGE_LABELS: Partial<Record<AnalysisStage, string>> = {
  history: "Reading repository history",
  milestones: "Detecting important milestones",
  graph: "Reconstructing module relationships",
  metrics: "Measuring codebase change",
  snapshots: "Generating architectural snapshots",
  finalize: "Preparing the timeline",
};

/**
 * The single deterministic analysis pipeline. Demo scenarios, the GitHub
 * lightweight mode and the deep git worker all normalize into HistoryInput
 * and flow through here — no source gets a different set of rules.
 */
export function analyzeHistory(
  rawInput: HistoryInput,
  onProgress?: ProgressReporter,
): RepositoryAnalysis {
  const report = (stage: AnalysisStage, percent: number, detail?: string) =>
    onProgress?.({
      stage,
      label: STAGE_LABELS[stage] ?? stage,
      percent,
      detail,
      at: new Date().toISOString(),
    });

  report("history", 5);
  const input = HistoryInputSchema.parse(rawInput);
  const commits = [...input.commits].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const samples = [...input.treeSamples].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const contributors = input.contributors.length
    ? input.contributors
    : deriveContributors(commits);
  report("history", 20, `${commits.length} commits`);

  const fileRecords = buildFileRecords(commits);
  report("milestones", 35);
  const milestones = detectMilestones(commits, input.releases);
  report("graph", 50, `${samples.length} tree snapshots`);

  const reasons = new Map<
    string,
    "initial" | "release" | "milestone" | "interval" | "structure-change" | "dependency-change" | "latest"
  >();
  reasons.set(samples[0].sha, "initial");
  reasons.set(samples[samples.length - 1].sha, "latest");
  const milestoneShas = new Set(milestones.map((m) => m.sha));
  const releaseShas = new Set(input.releases.map((r) => r.sha));
  for (const s of samples) {
    if (reasons.has(s.sha)) continue;
    if (releaseShas.has(s.sha)) reasons.set(s.sha, "release");
    else if (milestoneShas.has(s.sha)) reasons.set(s.sha, "milestone");
  }

  const contributorDates = commitDatesByNewAuthor(commits);
  const { snapshots, modules } = buildSnapshots(
    samples,
    commits,
    reasons,
    (date) => contributorDates.filter((d) => d <= date).length,
  );
  report("snapshots", 70, `${snapshots.length} snapshots`);

  const metricSeries = computeMetricSeries(snapshots, commits);
  report("metrics", 82);

  const debtSignals = computeDebtSignals({
    commits,
    snapshots,
    fileRecords,
    modules,
    latestTree: samples[samples.length - 1],
    metricSeries,
  });
  const refactorOpportunities = computeRefactorOpportunities({
    debtSignals,
    snapshots,
    fileRecords,
    modules,
  });
  report("finalize", 95);

  const analysis: RepositoryAnalysis = {
    schemaVersion: 1,
    repository: input.repository,
    mode: input.mode,
    analyzedAt: new Date().toISOString(),
    disclosures: [
      "Architectural relationships are inferred from static analysis and directory structure — runtime behavior may differ.",
      "Debt signals are indicators of maintenance risk, not definitive proof of technical debt.",
      ...(input.mode !== "full"
        ? ["History may be sampled; generated, binary, vendored and unsupported files are excluded."]
        : ["Generated, binary and vendored files are excluded from analysis."]),
      ...input.disclosures,
    ],
    commits,
    contributors,
    releases: input.releases,
    modules,
    snapshots,
    milestones,
    metricSeries,
    debtSignals,
    refactorOpportunities,
    fileRecords,
    aiInsights: [],
  };
  report("done", 100);
  return analysis;
}

function deriveContributors(
  commits: HistoryInput["commits"],
): Contributor[] {
  const map = new Map<string, Contributor>();
  for (const c of commits) {
    const existing = map.get(c.author.login);
    if (existing) {
      existing.commits += 1;
      existing.lastCommitAt = c.date;
    } else {
      map.set(c.author.login, {
        login: c.author.login,
        name: c.author.name,
        commits: 1,
        firstCommitAt: c.date,
        lastCommitAt: c.date,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.commits - a.commits);
}

function commitDatesByNewAuthor(commits: HistoryInput["commits"]): string[] {
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const c of commits) {
    if (!seen.has(c.author.login)) {
      seen.add(c.author.login);
      dates.push(c.date);
    }
  }
  return dates;
}
