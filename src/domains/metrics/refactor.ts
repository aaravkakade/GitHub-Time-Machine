import type {
  ArchitectureSnapshot,
  DebtSignal,
  FileRecord,
  ModuleMeta,
  RefactorOpportunity,
} from "@/domains/schemas";
import { isSourceFile, isTestPath } from "@/domains/analysis/classify";

export interface RefactorInput {
  debtSignals: DebtSignal[];
  snapshots: ArchitectureSnapshot[];
  fileRecords: FileRecord[];
  modules: Record<string, ModuleMeta>;
}

/**
 * "Likely refactor opportunities" — suggestions derived from current
 * measurable patterns, never predictions. Confidence is bounded by how
 * directly the evidence supports the suggestion.
 */
export function computeRefactorOpportunities(
  input: RefactorInput,
): RefactorOpportunity[] {
  const out: RefactorOpportunity[] = [];
  const { debtSignals, fileRecords } = input;
  const bySignal = new Map(debtSignals.map((s) => [s.type, s]));

  const cycle = bySignal.get("dependency-cycle");
  if (cycle) {
    out.push({
      id: "ro:break-cycle",
      title: `Break the ${cycle.evidence.files.slice(0, 2).join(" ↔ ")} cycle`,
      kind: "break-cycle",
      confidence: "high",
      evidence: [cycle.description, `Detected via: ${cycle.methodology}`],
      files: cycle.evidence.files,
      benefit:
        "Modules become independently testable and buildable; change impact stops ping-ponging between them.",
      risk: "Extracting the shared piece may briefly duplicate types or helpers until the seam settles.",
      firstStep: `Identify what ${cycle.evidence.files[0] ?? "the first module"} actually needs from the cycle and extract that surface into a leaf module neither side owns.`,
    });
  }

  const coupling = bySignal.get("coupling");
  if (coupling && coupling.evidence.files.length > 0) {
    const hub = coupling.evidence.files[0];
    out.push({
      id: "ro:decouple",
      title: `Reduce the blast radius of ${hub}`,
      kind: "decouple",
      confidence: coupling.severity === "high" ? "high" : "medium",
      evidence: [coupling.description, `Detected via: ${coupling.methodology}`],
      files: coupling.evidence.files,
      benefit:
        "Fewer modules recompile, retest and break when the hub changes.",
      risk: "Splitting a hub that is genuinely cohesive adds indirection without payoff — verify the hub mixes concerns first.",
      firstStep: `List the distinct reasons other modules import ${hub}; if there are ≥2 unrelated reasons, split along that line.`,
    });
  }

  const oversized = bySignal.get("oversized-file");
  const churn = bySignal.get("high-churn");
  if (oversized) {
    const hotAndBig = oversized.evidence.files.filter((f) =>
      churn?.evidence.files.includes(f),
    );
    const target = hotAndBig[0] ?? oversized.evidence.files[0];
    out.push({
      id: "ro:split-file",
      title: `Split ${target}`,
      kind: "split-file",
      confidence: hotAndBig.length > 0 ? "high" : "medium",
      evidence: [
        oversized.description,
        ...(hotAndBig.length > 0
          ? ["The same file is also among the highest-churn files — size and change pressure compound."]
          : []),
        `Detected via: ${oversized.methodology}`,
      ],
      files: oversized.evidence.files.slice(0, 4),
      benefit:
        "Smaller units localize changes, shrink review surface and reduce merge conflicts.",
      risk: "Mechanical splitting without a responsibility boundary just spreads the tangle across files.",
      firstStep: `Group ${target}'s top-level declarations by the data they touch; move the most independent group out first.`,
    });
  }

  // Low-test, high-churn: churny source files with no co-changed test files.
  const activeSource = fileRecords.filter(
    (f) =>
      !f.deletedAt &&
      isSourceFile(f.path) &&
      !isTestPath(f.path) &&
      f.commitCount >= 6,
  );
  const untested = activeSource.filter(
    (f) => !f.coChanged.some((c) => isTestPath(c.path)),
  );
  if (untested.length >= 2) {
    out.push({
      id: "ro:add-tests",
      title: "Add tests to high-churn, low-test files",
      kind: "add-tests",
      confidence: "medium",
      evidence: [
        `${untested.length} frequently-changed source files never change together with a test file (${untested
          .slice(0, 3)
          .map((f) => f.path)
          .join(", ")}).`,
        "Co-change with tests is a proxy: these files may still be covered indirectly.",
      ],
      files: untested.slice(0, 5).map((f) => f.path),
      benefit:
        "The files most likely to change next gain a safety net exactly where regressions are most likely.",
      risk: "Retro-fitted tests can freeze current behavior, bugs included — write them against intent, not implementation.",
      firstStep: `Start with ${untested[0].path}: cover its most recently changed code path first.`,
    });
  }

  // Cross-cluster co-change: files in different areas that keep changing together.
  const { modules } = input;
  const moduleList = Object.values(modules);
  const clusterOf = (path: string) =>
    moduleList.find((m) => path === m.path || path.startsWith(m.path + "/"))
      ?.cluster;
  for (const f of activeSource) {
    const partner = f.coChanged.find(
      (c) =>
        c.count >= 4 &&
        isSourceFile(c.path) &&
        !isTestPath(c.path) &&
        clusterOf(c.path) !== undefined &&
        clusterOf(f.path) !== undefined &&
        clusterOf(c.path) !== clusterOf(f.path),
    );
    if (partner) {
      out.push({
        id: `ro:consolidate:${f.path}`,
        title: `Co-change across areas: ${f.path} ↔ ${partner.path}`,
        kind: "consolidate",
        confidence: partner.count >= 6 ? "medium" : "low",
        evidence: [
          `Changed together in ${partner.count} commits despite living in different architectural areas — a shared concern may be split across the boundary.`,
        ],
        files: [f.path, partner.path],
        benefit:
          "Placing the shared concern in one home turns two-file edits into one-file edits.",
        risk: "Some cross-area co-change is legitimate (e.g. API + client); confirm the pairing is accidental before moving code.",
        firstStep:
          "Diff the last three commits that touched both files and name the concern they share.",
      });
      break; // one consolidate suggestion is enough
    }
  }

  const volatile = bySignal.get("volatile-subsystem");
  if (volatile && volatile.evidence.files.length > 0) {
    out.push({
      id: "ro:stabilize-interface",
      title: `Stabilize the interface of ${volatile.evidence.files[0]}`,
      kind: "stabilize-interface",
      confidence: "medium",
      evidence: [volatile.description, `Detected via: ${volatile.methodology}`],
      files: volatile.evidence.files,
      benefit:
        "A stable contract lets the rest of the codebase evolve without repeatedly syncing to this subsystem.",
      risk: "Premature interface freezing can ossify a design that is still legitimately searching for its shape.",
      firstStep:
        "Review the last ten commits touching it: separate signature changes from internal changes to see whether the churn is contractual.",
    });
  }

  return out.slice(0, 6);
}
