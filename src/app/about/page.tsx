import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "Methodology & limitations — CodeChronicle",
  description:
    "How CodeChronicle analyzes repositories, what it can measure, and what it can't.",
};

const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: "What is measured deterministically",
    paragraphs: [
      "Commit history, file changes, releases, and contributor activity come straight from Git data via the GitHub API (or a local clone in worker mode). Architectural snapshots group files into directory-level modules; edges come from parsed imports where static analysis ran, and from directory structure otherwise — structure-only edges are labeled as such in the graph.",
      "Milestones are detected by explicit rules: unusually large commit clusters, folder restructuring, dependency additions, first tests, first CI configuration, package extraction, contributor surges, mass deletions and major release tags. Each milestone lists the signals that triggered it, with commit-level evidence and a confidence score derived from how many independent signals agree.",
    ],
  },
  {
    title: "Debt signals are proxies",
    paragraphs: [
      "There is no objective measure of technical debt. CodeChronicle shows individual observable proxies — churn concentration, complexity trends, coupling, dependency cycles, oversized files, bug-fix density, test-ratio decline, reverts, ownership concentration, stale modules, and TODO growth — each with the exact method used to compute it.",
      "These are indicators of maintenance risk, not definitive proof of technical debt. A 'single-owner hotspot' may be a healthy area of deep expertise; an 'abandoned module' may simply be finished. The signals point at places worth a look; the judgment is yours.",
    ],
  },
  {
    title: "Where AI is used — and where it isn't",
    paragraphs: [
      "AI never produces the numbers. It is only used to summarize and classify moments that the deterministic engine already detected, and its input is restricted to evidence extracted from the analysis. Summaries must cite the evidence ids they relied on; uncited or invalid citations cause the summary to be rejected in favor of a deterministic fallback.",
      "AI summaries can still be imperfect — treat them as a well-informed first read, and use the linked commits as the source of truth. Without an API key configured, all AI panels show deterministic summaries instead.",
    ],
  },
  {
    title: "Sampling and limitations",
    paragraphs: [
      "Lightweight live mode analyzes the most recent ~300 commits, samples file-level details for a subset, estimates line counts from file sizes, and derives module relationships from structure and manifests rather than parsed imports. Repositories with enormous histories are therefore summarized, not exhaustively analyzed.",
      "Generated, binary, vendored and unsupported files are excluded everywhere. Static import graphs cannot see runtime wiring, dependency injection, or dynamic imports. Rename detection follows Git's heuristics and may miss content-level moves. The deep-analysis worker (local git clone + real parsers for TypeScript, JavaScript and Python) removes several of these limits — see the README for how to run it.",
    ],
  },
  {
    title: "Privacy",
    paragraphs: [
      "Only public repositories can be analyzed. All GitHub API access happens server-side; an optional GITHUB_TOKEN improves rate limits and is never exposed to the browser. Analyses are derived data (metrics, snapshots, milestones) — full repository contents are not stored.",
    ],
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-surface-0">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-1">
          Methodology &amp; limitations
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          CodeChronicle separates what can be measured from what can only be
          interpreted. This page explains exactly where that line runs.
        </p>
        {SECTIONS.map((section) => (
          <section key={section.title} className="mt-10">
            <h2 className="text-base font-semibold text-ink-1">{section.title}</h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="mt-3 text-sm leading-relaxed text-ink-2">
                {p}
              </p>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
