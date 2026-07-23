import type { Commit, FileChange } from "@/domains/schemas";

let counter = 0;

export function makeCommit(overrides: Partial<Commit> & { date: string }): Commit {
  counter += 1;
  return {
    sha: `sha${String(counter).padStart(4, "0")}${"0".repeat(33)}`,
    message: "Regular change",
    author: { login: "alice" },
    additions: 20,
    deletions: 5,
    files: [
      { path: "src/core.ts", status: "modified", additions: 20, deletions: 5 },
    ],
    tags: [],
    dependenciesAdded: [],
    dependenciesRemoved: [],
    pullRequest: null,
    ...overrides,
  };
}

export function files(...entries: [string, FileChange["status"], number, number][]): FileChange[] {
  return entries.map(([path, status, additions, deletions]) => ({
    path,
    status,
    additions,
    deletions,
  }));
}

/** Evenly spaced routine commits between two dates. */
export function routineCommits(
  from: string,
  to: string,
  count: number,
  author = "alice",
): Commit[] {
  const start = +new Date(from);
  const end = +new Date(to);
  return Array.from({ length: count }, (_, i) =>
    makeCommit({
      date: new Date(start + ((end - start) / count) * i).toISOString(),
      author: { login: author },
    }),
  );
}
