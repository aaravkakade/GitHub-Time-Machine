import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  InsightOutputSchema,
  type AIProvider,
  type AIProviderResult,
  type InsightRequest,
} from "./provider";

const DEFAULT_MODEL = "claude-opus-4-8";

/**
 * Anthropic implementation of the AI provider. Uses structured outputs so
 * the response always parses against InsightOutputSchema, and rejects any
 * cited evidence id that was not actually provided.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private model: string;

  constructor(model = process.env.CODECHRONICLE_AI_MODEL ?? DEFAULT_MODEL) {
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async generateInsight(request: InsightRequest): Promise<AIProviderResult> {
    const client = new Anthropic();

    const evidenceBlock = request.evidence
      .map((e) => `[${e.id}] (${e.kind}) ${e.text}`)
      .join("\n");

    const response = await client.messages.parse({
      model: this.model,
      max_tokens: 1024,
      system:
        "You explain repository history for CodeChronicle, a Git time-machine tool. " +
        "You are given deterministic evidence extracted from Git history and static analysis. " +
        "Every claim in your summary must be supported by the provided evidence items; " +
        "cite the ids of the items you relied on in evidenceIds. " +
        "Never invent commits, dates, files, or intentions that the evidence does not show. " +
        "If the evidence is thin, say so plainly rather than speculating. " +
        "Write for a developer: concrete, calm, no marketing language.",
      messages: [
        {
          role: "user",
          content: `Question: ${request.question}\n\nEvidence (cite by [id]):\n${evidenceBlock}`,
        },
      ],
      output_config: {
        format: zodOutputFormat(InsightOutputSchema),
      },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error("AI response did not match the expected schema");
    }
    const output = InsightOutputSchema.parse(parsed);

    // Grounding check: drop citations that don't exist; reject if none remain.
    const validIds = new Set(request.evidence.map((e) => e.id));
    const citedValid = output.evidenceIds.filter((id) => validIds.has(id));
    if (citedValid.length === 0) {
      throw new Error("AI summary cited no valid evidence — rejected");
    }

    return {
      output: { ...output, evidenceIds: citedValid },
      model: this.model,
    };
  }
}
