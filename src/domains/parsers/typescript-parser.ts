import ts from "typescript";
import { countLines, countTodos, type ParsedFile, type Parser } from "./types";

const EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/**
 * TypeScript/JavaScript parser built on the TypeScript compiler API — a real
 * AST walk, not regexes. Extracts imports (static + dynamic + require),
 * exports, functions, classes and an approximate cyclomatic complexity.
 */
export const typescriptParser: Parser = {
  language: "TypeScript",

  supports(path: string): boolean {
    return EXTENSIONS.test(path) && !path.endsWith(".d.ts");
  },

  parse(path: string, content: string): ParsedFile {
    const source = ts.createSourceFile(
      path,
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      path.endsWith(".tsx") || path.endsWith(".jsx")
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS,
    );

    const imports: string[] = [];
    let exportCount = 0;
    let functionCount = 0;
    let classCount = 0;
    let complexity = 1;

    const visit = (node: ts.Node) => {
      switch (node.kind) {
        case ts.SyntaxKind.ImportDeclaration: {
          const decl = node as ts.ImportDeclaration;
          if (ts.isStringLiteral(decl.moduleSpecifier)) {
            imports.push(decl.moduleSpecifier.text);
          }
          break;
        }
        case ts.SyntaxKind.ExportDeclaration: {
          const decl = node as ts.ExportDeclaration;
          if (decl.moduleSpecifier && ts.isStringLiteral(decl.moduleSpecifier)) {
            imports.push(decl.moduleSpecifier.text);
          }
          exportCount += 1;
          break;
        }
        case ts.SyntaxKind.ExportAssignment:
          exportCount += 1;
          break;
        case ts.SyntaxKind.CallExpression: {
          const call = node as ts.CallExpression;
          // require("x") and import("x")
          const isRequire =
            ts.isIdentifier(call.expression) &&
            call.expression.text === "require";
          const isDynamicImport =
            call.expression.kind === ts.SyntaxKind.ImportKeyword;
          if (
            (isRequire || isDynamicImport) &&
            call.arguments.length > 0 &&
            ts.isStringLiteral(call.arguments[0])
          ) {
            imports.push((call.arguments[0] as ts.StringLiteral).text);
          }
          break;
        }
        case ts.SyntaxKind.FunctionDeclaration:
        case ts.SyntaxKind.FunctionExpression:
        case ts.SyntaxKind.ArrowFunction:
        case ts.SyntaxKind.MethodDeclaration:
          functionCount += 1;
          break;
        case ts.SyntaxKind.ClassDeclaration:
        case ts.SyntaxKind.ClassExpression:
          classCount += 1;
          break;
        // Branching constructs → complexity.
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.CaseClause:
        case ts.SyntaxKind.CatchClause:
        case ts.SyntaxKind.ConditionalExpression:
          complexity += 1;
          break;
        case ts.SyntaxKind.BinaryExpression: {
          const op = (node as ts.BinaryExpression).operatorToken.kind;
          if (
            op === ts.SyntaxKind.AmpersandAmpersandToken ||
            op === ts.SyntaxKind.BarBarToken ||
            op === ts.SyntaxKind.QuestionQuestionToken
          ) {
            complexity += 1;
          }
          break;
        }
      }
      // Export modifiers on declarations.
      if (ts.canHaveModifiers(node)) {
        const modifiers = ts.getModifiers(node);
        if (modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
          exportCount += 1;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    return {
      path,
      language: /\.(ts|tsx|mts|cts)$/.test(path) ? "TypeScript" : "JavaScript",
      loc: countLines(content),
      imports,
      exports: exportCount,
      functions: functionCount,
      classes: classCount,
      complexity,
      todoCount: countTodos(content),
    };
  },
};
