import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-brand-text/15 bg-white px-3 py-2 text-sm text-brand-text shadow-sm outline-none transition placeholder:text-brand-text/40 focus:border-brand-red/50 focus:ring-2 focus:ring-brand-red/20 ${className}`}
      {...props}
    />
  );
}
