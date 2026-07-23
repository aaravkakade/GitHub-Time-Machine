import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-[#0b0b10] font-medium hover:bg-accent-strong active:translate-y-px",
  secondary:
    "bg-surface-2 text-ink-1 border border-line-1 hover:bg-surface-3 hover:border-line-2",
  ghost: "text-ink-2 hover:text-ink-1 hover:bg-surface-2",
  outline:
    "border border-line-1 text-ink-1 hover:border-line-2 hover:bg-surface-1",
  danger: "bg-remove-soft text-remove border border-remove/30 hover:bg-remove/20",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-9 px-3.5 text-sm gap-2 rounded-[var(--radius-md)]",
  lg: "h-11 px-5 text-sm gap-2 rounded-[var(--radius-lg)]",
  icon: "h-8 w-8 rounded-[var(--radius-md)]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap transition-colors duration-[var(--dur-fast)] disabled:pointer-events-none disabled:opacity-45",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
