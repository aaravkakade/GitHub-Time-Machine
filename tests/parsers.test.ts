import { describe, expect, it } from "vitest";
import { parseFile } from "@/domains/parsers";
import { typescriptParser } from "@/domains/parsers/typescript-parser";
import { pythonParser } from "@/domains/parsers/python-parser";
import { resolveImport } from "@/domains/parsers/resolve";

describe("typescript parser", () => {
  const source = `
import { useState } from "react";
import type { Thing } from "./types";
const lazy = () => import("./lazy-module");
const legacy = require("./legacy");

export const helper = (x: number) => (x > 0 ? x : -x);

export default class Widget {
  render() {
    if (this.ready && this.visible) {
      for (const item of this.items) {
        try {
          draw(item);
        } catch (e) {
          // TODO: report properly
        }
      }
    }
    return null;
  }
}
`;

  it("extracts imports including dynamic and require", () => {
    const parsed = typescriptParser.parse("src/widget.tsx", source);
    expect(parsed.imports).toEqual(
      expect.arrayContaining(["react", "./types", "./lazy-module", "./legacy"]),
    );
  });

  it("counts functions, classes, complexity and todos", () => {
    const parsed = typescriptParser.parse("src/widget.ts", source);
    expect(parsed.classes).toBe(1);
    expect(parsed.functions).toBeGreaterThanOrEqual(3); // helper, lazy, render
    // 1 base + if + && + for + catch + ternary = 6
    expect(parsed.complexity).toBeGreaterThanOrEqual(6);
    expect(parsed.todoCount).toBe(1);
    expect(parsed.language).toBe("TypeScript");
  });

  it("does not parse .d.ts files", () => {
    expect(typescriptParser.supports("dist/index.d.ts")).toBe(false);
    expect(typescriptParser.supports("src/index.ts")).toBe(true);
  });
});

describe("python parser", () => {
  const source = `
"""Module docstring with import os inside — must be ignored."""
import os
import sys, json as j
from flask.helpers import url_for
from . import utils

class App:
    def __init__(self, name):
        if name and name.strip():
            self.name = name
        elif fallback:
            self.name = "app"

    async def run(self):
        for task in self.tasks:
            while not task.done():
                await task  # FIXME: timeout
`;

  it("extracts imports including from-imports and relative", () => {
    const parsed = pythonParser.parse("src/app.py", source);
    expect(parsed.imports).toEqual(
      expect.arrayContaining(["os", "sys", "json", "flask.helpers", "."]),
    );
    // Docstring content is not treated as code.
    expect(parsed.imports.filter((i) => i === "os")).toHaveLength(1);
  });

  it("counts defs, classes and complexity", () => {
    const parsed = pythonParser.parse("src/app.py", source);
    expect(parsed.classes).toBe(1);
    expect(parsed.functions).toBe(2);
    expect(parsed.complexity).toBeGreaterThanOrEqual(6);
    expect(parsed.todoCount).toBe(1);
  });
});

describe("parseFile fallback", () => {
  it("still measures unsupported languages", () => {
    const parsed = parseFile("src/main.rs", "fn main() {\n // TODO: port\n}\n");
    expect(parsed.language).toBe("Rust");
    expect(parsed.loc).toBe(4);
    expect(parsed.todoCount).toBe(1);
    expect(parsed.imports).toEqual([]);
  });
});

describe("resolveImport", () => {
  const files = new Set([
    "src/app.ts",
    "src/lib/util.ts",
    "src/lib/index.ts",
    "src/flask/__init__.py",
    "src/flask/helpers.py",
    "tests/test_app.py",
    "lib/router/index.js",
  ]);

  it("resolves JS relative imports with extension guessing", () => {
    expect(resolveImport("src/app.ts", "./lib/util", files)).toBe("src/lib/util.ts");
    expect(resolveImport("src/app.ts", "./lib", files)).toBe("src/lib/index.ts");
    expect(resolveImport("src/lib/util.ts", "../app", files)).toBe("src/app.ts");
    expect(resolveImport("index.js", "./lib/router", files)).toBe("lib/router/index.js");
  });

  it("returns null for external packages", () => {
    expect(resolveImport("src/app.ts", "react", files)).toBeNull();
    expect(resolveImport("src/app.ts", "node:path", files)).toBeNull();
  });

  it("resolves python module paths, including src layouts and relatives", () => {
    expect(resolveImport("tests/test_app.py", "flask.helpers", files)).toBe(
      "src/flask/helpers.py",
    );
    expect(resolveImport("src/flask/helpers.py", ".", files)).toBe(
      "src/flask/__init__.py",
    );
  });

  it("never escapes the repository root", () => {
    expect(resolveImport("src/app.ts", "../../../etc/passwd", files)).toBeNull();
  });
});
