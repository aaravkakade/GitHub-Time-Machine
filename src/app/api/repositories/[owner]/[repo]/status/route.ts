import { NextResponse } from "next/server";
import { jobStore } from "@/domains/jobs/store";
import { isDemoRepo } from "@/domains/demo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const repoId = `${owner.toLowerCase()}/${repo.toLowerCase()}`;

  if (isDemoRepo(owner, repo)) {
    return NextResponse.json({
      job: {
        id: `demo:${repoId}`,
        repoId,
        mode: "demo",
        status: "completed",
        progress: [],
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      },
    });
  }

  const job = jobStore.get(repoId);
  return NextResponse.json({ job });
}
