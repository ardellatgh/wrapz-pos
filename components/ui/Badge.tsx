import type { HTMLAttributes } from "react";

type Tone = "default" | "success" | "warning" | "muted";

const tones: Record<Tone, string> = {
  default: "bg-brand-text/10 text-brand-text",
  success: "bg-semantic-success/12 text-semantic-success",
  warning: "bg-brand-yellow/35 text-brand-text",
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
