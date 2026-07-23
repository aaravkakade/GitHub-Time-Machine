import { NextResponse } from "next/server";
import { getDemoAnalysis, isDemoRepo } from "@/domains/demo";
import { jobStore } from "@/domains/jobs/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;

  if (isDemoRepo(owner, repo)) {
    const analysis = await getDemoAnalysis(owner, repo);
    if (analysis) return NextResponse.json({ analysis });
  }

  const repoId = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  const analysis = jobStore.result(repoId);
  if (!analysis) {
    return NextResponse.json(
      { error: "No completed analysis for this repository." },
      { status: 404 },
    );
  }
  return NextResponse.json({ analysis });
}
