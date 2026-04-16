"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/order/new", label: "New Order" },
  { href: "/menu", label: "Menu" },
  { href: "/discounts", label: "Discounts" },
  { href: "/stock", label: "Stock" },
  { href: "/cash", label: "Cash" },
  { href: "/transactions", label: "Transactions" },
  { href: "/ledger", label: "Ledger" },
  { href: "/kitchen", label: "Kitchen" },
  { href: "/export", label: "Export" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-52 shrink-0 border-r border-brand-text/10 bg-white md:block">
        <div className="flex h-14 items-center border-b border-brand-text/10 px-4">
          <span className="font-display text-lg font-semibold tracking-tight text-brand-text">
            WRAPZ POS
          </span>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-brand-red/10 text-brand-red"
                    : "text-brand-text/80 hover:bg-brand-bg hover:text-brand-text"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-brand-text/10 bg-white px-4 md:px-6">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-semibold text-brand-text md:hidden">
              WRAPZ POS
            </span>
          </div>
          <div className="font-mono text-xs text-brand-text/50">Wisuda Apr 2026</div>
        </header>

        <div className="border-b border-brand-text/10 bg-white px-2 py-2 md:hidden">
          <nav className="flex gap-1 overflow-x-auto pb-1">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href + "/"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                    active ? "bg-brand-red text-white" : "bg-brand-bg text-brand-text"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="flex-1 bg-brand-bg p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
