import type {
  Commit,
  FileChange,
  HistoryInput,
  Release,
  Repository,
  TreeSample,
} from "@/domains/schemas";
import { selectSnapshotPoints } from "@/domains/snapshots/select";

/**
 * Deterministic scenario generator for the bundled fictional demo.
 * A scenario describes development phases; the generator expands them into a
 * realistic commit stream + tree samples, which then run through the same
 * analysis engine as real repositories. Nothing downstream is hand-faked.
 */

export interface ScenarioAuthor {
  login: string;
  name: string;
}

export interface ScenarioPhase {
  name: string;
  from: string; // ISO date
  to: string;
  commitsPerWeek: number;
  churn: [number, number];
  authors: string[]; // logins active in this phase
  messages: string[];
  /** Fraction (0–1) of commits in this phase whose subject is a fix. */
  fixRatio?: number;
  adds?: { path: string; loc: number; at?: number }[];
  removes?: { path: string; at?: number }[];
  renames?: { from: string; to: string }[];
  /** Existing files preferentially modified during this phase. */
  focus?: string[];
  depsAdd?: string[];
  depsRemove?: string[];
  /** Import pairs that become active during this phase. */
  imports?: { from: string; to: string }[];
  /** Net TODO markers introduced across the phase. */
  todoDelta?: number;
  /** Per-modification complexity drift for focused files. */
  complexityDrift?: number;
  release?: { tag: string; name?: string };
  reverts?: number;
}

export interface Scenario {
  repository: Repository;
  authors: ScenarioAuthor[];
  phases: ScenarioPhase[];
  disclosures?: string[];
}

interface FileState {
  loc: number;
  complexity: number;
  todos: number;
}

type TreeEvent =
  | { kind: "set"; path: string; state: FileState }
  | { kind: "del"; path: string }
  | { kind: "deps"; packages: string[] };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pseudoSha(seed: string): string {
  let out = "";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  const rand = mulberry32(h);
  for (let i = 0; i < 40; i++) out += Math.floor(rand() * 16).toString(16);
  return out;
}

export function generateHistory(scenario: Scenario): HistoryInput {
  const rand = mulberry32(
    [...scenario.repository.id].reduce((s, ch) => s + ch.charCodeAt(0), 7),
  );
  const authorByLogin = new Map(scenario.authors.map((a) => [a.login, a]));

  const commits: Commit[] = [];
  const releases: Release[] = [];
  const eventLog: TreeEvent[][] = []; // events applied per commit
  const importActivations: { from: string; to: string; date: string }[] = [];

  const tree = new Map<string, FileState>();
  let packages: string[] = [];
  let commitIndex = 0;

  const pushCommit = (
    date: Date,
    login: string,
    message: string,
    files: FileChange[],
    events: TreeEvent[],
    extras?: Partial<Commit>,
  ) => {
    const additions = files.reduce((s, f) => s + f.additions, 0);
    const deletions = files.reduce((s, f) => s + f.deletions, 0);
    const author = authorByLogin.get(login) ?? { login, name: login };
    commits.push({
      sha: pseudoSha(`${scenario.repository.id}:${commitIndex}`),
      message,
      author: { login: author.login, name: author.name },
      date: date.toISOString(),
      additions,
      deletions,
      files,
      tags: [],
      dependenciesAdded: [],
      dependenciesRemoved: [],
      pullRequest:
        rand() < 0.4 ? 100 + Math.floor(commitIndex * 1.7) : null,
      ...extras,
    });
    eventLog.push(events);
    commitIndex += 1;
  };

  for (const phase of scenario.phases) {
    const start = +new Date(phase.from);
    const end = +new Date(phase.to);
    const weeks = Math.max(0.5, (end - start) / (7 * 24 * 3600 * 1000));
    const commitCount = Math.max(1, Math.round(weeks * phase.commitsPerWeek));
    const step = (end - start) / commitCount;

    // Schedule structured events at commit indices within the phase.
    const addAt = new Map<number, { path: string; loc: number }[]>();
    for (const add of phase.adds ?? []) {
      const at = Math.min(
        commitCount - 1,
        Math.floor((add.at ?? rand() * 0.5) * commitCount),
      );
      addAt.set(at, [...(addAt.get(at) ?? []), add]);
    }
    const removeAt = new Map<number, string[]>();
    for (const rem of phase.removes ?? []) {
      const at = Math.min(
        commitCount - 1,
        Math.floor((rem.at ?? 0.3) * commitCount),
      );
      removeAt.set(at, [...(removeAt.get(at) ?? []), rem.path]);
    }
    const renameIndex = phase.renames?.length
      ? Math.floor(commitCount * 0.25)
      : -1;
    const depsIndex =
      (phase.depsAdd?.length ?? 0) + (phase.depsRemove?.length ?? 0) > 0
        ? Math.floor(commitCount * 0.15)
        : -1;
    const revertIndices = new Set<number>();
    for (let r = 0; r < (phase.reverts ?? 0); r++) {
      revertIndices.add(Math.floor(((r + 1) / ((phase.reverts ?? 0) + 1)) * commitCount));
    }

    const todoPerCommit = (phase.todoDelta ?? 0) / commitCount;
    let todoCarry = 0;
    let messageCursor = 0;

    for (let i = 0; i < commitCount; i++) {
      const date = new Date(start + step * i + rand() * step * 0.8);
      const login =
        phase.authors[Math.floor(rand() * phase.authors.length)] ??
        scenario.authors[0].login;
      const files: FileChange[] = [];
      const events: TreeEvent[] = [];
      let message: string;

      const applyModify = (path: string, churnScale = 1) => {
        const state = tree.get(path);
        if (!state) return;
        const churn = Math.round(
          (phase.churn[0] + rand() * (phase.churn[1] - phase.churn[0])) *
            churnScale,
        );
        const additions = Math.round(churn * (0.45 + rand() * 0.3));
        const deletions = Math.max(0, churn - additions);
        todoCarry += todoPerCommit;
        const todoStep = Math.trunc(todoCarry);
        todoCarry -= todoStep;
        const next: FileState = {
          loc: Math.max(20, state.loc + Math.round((additions - deletions) * 0.8)),
          complexity: Math.max(
            1,
            state.complexity + (phase.complexityDrift ?? 0) * (0.5 + rand()),
          ),
          todos: Math.max(0, state.todos + todoStep),
        };
        tree.set(path, next);
        files.push({ path, status: "modified", additions, deletions });
        events.push({ kind: "set", path, state: next });
      };

      if (i === renameIndex && phase.renames) {
        message = "Restructure project layout";
        for (const rn of phase.renames) {
          const state = tree.get(rn.from);
          if (!state) continue;
          tree.delete(rn.from);
          tree.set(rn.to, state);
          files.push({
            path: rn.to,
            previousPath: rn.from,
            status: "renamed",
            additions: Math.round(state.loc * 0.05),
            deletions: Math.round(state.loc * 0.05),
          });
          events.push({ kind: "del", path: rn.from });
          events.push({ kind: "set", path: rn.to, state });
        }
      } else if (i === depsIndex) {
        const added = phase.depsAdd ?? [];
        const removed = phase.depsRemove ?? [];
        packages = [...packages.filter((p) => !removed.includes(p)), ...added];
        message =
          added.length > 0
            ? `Add ${added.join(", ")}${removed.length ? `, drop ${removed.join(", ")}` : ""}`
            : `Remove ${removed.join(", ")}`;
        const manifest = "package.json";
        const state = tree.get(manifest) ?? { loc: 40, complexity: 1, todos: 0 };
        const next = { ...state, loc: state.loc + added.length * 2 - removed.length * 2 };
        tree.set(manifest, next);
        files.push({
          path: manifest,
          status: tree.has(manifest) ? "modified" : "added",
          additions: 4 + added.length,
          deletions: 1 + removed.length,
        });
        events.push({ kind: "set", path: manifest, state: next });
        events.push({ kind: "deps", packages: [...packages] });
        pushCommit(date, login, message, files, events, {
          dependenciesAdded: added,
          dependenciesRemoved: removed,
        });
        continue;
      } else if (revertIndices.has(i)) {
        const target = phase.focus?.[Math.floor(rand() * (phase.focus.length || 1))];
        message = `Revert "${phase.messages[messageCursor % phase.messages.length]}"`;
        messageCursor += 1;
        if (target) applyModify(target, 1.2);
      } else {
        const isFix = rand() < (phase.fixRatio ?? 0.12);
        const pool = phase.messages;
        message = isFix
          ? `Fix ${["edge case", "race condition", "crash", "regression", "off-by-one"][Math.floor(rand() * 5)]} in ${phase.focus?.[Math.floor(rand() * (phase.focus?.length || 1))]?.split("/").pop() ?? "core"}`
          : pool[messageCursor % pool.length];
        if (!isFix) messageCursor += 1;
      }

      // Scheduled adds/removes for this commit.
      for (const add of addAt.get(i) ?? []) {
        const state: FileState = {
          loc: add.loc,
          complexity: 2 + rand() * 4,
          todos: 0,
        };
        tree.set(add.path, state);
        files.push({ path: add.path, status: "added", additions: add.loc, deletions: 0 });
        events.push({ kind: "set", path: add.path, state });
      }
      for (const path of removeAt.get(i) ?? []) {
        const state = tree.get(path);
        if (!state) continue;
        tree.delete(path);
        files.push({ path, status: "removed", additions: 0, deletions: state.loc });
        events.push({ kind: "del", path });
      }

      // Regular modifications.
      if (files.filter((f) => f.status === "modified").length === 0) {
        const candidates =
          phase.focus?.filter((p) => tree.has(p)) ?? [...tree.keys()];
        const count = 1 + Math.floor(rand() * 2.4);
        for (let k = 0; k < count && candidates.length > 0; k++) {
          applyModify(candidates[Math.floor(rand() * candidates.length)]);
        }
      }
      if (files.length === 0) continue;
      pushCommit(date, login, message, files, events);
    }

    for (const imp of phase.imports ?? []) {
      importActivations.push({ ...imp, date: new Date(end).toISOString() });
    }
    if (phase.release) {
      const last = commits[commits.length - 1];
      last.tags.push(phase.release.tag);
      releases.push({
        tag: phase.release.tag,
        name: phase.release.name,
        date: last.date,
        sha: last.sha,
      });
    }
  }

  // Tree samples at engine-selected snapshot points, replayed from the log.
  const points = selectSnapshotPoints(commits, releases, 14);
  const shaToIndex = new Map(commits.map((c, i) => [c.sha, i]));
  const samples: TreeSample[] = [];
  const replayTree = new Map<string, FileState>();
  let replayPackages: string[] = [];
  let replayed = -1;
  for (const point of [...points].sort(
    (a, b) => shaToIndex.get(a.sha)! - shaToIndex.get(b.sha)!,
  )) {
    const target = shaToIndex.get(point.sha)!;
    while (replayed < target) {
      replayed += 1;
      for (const event of eventLog[replayed]) {
        if (event.kind === "set") replayTree.set(event.path, event.state);
        else if (event.kind === "del") replayTree.delete(event.path);
        else replayPackages = event.packages;
      }
    }
    const sampleDate = commits[target].date;
    samples.push({
      sha: point.sha,
      date: sampleDate,
      files: [...replayTree.entries()].map(([path, state]) => ({
        path,
        loc: state.loc,
        complexity: Math.round(state.complexity * 10) / 10,
        todoCount: state.todos,
      })),
      imports: importActivations
        .filter((a) => a.date <= sampleDate)
        .filter((a) => replayTree.has(a.from) && replayTree.has(a.to))
        .map(({ from, to }) => ({ from, to })),
      packages: [...replayPackages],
    });
  }

  return {
    repository: scenario.repository,
    mode: "demo",
    commits,
    releases,
    contributors: [],
    treeSamples: samples,
    disclosures: [
      "Demo dataset: a fictional repository generated to showcase the analysis pipeline end-to-end.",
      ...(scenario.disclosures ?? []),
    ],
  };
}
