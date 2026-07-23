import { z } from "zod";
import {
  CommitSchema,
  ContributorSchema,
  FileRecordSchema,
  IsoDate,
  ReleaseSchema,
  RepositorySchema,
} from "./core";
import { ArchitectureSnapshotSchema, ModuleMetaSchema } from "./graph";
import {
  AIInsightSchema,
  DebtSignalSchema,
  MetricSeriesSchema,
  MilestoneSchema,
  RefactorOpportunitySchema,
} from "./insights";

export const AnalysisMode = z.enum(["demo", "lightweight", "full"]);
export type AnalysisMode = z.infer<typeof AnalysisMode>;

export const RepositoryAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  repository: RepositorySchema,
  mode: AnalysisMode,
  analyzedAt: IsoDate,
  /** Honest caveats surfaced in the UI (sampling, inference limits, …). */
  disclosures: z.array(z.string()),
  commits: z.array(CommitSchema),
  contributors: z.array(ContributorSchema),
  releases: z.array(ReleaseSchema),
  modules: z.record(z.string(), ModuleMetaSchema),
  snapshots: z.array(ArchitectureSnapshotSchema).min(1),
  milestones: z.array(MilestoneSchema),
  metricSeries: z.array(MetricSeriesSchema),
  debtSignals: z.array(DebtSignalSchema),
  refactorOpportunities: z.array(RefactorOpportunitySchema),
  fileRecords: z.array(FileRecordSchema),
  aiInsights: z.array(AIInsightSchema),
});
export type RepositoryAnalysis = z.infer<typeof RepositoryAnalysisSchema>;

/* ------------------------------------------------------------------ */
/* Engine input — every source (demo, GitHub API, git worker) maps to  */
/* this normalized shape before analysis runs.                          */
/* ------------------------------------------------------------------ */

export const TreeSampleFileSchema = z.object({
  path: z.string(),
  loc: z.number().optional(),
  language: z.string().optional(),
  complexity: z.number().optional(),
  todoCount: z.number().optional(),
});

export const TreeSampleSchema = z.object({
  sha: z.string(),
  date: IsoDate,
  files: z.array(TreeSampleFileSchema),
  /** Repo-relative import pairs when static analysis was possible. */
  imports: z
    .array(z.object({ from: z.string(), to: z.string() }))
    .optional(),
  /** Manifest dependencies present at this point. */
  packages: z.array(z.string()).optional(),
});
export type TreeSample = z.infer<typeof TreeSampleSchema>;

export const HistoryInputSchema = z.object({
  repository: RepositorySchema,
  mode: AnalysisMode,
  commits: z.array(CommitSchema).min(1), // oldest → newest
  releases: z.array(ReleaseSchema).default([]),
  contributors: z.array(ContributorSchema).default([]),
  /** Sampled full trees at candidate snapshot points, oldest → newest. */
  treeSamples: z.array(TreeSampleSchema).min(1),
  disclosures: z.array(z.string()).default([]),
});
export type HistoryInput = z.infer<typeof HistoryInputSchema>;

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

export const AnalysisStage = z.enum([
  "queued",
  "history",
  "milestones",
  "graph",
  "metrics",
  "snapshots",
  "finalize",
  "done",
  "failed",
]);
export type AnalysisStage = z.infer<typeof AnalysisStage>;

export const AnalysisProgressSchema = z.object({
  stage: AnalysisStage,
  label: z.string(),
  percent: z.number().min(0).max(100),
  detail: z.string().optional(),
  at: IsoDate,
});
export type AnalysisProgress = z.infer<typeof AnalysisProgressSchema>;

export const AnalysisJobSchema = z.object({
  id: z.string(),
  repoId: z.string(),
  mode: AnalysisMode,
  status: z.enum(["queued", "running", "completed", "failed"]),
  progress: z.array(AnalysisProgressSchema),
  error: z.string().nullable().default(null),
  startedAt: IsoDate,
  finishedAt: IsoDate.nullable().default(null),
});
export type AnalysisJob = z.infer<typeof AnalysisJobSchema>;
