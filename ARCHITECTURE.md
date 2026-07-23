# Architecture

CodeChronicle is organized around **domains**, not technical layers. Each domain
in `src/domains/` owns one concern and exposes a small typed surface; UI
components and API routes compose them. The Zod schema package is the single
source of truth every other domain depends on.

## The one pipeline

The central design decision: **there is exactly one analysis engine, and every
data source normalizes into its input.**

```
                         ┌──────────────────────────────┐
 Demo scenario ─────────▶│                              │
 GitHub lightweight ────▶│   HistoryInput (normalized)  │
 Deep git worker ───────▶│                              │
                         └───────────────┬──────────────┘
                                         ▼
                          analyzeHistory()  ──►  RepositoryAnalysis
                                         │
   ┌─────────────┬────────────┬──────────┼───────────┬─────────────┐
   ▼             ▼            ▼           ▼           ▼             ▼
 file records  milestones  snapshots   metrics   debt signals   refactor ops
```

`HistoryInput` (`src/domains/schemas/analysis.ts`) contains the repository
metadata, an ordered commit stream, releases, contributors, and **tree samples**
(the full file list — with line counts, complexity, imports and manifests — at
selected snapshot points). Because all three sources produce this same shape,
the engine's rules are identical whether the data came from a fictional
scenario, the GitHub API, or a local clone.

`analyzeHistory()` (`src/domains/analysis/engine.ts`) orchestrates:

1. `buildFileRecords` — per-file histories, following renames.
2. `detectMilestones` — deterministic signal detection + merging.
3. `buildSnapshots` — module graphs with per-period change status/churn.
4. `computeMetricSeries` — LOC, complexity, test ratio, churn, contributors…
5. `computeDebtSignals` — observable proxies, each with its methodology.
6. `computeRefactorOpportunities` — suggestions derived from the signals.

The output is a `RepositoryAnalysis`, validated by `RepositoryAnalysisSchema`.
Nothing downstream (UI, comparison, AI) re-derives facts — they read this object.

## Domain map

| Domain | Responsibility |
| --- | --- |
| `schemas` | Zod schemas + inferred types for the entire data model. Imported everywhere. |
| `analysis` | The engine, file classification (what to analyze/skip), module derivation, file-record reconstruction. |
| `snapshots` | Which commits become snapshots (`select`), building module graphs (`build`), diffing two snapshots (`diff`). |
| `milestones` | Rule-based milestone detection with confidence scoring and merging. |
| `metrics` | Metric series, debt signals, refactor opportunities. |
| `parsers` | `Parser` interface + TS/JS (compiler API) and Python parsers + import resolution to repo-relative paths. |
| `github` | REST client, URL normalization, response→schema mapping, lightweight live-analysis assembly. |
| `ai` | Provider abstraction, Anthropic provider (structured outputs), evidence-bundle construction, deterministic fallback. |
| `visualization` | The stable "union layout" that places every module once across the whole timeline. |
| `jobs` | In-memory job/result store + the provider-agnostic `AnalysisWorker` seam. |
| `demo` | Scenario generator, demo registry, bundled datasets. |

## Frontend

- **Routing** — Next.js App Router. `/`, `/explore`, `/about`,
  `/repo/[owner]/[repo]`, `/repo/[owner]/[repo]/compare`, and the API routes.
- **Workspace** (`components/workspace`) — a four-area layout: compact header,
  architecture canvas, insight panel, and timeline. Heavy pieces (the React Flow
  canvas, the comparison canvases) are `dynamic()`-imported with `ssr: false` and
  skeleton fallbacks so the initial bundle stays light.
- **State** — a single Zustand store (`store/workspace-store.ts`) holds the
  scrub position, active snapshot index, selection, filters, and playback state.
  Components subscribe to slices; the store keeps `timeMs` and `snapshotIndex`
  consistent so scrubbing never desyncs the graph from the timeline.
- **Graph** — `visualization/layout.ts` computes positions once over the union
  of every snapshot's modules. Time travel then only animates size, emphasis and
  presence, so the architecture appears to grow in place rather than reshuffle.
  `use-graph-elements.ts` derives React Flow nodes/edges for the active snapshot,
  including brief exit animations for removed modules.

## Data flow for a live repository

```
/repo/o/r page ──► LiveRepoLoader (client)
     │  POST /api/repositories/analyze          → startAnalysis() → jobStore
     │  GET  /api/repositories/o/r/status (poll) → job.progress
     │  GET  /api/repositories/o/r/data          → RepositoryAnalysis
     ▼
   Workspace(analysis)
```

`startAnalysis` runs the `inProcessLightweightWorker`, reporting progress into
the `jobStore`. Demo repositories skip the job entirely — the page resolves the
bundled/generated analysis server-side and renders the workspace directly.

## The worker seam

`jobs/runner.ts` exposes:

```ts
interface AnalysisWorker {
  name: string;
  analyze(owner, repo, onProgress): Promise<RepositoryAnalysis>;
}
```

The default implementation is the lightweight in-process worker. The local deep
worker (`scripts/worker/analyze-repo.ts`) performs the same conceptual steps
(clone → extract history → sample+parse trees → engine → compact) and can be
adapted to any background provider by implementing this interface. Because the
frontend only knows about the job store and status endpoint, swapping the worker
requires no UI changes.

## AI layer

`ai/index.ts` picks the first configured `AIProvider`. For a subject
(milestone / file / comparison / overview) it builds an **evidence bundle** of
deterministic facts (`ai/evidence.ts`) whose ids are the only things the model
may cite. The Anthropic provider (`ai/anthropic-provider.ts`) uses structured
outputs validated against `InsightOutputSchema`, then drops any cited id that
wasn't in the bundle; if nothing valid remains, the call is rejected. When no
provider is configured — or a provider fails — `ai/fallback.ts` produces a
deterministic, evidence-grounded summary. Insights are cached per subject.

## Performance choices

- Stable union layout + memoized element derivation → the whole graph is not
  rebuilt on pointer moves.
- Heavy libraries are lazy-loaded; the landing page ships none of them.
- Commit lists in the panel are paginated; the timeline debounces expensive
  recomputation to visible-window changes.
- Snapshots are precomputed, so timeline scrubbing selects the nearest snapshot
  instantly rather than recomputing.
- Bundled demo datasets are compacted by the worker: full file lists are kept
  only for commits referenced as evidence.
