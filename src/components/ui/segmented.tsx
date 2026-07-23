"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-line-1 bg-surface-1 p-0.5",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-[3px] px-2 py-1 text-[11px] font-medium transition-colors duration-[var(--dur-fast)]",
            value === opt.value
              ? "bg-surface-3 text-ink-1"
              : "text-ink-3 hover:text-ink-2",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
