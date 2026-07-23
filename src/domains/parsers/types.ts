/** Normalized result every language parser produces. */
export interface ParsedFile {
  path: string;
  language: string | null;
  loc: number;
  /** Raw import specifiers as written in the source. */
  imports: string[];
  exports: number;
  functions: number;
  classes: number;
  /** Approximate cyclomatic complexity: 1 + branching constructs. */
  complexity: number;
  todoCount: number;
}

export interface Parser {
  readonly language: string;
  supports(path: string): boolean;
  parse(path: string, content: string): ParsedFile;
}

export function countLines(content: string): number {
  if (content.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) lines++;
  }
  return lines;
}

const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX)\b/g;

export function countTodos(content: string): number {
  return content.match(TODO_PATTERN)?.length ?? 0;
}
