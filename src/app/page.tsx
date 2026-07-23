import Link from "next/link";
import { ArrowRight, GitCommitHorizontal, Network, Search } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { RepoInput } from "@/components/site/repo-input";
import { HeroGraph } from "@/components/landing/hero-graph";
import { DEMO_REPOSITORIES } from "@/domains/demo";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  {
    icon: Search,
    title: "Point it at a repository",
    body: "Paste any public GitHub URL. CodeChronicle reads commit history, trees, releases and manifests through the GitHub API — nothing is cloned to your machine.",
  },
  {
    icon: GitCommitHorizontal,
    title: "History becomes signals",
    body: "A deterministic engine reconstructs architectural snapshots, detects milestones, and measures churn, coupling and debt indicators. Every number is traceable to commits.",
  },
  {
    icon: Network,
    title: "Scrub through time",
    body: "Watch modules appear, grow, split and connect on an animated architecture canvas. AI can explain the turning points — always with the evidence attached.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-surface-0">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pt-20 pb-16 lg:grid-cols-[1.05fr_1fr] lg:pt-28">
          <div>
            <Badge tone="accent" className="mb-5">
              An interactive time machine for Git history
            </Badge>
            <h1 className="max-w-xl text-4xl leading-[1.08] font-semibold tracking-tight text-ink-1 sm:text-5xl">
              Watch any codebase{" "}
              <span className="text-accent-strong">evolve.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-2">
              Paste a GitHub repository and travel through its architecture,
              decisions, dependencies, and technical debt.
            </p>
            <RepoInput className="mt-8 max-w-lg" />
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-3">
              <span>Try a demo:</span>
              {DEMO_REPOSITORIES.map((demo) => (
                <Link
                  key={demo.id}
                  href={`/repo/${demo.owner}/${demo.repo}`}
                  className="rounded-full border border-line-1 bg-surface-1 px-2.5 py-1 font-mono text-[11px] text-ink-2 transition-colors hover:border-[var(--accent-line)] hover:text-ink-1"
                  data-testid={`demo-chip-${demo.repo}`}
                >
                  {demo.id}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--radius-xl)] border border-line-0 bg-surface-1/60 p-4">
            <HeroGraph />
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-line-0 bg-surface-1/40">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-xl font-semibold text-ink-1">How it works</h2>
            <div className="mt-8 grid gap-8 md:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.title}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-line-1 bg-surface-2">
                    <step.icon className="h-4 w-4 text-accent-strong" aria-hidden />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-ink-1">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Honesty + privacy */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-xl font-semibold text-ink-1">
                Facts first, interpretation second
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2">
                Milestones, metrics and debt signals are computed
                deterministically from Git history and static analysis. AI only
                interprets those measurements — and every summary cites the
                commits it&apos;s based on. No key configured? The whole
                product still works.
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-ink-1">
                Privacy &amp; processing
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2">
                Only public repositories are analyzed, entirely server-side via
                the GitHub API. Derived snapshots are cached; your GitHub token
                (optional, for rate limits) stays on the server. Large
                repositories are sampled — and the UI tells you when they are.
              </p>
            </div>
          </div>

          <div className="mt-16 flex flex-col items-center rounded-[var(--radius-xl)] border border-line-0 bg-surface-1/60 px-6 py-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-1">
              Every repository has a story.
            </h2>
            <p className="mt-2 max-w-md text-sm text-ink-2">
              Open a demo in one click — no account, no configuration.
            </p>
            <Link
              href={`/repo/${DEMO_REPOSITORIES[0].owner}/${DEMO_REPOSITORIES[0].repo}`}
              className="mt-6 inline-flex items-center gap-2 rounded-[var(--radius-lg)] bg-accent px-5 py-2.5 text-sm font-medium text-[#0b0b10] transition-colors hover:bg-accent-strong"
            >
              Open the demo time machine
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-ink-3">
          <span className="font-mono">
            code<span className="text-accent">chronicle</span>
          </span>
          <div className="flex gap-5">
            <Link href="/about" className="hover:text-ink-1">
              Methodology &amp; limitations
            </Link>
            <Link href="/explore" className="hover:text-ink-1">
              Explore
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
