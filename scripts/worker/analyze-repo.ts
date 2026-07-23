/**
 * CodeChronicle deep-analysis worker (local implementation).
 *
 * Clones a repository, reconstructs full history from `git log`, parses
 * source at selected snapshots with real parsers (TypeScript compiler API,
 * Python tokenizer), runs the same deterministic engine as the web app, and
 * writes a compact RepositoryAnalysis JSON.
 *
 * Usage:
 *   npx tsx scripts/worker/analyze-repo.ts owner/repo \
 *     [--out path.json] [--mode demo|full] [--max-commits N] [--budget N]
 *
 * The same steps map 1:1 onto a hosted queue (Trigger.dev, Inngest, a
 * container job): implement AnalysisWorker from src/domains/jobs/runner.ts
 * and call this module's `analyzeClonedRepo`.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  Commit,
  FileChange,
  HistoryInput,
  Release,
  Repository,
  RepositoryAnalysis,
  TreeSample,
} from "../../src/domains/schemas";
import { RepositoryAnalysisSchema } from "../../src/domains/schemas";
import { analyzeHistory } from "../../src/domains/analysis/engine";
import { isAnalyzable, isSourceFile } from "../../src/domains/analysis/classify";
import { selectSnapshotPoints } from "../../src/domains/snapshots/select";
import { parseFile, hasDeepParser } from "../../src/domains/parsers";
import { resolveImport } from "../../src/domains/parsers/resolve";

const FIELD = "\x1f";
const RECORD = "\x1e";
const MAX_PARSED_FILE_BYTES = 400_000;
const MAX_FILES_PER_SNAPSHOT = 4000;

function git(cwd: string, args: string[], maxBuffer = 1024 * 1024 * 512): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", maxBuffer });
}

/* ------------------------------------------------------------------ */
/* History extraction                                                  */
/* ------------------------------------------------------------------ */

function parseNumstatPath(raw: string): { path: string; previousPath?: string } {
  // Rename forms: "old => new" or "prefix/{old => new}/suffix"
  const brace = raw.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (brace) {
    const [, pre, from, to, post] = brace;
    return {
      path: (pre + to + post).replace(/\/\//g, "/"),
      previousPath: (pre + from + post).replace(/\/\//g, "/"),
    };
  }
  const arrow = raw.match(/^(.*) => (.*)$/);
  if (arrow) return { path: arrow[2], previousPath: arrow[1] };
  return { path: raw };
}

export function extractCommits(repoDir: string, maxCommits: number): Commit[] {
  const output = git(repoDir, [
    "log",
    "--reverse",
    "--no-merges",
    `--max-count=${maxCommits}`,
    `--pretty=format:${RECORD}%H${FIELD}%ae${FIELD}%an${FIELD}%aI${FIELD}%s`,
    "--numstat",
  ]);

  const commits: Commit[] = [];
  for (const record of output.split(RECORD)) {
    if (!record.trim()) continue;
    const [header, ...bodyLines] = record.split("\n");
    const [sha, email, name, date, subject] = header.split(FIELD);
    if (!sha || !date) continue;

    const files: FileChange[] = [];
    let additions = 0;
    let deletions = 0;
    for (const line of bodyLines) {
      const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!match) continue;
      const add = match[1] === "-" ? 0 : Number(match[1]);
      const del = match[2] === "-" ? 0 : Number(match[2]);
      const { path: filePath, previousPath } = parseNumstatPath(match[3]);
      additions += add;
      deletions += del;
      files.push({
        path: filePath,
        previousPath,
        status: previousPath ? "renamed" : del > 0 && add === 0 ? "modified" : "modified",
        additions: add,
        deletions: del,
      });
    }

    const login = (email?.split("@")[0] || name || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9-_.]/g, "-");

    commits.push({
      sha,
      message: (subject ?? "").slice(0, 140),
      author: { login, name },
      date,
      additions,
      deletions,
      files,
      tags: [],
      dependenciesAdded: [],
      dependenciesRemoved: [],
      pullRequest: extractPr(subject ?? ""),
    });
  }
  // git log --reverse with --max-count returns the OLDEST N; we want the most
  // recent window when capping, so re-sort ascending after a plain log if needed.
  return commits.sort((a, b) => a.date.localeCompare(b.date));
}

function extractPr(subject: string): number | null {
  const match = subject.match(/\(#(\d+)\)\s*$/);
  return match ? Number(match[1]) : null;
}

/** Mark added/removed files using --name-status (numstat can't tell). */
export function annotateStatuses(repoDir: string, commits: Commit[]) {
  const output = git(repoDir, [
    "log",
    "--reverse",
    "--no-merges",
    `--max-count=${commits.length}`,
    `--pretty=format:${RECORD}%H`,
    "--name-status",
  ]);
  const bySha = new Map(commits.map((c) => [c.sha, c]));
  for (const record of output.split(RECORD)) {
    if (!record.trim()) continue;
    const [sha, ...lines] = record.split("\n");
    const commit = bySha.get(sha.trim());
    if (!commit) continue;
    const statusByPath = new Map<string, FileChange["status"]>();
    for (const line of lines) {
      const match = line.match(/^([AMDR])\d*\t([^\t]+)(?:\t(.+))?$/);
      if (!match) continue;
      const [, code, p1, p2] = match;
      const filePath = code === "R" ? p2! : p1;
      statusByPath.set(
        filePath,
        code === "A" ? "added" : code === "D" ? "removed" : code === "R" ? "renamed" : "modified",
      );
    }
    for (const file of commit.files) {
      const status = statusByPath.get(file.path);
      if (status) file.status = status;
    }
  }
}

export function extractReleases(repoDir: string, commits: Commit[]): Release[] {
  let output = "";
  try {
    output = git(repoDir, [
      "tag",
      "--list",
      "--format=%(refname:short)\t%(creatordate:iso-strict)\t%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end)",
    ]);
  } catch {
    return [];
  }
  const bySha = new Map(commits.map((c) => [c.sha, c]));
  const releases: Release[] = [];
  for (const line of output.split("\n")) {
    const [tag, date, sha] = line.split("\t");
    if (!tag || !date) continue;
    const commit = sha ? bySha.get(sha) : undefined;
    if (commit) commit.tags.push(tag);
    releases.push({ tag, date: commit?.date ?? date, sha });
  }
  return releases.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* Snapshot extraction                                                 */
/* ------------------------------------------------------------------ */

function listFilesAt(repoDir: string, sha: string): string[] {
  // -z avoids C-style quoting of non-ASCII paths.
  return git(repoDir, ["ls-tree", "-r", "--name-only", "-z", sha])
    .split("\0")
    .filter(Boolean);
}

function readFileAt(repoDir: string, sha: string, filePath: string): string | null {
  try {
    const content = git(repoDir, ["show", `${sha}:${filePath}`], MAX_PARSED_FILE_BYTES * 4);
    return content.length > MAX_PARSED_FILE_BYTES ? null : content;
  } catch {
    return null;
  }
}

function extractPackages(repoDir: string, sha: string, files: Set<string>): string[] {
  const deps = new Set<string>();
  if (files.has("package.json")) {
    const raw = readFileAt(repoDir, sha, "package.json");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        Object.keys(parsed.dependencies ?? {}).forEach((d) => deps.add(d));
        Object.keys(parsed.devDependencies ?? {}).forEach((d) => deps.add(d));
      } catch {
        // malformed manifest at this point in history — skip
      }
    }
  }
  for (const manifest of ["requirements.txt", "requirements/dev.txt", "setup.py", "pyproject.toml"]) {
    if (!files.has(manifest)) continue;
    const raw = readFileAt(repoDir, sha, manifest);
    if (!raw) continue;
    if (manifest.endsWith(".txt")) {
      for (const line of raw.split("\n")) {
        const match = line.trim().match(/^([A-Za-z0-9._-]+)/);
        if (match && !line.trim().startsWith("#")) deps.add(match[1].toLowerCase());
      }
    } else {
      // setup.py / pyproject: quoted requirement strings
      for (const match of raw.matchAll(/["']([A-Za-z0-9._-]+)(?:[<>=!~\[][^"']*)?["']/g)) {
        const name = match[1].toLowerCase();
        if (/^[a-z][a-z0-9._-]{1,40}$/.test(name)) deps.add(name);
      }
    }
  }
  return [...deps].sort();
}

export function buildTreeSample(
  repoDir: string,
  sha: string,
  date: string,
): TreeSample {
  const allPaths = listFilesAt(repoDir, sha).filter((p) => isAnalyzable(p));
  const paths = allPaths.slice(0, MAX_FILES_PER_SNAPSHOT);
  const fileSet = new Set(paths);
  const files: TreeSample["files"] = [];
  const imports: { from: string; to: string }[] = [];

  for (const filePath of paths) {
    if (isSourceFile(filePath) && hasDeepParser(filePath)) {
      const content = readFileAt(repoDir, sha, filePath);
      if (content !== null) {
        const parsed = parseFile(filePath, content);
        files.push({
          path: filePath,
          loc: parsed.loc,
          language: parsed.language ?? undefined,
          complexity: parsed.complexity,
          todoCount: parsed.todoCount,
        });
        for (const spec of parsed.imports) {
          const resolved = resolveImport(filePath, spec, fileSet);
          if (resolved && resolved !== filePath) {
            imports.push({ from: filePath, to: resolved });
          }
        }
        continue;
      }
    }
    // Non-parsed files: count lines cheaply (blob may be binary → skip).
    const content = readFileAt(repoDir, sha, filePath);
    if (content !== null && !content.includes("\u0000")) {
      files.push({ path: filePath, loc: content.split("\n").length });
    }
  }

  return {
    sha,
    date,
    files,
    imports,
    packages: extractPackages(repoDir, sha, fileSet),
  };
}

/* ------------------------------------------------------------------ */
/* Repo metadata                                                       */
/* ------------------------------------------------------------------ */

async function fetchRepoMetadata(owner: string, repo: string): Promise<Partial<Repository>> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "codechronicle-worker",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as {
      description: string | null;
      stargazers_count: number;
      forks_count: number;
      language: string | null;
      default_branch: string;
      created_at: string;
      pushed_at: string;
    };
    return {
      description: data.description ?? "",
      stars: data.stargazers_count,
      forks: data.forks_count,
      primaryLanguage: data.language,
      defaultBranch: data.default_branch,
      createdAt: data.created_at,
      pushedAt: data.pushed_at,
    };
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* Output compaction                                                   */
/* ------------------------------------------------------------------ */

/** Keep full file lists only for commits referenced as evidence. */
export function compactAnalysis(analysis: RepositoryAnalysis): RepositoryAnalysis {
  const referenced = new Set<string>();
  for (const m of analysis.milestones) {
    referenced.add(m.sha);
    for (const s of m.signals) for (const sha of s.evidence) referenced.add(sha);
  }
  for (const f of analysis.fileRecords) {
    referenced.add(f.createdSha);
    for (const sha of f.majorCommits) referenced.add(sha);
  }
  for (const d of analysis.debtSignals) {
    for (const sha of d.evidence.commits) referenced.add(sha);
  }
  for (const s of analysis.snapshots) referenced.add(s.sha);

  const topChurn = [...analysis.commits]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, 200);
  for (const c of topChurn) referenced.add(c.sha);

  return {
    ...analysis,
    commits: analysis.commits.map((c) => ({
      ...c,
      message: c.message.split("\n")[0].slice(0, 120),
      files: referenced.has(c.sha)
        ? c.files
            .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
            .slice(0, 25)
        : [],
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

export async function analyzeClonedRepo(options: {
  owner: string;
  repo: string;
  repoDir: string;
  mode: "demo" | "full";
  maxCommits: number;
  snapshotBudget: number;
}): Promise<RepositoryAnalysis> {
  const { owner, repo, repoDir, mode, maxCommits, snapshotBudget } = options;

  console.log("→ extracting commit history");
  const commits = extractCommits(repoDir, maxCommits);
  annotateStatuses(repoDir, commits);
  console.log(`  ${commits.length} commits`);

  const releases = extractReleases(repoDir, commits);
  console.log(`  ${releases.length} tags`);

  const points = selectSnapshotPoints(commits, releases, snapshotBudget);
  console.log(`→ building ${points.length} tree snapshots (parsing source)`);
  const samples: TreeSample[] = [];
  for (const point of points) {
    process.stdout.write(`  ${point.date.slice(0, 10)} (${point.reason}) … `);
    const sample = buildTreeSample(repoDir, point.sha, point.date);
    samples.push(sample);
    console.log(`${sample.files.length} files, ${sample.imports?.length ?? 0} imports`);
  }

  // Manifest dependency changes between consecutive samples.
  for (let i = 1; i < samples.length; i++) {
    const prev = new Set(samples[i - 1].packages ?? []);
    const curr = new Set(samples[i].packages ?? []);
    const added = [...curr].filter((d) => !prev.has(d));
    const removed = [...prev].filter((d) => !curr.has(d));
    if (added.length + removed.length === 0) continue;
    const target = commits.find((c) => c.sha === samples[i].sha);
    if (target) {
      target.dependenciesAdded = added.slice(0, 30);
      target.dependenciesRemoved = removed.slice(0, 30);
    }
  }

  const meta = await fetchRepoMetadata(owner, repo);
  const repository: Repository = {
    id: `${owner}/${repo}`,
    owner,
    name: repo,
    description: meta.description ?? "",
    url: `https://github.com/${owner}/${repo}`,
    primaryLanguage: meta.primaryLanguage ?? null,
    languages: {},
    stars: meta.stars ?? 0,
    forks: meta.forks ?? 0,
    defaultBranch: meta.defaultBranch ?? "main",
    createdAt: meta.createdAt ?? commits[0].date,
    pushedAt: meta.pushedAt ?? commits[commits.length - 1].date,
  };

  const capturedAt = new Date().toISOString().slice(0, 10);
  const input: HistoryInput = {
    repository,
    mode,
    commits,
    releases,
    contributors: [],
    treeSamples: samples,
    disclosures:
      mode === "demo"
        ? [
            `Pre-analyzed snapshot of the real repository, captured ${capturedAt} by the CodeChronicle worker. The live repository has moved on since.`,
            "Author identities are derived from commit emails, not GitHub accounts.",
          ]
        : ["Deep analysis from a full local clone. Author identities are derived from commit emails."],
  };

  console.log("→ running analysis engine");
  const analysis = analyzeHistory(input);
  return compactAnalysis(analysis);
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  if (!target || !target.includes("/")) {
    console.error("Usage: npx tsx scripts/worker/analyze-repo.ts owner/repo [--out file] [--mode demo|full] [--max-commits N] [--budget N]");
    process.exit(1);
  }
  const flag = (name: string, fallback: string) => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
  };
  const [owner, repo] = target.toLowerCase().split("/");
  const mode = flag("mode", "full") === "demo" ? ("demo" as const) : ("full" as const);
  const maxCommits = Number(flag("max-commits", "8000"));
  const budget = Number(flag("budget", "14"));
  const out = flag("out", `analysis-${owner}-${repo}.json`);

  const cacheDir = path.join(os.tmpdir(), "codechronicle-worker");
  fs.mkdirSync(cacheDir, { recursive: true });
  const repoDir = path.join(cacheDir, `${owner}--${repo}`);
  if (!fs.existsSync(path.join(repoDir, ".git"))) {
    console.log(`→ cloning ${owner}/${repo}`);
    execFileSync(
      "git",
      ["clone", "--quiet", `https://github.com/${owner}/${repo}.git`, repoDir],
      { stdio: "inherit" },
    );
  } else {
    console.log(`→ using cached clone at ${repoDir}`);
  }

  const analysis = await analyzeClonedRepo({
    owner,
    repo,
    repoDir,
    mode,
    maxCommits,
    snapshotBudget: budget,
  });

  const validated = RepositoryAnalysisSchema.parse(analysis);
  const json = JSON.stringify(validated);
  fs.writeFileSync(out, json);
  console.log(`✓ wrote ${out} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(
    `  snapshots=${validated.snapshots.length} milestones=${validated.milestones.length} debt=${validated.debtSignals.length} modules=${Object.keys(validated.modules).length}`,
  );
}

// Only run the CLI when executed directly (not when imported by tests).
if (process.argv[1]?.includes("analyze-repo")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
