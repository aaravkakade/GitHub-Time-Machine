import { z } from "zod";
import { IsoDate } from "./core";

export const ModuleKind = z.enum(["directory", "file", "package"]);
export type ModuleKind = z.infer<typeof ModuleKind>;

/**
 * Static metadata for a module. Stored once per analysis; per-snapshot state
 * (size, status, churn) lives on SnapshotNode. The id is path-derived and
 * stable across the whole timeline so UI selection survives time travel.
 */
export const ModuleMetaSchema = z.object({
  id: z.string(), // "mod:src/components"
  path: z.string(),
  label: z.string(),
  kind: ModuleKind,
  language: z.string().nullable().default(null),
  /** Top-level architectural region (usually the first path segment). */
  cluster: z.string(),
  isTest: z.boolean().default(false),
});
export type ModuleMeta = z.infer<typeof ModuleMetaSchema>;

export const ChangeStatus = z.enum(["added", "removed", "modified", "stable"]);
export type ChangeStatus = z.infer<typeof ChangeStatus>;

export const SnapshotNodeSchema = z.object({
  id: z.string(), // ModuleMeta id
  loc: z.number(),
  fileCount: z.number().default(1),
  /** Approximate cyclomatic-style complexity, when measurable. */
  complexity: z.number().nullable().default(null),
  /** Change vs the previous snapshot. */
  status: ChangeStatus,
  /** Churn (adds+dels) inside this module since the previous snapshot. */
  churn: z.number().default(0),
});
export type SnapshotNode = z.infer<typeof SnapshotNodeSchema>;

export const EdgeKind = z.enum(["import", "package", "structure"]);
export type EdgeKind = z.infer<typeof EdgeKind>;

export const DependencyEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  kind: EdgeKind,
  weight: z.number().default(1),
});
export type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;

export const SnapshotMetricsSchema = z.object({
  files: z.number(),
  loc: z.number(),
  modules: z.number(),
  edges: z.number(),
  avgComplexity: z.number().nullable().default(null),
  testRatio: z.number().nullable().default(null),
  dependencyCount: z.number().default(0),
  contributors: z.number().default(0),
  todoCount: z.number().nullable().default(null),
});
export type SnapshotMetrics = z.infer<typeof SnapshotMetricsSchema>;

export const ArchitectureSnapshotSchema = z.object({
  id: z.string(), // "snap:<sha>"
  sha: z.string(),
  date: IsoDate,
  /** Why this commit was chosen as a snapshot point. */
  reason: z.enum([
    "initial",
    "release",
    "milestone",
    "interval",
    "structure-change",
    "dependency-change",
    "latest",
  ]),
  nodes: z.array(SnapshotNodeSchema),
  edges: z.array(DependencyEdgeSchema),
  metrics: SnapshotMetricsSchema,
  /** External packages present at this point (manifest dependencies). */
  packages: z.array(z.string()).default([]),
});
export type ArchitectureSnapshot = z.infer<typeof ArchitectureSnapshotSchema>;
