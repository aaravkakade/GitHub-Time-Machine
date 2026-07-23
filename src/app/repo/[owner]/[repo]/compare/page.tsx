import type { Metadata } from "next";
import Link from "next/link";
import { getDemoAnalysis, isDemoRepo } from "@/domains/demo";
import { jobStore } from "@/domains/jobs/store";
import { CompareWorkspace } from "@/components/compare/compare-workspace";
import { Button } from "@/components/ui/button";

interface RepoParams {
  owner: string;
  repo: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RepoParams>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `Compare — ${owner}/${repo} — CodeChronicle` };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<RepoParams>;
}) {
  const { owner, repo } = await params;

  const analysis = isDemoRepo(owner, repo)
    ? await getDemoAnalysis(owner, repo)
    : jobStore.result(`${owner.toLowerCase()}/${repo.toLowerCase()}`);

  if (!analysis) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface-0 px-6 text-center">
        <h1 className="text-lg font-semibold text-ink-1">
          No analysis available yet
        </h1>
        <p className="max-w-sm text-sm text-ink-2">
          Open the repository first so CodeChronicle can analyze it — then two
          moments of its history can be compared.
        </p>
        <Link href={`/repo/${owner}/${repo}`}>
          <Button variant="primary">Analyze {owner}/{repo}</Button>
        </Link>
      </div>
    );
  }

  return <CompareWorkspace analysis={analysis} />;
}
