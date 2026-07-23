import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "add" | "remove" | "warn" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border border-line-1",
  accent: "bg-accent-soft text-accent-strong border border-[var(--accent-line)]",
  add: "bg-add-soft text-add border border-add/25",
  remove: "bg-remove-soft text-remove border border-remove/25",
  warn: "bg-warn-soft text-warn border border-warn/25",
  outline: "border border-line-1 text-ink-3",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
