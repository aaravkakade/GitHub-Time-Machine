import { describe, expect, it } from "vitest";
import { normalizeRepoUrl } from "@/domains/github/normalize-url";

describe("normalizeRepoUrl", () => {
  it.each([
    ["https://github.com/facebook/react", "facebook", "react"],
    ["http://github.com/facebook/react", "facebook", "react"],
    ["github.com/vercel/next.js", "vercel", "next.js"],
    ["www.github.com/vercel/next.js", "vercel", "next.js"],
    ["facebook/react", "facebook", "react"],
    ["git@github.com:pallets/flask.git", "pallets", "flask"],
    ["https://github.com/pallets/flask.git", "pallets", "flask"],
    ["https://github.com/Owner/Repo/tree/main/src", "owner", "repo"],
    ["  github.com/a/b  ", "a", "b"],
    ["github.com/a/b?tab=readme#section", "a", "b"],
  ])("parses %s", (input, owner, repo) => {
    expect(normalizeRepoUrl(input)).toEqual({ owner, repo });
  });

  it.each([
    "",
    "   ",
    "react",
    "https://gitlab.com/foo/bar",
    "ftp://github.com/a/b",
    "github.com/onlyowner",
    "github.com//repo",
    "-bad-/repo",
    "owner/..",
  ])("rejects %s", (input) => {
    expect(normalizeRepoUrl(input)).toBeNull();
  });
});
