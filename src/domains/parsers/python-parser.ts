import { countLines, countTodos, type ParsedFile, type Parser } from "./types";

/**
 * Python parser. Python's import/def/class statements are line-oriented, so
 * a careful line tokenizer (with string/comment stripping and continuation
 * handling) is reliable without a native AST dependency. Complexity counts
 * branch keywords per logical line.
 */

const BRANCH_KEYWORDS = /\b(if|elif|for|while|except|case)\b|\band\b|\bor\b/g;

/** Strip comments and (approximately) string literal contents from a line. */
function stripNoise(line: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote && line[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === "#") break;
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    out += ch;
  }
  return out;
}

function parseImportLine(line: string): string[] {
  const fromMatch = line.match(/^\s*from\s+([\w.]+)\s+import\s+/);
  if (fromMatch) return [fromMatch[1]];
  const importMatch = line.match(/^\s*import\s+(.+)$/);
  if (importMatch) {
    return importMatch[1]
      .split(",")
      .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
      .filter((m) => /^[\w.]+$/.test(m));
  }
  return [];
}

export const pythonParser: Parser = {
  language: "Python",

  supports(path: string): boolean {
    return path.endsWith(".py");
  },

  parse(path: string, content: string): ParsedFile {
    const imports: string[] = [];
    let functions = 0;
    let classes = 0;
    let complexity = 1;
    let exports = 0;
    let inTripleString: '"""' | "'''" | null = null;

    for (const rawLine of content.split("\n")) {
      // Triple-quoted string tracking (docstrings and multiline strings).
      if (inTripleString) {
        if (rawLine.includes(inTripleString)) inTripleString = null;
        continue;
      }
      const tripleMatch = rawLine.match(/("""|''')/);
      if (tripleMatch) {
        const marker = tripleMatch[1] as '"""' | "'''";
        const occurrences = rawLine.split(marker).length - 1;
        if (occurrences % 2 === 1) inTripleString = marker;
        // A line that both opens and closes contributes code before/after;
        // treat conservatively and continue to the stripped analysis below.
      }

      const line = stripNoise(rawLine);
      if (!line.trim()) continue;

      imports.push(...parseImportLine(line));

      if (/^\s*(async\s+)?def\s+\w+/.test(line)) {
        functions += 1;
        complexity += 1;
      }
      if (/^\s*class\s+\w+/.test(line)) classes += 1;
      if (/^__all__\s*=/.test(line)) exports += 1;

      const branches = line.match(BRANCH_KEYWORDS);
      if (branches) complexity += branches.length;
    }

    return {
      path,
      language: "Python",
      loc: countLines(content),
      imports,
      exports,
      functions,
      classes,
      complexity,
      todoCount: countTodos(content),
    };
  },
};
