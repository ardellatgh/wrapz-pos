import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "min-h-10 rounded-ref-sm bg-brand-red px-4 py-2 text-button text-white shadow-card hover:bg-brand-red/92 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand-red/45 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg",
  secondary:
    "min-h-10 rounded-ref-sm border border-brand-text/12 bg-white px-4 py-2 text-button text-brand-text shadow-card hover:border-brand-text/20 hover:bg-brand-fill focus-visible:ring-2 focus-visible:ring-brand-yellow/35 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg",
  ghost:
    "min-h-10 rounded-ref-sm px-4 py-2 text-button text-brand-text hover:bg-brand-text/[0.06] focus-visible:ring-2 focus-visible:ring-brand-yellow/30 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg",
};

export function Button({
  variant = "primary",
  type = "button",
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-semibold tracking-tight transition disabled:opacity-45 disabled:pointer-events-none disabled:active:scale-100 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
