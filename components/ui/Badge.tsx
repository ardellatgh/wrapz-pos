import type { HTMLAttributes } from "react";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "muted";

const tones: Record<Tone, string> = {
  default: "bg-brand-text/10 text-brand-text",
  success: "bg-semantic-success/14 text-semantic-success ring-1 ring-semantic-success/20",
  warning: "bg-brand-yellow/25 text-semantic-warning ring-1 ring-brand-yellow/40",
  danger: "bg-semantic-danger/10 text-semantic-danger ring-1 ring-semantic-danger/25",
  info: "bg-semantic-info/10 text-semantic-info ring-1 ring-semantic-info/20",
  muted: "bg-brand-text/5 text-brand-text/70",
};

export function Badge({
  tone = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
      {...props}
    />
  );
}
