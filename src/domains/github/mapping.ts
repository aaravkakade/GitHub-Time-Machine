import type { Commit, FileChange, Repository } from "@/domains/schemas";
import type { GhCommitDetail, GhCommitListItem, GhRepo } from "./client";

export function mapRepository(
  gh: GhRepo,
  languages: Record<string, number>,
): Repository {
  return {
    id: gh.full_name.toLowerCase(),
    owner: gh.owner.login.toLowerCase(),
    name: gh.name.toLowerCase(),
    description: gh.description ?? "",
    url: gh.html_url,
    primaryLanguage: gh.language,
    languages,
    stars: gh.stargazers_count,
    forks: gh.forks_count,
    defaultBranch: gh.default_branch,
    createdAt: gh.created_at,
    pushedAt: gh.pushed_at,
  };
}

function mapFileStatus(status: string): FileChange["status"] {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "removed";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
}

export function mapCommit(gh: GhCommitListItem | GhCommitDetail): Commit {
  const detail = gh as GhCommitDetail;
  const files: FileChange[] = (detail.files ?? []).map((f) => ({
    path: f.filename,
    status: mapFileStatus(f.status),
    previousPath: f.previous_filename,
    additions: f.additions,
    deletions: f.deletions,
  }));
  return {
    sha: gh.sha,
    message: gh.commit.message.split("\n").slice(0, 2).join("\n"),
    author: {
      login: gh.author?.login ?? gh.commit.author?.name ?? "unknown",
      name: gh.commit.author?.name,
    },
    date:
      gh.commit.author?.date ??
      gh.commit.committer?.date ??
      new Date(0).toISOString(),
    additions: detail.stats?.additions ?? files.reduce((s, f) => s + f.additions, 0),
    deletions: detail.stats?.deletions ?? files.reduce((s, f) => s + f.deletions, 0),
    files,
    tags: [],
    dependenciesAdded: [],
    dependenciesRemoved: [],
    pullRequest: extractPrNumber(gh.commit.message),
  };
}

function extractPrNumber(message: string): number | null {
  const match = message.split("\n")[0].match(/\(#(\d+)\)\s*$/);
  return match ? Number(match[1]) : null;
}
