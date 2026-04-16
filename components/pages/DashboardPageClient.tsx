"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EVENT_SETTINGS_ROW_ID } from "@/lib/constants";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

const REFRESH_MS = 60_000;

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

type TopSeller = { menu_item_id: string; item_name: string; units: number };

type Readiness = {
  eventNameOk: boolean;
  activeMenuOk: boolean;
  openingStockOk: boolean;
  cashSessionOk: boolean;
};

type DashboardData = {
  anyOrdersCount: number;
  grossSales: number;
  discountTotal: number;
  netSales: number;
  totalPaidOrders: number;
  aov: number;
  targetRevenue: number | null;
  topSelling: TopSeller[];
  readiness: Readiness;
};

function readinessComplete(r: Readiness): boolean {
  return r.eventNameOk && r.activeMenuOk && r.openingStockOk && r.cashSessionOk;
}

/** Progress 0–100; null if no meaningful target */
function netSalesProgressPct(netSales: number, target: number | null): number | null {
  if (target == null || !Number.isFinite(target) || target <= 0) return null;
  return Math.min(100, Math.round((netSales / target) * 100));
}

export function DashboardPageClient() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    const silent = opts?.silent ?? false;
    setLoadError(null);
    if (!silent) setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();

      const [
        anyOrdersRes,
        paidOrdersRes,
        eventRes,
        menuActiveRes,
        openingStockRes,
        cashOpenRes,
      ] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id, subtotal, discount_amount").eq("payment_status", "paid"),
        supabase
          .from("event_settings")
          .select("event_name, target_revenue")
          .eq("id", EVENT_SETTINGS_ROW_ID)
          .maybeSingle(),
        supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("stock_movements").select("id", { count: "exact", head: true }).eq("movement_type", "opening"),
        supabase.from("cash_sessions").select("id").eq("status", "open").maybeSingle(),
      ]);

      if (anyOrdersRes.error) throw anyOrdersRes.error;
      if (paidOrdersRes.error) throw paidOrdersRes.error;
      if (eventRes.error) throw eventRes.error;
      if (menuActiveRes.error) throw menuActiveRes.error;
      if (openingStockRes.error) throw openingStockRes.error;
      if (cashOpenRes.error) throw cashOpenRes.error;

      const anyOrdersCount = anyOrdersRes.count ?? 0;
      const paidRows = paidOrdersRes.data ?? [];
      const paidIds = paidRows.map((r) => r.id as string);

      let grossSales = 0;
      let discountTotal = 0;
      for (const r of paidRows) {
        grossSales += Number(r.subtotal);
        discountTotal += Number(r.discount_amount);
      }
      const netSales = grossSales - discountTotal;
      const totalPaidOrders = paidRows.length;
      const aov = totalPaidOrders > 0 ? netSales / totalPaidOrders : 0;

      const trRaw = eventRes.data?.target_revenue;
      const trNum = trRaw != null ? Number(trRaw) : NaN;
      const targetRevenue =
        trRaw != null && Number.isFinite(trNum) && trNum > 0 ? Math.round(trNum) : null;

      let topSelling: TopSeller[] = [];
      if (paidIds.length > 0) {
        const byItem = new Map<string, { item_name: string; units: number }>();
        for (const part of chunkIds(paidIds, 150)) {
          const { data: oi, error: oiErr } = await supabase
            .from("order_items")
            .select("menu_item_id, item_name, quantity, order_id")
            .in("order_id", part);
          if (oiErr) throw oiErr;
          for (const row of oi ?? []) {
            const mid = row.menu_item_id as string;
            const qty = Number(row.quantity);
            const prev = byItem.get(mid) ?? { item_name: row.item_name as string, units: 0 };
            prev.units += qty;
            byItem.set(mid, prev);
          }
        }
        topSelling = [...byItem.entries()]
          .map(([menu_item_id, v]) => ({ menu_item_id, item_name: v.item_name, units: v.units }))
          .sort((a, b) => b.units - a.units)
          .slice(0, 5);
      }

      const eventName = (eventRes.data?.event_name as string | undefined)?.trim() ?? "";
      const readiness: Readiness = {
        eventNameOk: eventName.length > 0,
        activeMenuOk: (menuActiveRes.count ?? 0) > 0,
        openingStockOk: (openingStockRes.count ?? 0) > 0,
        cashSessionOk: cashOpenRes.data != null,
      };

      setData({
        anyOrdersCount,
        grossSales,
        discountTotal,
        netSales,
        totalPaidOrders,
        aov,
        targetRevenue,
        topSelling,
        readiness,
      });
      setLastRefreshedAt(Date.now());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load dashboard");
      if (!silent) setData(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load({ silent: false });
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load({ silent: true }), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const setupDone = useMemo(() => (data ? readinessComplete(data.readiness) : false), [data]);
  const showCashWarning = useMemo(() => data && !data.readiness.cashSessionOk, [data]);
  const showStockWarning = useMemo(() => data && !data.readiness.openingStockOk, [data]);

  const progressPct = useMemo(() => {
    if (!data) return null;
    return netSalesProgressPct(data.netSales, data.targetRevenue);
  }, [data]);

  const topMaxUnits = useMemo(() => {
    if (!data?.topSelling.length) return 1;
    return Math.max(1, ...data.topSelling.map((t) => t.units));
  }, [data]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-2xl font-semibold text-brand-text">Dashboard</h1>
        <SupabaseSetupBanner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-brand-red/15 bg-gradient-to-br from-white via-brand-bg to-brand-yellow/20 px-5 py-6 shadow-card">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-red/10" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-40 rounded-full bg-brand-yellow/25 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-red">Live board</p>
            <h1 className="font-display text-2xl font-semibold text-brand-text md:text-3xl">Dashboard</h1>
            <p className="mt-1 text-sm text-brand-text/70">
              Read-only operational summary · Refreshes every {REFRESH_MS / 1000}s
              {lastRefreshedAt != null && (
                <span className="block text-xs text-brand-text/55">
                  Last refreshed: {formatDateTime(new Date(lastRefreshedAt))}
                </span>
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 border-brand-red/20"
            onClick={() => void load({ silent: true })}
          >
            Refresh
          </Button>
        </div>
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50/90 p-3 text-sm text-red-900">{loadError}</Card>
      )}

      {loading && !data ? (
        <p className="text-sm text-brand-text/60">Loading dashboard…</p>
      ) : data && data.anyOrdersCount === 0 ? (
        <Card className="border-brand-yellow/35 bg-white p-10 text-center shadow-card">
          <p className="text-brand-text/80">No orders yet. Start the event by creating the first order.</p>
          <Link href="/order/new" className="mt-4 inline-block text-sm font-medium text-brand-red underline">
            New order
          </Link>
        </Card>
      ) : data ? (
        <>
          {showCashWarning && (
            <Card className="border-brand-yellow/60 bg-brand-yellow/15 p-3 text-sm text-brand-text">
              Cash session not open. Set opening cash before processing orders.{" "}
              <Link href="/cash" className="font-medium text-brand-red underline">
                Cash Control
              </Link>
            </Card>
          )}
          {showStockWarning && (
            <Card className="border-brand-yellow/60 bg-brand-yellow/15 p-3 text-sm text-brand-text">
              Opening stock not recorded. Set stock before the event starts.{" "}
              <Link href="/stock" className="font-medium text-brand-red underline">
                Stock
              </Link>
            </Card>
          )}

          {setupDone ? (
            <Card className="border-semantic-success/35 bg-gradient-to-r from-semantic-success/10 to-white p-5 shadow-card">
              <div className="flex flex-wrap items-start gap-3">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-semantic-success text-2xl text-white shadow-sm"
                  aria-hidden
                >
                  ✓
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold text-semantic-success">Event Setup Complete</h2>
                  <p className="mt-1 text-sm text-brand-text/75">
                    Event name, menu, opening stock, and cash session are ready. You can run service with
                    confidence.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="border-brand-yellow/50 bg-white p-5 shadow-card">
              <h2 className="font-display text-lg font-semibold text-brand-text">Event readiness</h2>
              <p className="mt-1 text-xs text-brand-text/60">Complete each item before go-live.</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <ReadinessRow ok={data.readiness.eventNameOk} label="Event name configured" href="/settings" />
                <ReadinessRow ok={data.readiness.activeMenuOk} label="At least one active menu item" href="/menu" />
                <ReadinessRow ok={data.readiness.openingStockOk} label="Opening stock recorded" href="/stock" />
                <ReadinessRow ok={data.readiness.cashSessionOk} label="Cash session open" href="/cash" />
              </ul>
            </Card>
          )}

          <Card className="overflow-hidden border-brand-red/20 bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-brand-text">Net sales vs target</h2>
                <p className="mt-0.5 text-xs text-brand-text/55">Paid orders · goal from Event Settings</p>
              </div>
              {progressPct != null && (
                <span className="rounded-full bg-brand-yellow/35 px-3 py-1 font-mono text-sm font-semibold text-brand-text tabular-nums">
                  {progressPct}%
                </span>
              )}
            </div>

            {data.targetRevenue == null ? (
              <div className="mt-5 rounded-xl border border-dashed border-brand-text/20 bg-brand-bg/80 p-6 text-center">
                <p className="text-sm font-medium text-brand-text">No target revenue set</p>
                <p className="mt-1 text-xs text-brand-text/60">
                  Add a whole-rupiah goal in Settings to track progress here.
                </p>
                <Link
                  href="/settings"
                  className="mt-3 inline-block text-sm font-medium text-brand-red underline"
                >
                  Event Settings
                </Link>
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-brand-text/10 bg-brand-bg/60 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">Net sales</p>
                    <p className="mt-1 font-mono text-2xl font-semibold text-brand-red tabular-nums">
                      {formatRupiah(data.netSales)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-brand-text/10 bg-brand-bg/60 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">Target revenue</p>
                    <p className="mt-1 font-mono text-2xl font-semibold text-brand-text tabular-nums">
                      {formatRupiah(data.targetRevenue)}
                    </p>
                  </div>
                </div>
                <div className="mt-5">
                  <div className="h-4 w-full overflow-hidden rounded-full bg-brand-text/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-red to-brand-red/85 transition-[width] duration-500"
                      style={{ width: `${progressPct ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-brand-text/55">
                    {progressPct != null && progressPct >= 100
                      ? "Target reached or exceeded on net sales."
                      : "Progress is net sales divided by target revenue, capped at 100%."}
                  </p>
                </div>
              </>
            )}
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-brand-yellow/45 bg-gradient-to-br from-brand-yellow/15 to-white p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">Net sales</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-brand-yellow tabular-nums">
                {formatRupiah(data.netSales)}
              </p>
            </Card>
            <Card className="border-brand-text/10 p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">Total orders</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-brand-text tabular-nums">
                {data.totalPaidOrders}
              </p>
              <p className="mt-1 text-xs text-brand-text/55">Paid orders only</p>
            </Card>
            <Card className="border-brand-text/10 p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">AOV</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-brand-text tabular-nums">
                {data.totalPaidOrders > 0 ? formatRupiah(Math.round(data.aov)) : "—"}
              </p>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-brand-red/15 p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">Gross sales</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-brand-text">
                {formatRupiah(data.grossSales)}
              </p>
            </Card>
            <Card className="border-brand-red/15 p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">Discount total</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-brand-text">
                {formatRupiah(data.discountTotal)}
              </p>
            </Card>
          </div>

          <Card className="border-brand-text/10 bg-white p-5 shadow-card">
            <h2 className="font-display text-lg font-semibold text-brand-text">Top selling menu</h2>
            <p className="mt-0.5 text-xs text-brand-text/55">Units sold on paid orders · top 5</p>
            {data.topSelling.length === 0 ? (
              <p className="mt-4 text-sm text-brand-text/60">No line items yet.</p>
            ) : (
              <ol className="mt-5 space-y-4">
                {data.topSelling.map((row, i) => {
                  const pct = Math.round((row.units / topMaxUnits) * 100);
                  return (
                    <li key={row.menu_item_id} className="flex gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-red text-sm font-bold text-white shadow-sm">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="truncate font-medium text-brand-text">{row.item_name}</p>
                          <p className="shrink-0 font-mono text-sm text-brand-text/70 tabular-nums">
                            {row.units} sold
                          </p>
                        </div>
                        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-brand-text/10">
                          <div
                            className="h-full rounded-full bg-brand-yellow/90"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function ReadinessRow({ ok, label, href }: { ok: boolean; label: string; href: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <span className="text-semantic-success" aria-label="OK">
          ✓
        </span>
      ) : (
        <span className="text-brand-yellow" aria-label="Needs attention">
          ⚠
        </span>
      )}
      <span className="flex-1">
        <span className={ok ? "text-brand-text" : "text-brand-text/85"}>{label}</span>
        {!ok && (
          <>
            {" "}
            <Link href={href} className="text-xs font-medium text-brand-red underline">
              Fix
            </Link>
          </>
        )}
      </span>
    </li>
  );
}
