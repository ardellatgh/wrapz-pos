"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { EVENT_SETTINGS_ROW_ID } from "@/lib/constants";
import { formatDateTime, formatRupiah } from "@/lib/format";
import {
  defaultDashboardPlanningBlueprint,
  loadJson,
  type DashboardPlanningBlueprint,
  saveJson,
} from "@/lib/eventOpsBlueprint";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

const DASH_PLAN_KEY = "dashboard_planning_v1";

const REFRESH_MS = 60_000;

type PaidAggRow = {
  id: string;
  subtotal: number;
  combo_savings_amount: number;
  discount_amount: number;
  total_amount: number;
};

/** PostgREST caps rows per request (default 1000); paginate to aggregate all paid orders. */
async function fetchAllPaidOrdersForAgg(
  supabase: ReturnType<typeof getSupabaseBrowserClient>
): Promise<PaidAggRow[]> {
  const pageSize = 1000;
  let from = 0;
  const all: PaidAggRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, subtotal, combo_savings_amount, discount_amount, total_amount")
      .eq("payment_status", "paid")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data ?? [];
    for (const r of chunk) {
      all.push({
        id: r.id as string,
        subtotal: Number(r.subtotal),
        combo_savings_amount:
          r.combo_savings_amount != null ? Number(r.combo_savings_amount) : 0,
        discount_amount: Number(r.discount_amount),
        total_amount: Number(r.total_amount),
      });
    }
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchPaymentsForOrderIds(
  supabase: ReturnType<typeof getSupabaseBrowserClient>,
  orderIds: string[]
): Promise<{ order_id: string; method: string; amount_tendered: number }[]> {
  if (orderIds.length === 0) return [];
  const out: { order_id: string; method: string; amount_tendered: number }[] = [];
  for (const part of chunkIds(orderIds, 400)) {
    const { data, error } = await supabase
      .from("payments")
      .select("order_id, method, amount_tendered")
      .in("order_id", part);
    if (error) throw error;
    for (const r of data ?? []) {
      out.push({
        order_id: r.order_id as string,
        method: r.method as string,
        amount_tendered: Number(r.amount_tendered),
      });
    }
  }
  return out;
}

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

type ChannelKey = "cash" | "qris" | "transfer";

type DashboardData = {
  anyOrdersCount: number;
  /** Sum of list-priced subtotals (before combo savings and discount). */
  grossSales: number;
  comboSavingsTotal: number;
  discountTotal: number;
  /** Sum of final total_amount (after combo savings and discount). */
  netSales: number;
  totalPaidOrders: number;
  aov: number;
  targetRevenue: number | null;
  topSelling: TopSeller[];
  readiness: Readiness;
  /** Net tendered by channel (initial payment row per paid order). */
  collected: Record<ChannelKey, number>;
  /** Sum of order total_amount attributed to each payment channel. */
  receivableByChannel: Record<ChannelKey, number>;
  /** actual − receivable per channel (tendered vs order net for orders using that channel). */
  varianceByChannel: Record<ChannelKey, number>;
  totalNetCollected: number;
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

      const [anyOrdersRes, eventRes, menuActiveRes, openingStockRes, cashOpenRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
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
      if (eventRes.error) throw eventRes.error;
      if (menuActiveRes.error) throw menuActiveRes.error;
      if (openingStockRes.error) throw openingStockRes.error;
      if (cashOpenRes.error) throw cashOpenRes.error;

      const anyOrdersCount = anyOrdersRes.count ?? 0;
      const paidRows = await fetchAllPaidOrdersForAgg(supabase);
      const paidIds = paidRows.map((r) => r.id);

      let grossSales = 0;
      let comboSavingsTotal = 0;
      let discountTotal = 0;
      let netSales = 0;
      for (const r of paidRows) {
        grossSales += r.subtotal;
        comboSavingsTotal += r.combo_savings_amount;
        discountTotal += r.discount_amount;
        netSales += r.total_amount;
      }
      const totalPaidOrders = paidRows.length;
      const aov = totalPaidOrders > 0 ? netSales / totalPaidOrders : 0;

      const payments = await fetchPaymentsForOrderIds(supabase, paidIds);
      const paidById = new Map(paidRows.map((r) => [r.id, r]));
      const zeroChannel = (): Record<ChannelKey, number> => ({
        cash: 0,
        qris: 0,
        transfer: 0,
      });
      const collected = zeroChannel();
      const receivableByChannel = zeroChannel();
      for (const p of payments) {
        const ch = p.method as ChannelKey;
        if (ch !== "cash" && ch !== "qris" && ch !== "transfer") continue;
        collected[ch] += p.amount_tendered;
        const ord = paidById.get(p.order_id);
        if (ord) receivableByChannel[ch] += ord.total_amount;
      }
      const varianceByChannel = zeroChannel();
      (["cash", "qris", "transfer"] as const).forEach((k) => {
        varianceByChannel[k] = collected[k] - receivableByChannel[k];
      });
      const totalNetCollected = collected.cash + collected.qris + collected.transfer;

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
        comboSavingsTotal,
        discountTotal,
        netSales,
        totalPaidOrders,
        aov,
        targetRevenue,
        topSelling,
        readiness,
        collected,
        receivableByChannel,
        varianceByChannel,
        totalNetCollected,
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

          <Card className="border-brand-text/10 bg-brand-fill/40 p-4 text-sm leading-relaxed text-brand-text/85">
            <h2 className="font-display text-xs font-normal uppercase tracking-wide text-brand-yellow">Sales definitions (paid orders)</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
              <li>
                <strong>Gross sales</strong> — sum of line list subtotals (<code className="rounded bg-white px-1">orders.subtotal</code>
                ) before combo savings and discounts.
              </li>
              <li>
                <strong>Net sales</strong> — sum of final order totals (
                <code className="rounded bg-white px-1">orders.total_amount</code>) after combo savings and discounts.
              </li>
              <li>
                Identity: <strong>Net sales ≈ Gross sales − Combo savings − Discount total</strong> (minor rounding possible).
              </li>
            </ul>
          </Card>

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

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
              label="Combo savings"
              value={formatRupiah(data.comboSavingsTotal)}
              className="border-brand-yellow/45 bg-brand-yellow-soft"
              labelClassName="text-brand-text/50"
              valueClassName="text-brand-text"
            />
            <KpiTile
              label="Discount total"
              value={formatRupiah(data.discountTotal)}
              className="border-brand-yellow/35 bg-brand-yellow-soft/70"
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
              label="AOV (net)"
              value={data.totalPaidOrders > 0 ? formatRupiah(Math.round(data.aov)) : "—"}
              hint="Net sales ÷ paid orders"
              className="border-brand-green/30 bg-brand-green/10"
              labelClassName="text-brand-green/60"
              valueClassName="text-brand-green"
            />
          </div>

          <Card className="border-brand-text/10 bg-white p-5">
            <h2 className="font-display text-base font-normal uppercase tracking-wide text-brand-yellow">
              Net collected by channel
            </h2>
            <p className="mt-1 text-xs text-brand-text/55">
              Initial payment tender per channel on paid orders. Receivable = order net total attributed to that channel;
              variance = tendered − receivable (overpay shows positive).
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile
                label="Cash net collected"
                value={formatRupiah(data.collected.cash)}
                className="border-brand-text/12 bg-brand-fill/70"
              />
              <KpiTile
                label="QRIS net collected"
                value={formatRupiah(data.collected.qris)}
                className="border-brand-text/12 bg-brand-fill/70"
              />
              <KpiTile
                label="Transfer net collected"
                value={formatRupiah(data.collected.transfer)}
                className="border-brand-text/12 bg-brand-fill/70"
              />
              <KpiTile
                label="Total net collected"
                value={formatRupiah(data.totalNetCollected)}
                hint="Cash + QRIS + transfer tender"
                className="border-brand-green/25 bg-brand-green/12"
                labelClassName="text-brand-green/70"
                valueClassName="text-brand-green"
              />
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="border-b border-brand-text/10 text-brand-text/55">
                    <th className="py-2 pr-3 font-semibold">Channel</th>
                    <th className="py-2 pr-3 font-semibold text-right">Receivable (net)</th>
                    <th className="py-2 pr-3 font-semibold text-right">Actual tender</th>
                    <th className="py-2 font-semibold text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-brand-text">
                  {(["cash", "qris", "transfer"] as const).map((ch) => (
                    <tr key={ch} className="border-b border-brand-text/5">
                      <td className="py-2 capitalize">{ch}</td>
                      <td className="py-2 text-right">{formatRupiah(data.receivableByChannel[ch])}</td>
                      <td className="py-2 text-right">{formatRupiah(data.collected[ch])}</td>
                      <td className="py-2 text-right font-medium">{formatRupiah(data.varianceByChannel[ch])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <DashboardPlanningSection />

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

function DashboardPlanningSection() {
  const { showToast } = useToast();
  const [plan, setPlan] = useState<DashboardPlanningBlueprint>(defaultDashboardPlanningBlueprint());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPlan(loadJson(DASH_PLAN_KEY, defaultDashboardPlanningBlueprint()));
    setHydrated(true);
  }, []);

  const save = () => {
    saveJson(DASH_PLAN_KEY, plan);
    showToast("Planning notes saved locally.");
  };

  if (!hydrated) return null;

  return (
    <Card className="border-dashed border-brand-yellow/40 bg-brand-yellow-soft/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-normal uppercase tracking-wide text-brand-yellow">
            Future dashboard metrics (planning)
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-brand-text/60">
            No fabricated live analytics — edit operational notes for what we intend to surface next (targets vs actual,
            GMV leaders, cost/GP when engines exist). Stored only in{" "}
            <code className="rounded bg-white px-1">localStorage</code>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/planning/event-ops"
            className="inline-flex min-h-10 items-center justify-center rounded-ref-sm border border-brand-text/12 bg-white px-4 py-2 text-xs font-semibold text-brand-text shadow-card transition hover:bg-brand-fill"
          >
            Planning hub
          </Link>
          <Button type="button" className="text-xs" onClick={save}>
            Save notes
          </Button>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-brand-text/70">Future metrics overview</label>
        <textarea
          className="min-h-[72px] w-full rounded-ref-sm border border-brand-text/12 bg-white px-2 py-2 text-sm"
          value={plan.futureMetricsNotes}
          onChange={(e) => setPlan((p) => ({ ...p, futureMetricsNotes: e.target.value }))}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-brand-text/70">Target vs actual by menu</label>
            <textarea
              className="mt-1 min-h-[56px] w-full rounded-ref-sm border border-brand-text/12 bg-white px-2 py-1.5 text-xs"
              value={plan.targetVsActualMenuNote}
              onChange={(e) => setPlan((p) => ({ ...p, targetVsActualMenuNote: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium text-brand-text/70">Future food/packaging cost comparison</label>
              <textarea
                className="mt-1 min-h-[40px] w-full rounded-ref-sm border border-brand-text/12 bg-white px-2 py-1.5 text-xs"
                value={plan.futureFoodPackagingCostNote}
                onChange={(e) => setPlan((p) => ({ ...p, futureFoodPackagingCostNote: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-brand-text/70">Future GP visibility</label>
              <textarea
                className="mt-1 min-h-[40px] w-full rounded-ref-sm border border-brand-text/12 bg-white px-2 py-1.5 text-xs"
                value={plan.futureGpVisibilityNote}
                onChange={(e) => setPlan((p) => ({ ...p, futureGpVisibilityNote: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <p className="text-[11px] text-brand-text/50">
          Recommended future tiles (no live data yet): target vs actual by SKU, top 3 GMV, top 3 portions, revenue by
          product, combo savings roll-up, low-stock blockers, closing variance highlights — detail in the planning hub.
        </p>
      </div>
    </Card>
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
