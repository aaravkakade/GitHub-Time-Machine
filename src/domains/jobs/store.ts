import type {
  AnalysisJob,
  AnalysisProgress,
  RepositoryAnalysis,
} from "@/domains/schemas";

/**
 * In-memory job + result store. Fine for demo/lightweight mode on a single
 * serverless instance; the worker abstraction (see jobs/runner.ts) is where a
 * durable queue (Trigger.dev, Inngest, Redis, …) would plug in. Stored on
 * globalThis so Next.js dev-server module reloads don't lose state.
 */

interface JobStoreState {
  jobs: Map<string, AnalysisJob>;
  results: Map<string, RepositoryAnalysis>;
}

const globalStore = globalThis as unknown as {
  __codechronicleJobs?: JobStoreState;
};

function state(): JobStoreState {
  globalStore.__codechronicleJobs ??= {
    jobs: new Map(),
    results: new Map(),
  };
  return globalStore.__codechronicleJobs;
}

export const jobStore = {
  get(repoId: string): AnalysisJob | null {
    return state().jobs.get(repoId) ?? null;
  },

  create(repoId: string, mode: AnalysisJob["mode"]): AnalysisJob {
    const job: AnalysisJob = {
      id: `job:${repoId}:${Date.now()}`,
      repoId,
      mode,
      status: "queued",
      progress: [
        {
          stage: "queued",
          label: "Queued",
          percent: 0,
          at: new Date().toISOString(),
        },
      ],
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    state().jobs.set(repoId, job);
    return job;
  },

  progress(repoId: string, progress: AnalysisProgress) {
    const job = state().jobs.get(repoId);
    if (!job) return;
    job.status = "running";
    job.progress = [...job.progress.slice(-24), progress];
  },

  complete(repoId: string, analysis: RepositoryAnalysis) {
    const job = state().jobs.get(repoId);
    state().results.set(repoId, analysis);
    if (!job) return;
    job.status = "completed";
    job.finishedAt = new Date().toISOString();
  },

  fail(repoId: string, error: string) {
    const job = state().jobs.get(repoId);
    if (!job) return;
    job.status = "failed";
    job.error = error;
    job.finishedAt = new Date().toISOString();
  },

  result(repoId: string): RepositoryAnalysis | null {
    return state().results.get(repoId) ?? null;
  },
};
