# Analysis methodology

This document is the precise version of the `/about` page: exactly what
CodeChronicle measures, how, and where interpretation begins.

## The dividing line

| Deterministic (computed from Git + static analysis) | Inferred (AI) |
| --- | --- |
| Commits, authors, releases, file changes | Milestone / module / comparison summaries |
| Module graph and dependency edges | Broad change classification |
| Metrics (LOC, complexity, test ratio, churn, …) | Onboarding-style explanations |
| Milestones + confidence | — |
| Debt signals + methodology | — |
| Refactor opportunities | — |

AI never produces a number and never invents a fact. Its inputs are restricted
to an evidence bundle drawn from the deterministic results, and it must cite the
evidence it used.

## What is analyzed

Files are classified in `analysis/classify.ts`:

- **Excluded:** vendored/generated directories (`node_modules`, `dist`, `.next`,
  `vendor`, `site-packages`, …), lockfiles and generated artifacts, and binary
  extensions.
- **Source languages** (TypeScript/JavaScript/Python/…) get parsed; other text
  files still contribute line counts.
- Tests, CI configs and manifests are detected by path so they can drive
  milestone and metric logic.

## Modules and the graph

Files are grouped into directory-level modules (`analysis/modules.ts`) so the
graph stays legible. Grouping depth adapts: when one root (e.g. `src`) dominates,
its children become clusters; inside a workspace namespace (`packages/x`), member
packages keep their internal structure. Module ids are path-derived and stable
across the entire timeline, so a UI selection survives time travel.

Edges are module-level imports aggregated from file-level imports **when import
analysis is available** (deep worker, or any source that supplies `imports`).
Otherwise a containment fallback connects a cluster's largest module to its
siblings — these are labeled `structure` in the UI and drawn dashed, so inferred
relationships are never presented as real import edges.

## Snapshots

Analyzing every commit is too expensive, so `snapshots/select.ts` chooses the
commits most likely to have changed the architecture — the initial and latest
commits, major releases, structural-change commits, dependency shifts, and
high-churn commits — then fills the remaining budget with evenly spaced interval
points so scrubbing always has nearby data. The timeline shows all retrieved
commits; the graph transitions between this smaller snapshot set, selecting the
nearest snapshot at or before the scrub position.

## Milestone detection

`milestones/detect.ts` emits candidates only from measurable signals:

| Signal | Trigger |
| --- | --- |
| founding-commit | first analyzed commit |
| commit-size | churn ≥ 8× the median commit and > 400 lines |
| folder-restructure | many renames/moves spanning ≥ 2 top-level directories |
| package-extraction | first `packages/*` directory appears |
| framework-adoption | manifest gains a known framework |
| dependency-shift | ≥ 3 dependency additions/removals in one commit |
| testing-introduced | first test files / test framework |
| ci-introduced | first CI workflow config |
| commit-cluster | a two-week window with ≥ 6× typical churn and ≥ 5 commits |
| contributor-surge | a month with distinct authors ≥ 2× the prior peak |
| major-release | an `x.0.0` release tag |
| mass-deletion | a large commit dominated by deletions |

Candidates within a span-scaled window (3–45 days) merge into one milestone. The
most descriptive category names it. **Confidence** grows with the lead signal's
strength and the number of independent corroborating signals — it is not an AI
judgment. For long histories the milestone set is capped (founding + major
releases always kept, then the highest-confidence rest) to keep the timeline
readable.

## Metrics

`metrics/series.ts` builds series from snapshots (LOC, files, modules,
complexity, test ratio, dependencies, TODO markers) and from the commit stream
(monthly churn, cumulative contributors). Complexity is an approximate
cyclomatic count (1 + branching constructs) from the parsers. Test ratio is test
LOC ÷ source LOC by path-based detection — a proxy that says nothing about test
quality.

## Debt signals

Debt is not measured directly. `metrics/debt.ts` surfaces individual observable
proxies, **each carrying the exact method used to compute it**:

- high-churn (churn concentration), complexity-growth, coupling (hub fan-in/out),
  dependency-cycle (DFS back-edges), oversized-file, bugfix-density,
  test-ratio-decline, revert-frequency, ownership-concentration,
  abandoned-module, todo-growth, volatile-subsystem.

Each signal has a severity, a trend, evidence (commits/files), and — where
applicable — a trend series. The UI states plainly: *these are indicators of
maintenance risk, not definitive proof of technical debt.*

## Refactor opportunities

`metrics/refactor.ts` derives "likely refactor opportunities" from the debt
signals and co-change data: break a cycle, decouple a hub, split an oversized
(and churny) file, add tests to high-churn low-test files, consolidate
cross-area co-change, stabilize a volatile interface. Each includes evidence,
affected files, a confidence level, the benefit, the **risk**, and a suggested
first step. These are suggestions from current patterns, not predictions.

## Comparison

`snapshots/diff.ts` compares two snapshots deterministically: added/removed
modules, size-change hotspots, added/removed edges, dependency changes, metric
deltas, the commits and milestones between the two points, and the contributors
active in that range. Passing the snapshots in either order yields the same
normalized diff (earlier date is always "before").

## AI grounding

For a subject, `ai/evidence.ts` assembles a bundle of facts, each with a stable
id (commit sha, file path, signal id, metric key). The provider must return a
summary plus the ids it relied on. Citations that don't resolve are stripped; if
none remain, the summary is rejected and the deterministic fallback
(`ai/fallback.ts`) is used instead. The fallback is always available and never
speculative, composed only from measured signals.

## Honesty guarantees

The application explicitly discloses that architectural relationships are
inferred, debt indicators are proxies, AI summaries can be imperfect, large
repositories may be sampled, excluded file classes exist, and refactor
opportunities are suggestions rather than predictions. These disclosures ship in
every analysis (`disclosures` on `RepositoryAnalysis`) and are surfaced in the
Overview panel and on `/about`.
