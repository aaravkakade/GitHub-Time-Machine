import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { RepoInput } from "@/components/site/repo-input";
import { DEMO_REPOSITORIES } from "@/domains/demo";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Explore repositories — CodeChronicle",
  description:
    "Open a pre-analyzed demo repository or analyze any public GitHub repository.",
};

export default function ExplorePage() {
  return (
    <div className="min-h-dvh bg-surface-0">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-1">
          Explore a repository
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-2">
          Analyze any public GitHub repository, or open a bundled demo that
          works instantly with no configuration.
        </p>
        <RepoInput className="mt-6 max-w-xl" autoFocus />

        <h2 className="mt-12 mb-4 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
          Demo repositories
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_REPOSITORIES.map((demo) => (
            <Link
              key={demo.id}
              href={`/repo/${demo.owner}/${demo.repo}`}
              data-testid={`demo-card-${demo.repo}`}
              className="group flex flex-col rounded-[var(--radius-lg)] border border-line-0 bg-surface-1 p-4 transition-colors hover:border-[var(--accent-line)]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-medium text-ink-1">
                  {demo.title}
                </span>
                <ArrowUpRight
                  className="h-4 w-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent-strong"
                  aria-hidden
                />
              </div>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-2">
                {demo.description}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{demo.language}</Badge>
                <Badge tone={demo.kind === "fictional" ? "accent" : "outline"}>
                  {demo.kind === "fictional" ? "fictional demo" : "real history"}
                </Badge>
              </div>
              <p className="mt-2 text-[10px] text-ink-3">
                Demo data prepared {formatDate(demo.capturedAt)}
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-[var(--radius-md)] border border-line-0 bg-surface-1/60 px-4 py-3 text-xs leading-relaxed text-ink-3">
          Live analysis uses the lightweight GitHub API mode: recent history is
          analyzed and large repositories are sampled. For full-depth analysis
          (import graphs, complexity trends across the entire history), run the
          local worker — see the project README.
        </div>
      </main>
    </div>
  );
}
