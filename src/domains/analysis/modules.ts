import type { ModuleMeta } from "@/domains/schemas";
import {
  isAnalyzable,
  isSourceFile,
  isTestPath,
  languageOf,
} from "./classify";

/**
 * Module derivation: files are grouped into directory modules so the
 * architecture graph stays readable on large repositories.
 *
 * Grouping depth adapts to layout: when one root directory (typically `src`)
 * dominates, its children become clusters so the graph shows real structure
 * instead of a single giant "src" blob.
 */

export interface ModulePlan {
  /** Effective root prefix stripped for clustering ("" or e.g. "src"). */
  effectiveRoot: string;
}

export function planModules(paths: string[]): ModulePlan {
  const analyzable = paths.filter((p) => isAnalyzable(p));
  const total = analyzable.length || 1;
  const rootCounts = new Map<string, number>();
  for (const p of analyzable) {
    const first = p.split("/")[0];
    if (first.includes(".")) continue; // root file
    rootCounts.set(first, (rootCounts.get(first) ?? 0) + 1);
  }
  for (const [root, count] of rootCounts) {
    if (count / total >= 0.7 && (root === "src" || root === "lib" || root === "app")) {
      return { effectiveRoot: root };
    }
  }
  return { effectiveRoot: "" };
}

/** Workspace namespaces whose children are architectural units of their own. */
const NAMESPACE_DIRS = new Set(["packages", "apps", "libs", "crates", "services"]);

/** Stable module id for a file path under a given plan. */
export function moduleIdForPath(path: string, plan: ModulePlan): string | null {
  if (!isAnalyzable(path)) return null;
  let rel = path;
  let prefix = "";
  if (plan.effectiveRoot && path.startsWith(plan.effectiveRoot + "/")) {
    rel = path.slice(plan.effectiveRoot.length + 1);
    prefix = plan.effectiveRoot + "/";
  }
  const parts = rel.split("/");
  if (parts.length === 1) {
    // Root-level file: only track source files as standalone nodes.
    return isSourceFile(path) ? `mod:${prefix}${parts[0]}` : null;
  }
  // Group at up to two directory levels below the effective root; inside a
  // workspace namespace (packages/x) allow one more level so member packages
  // keep their internal structure visible.
  const maxDepth = NAMESPACE_DIRS.has(parts[0]) ? 3 : 2;
  const depth = Math.min(maxDepth, parts.length - 1);
  return `mod:${prefix}${parts.slice(0, depth).join("/")}`;
}

export function clusterForModulePath(modulePath: string, plan: ModulePlan): string {
  let rel = modulePath;
  if (plan.effectiveRoot && modulePath.startsWith(plan.effectiveRoot + "/")) {
    rel = modulePath.slice(plan.effectiveRoot.length + 1);
  }
  const parts = rel.split("/");
  if (parts[0].includes(".")) return "root";
  // Workspace members are their own architectural regions.
  if (NAMESPACE_DIRS.has(parts[0]) && parts.length >= 2 && !parts[1].includes(".")) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

export interface DerivedModules {
  metas: Map<string, ModuleMeta>;
  /** file path → module id */
  fileToModule: Map<string, string>;
}

export function deriveModules(
  paths: string[],
  plan: ModulePlan,
): DerivedModules {
  const metas = new Map<string, ModuleMeta>();
  const fileToModule = new Map<string, string>();
  const langCounts = new Map<string, Map<string, number>>();

  for (const path of paths) {
    const id = moduleIdForPath(path, plan);
    if (!id) continue;
    fileToModule.set(path, id);
    const modulePath = id.slice(4);
    if (!metas.has(id)) {
      const isFileModule = modulePath.split("/").pop()!.includes(".");
      metas.set(id, {
        id,
        path: modulePath,
        label: isFileModule
          ? modulePath.split("/").pop()!
          : modulePath.replace(
              plan.effectiveRoot ? plan.effectiveRoot + "/" : "",
              "",
            ),
        kind: isFileModule ? "file" : "directory",
        language: null,
        cluster: clusterForModulePath(modulePath, plan),
        isTest: isTestPath(modulePath + "/"),
      });
      langCounts.set(id, new Map());
    }
    const lang = languageOf(path);
    if (lang) {
      const counts = langCounts.get(id)!;
      counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
    if (isTestPath(path)) {
      // A module counts as a test module if flagged by dir name or majority files.
      const meta = metas.get(id)!;
      if (!meta.isTest && isTestPath(modulePath + "/")) meta.isTest = true;
    }
  }

  for (const [id, counts] of langCounts) {
    let best: string | null = null;
    let bestCount = 0;
    for (const [lang, count] of counts) {
      if (count > bestCount) {
        best = lang;
        bestCount = count;
      }
    }
    metas.get(id)!.language = best;
  }

  return { metas, fileToModule };
}
