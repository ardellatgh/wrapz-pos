import type { HTMLAttributes } from "react";

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-brand-text/[0.12] bg-white p-4 shadow-none transition-colors duration-150 ${className}`}
      {...props}
    />
  );
}
