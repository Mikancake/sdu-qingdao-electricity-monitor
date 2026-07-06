import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "default" | "success" | "warning" | "danger" | "muted";
}

const tones = {
  default: "border-primary/20 bg-primary/10 text-primary",
  success: "border-success/20 bg-success/10 text-success",
  warning: "border-warning/20 bg-warning/10 text-warning",
  danger: "border-danger/20 bg-danger/10 text-danger",
  muted: "border-border bg-muted text-muted-foreground"
};

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
