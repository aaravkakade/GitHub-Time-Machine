import type { RepositoryAnalysis } from "@/domains/schemas";
import type { ProgressReporter } from "@/domains/analysis/engine";
import { runLightweightAnalysis } from "@/domains/github/lightweight";
import { GitHubError } from "@/domains/github/client";
import { jobStore } from "./store";

/**
 * Provider-agnostic worker seam. `AnalysisWorker` is the interface a queue
 * runner (Trigger.dev, Inngest, a container job, the local git worker in
 * scripts/worker) must satisfy; `inProcessLightweightWorker` is the default
 * implementation that runs inside the request lifecycle on Vercel.
 */
export interface AnalysisWorker {
  readonly name: string;
  analyze(
    owner: string,
    repo: string,
    onProgress: ProgressReporter,
  ): Promise<RepositoryAnalysis>;
}

export const inProcessLightweightWorker: AnalysisWorker = {
  name: "in-process-lightweight",
  analyze: (owner, repo, onProgress) =>
    runLightweightAnalysis(owner, repo, onProgress),
};

/** Kick off (or reuse) an analysis job for a repository. */
export function startAnalysis(
  owner: string,
  repo: string,
  worker: AnalysisWorker = inProcessLightweightWorker,
): { started: boolean } {
  const repoId = `${owner}/${repo}`;
  const existing = jobStore.get(repoId);
  if (
    existing &&
    (existing.status === "running" ||
      existing.status === "queued" ||
      (existing.status === "completed" && jobStore.result(repoId)))
  ) {
    return { started: false };
  }

  jobStore.create(repoId, "lightweight");

  // Fire and forget within this serverless invocation. `waitUntil`-style
  // persistence is provided by the deployment platform when configured.
  void worker
    .analyze(owner, repo, (progress) => jobStore.progress(repoId, progress))
    .then((analysis) => jobStore.complete(repoId, analysis))
    .catch((error: unknown) => {
      const message =
        error instanceof GitHubError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Analysis failed unexpectedly.";
      jobStore.fail(repoId, message);
    });

  return { started: true };
}
