"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight CSS-driven tooltip. Content is rendered in the DOM (visually
 * hidden until hover/focus) so it stays screen-reader accessible.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-60 -translate-x-1/2 rounded-[var(--radius-md)] border border-line-1 bg-surface-3 px-2.5 py-1.5 text-[11px] leading-snug text-ink-1 opacity-0 shadow-lg shadow-black/30 transition-opacity duration-[var(--dur-fast)] group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {label}
      </span>
    </span>
  );
}
