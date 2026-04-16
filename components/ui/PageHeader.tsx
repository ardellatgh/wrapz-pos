import type { ReactNode } from "react";

type PageHeaderProps = {
  /** Small label above the title (e.g. section context) */
  eyebrow?: string;
  /** Main page name — shown in bold condensed caps */
  title: string;
  description?: ReactNode;
  /** Right-aligned actions (buttons, pills) */
  actions?: ReactNode;
  className?: string;
};

/**
 * Shared page title band: condensed sans headline + muted description + optional actions.
 * Presentation only; no data fetching.
 */
export function PageHeader({ eyebrow, title, description, actions, className = "" }: PageHeaderProps) {
  return (
    <header
      className={`border-b border-brand-text/10 pb-4 pt-0.5 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-text/40">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-narrow text-[1.65rem] font-bold uppercase leading-tight tracking-tight text-brand-text md:text-3xl">
            {title}
          </h1>
          {description ? (
            <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-brand-text/65">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
