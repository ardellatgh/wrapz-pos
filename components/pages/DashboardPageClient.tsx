"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
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
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          eyebrow="Live board"
          title="Dashboard"
          description="Read-only operational summary for the active event."
        />
        <SupabaseSetupBanner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Live board"
        title="Dashboard"
        description={
          <>
            Read-only operational summary · Refreshes every {REFRESH_MS / 1000}s
            {lastRefreshedAt != null && (
              <span className="mt-1 block text-xs text-brand-text/50">
                Last refreshed: {formatDateTime(new Date(lastRefreshedAt))}
              </span>
            )}
          </>
        }
        actions={
          <>
            {data && setupDone && (
              <div
                className="inline-flex items-center gap-2 self-start rounded-full border border-brand-green/35 bg-brand-green/10 px-2.5 py-1.5 text-[11px] font-semibold text-brand-green sm:self-end"
                role="status"
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-green text-[10px] text-white"
                  aria-hidden
                >
                  ✓
                </span>
                <span className="max-w-[10rem] leading-tight">Setup OK</span>
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 border-brand-red/20"
              onClick={() => void load({ silent: true })}
            >
              Refresh
            </Button>
          </>
        }
      />

      {loadError && (
        <Card className="border-red-200 bg-red-50/90 p-3 text-sm text-red-900">{loadError}</Card>
      )}

      {loading && !data ? (
        <div className="space-y-3 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-full animate-pulse rounded-lg bg-brand-text/8" />
          ))}
        </div>
      ) : data && data.anyOrdersCount === 0 ? (
        <Card className="border-brand-text/10 p-0 text-center">
          <div className="py-12 text-center">
            <p className="font-display text-xl font-normal uppercase tracking-wide text-brand-text/55">No orders yet</p>
            <p className="mt-1 text-sm text-brand-text/45">Start the event by creating the first order.</p>
            <Link
              href="/order/new"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand-red px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-red/90"
            >
              New order →
            </Link>
          </div>
        </Card>
      ) : data ? (
        <>
          {showCashWarning && (
            <Card className="border-brand-yellow/40 bg-brand-yellow-soft p-3 text-sm text-brand-text ring-1 ring-brand-yellow/25">
              Cash session not open. Set opening cash before processing orders.{" "}
              <Link href="/cash" className="font-medium text-brand-red underline">
                Cash Control
              </Link>
            </Card>
          )}
          {showStockWarning && (
            <Card className="border-brand-yellow/40 bg-brand-yellow-soft p-3 text-sm text-brand-text ring-1 ring-brand-yellow/25">
              Opening stock not recorded. Set stock before the event starts.{" "}
              <Link href="/stock" className="font-medium text-brand-red underline">
                Stock
              </Link>
            </Card>
          )}

          {!setupDone ? (
            <Card className="border-brand-yellow/40 bg-brand-yellow-soft/80 p-4 ring-1 ring-brand-yellow/20">
              <h2 className="font-display text-base font-normal uppercase tracking-wide text-brand-text">Event readiness</h2>
              <p className="mt-1 text-xs text-brand-text/60">Complete each item before go-live.</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <ReadinessRow ok={data.readiness.eventNameOk} label="Event name configured" href="/settings" />
                <ReadinessRow ok={data.readiness.activeMenuOk} label="At least one active menu item" href="/menu" />
                <ReadinessRow ok={data.readiness.openingStockOk} label="Opening stock recorded" href="/stock" />
                <ReadinessRow ok={data.readiness.cashSessionOk} label="Cash session open" href="/cash" />
              </ul>
            </Card>
          ) : null}

          <Card className="overflow-hidden border-brand-red/20 bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-text/10 pb-4">
              <div>
                <h2 className="font-display text-base font-normal uppercase tracking-wide text-brand-yellow">
                  Net sales vs target
                </h2>
                <p className="mt-1 text-xs text-brand-text/55">Paid orders · goal from Event Settings</p>
              </div>
              {progressPct != null && (
                <span className="rounded-ref-sm bg-brand-text px-2.5 py-1 font-display text-lg font-normal tabular-nums tracking-wide text-white">
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
                  <div className="rounded-xl border border-brand-red/20 bg-brand-red/[0.04] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-text/45">
                      Net sales
                    </p>
                    <p className="font-display mt-2 text-3xl font-normal tabular-nums tracking-wide text-brand-red">
                      {formatRupiah(data.netSales)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-semantic-info/25 bg-semantic-info/10 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-semantic-info/70">
                      Target revenue
                    </p>
                    <p className="font-display mt-2 text-3xl font-normal tabular-nums tracking-wide text-brand-text">
                      {formatRupiah(data.targetRevenue)}
                    </p>
                  </div>
                </div>
                <div className="mt-6">
                  <div className="h-4 w-full overflow-hidden rounded-full bg-brand-text/10">
                    <div
                      className="h-full rounded-full bg-brand-red transition-[width] duration-500"
                      style={{ width: `${progressPct ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs font-medium text-brand-text/55">
                    {`${progressPct ?? 0}% of target`}
                    {(progressPct ?? 0) >= 100 ? " (met)" : ""}
                  </p>
                </div>
              </>
            )}
          </Card>

          <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-5 md:overflow-visible [&::-webkit-scrollbar]:hidden">
            <KpiTile
              label="Net sales"
              value={formatRupiah(data.netSales)}
              className="border-brand-red/35 bg-brand-red-soft/90"
              labelClassName="text-brand-red/60"
              valueClassName="text-brand-red"
            />
            <KpiTile
              label="Gross sales"
              value={formatRupiah(data.grossSales)}
              className="border-semantic-info/25 bg-semantic-info/8"
              labelClassName="text-semantic-info/55"
              valueClassName="text-semantic-info"
            />
            <KpiTile
              label="Discount total"
              value={formatRupiah(data.discountTotal)}
              className="border-brand-yellow/45 bg-brand-yellow-soft"
              labelClassName="text-brand-text/50"
              valueClassName="text-brand-text"
            />
            <KpiTile
              label="Total orders"
              value={String(data.totalPaidOrders)}
              hint="Paid orders only"
              className="border-brand-text/12 bg-brand-fill/80"
              labelClassName="text-brand-text/45"
              valueClassName="text-brand-text"
            />
            <KpiTile
              label="AOV"
              value={data.totalPaidOrders > 0 ? formatRupiah(Math.round(data.aov)) : "—"}
              className="border-brand-green/30 bg-brand-green/10"
              labelClassName="text-brand-green/60"
              valueClassName="text-brand-green"
            />
          </div>

          <Card className="border-brand-text/10 bg-white p-5">
            <h2 className="font-display text-base font-normal uppercase tracking-wide text-brand-yellow">Top selling menu</h2>
            <p className="mt-0.5 text-xs text-brand-text/55">Units sold on paid orders · top 5</p>
            {data.topSelling.length === 0 ? (
              <p className="mt-4 text-sm text-brand-text/60">No line items yet.</p>
            ) : (
              <ol className="mt-5 space-y-4">
                {data.topSelling.map((row, i) => {
                  const pct = Math.round((row.units / topMaxUnits) * 100);
                  return (
                    <li key={row.menu_item_id} className="flex gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ref-sm border border-brand-text/12 bg-brand-fill font-display text-base font-normal text-brand-text">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="truncate font-medium text-brand-text">{row.item_name}</p>
                          <p className="shrink-0 font-display text-lg font-normal tabular-nums tracking-wide text-brand-text/70">
                            {row.units} sold
                          </p>
                        </div>
                        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-brand-text/10">
                          <div
                            className="h-full rounded-full bg-brand-yellow"
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

function KpiTile({
  label,
  value,
  hint,
  className = "",
  labelClassName = "text-brand-text/50",
  valueClassName = "text-brand-text",
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}) {
  return (
    <Card className={`min-w-[132px] flex-1 p-4 md:min-w-0 ${className}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${labelClassName}`}>{label}</p>
      <p
        className={`font-display mt-2 text-[1.65rem] font-normal tabular-nums leading-none tracking-wide md:text-[1.85rem] ${valueClassName}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[11px] text-brand-text/50">{hint}</p> : null}
    </Card>
  );
}

function ReadinessRow({ ok, label, href }: { ok: boolean; label: string; href: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-green/18 text-xs font-bold text-brand-green"
          aria-label="OK"
        >
          ✓
        </span>
      ) : (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-yellow-soft text-xs font-bold text-brand-text"
          aria-label="Needs attention"
        >
          !
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
