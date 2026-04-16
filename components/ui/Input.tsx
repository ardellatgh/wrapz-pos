import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-ref-sm border border-brand-text/12 bg-brand-fill px-3 py-2 text-sm text-brand-text shadow-none outline-none transition placeholder:text-brand-text/40 focus:border-brand-yellow/80 focus:ring-2 focus:ring-brand-yellow/25 ${className}`}
      {...props}
    />
  );
}
