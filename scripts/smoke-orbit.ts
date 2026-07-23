import { analyzeHistory } from "../src/domains/analysis/engine";
import { generateHistory } from "../src/domains/demo/scenario";
import { orbitScenario } from "../src/domains/demo/scenarios/orbit";

const input = generateHistory(orbitScenario);
console.log("commits:", input.commits.length);
console.log("samples:", input.treeSamples.length);

const analysis = analyzeHistory(input);
console.log("\n--- snapshots ---");
for (const s of analysis.snapshots) {
  console.log(
    s.date.slice(0, 10),
    s.reason.padEnd(18),
    `nodes=${s.nodes.length}`,
    `edges=${s.edges.length}`,
    `loc=${s.metrics.loc}`,
    `cx=${s.metrics.avgComplexity}`,
    `test=${s.metrics.testRatio}`,
    `todo=${s.metrics.todoCount}`,
  );
}
console.log("\n--- milestones ---");
for (const m of analysis.milestones) {
  console.log(
    m.date.slice(0, 10),
    `[${m.category}]`.padEnd(22),
    m.title,
    `conf=${m.confidence}`,
    `signals=${m.signals.length}`,
  );
}
console.log("\n--- debt signals ---");
for (const d of analysis.debtSignals) {
  console.log(`[${d.severity}] ${d.type}: ${d.title}`);
}
console.log("\n--- refactor opportunities ---");
for (const r of analysis.refactorOpportunities) {
  console.log(`[${r.confidence}] ${r.kind}: ${r.title}`);
}
console.log("\n--- metric series ---");
for (const s of analysis.metricSeries) {
  console.log(s.id, s.points.length, "points");
}
console.log("\nmodules:", Object.keys(analysis.modules).length);
console.log("fileRecords:", analysis.fileRecords.length);
console.log("contributors:", analysis.contributors.length);
const json = JSON.stringify(analysis);
console.log("payload size:", (json.length / 1024).toFixed(0), "KB");
