import type {
  ArchitectureSnapshot,
  Commit,
  MetricSeries,
} from "@/domains/schemas";

/** Metric series derived from snapshots and the commit stream. */
export function computeMetricSeries(
  snapshots: ArchitectureSnapshot[],
  commits: Commit[],
): MetricSeries[] {
  const series: MetricSeries[] = [];
  const fromSnapshots = (
    id: string,
    name: string,
    unit: string,
    description: string,
    pick: (s: ArchitectureSnapshot) => number | null,
  ) => {
    const points = snapshots
      .map((s) => ({ t: s.date, v: pick(s) }))
      .filter((p): p is { t: string; v: number } => p.v !== null);
    if (points.length >= 2) {
      series.push({ id, name, unit, description, points });
    }
  };

  fromSnapshots("loc", "Lines of code", "lines", "Total analyzable lines across the tree", (s) => s.metrics.loc);
  fromSnapshots("files", "Files", "files", "Analyzable files in the tree", (s) => s.metrics.files);
  fromSnapshots("modules", "Modules", "modules", "Directory-level modules in the architecture graph", (s) => s.metrics.modules);
  fromSnapshots("complexity", "Avg. complexity", "", "Mean approximate cyclomatic complexity per module", (s) => s.metrics.avgComplexity);
  fromSnapshots("test-ratio", "Test ratio", "×", "Test lines relative to source lines", (s) => s.metrics.testRatio);
  fromSnapshots("dependencies", "Dependencies", "pkgs", "Declared manifest dependencies", (s) => s.metrics.dependencyCount);
  fromSnapshots("todos", "TODO markers", "", "TODO/FIXME markers found in source", (s) => s.metrics.todoCount);

  // Monthly churn from the commit stream.
  const byMonth = new Map<string, number>();
  for (const c of commits) {
    const month = c.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + c.additions + c.deletions);
  }
  const churnPoints = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ t: `${month}-15`, v }));
  if (churnPoints.length >= 2) {
    series.push({
      id: "churn",
      name: "Monthly churn",
      unit: "lines",
      description: "Lines added + removed per month across analyzed commits",
      points: churnPoints,
    });
  }

  // Cumulative distinct contributors.
  const seen = new Set<string>();
  const contributorPoints: { t: string; v: number }[] = [];
  for (const c of commits) {
    if (!seen.has(c.author.login)) {
      seen.add(c.author.login);
      contributorPoints.push({ t: c.date, v: seen.size });
    }
  }
  if (contributorPoints.length >= 2) {
    series.push({
      id: "contributors",
      name: "Contributors",
      unit: "people",
      description: "Cumulative distinct commit authors",
      points: contributorPoints,
    });
  }

  return series;
}
