"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, Td, Th } from "@/components/ui/Table";
import { formatDateTime, formatQueueNumber, formatRupiah } from "@/lib/format";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type OrderRow = {
  id: string;
  queue_number: number;
  customer_name: string | null;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_status: string;
  payment_notes: string | null;
  settlement_notes: string | null;
  created_at: string;
};

type ItemRow = {
  order_id: string;
  item_name: string;
  quantity: number;
  item_price: number;
  line_total: number;
};

type PaymentRow = {
  order_id: string;
  method: string;
  amount_tendered: number;
  is_exact: boolean;
  created_at: string;
};

type SettlementRow = {
  order_id: string;
  method: string;
  settlement_type: string;
  amount: number;
  is_adjustment: boolean;
  adjustment_amount: number | null;
  notes: string | null;
  created_at: string;
};

function methodLabel(m: string): string {
  if (m === "cash") return "Cash";
  if (m === "qris") return "QRIS";
  if (m === "transfer") return "Transfer";
  return m;
}

function methodChain(payment: PaymentRow | null, settlements: SettlementRow[]): string {
  const seq: string[] = [];
  if (payment) seq.push(methodLabel(payment.method));
  for (const s of settlements) {
    const lab = methodLabel(s.method);
    if (seq.length === 0) seq.push(lab);
    else if (seq[seq.length - 1] !== lab) seq.push(lab);
  }
  if (seq.length === 0) return "—";
  if (seq.length === 1) return seq[0];
  return seq.join(" → ");
}

function settlementStatusText(
  order: OrderRow,
  payment: PaymentRow | null,
  settlements: SettlementRow[]
): string {
  if (order.payment_status === "pending") return "Pending";
  if (order.payment_status === "partially_paid") {
    return settlements.length > 0 ? "Partially settled" : "Awaiting settlement";
  }
  if (order.payment_status === "paid") {
    const hasAdj = settlements.some((s) => s.is_adjustment);
    const over =
      payment != null && Math.round(payment.amount_tendered) > Math.round(order.total_amount);
    if (hasAdj && over) return "Overpaid (adjusted)";
    if (hasAdj) return "Settled (adjusted)";
    return settlements.length > 0 ? "Settled" : "Settled";
  }
  return "—";
}

function compactItems(items: ItemRow[], maxLen = 72): string {
  const s = items.map((i) => `${i.item_name} ×${i.quantity}`).join(", ");
  if (s.length <= maxLen) return s || "—";
  return `${s.slice(0, maxLen - 1)}…`;
}

export function TransactionsPageClient() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, ItemRow[]>>({});
  const [paymentByOrder, setPaymentByOrder] = useState<Record<string, PaymentRow>>({});
  const [settlementsByOrder, setSettlementsByOrder] = useState<Record<string, SettlementRow[]>>(
    {}
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: ordData, error: oErr } = await supabase
        .from("orders")
        .select(
          "id, queue_number, customer_name, subtotal, discount_amount, total_amount, payment_status, payment_notes, settlement_notes, created_at"
        )
        .order("created_at", { ascending: false });
      if (oErr) throw oErr;
      const ordRows: OrderRow[] = (ordData ?? []).map((r) => ({
        id: r.id as string,
        queue_number: Number(r.queue_number),
        customer_name: (r.customer_name as string | null) ?? null,
        subtotal: Number(r.subtotal),
        discount_amount: Number(r.discount_amount),
        total_amount: Number(r.total_amount),
        payment_status: r.payment_status as string,
        payment_notes: (r.payment_notes as string | null) ?? null,
        settlement_notes: (r.settlement_notes as string | null) ?? null,
        created_at: r.created_at as string,
      }));
      setOrders(ordRows);
      const ids = ordRows.map((o) => o.id);
      if (ids.length === 0) {
        setItemsByOrder({});
        setPaymentByOrder({});
        setSettlementsByOrder({});
        return;
      }

      const { data: items, error: iErr } = await supabase
        .from("order_items")
        .select("order_id, item_name, quantity, item_price, line_total")
        .in("order_id", ids);
      if (iErr) throw iErr;
      const ib: Record<string, ItemRow[]> = {};
      for (const r of items ?? []) {
        const oid = r.order_id as string;
        const row: ItemRow = {
          order_id: oid,
          item_name: r.item_name as string,
          quantity: Number(r.quantity),
          item_price: Number(r.item_price),
          line_total: Number(r.line_total),
        };
        ib[oid] = ib[oid] ? [...ib[oid], row] : [row];
      }
      setItemsByOrder(ib);

      const { data: pays, error: pErr } = await supabase
        .from("payments")
        .select("order_id, method, amount_tendered, is_exact, created_at")
        .in("order_id", ids);
      if (pErr) throw pErr;
      const pb: Record<string, PaymentRow> = {};
      for (const r of pays ?? []) {
        pb[r.order_id as string] = {
          order_id: r.order_id as string,
          method: r.method as string,
          amount_tendered: Number(r.amount_tendered),
          is_exact: Boolean(r.is_exact),
          created_at: r.created_at as string,
        };
      }
      setPaymentByOrder(pb);

      const { data: sets, error: sErr } = await supabase
        .from("settlements")
        .select(
          "order_id, method, settlement_type, amount, is_adjustment, adjustment_amount, notes, created_at"
        )
        .in("order_id", ids)
        .order("created_at", { ascending: true });
      if (sErr) throw sErr;
      const sb: Record<string, SettlementRow[]> = {};
      for (const r of sets ?? []) {
        const oid = r.order_id as string;
        const row: SettlementRow = {
          order_id: oid,
          method: r.method as string,
          settlement_type: r.settlement_type as string,
          amount: Number(r.amount),
          is_adjustment: Boolean(r.is_adjustment),
          adjustment_amount:
            r.adjustment_amount == null ? null : Number(r.adjustment_amount),
          notes: (r.notes as string | null) ?? null,
          created_at: r.created_at as string,
        };
        sb[oid] = sb[oid] ? [...sb[oid], row] : [row];
      }
      setSettlementsByOrder(sb);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasNotes = useCallback((o: OrderRow) => {
    return !!(o.payment_notes?.trim() || o.settlement_notes?.trim());
  }, []);

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-2xl font-semibold text-brand-text">Transactions</h1>
        <SupabaseSetupBanner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-brand-text">Transactions</h1>
          <p className="mt-1 text-sm text-brand-text/70">
            Read-only order log · Times in WIB (Asia/Jakarta)
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50/80 p-3 text-sm text-red-800">{loadError}</Card>
      )}

      {loading ? (
        <p className="text-sm text-brand-text/60">Loading…</p>
      ) : orders.length === 0 ? (
        <Card className="p-8 text-center text-sm text-brand-text/70">
          No orders yet. Create the first order from{" "}
          <Link href="/order/new" className="font-medium text-brand-red underline">
            New Order
          </Link>
          .
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-brand-text/10 bg-white shadow-card">
          <div className="max-h-[min(70vh,720px)] overflow-y-auto">
            <table className="min-w-full divide-y divide-brand-text/10 text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-brand-text/10 bg-brand-bg/95 backdrop-blur">
                <tr>
                  <Th className="whitespace-nowrap bg-brand-bg/95">Queue</Th>
                  <Th className="whitespace-nowrap bg-brand-bg/95">Time</Th>
                  <Th className="bg-brand-bg/95">Customer</Th>
                  <Th className="bg-brand-bg/95">Items</Th>
                  <Th className="bg-brand-bg/95 text-right">Subtotal</Th>
                  <Th className="bg-brand-bg/95 text-right">Discount</Th>
                  <Th className="bg-brand-bg/95 text-right">Total</Th>
                  <Th className="bg-brand-bg/95">Method</Th>
                  <Th className="bg-brand-bg/95">Status</Th>
                  <Th className="bg-brand-bg/95">Settlement</Th>
                  <Th className="bg-brand-bg/95">Notes</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-text/5">
                {orders.map((o) => {
                  const items = itemsByOrder[o.id] ?? [];
                  const pay = paymentByOrder[o.id] ?? null;
                  const settles = settlementsByOrder[o.id] ?? [];
                  const expanded = expandedId === o.id;
                  return (
                    <Fragment key={o.id}>
                      <tr
                        className="cursor-pointer hover:bg-brand-bg/50"
                        onClick={() => setExpandedId(expanded ? null : o.id)}
                      >
                        <Td className="whitespace-nowrap align-top">
                          <span className="inline-block rounded-md bg-brand-red/10 px-2 py-0.5 font-mono text-sm font-semibold text-brand-red">
                            #{formatQueueNumber(o.queue_number)}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap align-top font-mono text-xs text-brand-text/80">
                          {formatDateTime(o.created_at)}
                        </Td>
                        <Td className="align-top text-brand-text/90">
                          {o.customer_name?.trim() || "—"}
                        </Td>
                        <Td className="max-w-[200px] align-top text-xs text-brand-text/80">
                          {compactItems(items)}
                        </Td>
                        <Td className="align-top text-right font-mono tabular-nums">
                          {formatRupiah(o.subtotal)}
                        </Td>
                        <Td className="align-top text-right font-mono tabular-nums text-brand-text/80">
                          {o.discount_amount === 0 ? "—" : formatRupiah(o.discount_amount)}
                        </Td>
                        <Td className="align-top text-right font-mono text-sm font-semibold tabular-nums">
                          {formatRupiah(o.total_amount)}
                        </Td>
                        <Td className="align-top text-xs">{methodChain(pay, settles)}</Td>
                        <Td className="align-top">
                          <PaymentStatusBadge status={o.payment_status} />
                        </Td>
                        <Td className="align-top text-xs text-brand-text/75">
                          {settlementStatusText(o, pay, settles)}
                        </Td>
                        <Td className="align-top" onClick={(e) => e.stopPropagation()}>
                          {hasNotes(o) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto px-2 py-1 text-xs"
                              onClick={() => setExpandedId(expanded ? null : o.id)}
                            >
                              View
                            </Button>
                          ) : (
                            <span className="text-brand-text/40">—</span>
                          )}
                        </Td>
                      </tr>
                      {expanded && (
                        <tr className="bg-brand-bg/60">
                          <Td colSpan={11} className="p-4">
                            <DetailPanel
                              order={o}
                              items={items}
                              payment={pay}
                              settlements={settles}
                            />
                          </Td>
                        </tr>
                      )}
                    </Fragment>
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

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === "paid") return <Badge tone="success">Paid</Badge>;
  if (status === "partially_paid") return <Badge tone="warning">Partial</Badge>;
  return <Badge tone="muted">Pending</Badge>;
}

function DetailPanel({
  order,
  items,
  payment,
  settlements,
}: {
  order: OrderRow;
  items: ItemRow[];
  payment: PaymentRow | null;
  settlements: SettlementRow[];
}) {
  return (
    <Card className="border border-brand-text/10 p-4 text-left shadow-none">
      <h3 className="font-display text-base font-semibold text-brand-text">
        Order #{formatQueueNumber(order.queue_number)}
      </h3>
      <div className="mt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-text/50">
          Line items
        </h4>
        <Table className="mt-2">
          <thead>
            <tr>
              <Th>Item</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Unit</Th>
              <Th className="text-right">Line</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <Td>{it.item_name}</Td>
                <Td className="text-right font-mono">{it.quantity}</Td>
                <Td className="text-right font-mono">{formatRupiah(it.item_price)}</Td>
                <Td className="text-right font-mono">{formatRupiah(it.line_total)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-text/50">
          Payment
        </h4>
        {payment ? (
          <ul className="mt-2 space-y-1 text-sm text-brand-text/90">
            <li>
              Method: <span className="font-medium">{methodLabel(payment.method)}</span>
            </li>
            <li>Amount tendered: {formatRupiah(payment.amount_tendered)}</li>
            <li>Exact: {payment.is_exact ? "Yes" : "No"}</li>
            <li className="font-mono text-xs text-brand-text/60">
              Recorded {formatDateTime(payment.created_at)}
            </li>
          </ul>
        ) : (
          <p className="mt-2 text-sm text-brand-text/60">No payment record yet.</p>
        )}
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-text/50">
          Settlements
        </h4>
        {settlements.length === 0 ? (
          <p className="mt-2 text-sm text-brand-text/60">No settlement rows.</p>
        ) : (
          <ul className="mt-2 space-y-3 text-sm">
            {settlements.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-brand-text/10 bg-white px-3 py-2"
              >
                <div className="font-medium">
                  {methodLabel(s.method)} · {s.settlement_type === "collect" ? "Collect" : "Refund"}{" "}
                  · {formatRupiah(s.amount)}
                </div>
                {s.is_adjustment && (
                  <div className="mt-1 text-xs text-amber-800">
                    Adjustment:{" "}
                    {s.adjustment_amount != null ? formatRupiah(s.adjustment_amount) : "—"}
                  </div>
                )}
                {s.notes?.trim() && (
                  <div className="mt-1 text-xs text-brand-text/70">Note: {s.notes}</div>
                )}
                <div className="mt-1 font-mono text-xs text-brand-text/50">
                  {formatDateTime(s.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 grid gap-4 border-t border-brand-text/10 pt-4 sm:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-text/50">
            Payment notes
          </h4>
          <p className="mt-1 whitespace-pre-wrap text-sm text-brand-text/90">
            {order.payment_notes?.trim() || "—"}
          </p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-text/50">
            Settlement notes
          </h4>
          <p className="mt-1 whitespace-pre-wrap text-sm text-brand-text/90">
            {order.settlement_notes?.trim() || "—"}
          </p>
        </div>
      </div>
    </Card>
  );
}
