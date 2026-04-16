"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th } from "@/components/ui/Table";
import { formatDateTime, formatQueueNumber, formatRupiah } from "@/lib/format";
import { ledgerEntryTypeLabel } from "@/lib/ledgerLabels";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type LedgerRow = {
  id: string;
  created_at: string;
  entry_type: string;
  direction: "in" | "out";
  amount: number;
  notes: string | null;
  order_id: string | null;
  queue_number: number | null;
};

type PayMethod = "cash" | "qris" | "transfer";

/** Filter + row grouping: cash | qris | transfer | unassigned (table shows "—"). */
type Channel = "cash" | "qris" | "transfer" | "unassigned";

type ChannelFilter = "all" | "cash" | "qris" | "transfer";

type OrderMoneyContext = {
  initialMethod: PayMethod | null;
  settlements: { created_at: string; method: PayMethod }[];
};

const NOTE_PREVIEW = 56;

function parseMethod(m: string | null | undefined): PayMethod | null {
  if (m === "cash" || m === "qris" || m === "transfer") return m;
  return null;
}

function inferMethodFromOrder(
  ctx: OrderMoneyContext | undefined,
  ledgerCreatedAt: string
): PayMethod | null {
  if (!ctx) return null;
  const tLedger = new Date(ledgerCreatedAt).getTime();
  const before = ctx.settlements.filter((s) => new Date(s.created_at).getTime() <= tLedger);
  if (before.length > 0) {
    const latest = [...before].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
    return latest.method;
  }
  return ctx.initialMethod;
}

function deriveChannel(row: LedgerRow, ctxByOrder: Record<string, OrderMoneyContext>): Channel {
  const et = row.entry_type;
  if (
    et === "payment_cash" ||
    et === "settlement_cash" ||
    et === "refund_cash" ||
    et === "cash_sale" ||
    et === "opening_cash" ||
    et === "cash_refill"
  ) {
    return "cash";
  }
  if (et === "payment_qris" || et === "settlement_qris") return "qris";
  if (et === "payment_transfer" || et === "settlement_transfer") return "transfer";
  if (et === "adjustment" || et === "refund") {
    const ctx = row.order_id ? ctxByOrder[row.order_id] : undefined;
    const m = inferMethodFromOrder(ctx, row.created_at);
    if (m === "cash") return "cash";
    if (m === "qris") return "qris";
    if (m === "transfer") return "transfer";
    return "unassigned";
  }
  return "unassigned";
}

function channelColumnLabel(ch: Channel): string {
  if (ch === "unassigned") return "—";
  if (ch === "cash") return "Cash";
  if (ch === "qris") return "QRIS";
  return "Transfer";
}

function filterShowingLabel(f: ChannelFilter): string {
  if (f === "all") return "All";
  if (f === "cash") return "Cash";
  if (f === "qris") return "QRIS";
  return "Transfer";
}

function rowMatchesChannelFilter(ch: Channel, f: ChannelFilter): boolean {
  if (f === "all") return true;
  return ch === f;
}

type TotalsThree = { in: number; out: number; balance: number };

function emptyTotals(): TotalsThree {
  return { in: 0, out: 0, balance: 0 };
}

function addSigned(t: TotalsThree, direction: "in" | "out", amount: number) {
  if (direction === "in") t.in += amount;
  else t.out += amount;
  t.balance = t.in - t.out;
}

const FILTER_OPTIONS: { key: ChannelFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cash", label: "Cash" },
  { key: "qris", label: "QRIS" },
  { key: "transfer", label: "Transfer" },
];

export function LedgerPageClient() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [orderContext, setOrderContext] = useState<Record<string, OrderMoneyContext>>({});
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, created_at, entry_type, direction, amount, notes, order_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rawRows = (data ?? []) as Record<string, unknown>[];
      const orderIds = [
        ...new Set(
          rawRows
            .map((r) => r.order_id as string | null)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        ),
      ];
      const queueByOrderId: Record<string, number> = {};
      if (orderIds.length > 0) {
        const { data: ordData, error: ordErr } = await supabase
          .from("orders")
          .select("id, queue_number")
          .in("id", orderIds);
        if (ordErr) throw ordErr;
        for (const o of ordData ?? []) {
          queueByOrderId[o.id as string] = Number(o.queue_number);
        }
      }

      const contextOrderIds = new Set<string>();
      for (const r of rawRows) {
        const et = r.entry_type as string;
        const oid = r.order_id as string | null;
        if (oid && (et === "adjustment" || et === "refund")) contextOrderIds.add(oid);
      }
      const ctxMap: Record<string, OrderMoneyContext> = {};
      if (contextOrderIds.size > 0) {
        const cids = [...contextOrderIds];
        const { data: pays, error: pErr } = await supabase
          .from("payments")
          .select("order_id, method")
          .in("order_id", cids);
        if (pErr) throw pErr;
        const { data: sets, error: sErr } = await supabase
          .from("settlements")
          .select("order_id, method, created_at")
          .in("order_id", cids)
          .order("created_at", { ascending: true });
        if (sErr) throw sErr;
        for (const oid of cids) {
          ctxMap[oid] = { initialMethod: null, settlements: [] };
        }
        for (const p of pays ?? []) {
          const oid = p.order_id as string;
          if (!ctxMap[oid]) ctxMap[oid] = { initialMethod: null, settlements: [] };
          ctxMap[oid].initialMethod = parseMethod(p.method as string);
        }
        for (const s of sets ?? []) {
          const oid = s.order_id as string;
          const m = parseMethod(s.method as string);
          if (!m) continue;
          if (!ctxMap[oid]) ctxMap[oid] = { initialMethod: null, settlements: [] };
          ctxMap[oid].settlements.push({
            created_at: s.created_at as string,
            method: m,
          });
        }
      }
      setOrderContext(ctxMap);

      setRows(
        rawRows.map((rec) => {
          const oid = (rec.order_id as string | null) ?? null;
          return {
            id: rec.id as string,
            created_at: rec.created_at as string,
            entry_type: rec.entry_type as string,
            direction: rec.direction as "in" | "out",
            amount: Number(rec.amount),
            notes: (rec.notes as string | null) ?? null,
            order_id: oid,
            queue_number: oid ? queueByOrderId[oid] ?? null : null,
          };
        })
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rowsWithChannel = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        channel: deriveChannel(r, orderContext),
      })),
    [rows, orderContext]
  );

  const filteredRows = useMemo(
    () => rowsWithChannel.filter((r) => rowMatchesChannelFilter(r.channel, channelFilter)),
    [rowsWithChannel, channelFilter]
  );

  /** In / Out / Balance for the selected channel (non-All filters). */
  const selectedChannelTotals = useMemo(() => {
    const t = emptyTotals();
    for (const r of filteredRows) {
      addSigned(t, r.direction, r.amount);
    }
    return t;
  }, [filteredRows]);

  /** Four KPIs when filter = All (always from full ledger, not filtered). */
  const allFilterKpis = useMemo(() => {
    const full = rowsWithChannel;
    let cashReceived = 0;
    let qrisNet = 0;
    let transferNet = 0;
    let cashInHand = 0;

    for (const r of full) {
      const et = r.entry_type;
      const amt = r.amount;
      const isIn = r.direction === "in";
      const signed = isIn ? amt : -amt;

      if (isIn && (et === "payment_cash" || et === "settlement_cash" || et === "cash_sale")) {
        cashReceived += amt;
      }

      if (r.channel === "qris") {
        qrisNet += signed;
      }
      if (r.channel === "transfer") {
        transferNet += signed;
      }
      if (r.channel === "cash") {
        cashInHand += signed;
      }
    }

    return {
      cashReceived,
      qrisReceivable: qrisNet,
      transferReceivable: transferNet,
      cashInHand,
    };
  }, [rowsWithChannel]);

  function toggleNote(id: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          eyebrow="Money"
          title="Ledger"
          description="Operational money log · Newest first · WIB (Asia/Jakarta)"
        />
        <SupabaseSetupBanner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <PageHeader
        eyebrow="Money"
        title="Ledger"
        description="Operational money log · Newest first · WIB (Asia/Jakarta)"
        actions={
          <Button type="button" variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        }
      />
      <p className="-mt-2 max-w-2xl text-xs leading-relaxed text-brand-text/55">
        <span className="font-semibold text-brand-text/70">Channel</span> groups customer and physical cash flows.
        Adjustments and generic <span className="font-sans tabular-nums">refund</span> rows use the latest settlement method on
        the same order before the ledger time, otherwise the initial payment method. If that cannot be resolved, the
        channel shows &quot;—&quot; and the row only appears under All only.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-brand-text">
          Showing:{" "}
          <span className="font-sans tabular-nums text-brand-red">{filterShowingLabel(channelFilter)}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              variant={channelFilter === key ? "primary" : "secondary"}
              className="px-3 py-1.5 text-xs"
              onClick={() => setChannelFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50/80 p-3 text-sm text-red-800">{loadError}</Card>
      )}

      {!loading && channelFilter === "all" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">
              Cash received
            </p>
            <p className="mt-1 font-display text-2xl font-normal text-brand-green tabular-nums tracking-wide">
              {formatRupiah(allFilterKpis.cashReceived)}
            </p>
            <p className="mt-1 text-xs text-brand-text/55">
              Gross cash in: payment / settlement / sale (IN only; excludes opening, refill, refunds,
              adjustments)
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">
              QRIS receivable
            </p>
            <p
              className={`mt-1 font-display text-2xl font-normal tabular-nums tracking-wide ${
                allFilterKpis.qrisReceivable >= 0 ? "text-brand-green" : "text-brand-red"
              }`}
            >
              {formatRupiah(allFilterKpis.qrisReceivable)}
            </p>
            <p className="mt-1 text-xs text-brand-text/55">Net QRIS (in − out, channel QRIS)</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">
              Transfer receivable
            </p>
            <p
              className={`mt-1 font-display text-2xl font-normal tabular-nums tracking-wide ${
                allFilterKpis.transferReceivable >= 0 ? "text-brand-green" : "text-brand-red"
              }`}
            >
              {formatRupiah(allFilterKpis.transferReceivable)}
            </p>
            <p className="mt-1 text-xs text-brand-text/55">Net transfer (in − out, channel Transfer)</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">
              Cash in hand
            </p>
            <p
              className={`mt-1 font-display text-2xl font-normal tabular-nums tracking-wide ${
                allFilterKpis.cashInHand >= 0 ? "text-brand-green" : "text-brand-red"
              }`}
            >
              {formatRupiah(allFilterKpis.cashInHand)}
            </p>
            <p className="mt-1 text-xs text-brand-text/55">Physical drawer (net)</p>
          </Card>
        </div>
      )}

      {!loading && channelFilter !== "all" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">In</p>
            <p className="mt-1 font-display text-2xl font-normal text-brand-green tabular-nums tracking-wide">
              {formatRupiah(selectedChannelTotals.in)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">Out</p>
            <p className="mt-1 font-display text-2xl font-normal text-brand-red tabular-nums tracking-wide">
              {formatRupiah(selectedChannelTotals.out)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">Balance</p>
            <p
              className={`mt-1 font-display text-2xl font-normal tabular-nums tracking-wide ${
                selectedChannelTotals.balance >= 0 ? "text-brand-green" : "text-brand-red"
              }`}
            >
              {formatRupiah(selectedChannelTotals.balance)}
            </p>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="space-y-3 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-full animate-pulse rounded-lg bg-brand-text/8" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-brand-text/70">
          No ledger entries yet. Cash, stock, and order activity will appear here as the event runs.
        </Card>
      ) : filteredRows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-brand-text/70">
          No ledger entries for this filter.{" "}
          <button
            type="button"
            className="font-medium text-brand-red underline"
            onClick={() => setChannelFilter("all")}
          >
            Show all
          </button>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-brand-text/10 bg-white shadow-card">
          <div className="max-h-[min(70vh,720px)] overflow-y-auto">
            <table className="min-w-full divide-y divide-brand-text/10 text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-brand-text/10 bg-brand-bg/95 backdrop-blur">
                <tr>
                  <Th className="bg-brand-bg/95">Time</Th>
                  <Th className="bg-brand-bg/95">Type</Th>
                  <Th className="bg-brand-bg/95">Channel</Th>
                  <Th className="bg-brand-bg/95">Direction</Th>
                  <Th className="bg-brand-bg/95 text-right">Amount</Th>
                  <Th className="bg-brand-bg/95">Queue</Th>
                  <Th className="bg-brand-bg/95">Notes</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-text/5">
                {filteredRows.map((r) => {
                  const note = r.notes?.trim() ?? "";
                  const expanded = expandedNotes.has(r.id);
                  const showExpand = note.length > NOTE_PREVIEW;
                  const displayNote =
                    !showExpand || expanded ? note : `${note.slice(0, NOTE_PREVIEW)}…`;
                  return (
                    <tr key={r.id} className="hover:bg-brand-bg/40">
                      <Td className="whitespace-nowrap font-sans tabular-nums text-xs text-brand-text/80">
                        {formatDateTime(r.created_at)}
                      </Td>
                      <Td className="text-brand-text">{ledgerEntryTypeLabel(r.entry_type)}</Td>
                      <Td className="whitespace-nowrap text-sm text-brand-text/90">
                        {channelColumnLabel(r.channel)}
                      </Td>
                      <Td>
                        {r.direction === "in" ? (
                          <Badge tone="success">IN</Badge>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                            OUT
                          </span>
                        )}
                      </Td>
                      <Td className="text-right font-sans tabular-nums text-sm font-medium tabular-nums">
                        {formatRupiah(r.amount)}
                      </Td>
                      <Td>
                        {r.queue_number != null ? (
                          <span className="inline-block rounded-md bg-brand-red/10 px-2 py-0.5 font-sans tabular-nums text-xs font-semibold text-brand-red">
                            #{formatQueueNumber(r.queue_number)}
                          </span>
                        ) : (
                          <span className="text-brand-text/40">—</span>
                        )}
                      </Td>
                      <Td className="max-w-[240px] text-xs text-brand-text/80">
                        <span className="break-words">{displayNote || "—"}</span>
                        {showExpand && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="ml-1 inline h-auto px-1 py-0 align-baseline text-xs underline"
                            onClick={() => toggleNote(r.id)}
                          >
                            {expanded ? "Less" : "More"}
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
