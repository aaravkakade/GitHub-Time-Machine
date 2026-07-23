import type { RepositoryAnalysis } from "@/domains/schemas";
import { diffSnapshots } from "@/domains/snapshots/diff";
import { formatDate, shortSha } from "@/lib/utils";
import type { EvidenceItem, InsightRequest, InsightSubjectType } from "./provider";

/**
 * Build the deterministic evidence bundle for a subject. Everything the AI
 * is allowed to claim must be derivable from these items; their ids are the
 * only citable references.
 */
export function buildInsightRequest(
  analysis: RepositoryAnalysis,
  subjectType: InsightSubjectType,
  subjectId: string,
): InsightRequest | null {
  if (subjectType === "milestone") {
    const milestone = analysis.milestones.find((m) => m.id === subjectId);
    if (!milestone) return null;
    const evidence: EvidenceItem[] = [];

    for (const signal of milestone.signals) {
      evidence.push({
        id: `signal:${signal.type}`,
        kind: "signal",
        text: `Detected signal (${signal.type}): ${signal.description}`,
      });
      for (const sha of signal.evidence.slice(0, 4)) {
        const commit = analysis.commits.find((c) => c.sha === sha);
        if (commit) {
          evidence.push({
            id: shortSha(sha),
            kind: "commit",
            text: `Commit ${shortSha(sha)} (${formatDate(commit.date)}, ${commit.author.login}): "${commit.message.split("\n")[0]}" (+${commit.additions}/−${commit.deletions}, files: ${commit.files.slice(0, 5).map((f) => f.path).join(", ") || "n/a"})`,
          });
        }
      }
    }
    for (const path of milestone.affectedPaths.slice(0, 6)) {
      evidence.push({ id: path, kind: "file", text: `Affected area: ${path}` });
    }

    // Architecture context: nearest snapshots around the milestone.
    const before = [...analysis.snapshots]
      .reverse()
      .find((s) => s.date <= milestone.date);
    const after = analysis.snapshots.find((s) => s.date > milestone.date);
    if (before && after) {
      evidence.push({
        id: "metric:architecture-delta",
        kind: "metric",
        text: `Between snapshots ${formatDate(before.date)} and ${formatDate(after.date)}: modules ${before.metrics.modules}→${after.metrics.modules}, LOC ${before.metrics.loc}→${after.metrics.loc}, dependencies ${before.metrics.dependencyCount}→${after.metrics.dependencyCount}, test ratio ${before.metrics.testRatio ?? "n/a"}→${after.metrics.testRatio ?? "n/a"}.`,
      });
    }

    return {
      analysis,
      subjectType,
      subjectId,
      evidence,
      question: `Why was "${milestone.title}" (${formatDate(milestone.date)}) an important moment in ${analysis.repository.id}'s history, and what kind of change was it?`,
    };
  }

  if (subjectType === "file") {
    const record = analysis.fileRecords.find((f) => f.path === subjectId);
    const moduleMeta = analysis.modules[subjectId];
    const path = record?.path ?? moduleMeta?.path;
    if (!path) return null;
    const records = record
      ? [record]
      : analysis.fileRecords.filter(
          (f) => f.path === path || f.path.startsWith(path + "/"),
        );
    if (records.length === 0) return null;
    const evidence: EvidenceItem[] = [];
    for (const r of records.slice(0, 4)) {
      evidence.push({
        id: r.path,
        kind: "file",
        text: `${r.path}: created ${formatDate(r.createdAt)}, ${r.commitCount} commits, ${r.totalChurn} lines churned, main authors ${r.authors.slice(0, 3).map((a) => a.login).join(", ")}${r.renamedFrom.length ? `, renamed from ${r.renamedFrom.join(", ")}` : ""}${r.coChanged.length ? `, frequently changes with ${r.coChanged.slice(0, 3).map((c) => c.path).join(", ")}` : ""}`,
      });
      for (const sha of r.majorCommits.slice(0, 3)) {
        const commit = analysis.commits.find((c) => c.sha === sha);
        if (commit) {
          evidence.push({
            id: shortSha(sha),
            kind: "commit",
            text: `Commit ${shortSha(sha)} (${formatDate(commit.date)}, ${commit.author.login}): "${commit.message.split("\n")[0]}" (+${commit.additions}/−${commit.deletions})`,
          });
        }
      }
    }
    return {
      analysis,
      subjectType,
      subjectId,
      evidence,
      question: `Why has ${path} evolved the way it has in ${analysis.repository.id}?`,
    };
  }

  if (subjectType === "overview") {
    const evidence: EvidenceItem[] = analysis.milestones.slice(0, 8).map((m) => ({
      id: `signal:${m.id}`,
      kind: "signal" as const,
      text: `Milestone ${formatDate(m.date)} [${m.category}]: ${m.title} — ${m.summary}`,
    }));
    for (const d of analysis.debtSignals.slice(0, 4)) {
      evidence.push({
        id: d.id,
        kind: "signal",
        text: `Debt signal [${d.severity}] ${d.title}: ${d.description}`,
      });
    }
    const first = analysis.snapshots[0];
    const last = analysis.snapshots[analysis.snapshots.length - 1];
    evidence.push({
      id: "metric:growth",
      kind: "metric",
      text: `From ${formatDate(first.date)} to ${formatDate(last.date)}: LOC ${first.metrics.loc}→${last.metrics.loc}, modules ${first.metrics.modules}→${last.metrics.modules}, contributors ${first.metrics.contributors}→${last.metrics.contributors}.`,
    });
    return {
      analysis,
      subjectType,
      subjectId,
      evidence,
      question: `Summarize the architectural story of ${analysis.repository.id} for a developer seeing it for the first time.`,
    };
  }

  if (subjectType === "comparison") {
    const [beforeId, afterId] = subjectId.split("..");
    const diff = beforeId && afterId ? diffSnapshots(analysis, beforeId, afterId) : null;
    if (!diff) return null;
    const evidence: EvidenceItem[] = [];
    for (const m of diff.metrics) {
      if (m.before === null || m.after === null) continue;
      evidence.push({
        id: `metric:${m.key}`,
        kind: "metric",
        text: `${m.label}: ${m.before} → ${m.after}`,
      });
    }
    if (diff.addedModules.length > 0) {
      evidence.push({
        id: "signal:modules-added",
        kind: "signal",
        text: `Modules added: ${diff.addedModules.slice(0, 6).map((m) => m.path).join(", ")}`,
      });
    }
    if (diff.removedModules.length > 0) {
      evidence.push({
        id: "signal:modules-removed",
        kind: "signal",
        text: `Modules removed: ${diff.removedModules.slice(0, 6).map((m) => m.path).join(", ")}`,
      });
    }
    if (diff.packagesAdded.length + diff.packagesRemoved.length > 0) {
      evidence.push({
        id: "signal:dependency-changes",
        kind: "signal",
        text: `Dependencies added: ${diff.packagesAdded.join(", ") || "none"}; removed: ${diff.packagesRemoved.join(", ") || "none"}`,
      });
    }
    for (const m of diff.milestonesBetween.slice(0, 5)) {
      evidence.push({
        id: `signal:${m.id}`,
        kind: "signal",
        text: `Milestone in this range (${formatDate(m.date)}, ${m.category}): ${m.title} — ${m.summary}`,
      });
    }
    const bigCommits = [...diff.commitsBetween]
      .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
      .slice(0, 5);
    for (const c of bigCommits) {
      evidence.push({
        id: shortSha(c.sha),
        kind: "commit",
        text: `Commit ${shortSha(c.sha)} (${formatDate(c.date)}, ${c.author.login}): "${c.message.split("\n")[0]}" (+${c.additions}/−${c.deletions})`,
      });
    }
    return {
      analysis,
      subjectType,
      subjectId,
      evidence,
      question: `What changed in ${analysis.repository.id} between ${formatDate(diff.before.date)} and ${formatDate(diff.after.date)}, and what was the overall character of that period?`,
    };
  }

  return null;
}
