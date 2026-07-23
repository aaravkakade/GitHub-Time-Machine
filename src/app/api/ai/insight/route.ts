import { NextResponse } from "next/server";
import { z } from "zod";
import { getDemoAnalysis, isDemoRepo } from "@/domains/demo";
import { jobStore } from "@/domains/jobs/store";
import { getInsight } from "@/domains/ai";

const BodySchema = z.object({
  repoId: z.string().min(3),
  subjectType: z.enum(["milestone", "file", "overview", "comparison"]),
  subjectId: z.string().min(1),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { repoId, subjectType, subjectId } = parsed.data;
  const [owner, repo] = repoId.split("/");
  if (!owner || !repo) {
    return NextResponse.json({ error: "Invalid repository id." }, { status: 400 });
  }

  const analysis = isDemoRepo(owner, repo)
    ? await getDemoAnalysis(owner, repo)
    : jobStore.result(repoId.toLowerCase());

  if (!analysis) {
    return NextResponse.json(
      { error: "No analysis available for this repository." },
      { status: 404 },
    );
  }

  const insight = await getInsight(analysis, subjectType, subjectId);
  if (!insight) {
    return NextResponse.json({ error: "Unknown subject." }, { status: 404 });
  }
  return NextResponse.json({ insight });
}
