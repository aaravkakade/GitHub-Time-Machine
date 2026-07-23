import { describe, expect, it } from "vitest";
import {
  clusterForModulePath,
  deriveModules,
  moduleIdForPath,
  planModules,
} from "@/domains/analysis/modules";
import {
  selectSnapshotPoints,
  snapshotIndexForTime,
} from "@/domains/snapshots/select";
import { makeCommit, routineCommits } from "./fixtures/history";

describe("module derivation", () => {
  it("groups files at up to two directory levels", () => {
    const plan = planModules(["app/api/users.ts", "app/api/posts.ts", "docs/readme.md", "main.ts"]);
    expect(moduleIdForPath("app/api/users.ts", plan)).toBe("mod:app/api");
    expect(moduleIdForPath("main.ts", plan)).toBe("mod:main.ts");
    expect(moduleIdForPath("node_modules/react/index.js", plan)).toBeNull();
  });

  it("keeps workspace package internals visible (depth 3)", () => {
    const plan = planModules(["packages/core/sync/engine.ts"]);
    expect(moduleIdForPath("packages/core/sync/engine.ts", plan)).toBe(
      "mod:packages/core/sync",
    );
    expect(clusterForModulePath("packages/core/sync", plan)).toBe("packages/core");
  });

  it("uses src children as clusters when src dominates", () => {
    const paths = Array.from({ length: 20 }, (_, i) => `src/feature${i % 4}/f${i}.ts`);
    const plan = planModules([...paths, "README.md"]);
    expect(plan.effectiveRoot).toBe("src");
    expect(moduleIdForPath("src/feature1/f1.ts", plan)).toBe("mod:src/feature1");
    expect(clusterForModulePath("src/feature1", plan)).toBe("feature1");
  });

  it("derives language and test flags per module", () => {
    const paths = ["tests/app.test.ts", "tests/util.test.ts", "lib/a.py", "lib/b.py"];
    const { metas } = deriveModules(paths, planModules(paths));
    const tests = metas.get("mod:tests");
    const lib = metas.get("mod:lib");
    expect(tests?.isTest).toBe(true);
    expect(tests?.language).toBe("TypeScript");
    expect(lib?.isTest).toBe(false);
    expect(lib?.language).toBe("Python");
  });
});

describe("snapshot point selection", () => {
  it("always includes the initial and latest commits and respects the budget", () => {
    const commits = routineCommits("2020-01-01", "2024-01-01", 200);
    const points = selectSnapshotPoints(commits, [], 10);
    expect(points.length).toBeLessThanOrEqual(10);
    expect(points[0].sha).toBe(commits[0].sha);
    expect(points[points.length - 1].sha).toBe(commits[commits.length - 1].sha);
    // Ascending by date, no duplicates.
    const dates = points.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(points.map((p) => p.sha)).size).toBe(points.length);
  });

  it("prioritizes releases and fills gaps with interval points", () => {
    const commits = routineCommits("2020-01-01", "2024-01-01", 100);
    const mid = commits[50];
    mid.tags.push("v1.0.0");
    const points = selectSnapshotPoints(
      commits,
      [{ tag: "v1.0.0", date: mid.date, sha: mid.sha }],
      8,
    );
    expect(points.some((p) => p.sha === mid.sha && p.reason === "release")).toBe(true);
    expect(points.some((p) => p.reason === "interval")).toBe(true);
  });

  it("handles single-commit repositories", () => {
    const commits = [makeCommit({ date: "2024-01-01T00:00:00Z" })];
    const points = selectSnapshotPoints(commits, [], 16);
    expect(points).toHaveLength(1);
    expect(points[0].reason).toBe("initial");
  });
});

describe("snapshotIndexForTime", () => {
  const dates = ["2020-01-01", "2021-01-01", "2022-01-01"];

  it("returns the nearest snapshot at or before the time", () => {
    expect(snapshotIndexForTime(dates, +new Date("2019-06-01"))).toBe(0);
    expect(snapshotIndexForTime(dates, +new Date("2020-01-01"))).toBe(0);
    expect(snapshotIndexForTime(dates, +new Date("2021-06-15"))).toBe(1);
    expect(snapshotIndexForTime(dates, +new Date("2030-01-01"))).toBe(2);
  });
});
