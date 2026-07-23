import { describe, expect, it } from "vitest";
import { mapCommit, mapRepository } from "@/domains/github/mapping";
import type { GhCommitDetail, GhRepo } from "@/domains/github/client";

const repoFixture: GhRepo = {
  full_name: "Pallets/Flask",
  name: "Flask",
  owner: { login: "Pallets" },
  description: "The Python micro framework",
  html_url: "https://github.com/pallets/flask",
  stargazers_count: 68000,
  forks_count: 16000,
  language: "Python",
  default_branch: "main",
  created_at: "2010-04-06T11:11:59Z",
  pushed_at: "2026-07-01T00:00:00Z",
  size: 9000,
  private: false,
};

describe("mapRepository", () => {
  it("normalizes identifiers to lowercase and keeps metadata", () => {
    const repo = mapRepository(repoFixture, { Python: 100 });
    expect(repo.id).toBe("pallets/flask");
    expect(repo.owner).toBe("pallets");
    expect(repo.stars).toBe(68000);
    expect(repo.languages).toEqual({ Python: 100 });
    expect(repo.defaultBranch).toBe("main");
  });
});

describe("mapCommit", () => {
  const detail: GhCommitDetail = {
    sha: "abc1234def",
    commit: {
      message: "Fix routing edge case (#512)\n\nLong body here",
      author: { name: "Jane Doe", date: "2020-05-01T10:00:00Z" },
      committer: { date: "2020-05-01T10:05:00Z" },
    },
    author: { login: "janedoe" },
    stats: { additions: 12, deletions: 4 },
    files: [
      { filename: "src/app.py", status: "modified", additions: 10, deletions: 4 },
      {
        filename: "src/new.py",
        status: "renamed",
        additions: 2,
        deletions: 0,
        previous_filename: "src/old.py",
      },
    ],
  };

  it("maps detail commits with files, stats and PR number", () => {
    const commit = mapCommit(detail);
    expect(commit.sha).toBe("abc1234def");
    expect(commit.author.login).toBe("janedoe");
    expect(commit.additions).toBe(12);
    expect(commit.pullRequest).toBe(512);
    expect(commit.files).toHaveLength(2);
    expect(commit.files[1]).toMatchObject({
      status: "renamed",
      previousPath: "src/old.py",
    });
  });

  it("falls back to commit author name when no GitHub login", () => {
    const commit = mapCommit({ ...detail, author: null });
    expect(commit.author.login).toBe("Jane Doe");
  });

  it("handles list items without files or stats", () => {
    const commit = mapCommit({
      sha: "fff",
      commit: { message: "chore", author: { date: "2020-01-01T00:00:00Z" }, committer: null },
      author: { login: "x" },
    });
    expect(commit.files).toEqual([]);
    expect(commit.additions).toBe(0);
    expect(commit.pullRequest).toBeNull();
  });
});
