import type { ReactNode } from "react";

type PageHeaderProps = {
  /** Small uppercase label above the title (accent color), e.g. "Live board" */
  eyebrow?: string;
  /** Main page title — Bebas display */
  title: string;
  /** Optional line(s) directly under the title (before description), e.g. queue # */
  extra?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Additional classes on the outer header (e.g. kiosk flush overrides) */
  className?: string;
  /** Override default title sizing (e.g. large queue on confirmation) */
  titleClassName?: string;
};

const defaultTitleClass =
  "font-display text-[1.75rem] font-normal uppercase leading-none tracking-[0.06em] text-brand-text md:text-[2rem]";

/**
 * Unified page header: white band, left accent bar, eyebrow + Bebas title + subtitle, optional actions.
 * Matches the Dashboard live-board header treatment.
 */
export function PageHeader({
  eyebrow,
  title,
  extra,
  description,
  actions,
  className = "",
  titleClassName = "",
}: PageHeaderProps) {
  return (
    <header
      className={`mb-6 flex flex-col gap-4 rounded-ref border border-brand-text/10 bg-white px-5 py-5 shadow-card sm:flex-row sm:items-stretch sm:justify-between ${className}`}
    >
      <div className="flex min-w-0 flex-1 gap-4">
        <div className="w-1 shrink-0 self-stretch rounded-full bg-brand-red" aria-hidden />
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-red">{eyebrow}</p>
          ) : null}
          <h1 className={titleClassName ? titleClassName : defaultTitleClass}>{title}</h1>
          {extra ? <div className="mt-1 min-w-0">{extra}</div> : null}
          {description ? (
            <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-brand-text/70">{description}</div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex w-full shrink-0 flex-col items-stretch justify-center gap-2 sm:w-auto sm:items-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
