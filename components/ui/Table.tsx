import type { HTMLAttributes, ReactNode, TdHTMLAttributes } from "react";

export function Table({
  className = "",
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-brand-text/10 bg-white">
      <table
        className={`min-w-full divide-y divide-brand-text/10 text-left text-sm [&_tbody>tr]:transition-colors [&_tbody>tr]:duration-100 [&_tbody>tr:hover]:bg-brand-bg/60 ${className}`}
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
      className={`bg-brand-bg/80 px-3 py-2 font-semibold text-brand-text/80 ${className}`}
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
      className={`border-t border-brand-text/5 px-3 py-2 text-brand-text ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}
