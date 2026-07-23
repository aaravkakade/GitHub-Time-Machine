import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line-0 bg-surface-0/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
        <Link
          href="/"
          className="font-mono text-sm font-semibold tracking-tight text-ink-1"
        >
          code<span className="text-accent">chronicle</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="Main">
          <Link
            href="/explore"
            className="rounded-[var(--radius-md)] px-2.5 py-1.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
          >
            Explore
          </Link>
          <Link
            href="/about"
            className="rounded-[var(--radius-md)] px-2.5 py-1.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
          >
            Methodology
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden text-xs text-ink-3 transition-colors hover:text-ink-1 sm:block"
          >
            Open source
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
