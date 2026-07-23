import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("cc-pulse rounded-[var(--radius-md)] bg-surface-2", className)}
    />
  );
}
