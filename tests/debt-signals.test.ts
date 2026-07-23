import { describe, expect, it } from "vitest";
import { computeDebtSignals, type DebtInput } from "@/domains/metrics/debt";
import { computeRefactorOpportunities } from "@/domains/metrics/refactor";
import type {
  ArchitectureSnapshot,
  ModuleMeta,
  TreeSample,
} from "@/domains/schemas";
import { makeCommit, routineCommits } from "./fixtures/history";

function snapshot(overrides: Partial<ArchitectureSnapshot>): ArchitectureSnapshot {
  return {
    id: "snap:a",
    sha: "a",
    date: "2023-01-01T00:00:00Z",
    reason: "interval",
    nodes: [],
    edges: [],
    metrics: {
      files: 10,
      loc: 1000,
      modules: 3,
      edges: 2,
      avgComplexity: 3,
      testRatio: 0.5,
      dependencyCount: 5,
      contributors: 2,
      todoCount: 4,
    },
    packages: [],
    ...overrides,
  };
}

function moduleMeta(id: string, path: string): ModuleMeta {
  return { id, path, label: path, kind: "directory", language: "TypeScript", cluster: path.split("/")[0], isTest: false };
}

const emptyTree: TreeSample = { sha: "a", date: "2023-06-01T00:00:00Z", files: [] };

function baseInput(overrides: Partial<DebtInput>): DebtInput {
  return {
    commits: routineCommits("2023-01-01", "2023-06-01", 30),
    snapshots: [snapshot({})],
    fileRecords: [],
    modules: {},
    latestTree: emptyTree,
    metricSeries: [],
    ...overrides,
  };
}

describe("debt signals", () => {
  it("detects dependency cycles in the module import graph", () => {
    const input = baseInput({
      snapshots: [
        snapshot({
          nodes: [],
          edges: [
            { source: "mod:a", target: "mod:b", kind: "import", weight: 1 },
            { source: "mod:b", target: "mod:a", kind: "import", weight: 1 },
          ],
        }),
      ],
      modules: { "mod:a": moduleMeta("mod:a", "a"), "mod:b": moduleMeta("mod:b", "b") },
    });
    const signals = computeDebtSignals(input);
    const cycle = signals.find((s) => s.type === "dependency-cycle");
    expect(cycle).toBeDefined();
    expect(cycle!.severity).toBe("high"); // 2-module cycle
    expect(cycle!.evidence.files).toEqual(expect.arrayContaining(["a", "b"]));
    expect(cycle!.methodology).toBeTruthy();
  });

  it("flags oversized files from the latest tree", () => {
    const input = baseInput({
      latestTree: {
        sha: "a",
        date: "2023-06-01T00:00:00Z",
        files: [
          { path: "src/huge.ts", loc: 1200 },
          { path: "src/ok.ts", loc: 90 },
          { path: "tests/huge.test.ts", loc: 2000 }, // tests excluded
        ],
      },
    });
    const signal = computeDebtSignals(input).find((s) => s.type === "oversized-file");
    expect(signal).toBeDefined();
    expect(signal!.evidence.files).toContain("src/huge.ts");
    expect(signal!.evidence.files).not.toContain("tests/huge.test.ts");
    expect(signal!.severity).toBe("high");
  });

  it("flags high bug-fix density in recent commits", () => {
    const fixes = Array.from({ length: 20 }, (_, i) =>
      makeCommit({
        date: new Date(Date.UTC(2023, 5, i + 1)).toISOString(),
        message: i % 2 === 0 ? "Fix crash in parser" : "Fix regression in router",
      }),
    );
    const input = baseInput({
      commits: [...routineCommits("2023-01-01", "2023-05-01", 40), ...fixes],
    });
    const signal = computeDebtSignals(input).find((s) => s.type === "bugfix-density");
    expect(signal).toBeDefined();
    expect(signal!.evidence.commits.length).toBeGreaterThan(0);
  });

  it("flags churn concentration with evidence files", () => {
    const input = baseInput({
      commits: routineCommits("2023-01-01", "2023-06-01", 30),
      fileRecords: [
        {
          path: "src/core.ts",
          createdAt: "2023-01-01T00:00:00Z",
          createdSha: "sha0",
          deletedAt: null,
          renamedFrom: [],
          totalChurn: 700, // 30 commits × 25 churn = 750 total
          commitCount: 28,
          authors: [{ login: "alice", commits: 28 }],
          majorCommits: ["sha1", "sha2"],
          coChanged: [],
          churnSeries: [],
        },
      ],
    });
    const signal = computeDebtSignals(input).find((s) => s.type === "high-churn");
    expect(signal).toBeDefined();
    expect(signal!.evidence.files).toContain("src/core.ts");
  });

  it("reports declining test ratio from metric series", () => {
    const input = baseInput({
      metricSeries: [
        {
          id: "test-ratio",
          name: "Test ratio",
          unit: "×",
          description: "",
          points: [
            { t: "2023-01-01", v: 0.8 },
            { t: "2023-03-01", v: 0.5 },
            { t: "2023-06-01", v: 0.2 },
          ],
        },
      ],
    });
    const signal = computeDebtSignals(input).find((s) => s.type === "test-ratio-decline");
    expect(signal).toBeDefined();
    expect(signal!.trend).toBe("falling");
  });
});

describe("refactor opportunities", () => {
  it("derives a break-cycle opportunity from a cycle signal", () => {
    const input = baseInput({
      snapshots: [
        snapshot({
          edges: [
            { source: "mod:a", target: "mod:b", kind: "import", weight: 1 },
            { source: "mod:b", target: "mod:a", kind: "import", weight: 1 },
          ],
        }),
      ],
      modules: { "mod:a": moduleMeta("mod:a", "a"), "mod:b": moduleMeta("mod:b", "b") },
    });
    const debtSignals = computeDebtSignals(input);
    const opportunities = computeRefactorOpportunities({
      debtSignals,
      snapshots: input.snapshots,
      fileRecords: input.fileRecords,
      modules: input.modules,
    });
    const breakCycle = opportunities.find((o) => o.kind === "break-cycle");
    expect(breakCycle).toBeDefined();
    expect(breakCycle!.confidence).toBe("high");
    expect(breakCycle!.evidence.length).toBeGreaterThan(0);
    expect(breakCycle!.firstStep).toBeTruthy();
    expect(breakCycle!.benefit).toBeTruthy();
    expect(breakCycle!.risk).toBeTruthy();
  });

  it("suggests tests for churny files that never co-change with tests", () => {
    const record = (path: string) => ({
      path,
      createdAt: "2023-01-01T00:00:00Z",
      createdSha: "sha0",
      deletedAt: null,
      renamedFrom: [],
      totalChurn: 400,
      commitCount: 10,
      authors: [{ login: "alice", commits: 10 }],
      majorCommits: [],
      coChanged: [{ path: "src/other.ts", count: 4 }],
      churnSeries: [],
    });
    const opportunities = computeRefactorOpportunities({
      debtSignals: [],
      snapshots: [snapshot({})],
      fileRecords: [record("src/a.ts"), record("src/b.ts")],
      modules: {},
    });
    const addTests = opportunities.find((o) => o.kind === "add-tests");
    expect(addTests).toBeDefined();
    expect(addTests!.files).toEqual(expect.arrayContaining(["src/a.ts", "src/b.ts"]));
  });
});
