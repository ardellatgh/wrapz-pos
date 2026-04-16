import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-red text-white hover:bg-brand-red/90 focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2",
  secondary:
    "border border-brand-text/20 bg-white text-brand-text hover:bg-brand-bg focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-offset-2",
  ghost:
    "text-brand-text hover:bg-brand-text/5 focus-visible:ring-2 focus-visible:ring-brand-red/30 focus-visible:ring-offset-2",
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
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
