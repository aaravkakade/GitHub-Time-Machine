import type { RepositoryAnalysis } from "@/domains/schemas";
import { RepositoryAnalysisSchema } from "@/domains/schemas";
import { analyzeHistory } from "@/domains/analysis/engine";
import { generateHistory } from "./scenario";
import { orbitScenario } from "./scenarios/orbit";

export interface DemoDescriptor {
  id: string; // owner/name
  owner: string;
  repo: string;
  title: string;
  description: string;
  language: string;
  kind: "fictional" | "real-snapshot";
  /** When the underlying data was captured/generated. */
  capturedAt: string;
  highlights: string[];
}

export const DEMO_REPOSITORIES: DemoDescriptor[] = [
  {
    id: "chronicle-demo/orbit",
    owner: "chronicle-demo",
    repo: "orbit",
    title: "orbit",
    description:
      "Fictional real-time sync service. A scripted 4-year history that shows every feature: monorepo migration, a debt spiral, cycles, and a v2 cleanup.",
    language: "TypeScript",
    kind: "fictional",
    capturedAt: "2026-07-22",
    highlights: ["Monorepo migration", "Dependency cycle", "Debt spiral", "v2 cleanup"],
  },
  {
    id: "expressjs/express",
    owner: "expressjs",
    repo: "express",
    title: "expressjs/express",
    description:
      "The classic Node.js web framework — 15+ years of real history, from first commit to v5.",
    language: "JavaScript",
    kind: "real-snapshot",
    capturedAt: "2026-07-22",
    highlights: ["15-year history", "v4 → v5 era", "Real commit data"],
  },
  {
    id: "pallets/flask",
    owner: "pallets",
    repo: "flask",
    title: "pallets/flask",
    description:
      "The Python microframework — real history including the great src/ re-layout and the 2.0 modernization.",
    language: "Python",
    kind: "real-snapshot",
    capturedAt: "2026-07-22",
    highlights: ["Python parsing", "src/ migration", "Real commit data"],
  },
];

export function isDemoRepo(owner: string, repo: string): boolean {
  return DEMO_REPOSITORIES.some(
    (d) =>
      d.owner === owner.toLowerCase() && d.repo === repo.toLowerCase(),
  );
}

const cache = new Map<string, RepositoryAnalysis>();

/**
 * Demo analyses: the fictional scenario is generated + analyzed on demand
 * (deterministic, ~10ms); real-repository snapshots are bundled JSON produced
 * by the local worker and validated on load.
 */
export async function getDemoAnalysis(
  owner: string,
  repo: string,
): Promise<RepositoryAnalysis | null> {
  const id = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  const cached = cache.get(id);
  if (cached) return cached;

  let analysis: RepositoryAnalysis | null = null;
  if (id === "chronicle-demo/orbit") {
    analysis = analyzeHistory(generateHistory(orbitScenario));
  } else if (id === "expressjs/express") {
    analysis = await loadBundled(() => import("./data/expressjs-express.json"));
  } else if (id === "pallets/flask") {
    analysis = await loadBundled(() => import("./data/pallets-flask.json"));
  }
  if (analysis) cache.set(id, analysis);
  return analysis;
}

/** Bundled snapshots are validated on load; a bad bundle degrades to live mode. */
async function loadBundled(
  importer: () => Promise<{ default: unknown }>,
): Promise<RepositoryAnalysis | null> {
  try {
    const data = await importer();
    const parsed = RepositoryAnalysisSchema.safeParse(data.default);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
