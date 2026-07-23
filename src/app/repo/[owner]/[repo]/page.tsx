import type { Metadata } from "next";
import { getDemoAnalysis, isDemoRepo } from "@/domains/demo";
import { Workspace } from "@/components/workspace/workspace";
import { LiveRepoLoader } from "@/components/workspace/live-repo-loader";

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
  return {
    title: `${owner}/${repo} — CodeChronicle`,
    description: `Travel through the architectural history of ${owner}/${repo}.`,
  };
}

export default async function RepoPage({
  params,
}: {
  params: Promise<RepoParams>;
}) {
  const { owner, repo } = await params;

  if (isDemoRepo(owner, repo)) {
    const analysis = await getDemoAnalysis(owner, repo);
    if (analysis) return <Workspace analysis={analysis} />;
  }

  return <LiveRepoLoader owner={owner} repo={repo} />;
}
