import { z } from "zod";
import { IsoDate } from "./core";

export const MilestoneCategory = z.enum([
  "founding",
  "restructure",
  "framework-adoption",
  "dependency-shift",
  "testing",
  "ci-cd",
  "extraction",
  "migration",
  "release",
  "growth-surge",
  "mass-deletion",
  "refactor",
  "hotspot",
]);
export type MilestoneCategory = z.infer<typeof MilestoneCategory>;

/** A measurable signal that contributed to detecting a milestone. */
export const MilestoneSignalSchema = z.object({
  type: z.string(), // e.g. "commit-cluster", "folder-restructure"
  description: z.string(),
  value: z.number().optional(),
  /** Commits backing this signal. */
  evidence: z.array(z.string()).default([]),
});
export type MilestoneSignal = z.infer<typeof MilestoneSignalSchema>;

export const MilestoneSchema = z.object({
  id: z.string(),
  sha: z.string(),
  date: IsoDate,
  title: z.string(),
  category: MilestoneCategory,
  /** 0–1, derived from signal count and strength. */
  confidence: z.number().min(0).max(1),
  signals: z.array(MilestoneSignalSchema).min(1),
  /** Deterministic one-line description (no AI required). */
  summary: z.string(),
  affectedPaths: z.array(z.string()).default([]),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const MetricPointSchema = z.object({ t: IsoDate, v: z.number() });
export type MetricPoint = z.infer<typeof MetricPointSchema>;

export const MetricSeriesSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string().default(""),
  description: z.string().default(""),
  points: z.array(MetricPointSchema),
});
export type MetricSeries = z.infer<typeof MetricSeriesSchema>;

export const DebtSignalType = z.enum([
  "high-churn",
  "complexity-growth",
  "coupling",
  "dependency-cycle",
  "oversized-file",
  "bugfix-density",
  "test-ratio-decline",
  "revert-frequency",
  "ownership-concentration",
  "abandoned-module",
  "todo-growth",
  "volatile-subsystem",
]);
export type DebtSignalType = z.infer<typeof DebtSignalType>;

export const DebtSignalSchema = z.object({
  id: z.string(),
  type: DebtSignalType,
  title: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  trend: z.enum(["rising", "stable", "falling"]),
  /** How this proxy was computed — always shown to the user. */
  methodology: z.string(),
  evidence: z.object({
    commits: z.array(z.string()).default([]),
    files: z.array(z.string()).default([]),
  }),
  /** Optional trend line for the signal. */
  series: z.array(MetricPointSchema).default([]),
  /** First date the signal crossed its threshold. */
  since: IsoDate.optional(),
});
export type DebtSignal = z.infer<typeof DebtSignalSchema>;

export const RefactorOpportunitySchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum([
    "decouple",
    "split-file",
    "break-cycle",
    "add-tests",
    "consolidate",
    "stabilize-interface",
  ]),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.string()).min(1),
  files: z.array(z.string()),
  benefit: z.string(),
  risk: z.string(),
  firstStep: z.string(),
});
export type RefactorOpportunity = z.infer<typeof RefactorOpportunitySchema>;

/** AI output is always tied to a subject and to evidence IDs it cited. */
export const AIInsightSchema = z.object({
  id: z.string(),
  subject: z.object({
    type: z.enum(["milestone", "file", "comparison", "overview", "refactor"]),
    id: z.string(),
  }),
  summary: z.string(),
  classification: z
    .enum(["feature", "refactor", "migration", "cleanup", "fix", "infra", "mixed"])
    .nullable()
    .default(null),
  /** Evidence identifiers (commit shas, file paths, signal ids) the model cited. */
  evidenceIds: z.array(z.string()),
  model: z.string(),
  generatedAt: IsoDate,
  /** True when produced by the deterministic fallback (no API key). */
  isFallback: z.boolean().default(false),
});
export type AIInsight = z.infer<typeof AIInsightSchema>;
