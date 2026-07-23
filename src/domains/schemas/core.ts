import { z } from "zod";

/** ISO-8601 date string. Kept as string end-to-end for serializability. */
export const IsoDate = z.string().min(4);

export const RepositorySchema = z.object({
  id: z.string(), // "owner/name", lowercase — stable identifier
  owner: z.string(),
  name: z.string(),
  description: z.string().default(""),
  url: z.string(),
  primaryLanguage: z.string().nullable().default(null),
  languages: z.record(z.string(), z.number()).default({}),
  stars: z.number().default(0),
  forks: z.number().default(0),
  defaultBranch: z.string().default("main"),
  createdAt: IsoDate,
  pushedAt: IsoDate.nullable().default(null),
});
export type Repository = z.infer<typeof RepositorySchema>;

export const CommitAuthorSchema = z.object({
  login: z.string(),
  name: z.string().optional(),
});

export const FileChangeSchema = z.object({
  path: z.string(),
  status: z.enum(["added", "modified", "removed", "renamed"]),
  previousPath: z.string().optional(),
  additions: z.number().default(0),
  deletions: z.number().default(0),
});
export type FileChange = z.infer<typeof FileChangeSchema>;

export const CommitSchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: CommitAuthorSchema,
  date: IsoDate,
  additions: z.number().default(0),
  deletions: z.number().default(0),
  /** File-level changes. May be empty when only commit metadata was retrievable. */
  files: z.array(FileChangeSchema).default([]),
  /** Release tags pointing at this commit. */
  tags: z.array(z.string()).default([]),
  /** npm/PyPI-style manifest dependency changes introduced by this commit. */
  dependenciesAdded: z.array(z.string()).default([]),
  dependenciesRemoved: z.array(z.string()).default([]),
  pullRequest: z.number().nullable().default(null),
});
export type Commit = z.infer<typeof CommitSchema>;

export const ContributorSchema = z.object({
  login: z.string(),
  name: z.string().optional(),
  commits: z.number(),
  firstCommitAt: IsoDate.optional(),
  lastCommitAt: IsoDate.optional(),
});
export type Contributor = z.infer<typeof ContributorSchema>;

export const ReleaseSchema = z.object({
  tag: z.string(),
  name: z.string().optional(),
  date: IsoDate,
  sha: z.string().optional(),
});
export type Release = z.infer<typeof ReleaseSchema>;

/** Historical evolution of a single notable file/module. */
export const FileRecordSchema = z.object({
  path: z.string(),
  createdAt: IsoDate,
  createdSha: z.string(),
  deletedAt: IsoDate.nullable().default(null),
  renamedFrom: z.array(z.string()).default([]),
  totalChurn: z.number().default(0),
  commitCount: z.number().default(0),
  authors: z
    .array(z.object({ login: z.string(), commits: z.number() }))
    .default([]),
  /** Commit shas that most changed this file, newest last. */
  majorCommits: z.array(z.string()).default([]),
  /** Files most frequently changed in the same commits. */
  coChanged: z
    .array(z.object({ path: z.string(), count: z.number() }))
    .default([]),
  /** Churn (additions+deletions) bucketed over time. */
  churnSeries: z
    .array(z.object({ t: IsoDate, v: z.number() }))
    .default([]),
});
export type FileRecord = z.infer<typeof FileRecordSchema>;
