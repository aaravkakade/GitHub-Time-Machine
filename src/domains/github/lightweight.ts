import type {
  Commit,
  HistoryInput,
  Release,
  RepositoryAnalysis,
  TreeSample,
} from "@/domains/schemas";
import { analyzeHistory, type ProgressReporter } from "@/domains/analysis/engine";
import { isAnalyzable } from "@/domains/analysis/classify";
import { selectSnapshotPoints } from "@/domains/snapshots/select";
import { githubApi, GitHubError } from "./client";
import { mapCommit, mapRepository } from "./mapping";

const MAX_COMMIT_PAGES = 3; // 300 most recent commits
const DETAIL_BUDGET = 20; // per-commit detail fetches
const TREE_BUDGET = 6; // full tree snapshots
/** Rough bytes-per-line used to estimate LOC from blob sizes (disclosed). */
const BYTES_PER_LINE = 32;

/**
 * Lightweight live analysis: enough GitHub API calls to build a real
 * timeline and structural architecture view within serverless limits
 * (≈35–45 requests), with every shortcut disclosed to the user.
 */
export async function runLightweightAnalysis(
  owner: string,
  repo: string,
  onProgress?: ProgressReporter,
): Promise<RepositoryAnalysis> {
  const report = (
    stage: Parameters<ProgressReporter>[0]["stage"],
    percent: number,
    label: string,
    detail?: string,
  ) =>
    onProgress?.({ stage, percent, label, detail, at: new Date().toISOString() });

  report("history", 4, "Reading repository history", "metadata");
  const [ghRepo, languages] = await Promise.all([
    githubApi.repo(owner, repo),
    githubApi.languages(owner, repo).catch(() => ({}) as Record<string, number>),
  ]);
  const repository = mapRepository(ghRepo, languages);

  // Recent commit pages (newest first from the API).
  const pages = await Promise.all(
    Array.from({ length: MAX_COMMIT_PAGES }, (_, i) =>
      githubApi.commits(owner, repo, i + 1).catch(() => []),
    ),
  );
  const listItems = pages.flat();
  if (listItems.length === 0) {
    throw new Error("No commits found on the default branch.");
  }
  const commits: Commit[] = listItems.map(mapCommit).reverse(); // oldest → newest
  report("history", 22, "Reading repository history", `${commits.length} commits`);

  // Tags → releases (only tags whose commit is in our window get a date).
  const tags = await githubApi.tags(owner, repo).catch(() => []);
  const commitBySha = new Map(commits.map((c) => [c.sha, c]));
  const releases: Release[] = [];
  for (const tag of tags) {
    const commit = commitBySha.get(tag.commit.sha);
    if (commit) {
      commit.tags.push(tag.name);
      releases.push({ tag: tag.name, date: commit.date, sha: commit.sha });
    }
  }

  const contributors = await githubApi
    .contributors(owner, repo)
    .then((list) =>
      list.map((c) => ({ login: c.login, commits: c.contributions })),
    )
    .catch(() => []);

  // Repository trees FIRST — these are essential for the architecture graph,
  // so they get priority over the optional commit-detail sampling below. On a
  // tight (unauthenticated) request budget this is what lets a run still
  // produce a usable result instead of starving the trees.
  report("graph", 42, "Reconstructing module relationships", "fetching trees");
  const points = selectSnapshotPoints(commits, releases, TREE_BUDGET);
  const samples: TreeSample[] = [];
  let lastTreeError: unknown = null;
  for (const point of points) {
    let tree;
    try {
      tree = await githubApi.tree(owner, repo, point.sha);
    } catch (error) {
      lastTreeError = error;
      // Once the rate limit is hit, further tree requests can't succeed —
      // stop rather than hammering a spent budget.
      if (error instanceof GitHubError && error.kind === "rate-limited") break;
      continue;
    }
    const files = tree.tree
      .filter((e) => e.type === "blob" && isAnalyzable(e.path))
      .slice(0, 4000)
      .map((e) => ({
        path: e.path,
        loc: Math.max(1, Math.round((e.size ?? 0) / BYTES_PER_LINE)),
      }));
    // Only spend a request on the manifest if the tree actually contains one.
    const hasManifest = tree.tree.some((e) => e.path === "package.json");
    const packages = hasManifest
      ? await fetchManifestDeps(owner, repo, point.sha).catch(() => [])
      : [];
    samples.push({ sha: point.sha, date: point.date, files, packages });
  }
  if (samples.length === 0) {
    throw treeFailureError(lastTreeError);
  }

  // File-level detail for a sampled subset of commits — enrichment only
  // (sharpens milestone detection). Best-effort with whatever request budget
  // remains after the essential trees; a rate limit here simply yields a
  // coarser-but-valid analysis rather than a failure.
  report("milestones", 62, "Detecting important milestones", "sampling commit details");
  const detailShas = sampleDetailShas(commits, DETAIL_BUDGET);
  let detailCount = 0;
  for (const sha of detailShas) {
    let detail;
    try {
      detail = await githubApi.commitDetail(owner, repo, sha);
    } catch (error) {
      if (error instanceof GitHubError && error.kind === "rate-limited") break;
      continue;
    }
    const index = commits.findIndex((c) => c.sha === detail.sha);
    if (index !== -1) {
      commits[index] = { ...mapCommit(detail), tags: commits[index].tags };
      detailCount += 1;
    }
  }

  // Derive manifest dependency changes between consecutive samples so the
  // milestone detector can see framework adoptions.
  attachDependencyChanges(commits, samples);

  const input: HistoryInput = {
    repository,
    mode: "lightweight",
    commits,
    releases,
    contributors,
    treeSamples: samples,
    disclosures: [
      `Lightweight live analysis: the most recent ${commits.length} commits were analyzed; file-level detail was sampled for ${detailCount} of them.`,
      ...(detailCount < detailShas.length
        ? [
            "The GitHub API request budget was reached, so per-commit detail sampling was reduced. Setting a GITHUB_TOKEN raises the limit and yields a sharper analysis.",
          ]
        : []),
      "Line counts in live mode are estimated from file sizes.",
      "Module relationships in live mode come from directory structure and manifests; import-level edges require the deep analysis worker.",
    ],
  };

  report("metrics", 78, "Measuring codebase change");
  return analyzeHistory(input, onProgress);
}

/** Turn a failed batch of tree fetches into an accurate, actionable error. */
function treeFailureError(lastError: unknown): Error {
  if (lastError instanceof GitHubError) {
    if (lastError.kind === "rate-limited") {
      return new GitHubError(
        "GitHub's API rate limit was reached before the repository's file trees could be read. " +
          "Unauthenticated requests are capped at 60/hour — set a GITHUB_TOKEN to raise it to 5,000/hour, then retry.",
        lastError.status,
        "rate-limited",
      );
    }
    // not-found / forbidden / network — already carries a specific message.
    return lastError;
  }
  return new Error(
    "Could not retrieve any of this repository's file trees. It may be empty at the sampled commits, or GitHub may be temporarily unavailable.",
  );
}

function sampleDetailShas(commits: Commit[], budget: number): string[] {
  if (commits.length <= budget) return commits.map((c) => c.sha);
  const shas = new Set<string>();
  shas.add(commits[0].sha);
  shas.add(commits[commits.length - 1].sha);
  const step = (commits.length - 1) / (budget - 1);
  for (let i = 1; i < budget - 1; i++) {
    shas.add(commits[Math.round(i * step)].sha);
  }
  return [...shas];
}

async function fetchManifestDeps(
  owner: string,
  repo: string,
  ref: string,
): Promise<string[]> {
  try {
    const content = await githubApi.contents(owner, repo, "package.json", ref);
    if (!content.content) return [];
    const parsed = JSON.parse(
      Buffer.from(content.content, "base64").toString("utf-8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

/** Diff manifest deps between consecutive samples onto the nearest commit. */
function attachDependencyChanges(commits: Commit[], samples: TreeSample[]) {
  for (let i = 1; i < samples.length; i++) {
    const prev = new Set(samples[i - 1].packages ?? []);
    const curr = new Set(samples[i].packages ?? []);
    const added = [...curr].filter((d) => !prev.has(d));
    const removed = [...prev].filter((d) => !curr.has(d));
    if (added.length === 0 && removed.length === 0) continue;
    const target = commits.find((c) => c.sha === samples[i].sha);
    if (target) {
      target.dependenciesAdded = added;
      target.dependenciesRemoved = removed;
    }
  }
}
