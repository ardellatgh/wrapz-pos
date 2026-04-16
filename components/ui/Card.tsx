import type { HTMLAttributes } from "react";

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-ref border border-brand-text/10 bg-white p-4 shadow-card transition-shadow duration-150 ${className}`}
      {...props}
    />
  );
}
