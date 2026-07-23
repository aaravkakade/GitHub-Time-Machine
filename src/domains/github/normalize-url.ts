export interface RepoRef {
  owner: string;
  repo: string;
}

const OWNER_PATTERN = /^[a-z\d](?:[a-z\d-]{0,38})$/i;
const REPO_PATTERN = /^[a-z\d._-]{1,100}$/i;

/**
 * Accepts the common ways people paste a repository reference:
 *   https://github.com/facebook/react (with optional path/query/fragment)
 *   github.com/vercel/next.js
 *   git@github.com:owner/repo.git
 *   facebook/react
 */
export function normalizeRepoUrl(input: string): RepoRef | null {
  let value = input.trim();
  if (!value) return null;

  value = value.replace(/^git@github\.com:/i, "");
  value = value.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  value = value.replace(/^\/+/, "");

  // Reject non-GitHub absolute URLs that survived the strip.
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return null;

  const segments = value.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[0];
  let repo = segments[1].split(/[?#]/)[0];
  repo = repo.replace(/\.git$/i, "");

  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) return null;
  if (owner.startsWith("-") || owner.endsWith("-")) return null;
  if (repo === "." || repo === "..") return null;

  return { owner: owner.toLowerCase(), repo: repo.toLowerCase() };
}
