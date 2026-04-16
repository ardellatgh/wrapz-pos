import type { HTMLAttributes } from "react";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "muted";

const tones: Record<Tone, string> = {
  default: "bg-brand-text/8 text-brand-text",
  success: "bg-brand-green/15 text-brand-green ring-1 ring-brand-green/25",
  warning: "bg-brand-yellow-soft text-brand-text ring-1 ring-brand-yellow/35",
  danger: "bg-brand-red-soft text-brand-red ring-1 ring-brand-red/30",
  info: "bg-semantic-info/12 text-semantic-info ring-1 ring-semantic-info/20",
  muted: "bg-brand-fill text-brand-text/70",
};

export function Badge({
  tone = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${tones[tone]} ${className}`}
      {...props}
    />
  );
}
