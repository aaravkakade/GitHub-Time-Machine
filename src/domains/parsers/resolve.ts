/**
 * Resolve raw import specifiers to repo-relative file paths so file-level
 * imports can become module-level graph edges. External packages resolve to
 * null (they are tracked via manifests instead).
 */

const JS_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const JS_INDEXES = JS_EXTENSIONS.filter(Boolean).map((ext) => `/index${ext}`);

function normalize(path: string): string {
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return ""; // escapes the repo
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

export function resolveImport(
  importerPath: string,
  specifier: string,
  fileSet: Set<string>,
): string | null {
  const importerDir = importerPath.includes("/")
    ? importerPath.slice(0, importerPath.lastIndexOf("/"))
    : "";

  // JS/TS relative imports.
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const base = normalize(`${importerDir}/${specifier}`);
    if (!base) return null;
    const stripped = base.replace(/\.(js|mjs|cjs)$/, "");
    for (const candidate of [base, stripped]) {
      for (const ext of JS_EXTENSIONS) {
        if (fileSet.has(candidate + ext)) return candidate + ext;
      }
      for (const index of JS_INDEXES) {
        if (fileSet.has(candidate + index)) return candidate + index;
      }
    }
    return null;
  }

  // Common "@/" alias → src/.
  if (specifier.startsWith("@/")) {
    return resolveImport(importerPath, `/src/${specifier.slice(2)}`.replace("//", "/"), fileSet) ??
      resolveFromRoot(`src/${specifier.slice(2)}`, fileSet);
  }

  // Python module paths (importer must be a .py file).
  if (importerPath.endsWith(".py") && /^[\w.]+$/.test(specifier)) {
    // Relative python imports arrive as ".foo" / "..foo".
    let spec = specifier;
    let baseDir = "";
    if (spec.startsWith(".")) {
      const dots = spec.match(/^\.+/)![0].length;
      spec = spec.slice(dots);
      const dirs = importerDir.split("/").filter(Boolean);
      baseDir = dirs.slice(0, dirs.length - (dots - 1)).join("/");
    }
    const relPath = spec.split(".").join("/");
    const combined = baseDir ? `${baseDir}/${relPath}` : relPath;
    const candidates = [
      `${combined}.py`,
      `${combined}/__init__.py`,
      // Top-level package inside src/ layouts.
      `src/${combined}.py`,
      `src/${combined}/__init__.py`,
    ];
    for (const candidate of candidates) {
      const normalized = normalize(candidate);
      if (normalized && fileSet.has(normalized)) return normalized;
    }
    return null;
  }

  return null;
}

function resolveFromRoot(path: string, fileSet: Set<string>): string | null {
  for (const ext of JS_EXTENSIONS) {
    if (fileSet.has(path + ext)) return path + ext;
  }
  for (const index of JS_INDEXES) {
    if (fileSet.has(path + index)) return path + index;
  }
  return null;
}
