import type { AIInsight, RepositoryAnalysis } from "@/domains/schemas";
import { buildInsightRequest } from "./evidence";
import { fallbackInsight } from "./fallback";
import { AnthropicProvider } from "./anthropic-provider";
import type { AIProvider, InsightSubjectType } from "./provider";

const providers: AIProvider[] = [new AnthropicProvider()];

const insightCache = new Map<string, AIInsight>();

/**
 * Produce an evidence-grounded insight for a subject. Uses the first
 * configured provider; falls back to the deterministic summary when no
 * provider is configured or a provider fails/returns ungrounded output.
 */
export async function getInsight(
  analysis: RepositoryAnalysis,
  subjectType: InsightSubjectType,
  subjectId: string,
): Promise<AIInsight | null> {
  const cacheKey = `${analysis.repository.id}:${analysis.analyzedAt}:${subjectType}:${subjectId}`;
  const cached = insightCache.get(cacheKey);
  if (cached) return cached;

  const request = buildInsightRequest(analysis, subjectType, subjectId);
  if (!request) return null;

  const provider = providers.find((p) => p.isConfigured());
  let insight: AIInsight;

  if (provider) {
    try {
      const result = await provider.generateInsight(request);
      insight = {
        id: cacheKey,
        subject: { type: subjectType, id: subjectId },
        summary: result.output.summary,
        classification: result.output.classification,
        evidenceIds: result.output.evidenceIds,
        model: result.model,
        generatedAt: new Date().toISOString(),
        isFallback: false,
      };
    } catch (error) {
      console.error(
        `AI provider ${provider.name} failed for ${subjectType}:${subjectId}:`,
        error,
      );
      insight = buildFallback(cacheKey, subjectType, subjectId, request);
    }
  } else {
    insight = buildFallback(cacheKey, subjectType, subjectId, request);
  }

  insightCache.set(cacheKey, insight);
  return insight;
}

function buildFallback(
  id: string,
  subjectType: InsightSubjectType,
  subjectId: string,
  request: NonNullable<ReturnType<typeof buildInsightRequest>>,
): AIInsight {
  const output = fallbackInsight(request);
  return {
    id,
    subject: { type: subjectType, id: subjectId },
    summary: output.summary,
    classification: output.classification,
    evidenceIds: output.evidenceIds,
    model: "deterministic-fallback",
    generatedAt: new Date().toISOString(),
    isFallback: true,
  };
}
