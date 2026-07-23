/** Shared file classification: what we analyze, what we skip, how we label. */

const VENDORED_SEGMENTS = [
  "node_modules",
  "vendor",
  "vendored",
  "third_party",
  "bower_components",
  ".yarn",
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  "__snapshots__",
  ".venv",
  "venv",
  "site-packages",
];

const GENERATED_PATTERNS = [
  /\.min\.(js|css)$/,
  /\.(lock|lockb)$/,
  /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Pipfile\.lock|uv\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock)$/,
  /\.(snap|map)$/,
  /_pb2\.py$/,
  /\.generated\.[a-z]+$/,
  /\.d\.ts$/,
];

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "svg",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp3", "mp4", "webm", "wav", "ogg",
  "zip", "gz", "tar", "br", "pdf", "wasm", "exe", "dll", "so", "dylib",
  "jar", "class", "pyc", "db", "sqlite",
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", pyi: "Python",
  rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin",
  c: "C", h: "C", cc: "C++", cpp: "C++", hpp: "C++",
  cs: "C#", php: "PHP", swift: "Swift", scala: "Scala",
  sh: "Shell", bash: "Shell", zsh: "Shell",
  css: "CSS", scss: "CSS", less: "CSS",
  html: "HTML", vue: "Vue", svelte: "Svelte",
  json: "JSON", yml: "YAML", yaml: "YAML", toml: "TOML",
  md: "Markdown", mdx: "Markdown", sql: "SQL",
};

const SOURCE_LANGUAGES = new Set([
  "TypeScript", "JavaScript", "Python", "Ruby", "Go", "Rust", "Java",
  "Kotlin", "C", "C++", "C#", "PHP", "Swift", "Scala", "Vue", "Svelte",
]);

export function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function languageOf(path: string): string | null {
  return LANGUAGE_BY_EXTENSION[extensionOf(path)] ?? null;
}

export function isSourceFile(path: string): boolean {
  const lang = languageOf(path);
  return lang !== null && SOURCE_LANGUAGES.has(lang);
}

export function isBinaryFile(path: string): boolean {
  return BINARY_EXTENSIONS.has(extensionOf(path));
}

export function isVendoredOrGenerated(path: string): boolean {
  const segments = path.split("/");
  const base = segments[segments.length - 1];
  if (segments.some((s) => VENDORED_SEGMENTS.includes(s))) return true;
  return GENERATED_PATTERNS.some((p) => p.test(base) || p.test(path));
}

/** Files we track in history and graphs at all. */
export function isAnalyzable(path: string): boolean {
  return !isVendoredOrGenerated(path) && !isBinaryFile(path);
}

export function isTestPath(path: string): boolean {
  return (
    /(^|\/)(tests?|__tests__|spec|specs|e2e|cypress)\//.test(path) ||
    /\.(test|spec)\.[a-z]+$/.test(path) ||
    /(^|\/)test_[^/]+\.py$/.test(path) ||
    /(^|\/)[^/]+_test\.(go|py|ts|js)$/.test(path)
  );
}

export function isCiPath(path: string): boolean {
  return (
    path.startsWith(".github/workflows/") ||
    /^(\.gitlab-ci\.yml|\.circleci\/|\.travis\.yml|Jenkinsfile|azure-pipelines\.yml)/.test(path)
  );
}

export function isManifestPath(path: string): boolean {
  return /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|setup\.py|Pipfile|Cargo\.toml|go\.mod|composer\.json|Gemfile)$/.test(
    path,
  );
}
