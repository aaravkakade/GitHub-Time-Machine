import { describe, expect, it } from "vitest";
import { detectMilestones } from "@/domains/milestones/detect";
import { files, makeCommit, routineCommits } from "./fixtures/history";

describe("detectMilestones", () => {
  it("always detects the founding commit", () => {
    const commits = routineCommits("2023-01-01", "2023-06-01", 20);
    const milestones = detectMilestones(commits, []);
    expect(milestones[0].category).toBe("founding");
    expect(milestones[0].sha).toBe(commits[0].sha);
    expect(milestones[0].signals[0].evidence).toContain(commits[0].sha);
  });

  it("detects framework adoption from dependency additions", () => {
    const commits = [
      ...routineCommits("2023-01-01", "2023-03-01", 15),
      makeCommit({
        date: "2023-03-10T00:00:00Z",
        message: "Add react",
        dependenciesAdded: ["react", "react-dom"],
      }),
      ...routineCommits("2023-03-20", "2023-06-01", 15),
    ];
    const milestones = detectMilestones(commits, []);
    const adoption = milestones.find((m) => m.category === "framework-adoption");
    expect(adoption).toBeDefined();
    expect(adoption!.title).toContain("React");
  });

  it("detects first tests and first CI configuration", () => {
    const commits = [
      ...routineCommits("2023-01-01", "2023-02-01", 10),
      makeCommit({
        date: "2023-02-10T00:00:00Z",
        message: "Add test suite",
        files: files(["tests/app.test.ts", "added", 120, 0]),
      }),
      ...routineCommits("2023-02-20", "2023-04-01", 10),
      makeCommit({
        date: "2023-04-05T00:00:00Z",
        message: "Add CI",
        files: files([".github/workflows/ci.yml", "added", 40, 0]),
      }),
      ...routineCommits("2023-04-10", "2023-06-01", 10),
    ];
    const categories = detectMilestones(commits, []).map((m) => m.category);
    expect(categories).toContain("testing");
    expect(categories).toContain("ci-cd");
  });

  it("detects directory restructuring from mass renames", () => {
    const renameFiles = Array.from({ length: 12 }, (_, i) => ({
      path: `packages/core/mod${i}.ts`,
      previousPath: `src/mod${i}.ts`,
      status: "renamed" as const,
      additions: 5,
      deletions: 5,
    }));
    const commits = [
      ...routineCommits("2023-01-01", "2023-03-01", 20),
      makeCommit({
        date: "2023-03-15T00:00:00Z",
        message: "Move to packages layout",
        files: renameFiles,
      }),
      ...routineCommits("2023-03-20", "2023-06-01", 20),
    ];
    const milestones = detectMilestones(commits, []);
    expect(milestones.some((m) => m.category === "restructure")).toBe(true);
    // packages/ extraction should also fire once files appear there.
    const commits2 = [
      ...routineCommits("2023-01-01", "2023-03-01", 20),
      makeCommit({
        date: "2023-03-15T00:00:00Z",
        files: files(["packages/core/index.ts", "added", 100, 0]),
      }),
    ];
    expect(
      detectMilestones(commits2, []).some((m) => m.category === "extraction"),
    ).toBe(true);
  });

  it("detects mass deletions and major releases", () => {
    const commits = [
      ...routineCommits("2023-01-01", "2023-06-01", 40),
      makeCommit({
        date: "2023-06-10T00:00:00Z",
        message: "Remove legacy engine",
        additions: 40,
        deletions: 4000,
        files: files(["src/legacy.ts", "removed", 0, 4000]),
      }),
      ...routineCommits("2023-06-20", "2023-09-01", 10),
    ];
    const tagged = commits[commits.length - 1];
    tagged.tags.push("v1.0.0");
    const milestones = detectMilestones(commits, [
      { tag: "v1.0.0", date: tagged.date, sha: tagged.sha },
    ]);
    expect(milestones.some((m) => m.category === "mass-deletion")).toBe(true);
    expect(milestones.some((m) => m.category === "release")).toBe(true);
    // Patch releases of a x.0 line must not count as majors.
    const patch = detectMilestones(commits, [
      { tag: "v1.0.3", date: tagged.date, sha: tagged.sha },
    ]);
    expect(patch.filter((m) => m.category === "release")).toHaveLength(0);
  });

  it("merges corroborating signals and raises confidence", () => {
    const commits = [
      ...routineCommits("2023-01-01", "2023-03-01", 30),
      makeCommit({
        date: "2023-03-15T00:00:00Z",
        message: "Big migration",
        additions: 5000,
        deletions: 3000,
        dependenciesAdded: ["vite", "vitest", "zod"],
        files: [
          { path: "package.json", status: "modified" as const, additions: 20, deletions: 10 },
          ...Array.from({ length: 25 }, (_, i) => ({
            path: `src/new/mod${i}.ts`,
            status: "added" as const,
            additions: 180,
            deletions: 0,
          })),
        ],
      }),
      ...routineCommits("2023-04-01", "2023-06-01", 30),
    ];
    const milestones = detectMilestones(commits, []);
    const merged = milestones.find((m) => m.signals.length >= 2);
    expect(merged).toBeDefined();
    expect(merged!.confidence).toBeGreaterThan(0.6);
    expect(merged!.confidence).toBeLessThanOrEqual(0.95);
  });

  it("caps milestone count for very long histories", () => {
    // 8 years of monthly huge commits → many candidates.
    const commits = [];
    for (let month = 0; month < 96; month++) {
      const date = new Date(Date.UTC(2015, month, 1)).toISOString();
      commits.push(
        makeCommit({ date, additions: 10, deletions: 2 }),
        makeCommit({
          date: new Date(Date.UTC(2015, month, 15)).toISOString(),
          additions: 9000,
          deletions: 5000,
          files: files(["src/core.ts", "modified", 9000, 5000]),
        }),
      );
    }
    const milestones = detectMilestones(commits, []);
    expect(milestones.length).toBeLessThanOrEqual(40);
    expect(milestones.some((m) => m.category === "founding")).toBe(true);
  });
});
