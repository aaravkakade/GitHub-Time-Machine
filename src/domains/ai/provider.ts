import { z } from "zod";
import type { RepositoryAnalysis } from "@/domains/schemas";

export type InsightSubjectType = "milestone" | "file" | "overview" | "comparison";

/** One verifiable fact handed to the model. Ids are what the model may cite. */
export interface EvidenceItem {
  id: string; // commit sha, file path, or signal id
  kind: "commit" | "file" | "signal" | "metric";
  text: string;
}

export interface InsightRequest {
  analysis: RepositoryAnalysis;
  subjectType: InsightSubjectType;
  subjectId: string;
  /** Deterministic facts the summary must be grounded in. */
  evidence: EvidenceItem[];
  /** What the summary should explain. */
  question: string;
}

/** Structured output contract for AI summaries — validated with Zod. */
export const InsightOutputSchema = z.object({
  summary: z
    .string()
    .describe(
      "2-4 sentence explanation grounded ONLY in the provided evidence. No speculation beyond it.",
    ),
  classification: z
    .enum(["feature", "refactor", "migration", "cleanup", "fix", "infra", "mixed"])
    .nullable()
    .describe("Broad intent of the change, or null when not applicable."),
  evidenceIds: z
    .array(z.string())
    .min(1)
    .describe("IDs of the evidence items that support the summary."),
});
export type InsightOutput = z.infer<typeof InsightOutputSchema>;

export interface AIProviderResult {
  output: InsightOutput;
  model: string;
}

/**
 * Provider abstraction: any backend that can turn an evidence bundle into a
 * structured, evidence-cited summary. Anthropic is the first implementation;
 * nothing outside this module may depend on a specific vendor.
 */
export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateInsight(request: InsightRequest): Promise<AIProviderResult>;
}
