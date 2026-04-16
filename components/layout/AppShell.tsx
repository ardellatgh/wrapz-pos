"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { useKioskMode } from "@/components/layout/KioskModeProvider";

type NavItem = { href: string; label: string; icon: string };

type NavGroup = { title: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: "Run sheet",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "📊" },
      { href: "/order/new", label: "New order", icon: "➕" },
      { href: "/kitchen", label: "Kitchen", icon: "🍳" },
    ],
  },
  {
    title: "Catalog & floor",
    items: [
      { href: "/menu", label: "Menu", icon: "📋" },
      { href: "/discounts", label: "Discounts", icon: "🏷️" },
      { href: "/stock", label: "Stock", icon: "📦" },
      { href: "/cash", label: "Cash", icon: "💵" },
    ],
  },
  {
    title: "Money & records",
    items: [
      { href: "/transactions", label: "Transactions", icon: "📑" },
      { href: "/ledger", label: "Ledger", icon: "📒" },
      { href: "/export", label: "Export", icon: "💾" },
    ],
  },
  {
    title: "Event",
    items: [{ href: "/settings", label: "Settings", icon: "⚙️" }],
  },
];

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string | null;
  onNavigate?: () => void;
}) {
  const active =
    pathname === item.href || (item.href !== "/" && !!pathname?.startsWith(item.href + "/"));
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 rounded-ref-sm py-2 pl-2.5 pr-2 text-[14px] font-medium transition ${
        active
          ? "bg-brand-red text-white shadow-sm"
          : "text-brand-text/80 hover:bg-brand-fill hover:text-brand-text"
      }`}
    >
      <span className={`text-base leading-none ${active ? "text-brand-yellow" : ""}`} aria-hidden>
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

function SidebarNav({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0 px-2 py-3">
      {navGroups.map((group, gi) => (
        <div key={group.title} className={gi > 0 ? "mt-3 border-t border-brand-text/10 pt-3" : ""}>
          <p className="mb-1.5 px-2 text-label font-bold uppercase tracking-[0.14em] text-brand-text/40">
            {group.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { kiosk } = useKioskMode();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside
        className={`hidden w-[260px] shrink-0 flex-col border-r border-brand-text/10 bg-white shadow-card md:flex ${
          kiosk ? "!hidden" : ""
        }`}
      >
        <div className="flex min-h-[60px] shrink-0 items-center border-b border-brand-text/10 px-5 py-3">
          <span className="font-display text-[28px] font-normal uppercase leading-none tracking-[0.12em] text-brand-yellow">
            WRAPZ
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav pathname={pathname} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={`flex h-[60px] shrink-0 items-center justify-between border-b border-brand-text/10 bg-white px-4 shadow-card md:hidden ${
            kiosk ? "hidden" : ""
          }`}
        >
          <span className="font-display text-[26px] font-normal uppercase leading-none tracking-[0.1em] text-brand-yellow">
            WRAPZ
          </span>
          <button
            type="button"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-ref-sm border border-brand-text/12 bg-white text-lg text-brand-text shadow-card transition hover:bg-brand-fill active:scale-[0.98]"
            aria-expanded={mobileNavOpen}
            aria-controls="app-mobile-nav"
            aria-label="Open navigation menu"
            onClick={() => setMobileNavOpen(true)}
          >
            ☰
          </button>
        </header>

        {mobileNavOpen && !kiosk && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-brand-text/30 backdrop-blur-[1px] md:hidden"
              aria-label="Close menu"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside
              id="app-mobile-nav"
              className="fixed left-0 top-0 z-50 flex h-full w-[min(100%,280px)] flex-col border-r border-brand-text/10 bg-white shadow-lift md:hidden"
            >
              <div className="flex min-h-[56px] shrink-0 items-center justify-between border-b border-brand-text/10 px-3">
                <span className="font-display text-[26px] font-normal uppercase leading-none tracking-[0.1em] text-brand-yellow">
                  WRAPZ
                </span>
                <button
                  type="button"
                  className="rounded-ref-sm px-3 py-2 text-sm font-semibold text-brand-text/55 transition hover:bg-brand-fill hover:text-brand-text"
                  aria-label="Close navigation"
                  onClick={() => setMobileNavOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <SidebarNav pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
              </div>
            </aside>
          </>
        )}

        <main
          className={`flex-1 bg-brand-bg ${kiosk ? "min-h-0 flex-1 p-0 md:p-0" : "p-4 md:p-7"}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
