"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { normalizeRepoUrl } from "@/domains/github/normalize-url";
import { cn } from "@/lib/utils";

export function RepoInput({
  autoFocus = false,
  className,
}: {
  autoFocus?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [navigating, setNavigating] = React.useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = normalizeRepoUrl(value);
    if (!ref) {
      setError(
        "Try a format like github.com/facebook/react or just facebook/react.",
      );
      return;
    }
    setError(null);
    setNavigating(true);
    router.push(`/repo/${ref.owner}/${ref.repo}`);
  };

  return (
    <form onSubmit={submit} className={cn("w-full", className)}>
      <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-line-1 bg-surface-1 p-1.5 shadow-lg shadow-black/20 transition-colors focus-within:border-[var(--accent-line)]">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="github.com/owner/repository"
          aria-label="GitHub repository URL"
          aria-invalid={error !== null}
          aria-describedby={error ? "repo-input-error" : undefined}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
          data-testid="repo-input"
          className="h-10 min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none"
        />
        <button
          type="submit"
          disabled={navigating}
          className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-[#0b0b10] transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {navigating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <>
              <span className="hidden sm:inline">Travel</span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      </div>
      {error && (
        <p id="repo-input-error" role="alert" className="mt-2 text-xs text-remove">
          {error}
        </p>
      )}
    </form>
  );
}
