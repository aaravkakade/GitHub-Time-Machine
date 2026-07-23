/**
 * Minimal typed GitHub REST client (server-side only).
 * Uses an optional GITHUB_TOKEN for better rate limits; the token never
 * reaches the browser.
 */

const API_BASE = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind:
      | "not-found"
      | "rate-limited"
      | "forbidden"
      | "network"
      | "unknown",
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface GhRepo {
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  default_branch: string;
  created_at: string;
  pushed_at: string | null;
  size: number;
  private: boolean;
}

export interface GhCommitListItem {
  sha: string;
  commit: {
    message: string;
    author: { name?: string; date?: string } | null;
    committer: { date?: string } | null;
  };
  author: { login: string } | null;
}

export interface GhCommitDetail extends GhCommitListItem {
  stats?: { additions: number; deletions: number };
  files?: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    previous_filename?: string;
  }[];
}

export interface GhTag {
  name: string;
  commit: { sha: string };
}

export interface GhContributor {
  login: string;
  contributions: number;
}

export interface GhTreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
}

export interface GhTree {
  sha: string;
  tree: GhTreeEntry[];
  truncated: boolean;
}

export interface GhContent {
  content?: string;
  encoding?: string;
}

async function ghFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "codechronicle",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers,
      // Repository history is immutable enough for aggressive caching.
      next: { revalidate: 1800 },
    });
  } catch (error) {
    throw new GitHubError(
      `Network error reaching GitHub: ${error instanceof Error ? error.message : String(error)}`,
      0,
      "network",
    );
  }

  if (response.ok) return (await response.json()) as T;

  const remaining = response.headers.get("x-ratelimit-remaining");
  if ((response.status === 403 || response.status === 429) && remaining === "0") {
    throw new GitHubError(
      "GitHub API rate limit reached. Set GITHUB_TOKEN to raise the limit, or try again later.",
      response.status,
      "rate-limited",
    );
  }
  if (response.status === 404) {
    throw new GitHubError(
      "Repository not found — it may be private or the name may be misspelled.",
      404,
      "not-found",
    );
  }
  if (response.status === 403) {
    throw new GitHubError("GitHub declined the request.", 403, "forbidden");
  }
  throw new GitHubError(
    `GitHub API error (${response.status})`,
    response.status,
    "unknown",
  );
}

export const githubApi = {
  repo: (owner: string, repo: string) =>
    ghFetch<GhRepo>(`/repos/${owner}/${repo}`),
  languages: (owner: string, repo: string) =>
    ghFetch<Record<string, number>>(`/repos/${owner}/${repo}/languages`),
  commits: (owner: string, repo: string, page: number, perPage = 100) =>
    ghFetch<GhCommitListItem[]>(
      `/repos/${owner}/${repo}/commits?per_page=${perPage}&page=${page}`,
    ),
  commitDetail: (owner: string, repo: string, sha: string) =>
    ghFetch<GhCommitDetail>(`/repos/${owner}/${repo}/commits/${sha}`),
  tags: (owner: string, repo: string) =>
    ghFetch<GhTag[]>(`/repos/${owner}/${repo}/tags?per_page=100`),
  contributors: (owner: string, repo: string) =>
    ghFetch<GhContributor[]>(
      `/repos/${owner}/${repo}/contributors?per_page=30`,
    ),
  tree: (owner: string, repo: string, sha: string) =>
    ghFetch<GhTree>(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`),
  contents: (owner: string, repo: string, path: string, ref: string) =>
    ghFetch<GhContent>(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`,
    ),
};
