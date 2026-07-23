# CodeChronicle

**Watch any codebase evolve.** Paste a GitHub repository and travel through its
architecture, decisions, dependencies, and technical debt.

CodeChronicle is an interactive time machine for Git history. It reconstructs a
repository's architecture at points in time, detects the milestones that shaped
it, surfaces maintenance-risk signals — and lets you scrub through all of it on
an animated architecture canvas.

Its guiding principle: **facts first, interpretation second.** Milestones,
metrics and debt signals are computed deterministically from Git history and
static analysis. AI is used only to interpret those measurements, and every AI
summary cites the commits it is based on. With no API key configured, the whole
product still works.

---

## Screenshots

> Replace these placeholders with real captures (`/`, `/repo/chronicle-demo/orbit`,
> and `/repo/chronicle-demo/orbit/compare`).

| Landing | Workspace | Comparison |
| --- | --- | --- |
| ![Landing page](docs/screenshots/landing.png) | ![Workspace](docs/screenshots/workspace.png) | ![Comparison](docs/screenshots/compare.png) |

---

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000  →  click the "chronicle-demo/orbit" demo chip
```

No configuration is required. The bundled demos (a fictional scripted repo plus
pre-analyzed snapshots of `expressjs/express` and `pallets/flask`) open
instantly.

To analyze a live public repository, set a `GITHUB_TOKEN` (see below) and paste
any GitHub URL on the landing page.

---

## Architecture at a glance

```
Browser (Next.js App Router, React Flow canvas, Zustand store)
   │  server actions / API routes
   ▼
Analysis engine  ──────────────  the single deterministic pipeline
   ▲     ▲     ▲
   │     │     └── Deep worker    (local git clone + TS/JS/Python parsers)
   │     └──────── Lightweight    (GitHub REST API, sampled)
   └────────────── Demo           (bundled datasets + scenario generator)
```

Every data source normalizes into one `HistoryInput` shape and flows through the
same engine (`src/domains/analysis/engine.ts`) — so demo, live and deep analyses
all apply identical rules. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full
breakdown and [ANALYSIS_METHODOLOGY.md](ANALYSIS_METHODOLOGY.md) for exactly what
is measured versus inferred.

**Stack:** Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS v4 ·
React Flow (`@xyflow/react`) · Framer Motion · Zustand · Zod · Anthropic SDK ·
Vitest · Playwright.

---

## Local setup

```bash
npm install          # install dependencies
npm run dev          # dev server (Turbopack) on http://localhost:3000
npm run build        # production build
npm start            # serve the production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # unit tests (Vitest)
npm run e2e          # end-to-end test (Playwright; boots its own dev server)
```

The e2e test needs the Playwright browser once: `npx playwright install chromium`.

### Environment variables

All are **optional** — see [.env.example](.env.example). Copy it to `.env.local`.

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Raises the GitHub API rate limit (60 → 5,000 req/hr) for live analysis. Server-side only. |
| `ANTHROPIC_API_KEY` | Enables evidence-grounded AI insight summaries. Without it, deterministic summaries are shown. |
| `CODECHRONICLE_AI_MODEL` | Override the Claude model (default `claude-opus-4-8`). |
| `NEXT_PUBLIC_APP_URL` | Absolute base URL for OpenGraph metadata (default `http://localhost:3000`). |

#### GitHub API setup

1. Create a token at **github.com → Settings → Developer settings → Personal
   access tokens**. A fine-grained token with read-only public repository
   access, or a classic token with no scopes, is sufficient (public data only).
2. Put it in `.env.local` as `GITHUB_TOKEN=…`. It is only ever read server-side.

#### AI provider setup

1. Get an API key from the Anthropic Console.
2. Set `ANTHROPIC_API_KEY=…` in `.env.local`.
3. Insight panels will use evidence-grounded summaries; each cited commit is
   verifiable in the UI. Summaries whose citations don't resolve are rejected in
   favor of the deterministic fallback.

---

## Analysis modes

CodeChronicle uses a tiered strategy so it is impressive without configuration
and still deployable within serverless limits.

### Demo mode (default, zero config)

- The fictional **`chronicle-demo/orbit`** repository is generated
  deterministically from a scripted scenario and analyzed on the fly (~10 ms).
- **`expressjs/express`** and **`pallets/flask`** are bundled as compact,
  validated `RepositoryAnalysis` JSON produced by the deep worker.

### Lightweight live mode (Vercel-compatible)

For any public repository pasted at runtime. Uses the GitHub REST API to read
the most recent ~300 commits, sample file-level detail, fetch a handful of trees
and manifests, and build a real timeline + structural architecture view — all
within ~35–45 API requests. Line counts are estimated from file sizes and module
edges come from directory structure/manifests. Every shortcut is disclosed in
the UI.

Progress streams to the loading screen through a polled job
(`/api/repositories/[owner]/[repo]/status`).

### Full-analysis mode (worker)

The deep worker clones the repository and parses real source with the TypeScript
compiler API and a Python parser, producing accurate line counts, complexity,
and import-level dependency edges.

```bash
# Generate a bundled demo dataset (compact, validated):
npm run worker -- expressjs/express --mode demo --out src/domains/demo/data/expressjs-express.json

# Full local analysis to an arbitrary file:
npm run worker -- owner/repo --out analysis.json --mode full --max-commits 8000 --budget 14
```

Flags: `--mode demo|full`, `--max-commits N`, `--budget N` (snapshot count),
`--out path`.

#### Worker architecture

`src/domains/jobs/runner.ts` defines a provider-agnostic `AnalysisWorker`
interface. The default `inProcessLightweightWorker` runs inside the request
lifecycle; the local git worker (`scripts/worker/analyze-repo.ts`) implements the
same steps for deep analysis. To move deep analysis to a background provider
(Trigger.dev, Inngest, a queue-backed worker, a container job, or a separate
Python service), implement `AnalysisWorker` around that provider and have the
frontend poll the existing status endpoint — no UI changes required.

---

## Deployment to Vercel

1. Push this repository to GitHub (already the case if you're reading this).
2. Import it in Vercel as a Next.js project — defaults are correct.
3. (Optional) Add environment variables in **Project → Settings → Environment
   Variables**: `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`.
4. Deploy. The demos and lightweight live mode work on Vercel's default runtime.

Deep, whole-history analysis of large repositories should not run synchronously
inside a single serverless request — wire the worker interface to a background
provider as described above, or pre-generate datasets with the local worker and
bundle them.

---

## Supported languages

| Language | Depth |
| --- | --- |
| TypeScript / JavaScript (`.ts .tsx .js .jsx .mjs .cjs`) | Full AST via the TypeScript compiler API: imports (static, dynamic, `require`), exports, functions, classes, cyclomatic complexity. |
| Python (`.py`) | Import/def/class extraction with string- and comment-aware tokenizing; complexity from branch keywords. |
| Everything else | Graceful fallback: line counts, TODO markers, directory-structure edges. |

The parser layer (`src/domains/parsers`) has a common `ParsedFile` schema, so
adding a language means adding one `Parser` implementation.

---

## Analysis methodology

Summarized here; see [ANALYSIS_METHODOLOGY.md](ANALYSIS_METHODOLOGY.md) for
detail.

- **Deterministic:** commits, snapshots, module graph, metrics, milestones
  (with confidence from corroborating signals), debt signals (each with its
  computation method), and refactor opportunities.
- **Inferred by AI:** milestone / module / comparison summaries and change
  classification — grounded in evidence and citing commit hashes.

---

## Limitations

- Architectural relationships are inferred from static analysis and directory
  structure; runtime wiring, DI and dynamic imports are invisible.
- Debt signals are **indicators of maintenance risk, not proof of technical
  debt**.
- AI summaries can be imperfect — the cited commits are the source of truth.
- Lightweight live mode samples history and estimates line counts.
- Generated, binary, vendored and unsupported files are excluded.
- "Likely refactor opportunities" are suggestions, not predictions.

---

## Testing

```bash
npm test        # 86 unit tests: URL normalization, GitHub mapping, parsers,
                # dependency-graph resolution, snapshot selection, milestone
                # detection, debt signals, AI structured-output validation,
                # timeline interaction, repo loading error states, store logic
npm run e2e     # end-to-end: open demo → scrub timeline → select milestone →
                # inspect module → enter comparison mode
```

Unit tests use fixtures and never hit live GitHub APIs.

---

## Roadmap

- Background worker provider integration (Trigger.dev / Inngest) with durable
  job storage.
- More language parsers (Go, Rust, Java) via the existing `Parser` interface.
- Persisted analysis cache (KV / Postgres) shared across instances.
- Branch selection for live repositories.
- Shareable deep-link URLs that encode timeline position and selection.

---

## Repository layout

```
src/
  app/                     Next.js routes (landing, explore, about, repo, compare, api)
  components/              UI: site, landing, workspace (canvas/timeline/panel), compare, charts, ui
  domains/
    schemas/               Zod data model (single source of truth)
    analysis/              engine, classification, module derivation, file records
    snapshots/             snapshot selection, building, diffing
    milestones/            deterministic milestone detection
    metrics/               metric series, debt signals, refactor opportunities
    parsers/               TS/JS + Python parsers, import resolution
    github/                REST client, URL normalization, mapping, lightweight mode
    ai/                    provider abstraction, Anthropic provider, evidence, fallback
    visualization/         stable union graph layout
    jobs/                  in-memory store + provider-agnostic worker seam
    demo/                  scenario generator, demo registry, bundled datasets
  store/                   Zustand workspace store
scripts/worker/            local deep-analysis worker (git clone + parsers)
tests/                     Vitest unit + component tests
e2e/                       Playwright end-to-end test
```

See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for the visual language.
