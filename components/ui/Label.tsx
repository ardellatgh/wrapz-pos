import type { LabelHTMLAttributes } from "react";

export function Label({
  className = "",
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`mb-1 block text-[11px] font-bold uppercase tracking-wide text-brand-text/65 ${className}`}
      {...props}
    />
  );
}
