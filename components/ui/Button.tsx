import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "min-h-[44px] rounded-md py-2.5 bg-brand-red text-white shadow-sm hover:bg-brand-red/92 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand-red/50 focus-visible:ring-offset-2",
  secondary:
    "rounded-md py-2 border border-brand-text/15 bg-white text-brand-text shadow-sm hover:border-brand-text/25 hover:bg-brand-bg focus-visible:ring-2 focus-visible:ring-brand-red/30 focus-visible:ring-offset-2",
  ghost:
    "rounded-md py-2 text-brand-text hover:bg-brand-text/[0.06] focus-visible:ring-2 focus-visible:ring-brand-red/25 focus-visible:ring-offset-2",
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
      className={`inline-flex items-center justify-center rounded-md px-4 text-sm font-semibold tracking-tight transition disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
