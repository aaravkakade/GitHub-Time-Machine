import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeRepoUrl } from "@/domains/github/normalize-url";
import { isDemoRepo } from "@/domains/demo";
import { startAnalysis } from "@/domains/jobs/runner";

const BodySchema = z.object({ url: z.string().min(1).max(500) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a repository URL in the `url` field." },
      { status: 400 },
    );
  }

  const ref = normalizeRepoUrl(parsed.data.url);
  if (!ref) {
    return NextResponse.json(
      {
        error: "That doesn't look like a GitHub repository.",
        hint: "Accepted formats: https://github.com/owner/repo, github.com/owner/repo, or owner/repo.",
      },
      { status: 422 },
    );
  }

  if (isDemoRepo(ref.owner, ref.repo)) {
    return NextResponse.json({
      owner: ref.owner,
      repo: ref.repo,
      demo: true,
      status: "ready",
    });
  }

  const { started } = startAnalysis(ref.owner, ref.repo);
  return NextResponse.json(
    {
      owner: ref.owner,
      repo: ref.repo,
      demo: false,
      status: started ? "started" : "already-running",
    },
    { status: 202 },
  );
}
