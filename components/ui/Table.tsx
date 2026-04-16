import type { HTMLAttributes, ReactNode, TdHTMLAttributes } from "react";

export function Table({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-ref border border-brand-text/10 bg-white shadow-card">
      <table
        className={`min-w-full divide-y divide-brand-text/10 text-left text-[13px] leading-snug [&_tbody>tr]:transition-colors [&_tbody>tr]:duration-100 [&_tbody>tr:hover]:bg-brand-fill/80 ${className}`}
        {...props}
      />
    </div>
  );
}

export function Th({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <th
      scope="col"
      className={`bg-brand-bg px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-brand-text/50 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  className = "",
  children,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td
      className={`border-t border-brand-text/[0.06] px-3 py-2.5 text-brand-text ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}
