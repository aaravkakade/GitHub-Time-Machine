import { languageOf } from "@/domains/analysis/classify";
import { countLines, countTodos, type ParsedFile, type Parser } from "./types";
import { typescriptParser } from "./typescript-parser";
import { pythonParser } from "./python-parser";

export type { ParsedFile, Parser } from "./types";

const parsers: Parser[] = [typescriptParser, pythonParser];

/**
 * Parse a source file with the best available parser; unsupported languages
 * fall back to line/TODO counting so every file still contributes metrics.
 */
export function parseFile(path: string, content: string): ParsedFile {
  const parser = parsers.find((p) => p.supports(path));
  if (parser) {
    try {
      return parser.parse(path, content);
    } catch {
      // A parse crash on one exotic file must not sink the analysis.
    }
  }
  return {
    path,
    language: languageOf(path),
    loc: countLines(content),
    imports: [],
    exports: 0,
    functions: 0,
    classes: 0,
    complexity: 1,
    todoCount: countTodos(content),
  };
}

export function hasDeepParser(path: string): boolean {
  return parsers.some((p) => p.supports(path));
}
