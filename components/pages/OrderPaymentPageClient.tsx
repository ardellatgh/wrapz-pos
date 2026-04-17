"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Table, Td, Th } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { deductStock } from "@/lib/deductStock";
import { formatQueueDisplay, formatRupiah } from "@/lib/format";
import {
  fetchOpenCashSessionId,
  ledgerPaymentEntryType,
  type PayMethod,
} from "@/lib/orderPaymentHelpers";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type OrderRow = {
  id: string;
  queue_number: number;
  customer_name: string | null;
  subtotal: number;
  combo_savings_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_status: string;
};

type LineRow = {
  item_name: string;
  quantity: number;
  line_total: number;
};

function parseRp(raw: string): number {
  const d = raw.replace(/\D/g, "");
  if (d === "") return 0;
  return Number.parseInt(d, 10);
}

export function OrderPaymentPageClient() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [hasPayment, setHasPayment] = useState(false);

  const [method, setMethod] = useState<PayMethod>("cash");
  const [amountInput, setAmountInput] = useState("");
  const [exactSelected, setExactSelected] = useState(true);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [noCashSession, setNoCashSession] = useState(false);
  const [cashTenderInput, setCashTenderInput] = useState("");
  const prevMethodRef = useRef<PayMethod | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !orderId) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: o, error: oErr } = await supabase
        .from("orders")
        .select(
          "id, queue_number, customer_name, subtotal, combo_savings_amount, discount_amount, total_amount, payment_status"
        )
        .eq("id", orderId)
        .single();
      if (oErr) throw oErr;
      if (!o) throw new Error("Order not found");
      const comboSav =
        o.combo_savings_amount != null ? Number(o.combo_savings_amount) : 0;
      const ord: OrderRow = {
        id: o.id as string,
        queue_number: Number(o.queue_number),
        customer_name: (o.customer_name as string | null) ?? null,
        subtotal: Number(o.subtotal),
        combo_savings_amount: comboSav,
        discount_amount: Number(o.discount_amount),
        total_amount: Number(o.total_amount),
        payment_status: o.payment_status as string,
      };
      setOrder(ord);
      setCashTenderInput("");

      const { data: li, error: lErr } = await supabase
        .from("order_items")
        .select("item_name, quantity, line_total")
        .eq("order_id", orderId);
      if (lErr) throw lErr;
      setLines(
        (li ?? []).map((r) => ({
          item_name: r.item_name as string,
          quantity: Number(r.quantity),
          line_total: Number(r.line_total),
        }))
      );

      const { data: pay, error: pErr } = await supabase
        .from("payments")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle();
      if (pErr) throw pErr;
      setHasPayment(!!pay);

      if (ord.payment_status === "paid") {
        router.replace(`/order/${orderId}/confirmation`);
        return;
      }
      if (ord.payment_status === "partially_paid" || pay) {
        router.replace(`/order/${orderId}/settlement`);
        return;
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!order) return;
    if (method === "cash" && prevMethodRef.current != null && prevMethodRef.current !== "cash") {
      setCashTenderInput("");
    }
    prevMethodRef.current = method;
  }, [method, order]);

  useEffect(() => {
    if (!order) return;
    if (method === "cash") return;
    if (exactSelected) setAmountInput(String(Math.round(order.total_amount)));
  }, [order, exactSelected, method]);

  useEffect(() => {
    let cancelled = false;
    async function checkCash() {
      if (!isSupabaseConfigured() || method !== "cash") {
        if (!cancelled) setNoCashSession(false);
        return;
      }
      try {
        const supabase = getSupabaseBrowserClient();
        const sid = await fetchOpenCashSessionId(supabase);
        if (!cancelled) setNoCashSession(!sid);
      } catch {
        if (!cancelled) setNoCashSession(true);
      }
    }
    void checkCash();
    return () => {
      cancelled = true;
    };
  }, [method]);

  const cashTendered = useMemo(() => parseRp(cashTenderInput), [cashTenderInput]);
  const cashChangeDue = useMemo(() => {
    if (!order || method !== "cash") return 0;
    const t = Math.round(order.total_amount);
    return Math.max(0, cashTendered - t);
  }, [order, method, cashTendered]);
  const cashStillDue = useMemo(() => {
    if (!order || method !== "cash") return 0;
    const t = Math.round(order.total_amount);
    return Math.max(0, t - cashTendered);
  }, [order, method, cashTendered]);

  function addCashTender(delta: number) {
    setCashTenderInput(String(Math.max(0, parseRp(cashTenderInput) + delta)));
  }

  async function onConfirm() {
    if (!order || !isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();

    if (hasPayment) {
      showToast("Payment already recorded for this order.", "error");
      router.replace(`/order/${orderId}/settlement`);
      return;
    }

    const total = Math.round(order.total_amount);

    if (total === 0) {
      setSubmitting(true);
      try {
        const d = await deductStock(supabase, orderId);
        if (!d.ok) throw new Error(d.error);
        const { error: uErr } = await supabase
          .from("orders")
          .update({
            payment_status: "paid",
            serving_status: "queued",
            payment_notes: paymentNotes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);
        if (uErr) throw uErr;
        showToast("Order marked paid (Rp 0).");
        router.push(`/order/${orderId}/confirmation`);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed", "error");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const tendered =
      method === "cash" ? parseRp(cashTenderInput) : exactSelected ? total : parseRp(amountInput);
    if (tendered <= 0) {
      showToast("Enter an amount greater than zero.", "error");
      return;
    }

    if (method === "cash") {
      const sid = await fetchOpenCashSessionId(supabase);
      if (!sid) {
        showToast("Open a cash session on Cash Control before taking cash payments.", "error");
        return;
      }
    }

    const isExact = tendered === total;

    setSubmitting(true);
    try {
      const { data: existing, error: exErr } = await supabase
        .from("payments")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle();
      if (exErr) throw exErr;
      if (existing) {
        showToast("Payment already exists.", "error");
        router.replace(`/order/${orderId}/settlement`);
        return;
      }

      const { error: payErr } = await supabase.from("payments").insert({
        order_id: orderId,
        method,
        amount_tendered: tendered,
        is_exact: isExact,
      });
      if (payErr) throw payErr;

      const { error: nErr } = await supabase
        .from("orders")
        .update({
          payment_notes: paymentNotes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (nErr) throw nErr;

      const entryType = ledgerPaymentEntryType(method);
      const cashSessionId =
        method === "cash" ? await fetchOpenCashSessionId(supabase) : null;

      if (isExact) {
        const { error: uErr } = await supabase
          .from("orders")
          .update({
            payment_status: "paid",
            serving_status: "queued",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);
        if (uErr) throw uErr;

        const { error: lErr } = await supabase.from("ledger_entries").insert({
          cash_session_id: cashSessionId,
          order_id: orderId,
          entry_type: entryType,
          direction: "in",
          amount: total,
          notes: "Initial payment (exact)",
        });
        if (lErr) throw lErr;

        if (method === "cash" && cashSessionId) {
          const { error: cErr } = await supabase.from("cash_movements").insert({
            cash_session_id: cashSessionId,
            order_id: orderId,
            movement_type: "cash_in_sale",
            amount: total,
            notes: `Order ${formatQueueDisplay(order.queue_number)}`,
          });
          if (cErr) throw cErr;
        }

        const d = await deductStock(supabase, orderId);
        if (!d.ok) throw new Error(d.error);

        router.push(`/order/${orderId}/confirmation`);
      } else {
        const { error: uErr } = await supabase
          .from("orders")
          .update({
            payment_status: "partially_paid",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);
        if (uErr) throw uErr;

        const { error: lErr } = await supabase.from("ledger_entries").insert({
          cash_session_id: cashSessionId,
          order_id: orderId,
          entry_type: entryType,
          direction: "in",
          amount: tendered,
          notes: "Initial payment (partial / over)",
        });
        if (lErr) throw lErr;

        if (method === "cash" && cashSessionId) {
          const { error: cErr } = await supabase.from("cash_movements").insert({
            cash_session_id: cashSessionId,
            order_id: orderId,
            movement_type: "cash_in_sale",
            amount: tendered,
            notes: `Order ${formatQueueDisplay(order.queue_number)}`,
          });
          if (cErr) throw cErr;
        }

        router.push(`/order/${orderId}/settlement`);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Payment failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader
          eyebrow="Checkout"
          title="Payment"
          description="Record tender and payment method for this order."
        />
        <SupabaseSetupBanner />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <PageHeader
          eyebrow="Checkout"
          title="Payment"
          description="Record tender and payment method for this order."
        />
        <p className="text-sm text-brand-text/60">Loading order…</p>
      </div>
    );
  }

  if (loadError || !order) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <PageHeader
          eyebrow="Checkout"
          title="Payment"
          description="Record tender and payment method for this order."
        />
        <Card className="p-4 text-sm text-red-800">{loadError ?? "Order not found."}</Card>
      </div>
    );
  }

  const total = Math.round(order.total_amount);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Checkout"
        title="Payment"
        extra={
          <>
            <p className="font-display text-4xl font-normal tabular-nums tracking-wide text-brand-red md:text-5xl">
              #{formatQueueDisplay(order.queue_number)}
            </p>
            {order.customer_name ? (
              <p className="mt-1 text-sm text-brand-text/70">{order.customer_name}</p>
            ) : null}
          </>
        }
        description="Record tender and payment method for this order."
      />

      <Card className="p-4">
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Line</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <Td>{l.item_name}</Td>
                <Td className="text-right font-display text-base font-normal tabular-nums tracking-wide">{l.quantity}</Td>
                <Td className="text-right font-display text-base font-normal tabular-nums tracking-wide text-brand-text">
                  {formatRupiah(l.line_total)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="mt-3 space-y-1 border-t border-brand-text/10 pt-3 text-sm">
          <div className="flex justify-between">
            <span>Subtotal (list)</span>
            <span className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(order.subtotal)}</span>
          </div>
          {order.combo_savings_amount !== 0 ? (
            <div className="flex justify-between text-emerald-900">
              <span>Combo package savings</span>
              <span className="font-display text-lg font-normal tabular-nums tracking-wide">
                −{formatRupiah(Math.max(0, order.combo_savings_amount))}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span>Discount</span>
            <span className="font-display text-lg font-normal tabular-nums tracking-wide">
              −{formatRupiah(order.discount_amount)}
            </span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span className="font-display text-2xl font-normal tabular-nums tracking-wide text-brand-red">
              {formatRupiah(total)}
            </span>
          </div>
        </div>
      </Card>

      {total === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-brand-text/80">Total is Rp 0 — no payment required.</p>
          <div className="mt-3">
            <Label htmlFor="pn0">Payment notes (optional)</Label>
            <Input
              id="pn0"
              className="mt-1"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
            />
          </div>
          <Button type="button" className="mt-4" disabled={submitting} onClick={() => void onConfirm()}>
            {submitting ? "Saving…" : "Confirm paid (Rp 0)"}
          </Button>
        </Card>
      ) : (
        <>
          {method === "cash" && noCashSession && (
            <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <strong className="font-semibold">No open cash session.</strong> Open a session on
              the Cash page before accepting cash. QRIS and Transfer do not require a cash session.
            </Card>
          )}

          <Card className="space-y-4 p-4">
            <Label>Payment method</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  ["cash", "💵", "Cash"],
                  ["qris", "🧾", "QRIS"],
                  ["transfer", "🏦", "Transfer"],
                ] as const
              ).map(([m, emoji, title]) => (
                <label
                  key={m}
                  className={`flex cursor-pointer flex-col gap-1 rounded-md border px-3 py-3 text-left shadow-sm transition hover:border-brand-text/20 ${
                    method === m
                      ? "border-brand-red bg-brand-red/[0.07] ring-1 ring-brand-red/25"
                      : "border-brand-text/12 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="pm"
                    className="sr-only"
                    checked={method === m}
                    onChange={() => setMethod(m)}
                  />
                  <span className="text-xl leading-none" aria-hidden>
                    {emoji}
                  </span>
                  <span className="text-sm font-semibold tracking-tight text-brand-text">{title}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              {method === "cash" ? (
                <div className="space-y-4 rounded-lg border border-brand-text/10 bg-brand-fill/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-text/55">
                    Cash payment
                  </p>
                  <div>
                    <Label className="text-sm text-brand-text/80">Quick tender</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" onClick={() => addCashTender(20_000)}>
                        +20k
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => addCashTender(50_000)}>
                        +50k
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => addCashTender(100_000)}>
                        +100k
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setCashTenderInput(String(total))}
                      >
                        Exact total
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-9 border border-brand-text/15 bg-brand-yellow/12 px-3 py-1.5 text-xs text-brand-text shadow-sm hover:bg-brand-yellow/18"
                        onClick={() => setCashTenderInput("")}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="cash-tender-input" className="text-sm text-brand-text/80">
                      Cash tendered
                    </Label>
                    <Input
                      id="cash-tender-input"
                      inputMode="numeric"
                      className="mt-2 font-sans tabular-nums"
                      value={cashTenderInput}
                      onChange={(e) => setCashTenderInput(e.target.value)}
                      placeholder="Empty — type or use quick tender"
                      aria-label="Cash amount tendered"
                    />
                    <p className="mt-1 text-xs text-brand-text/50">
                      Starts blank; quick buttons stack from zero. Use Exact total for the order total in one tap.
                    </p>
                  </div>
                  <div className="space-y-2 rounded-md border border-brand-text/10 bg-white px-3 py-3 text-sm shadow-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-brand-text/75">Tendered</span>
                      <span className="font-display text-lg font-normal tabular-nums tracking-wide text-brand-text">
                        {formatRupiah(cashTendered)}
                      </span>
                    </div>
                    {cashStillDue > 0 ? (
                      <div className="flex justify-between gap-4 border-t border-brand-text/10 pt-2 font-medium text-amber-900">
                        <span>Still due</span>
                        <span className="font-display text-lg font-normal tabular-nums">
                          {formatRupiah(cashStillDue)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-between gap-4 border-t border-brand-text/10 pt-2 font-medium text-emerald-900">
                        <span>Change (estimate)</span>
                        <span className="font-display text-lg font-normal tabular-nums">
                          {formatRupiah(cashChangeDue)}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-brand-text/55">
                    If the change handed to the customer differs, record it on Settlement — adjustments follow the same
                    flow as before.
                  </p>
                </div>
              ) : (
                <>
                  <Label>Payment amount</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={exactSelected ? "primary" : "secondary"}
                      onClick={() => setExactSelected(true)}
                    >
                      Exact amount
                    </Button>
                    <Button
                      type="button"
                      variant={!exactSelected ? "primary" : "secondary"}
                      onClick={() => setExactSelected(false)}
                    >
                      Enter amount
                    </Button>
                  </div>
                  {!exactSelected && (
                    <Input
                      inputMode="numeric"
                      className="mt-2 font-sans tabular-nums"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      placeholder="Rp"
                    />
                  )}
                  {exactSelected && (
                    <p className="font-display text-2xl font-normal tabular-nums tracking-wide text-brand-text">
                      {formatRupiah(total)}
                    </p>
                  )}
                </>
              )}
            </div>

            <div>
              <Label htmlFor="pnotes">Payment notes (optional)</Label>
              <Input
                id="pnotes"
                className="mt-1"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
              />
            </div>

            <Button
              type="button"
              disabled={submitting || (method === "cash" && noCashSession)}
              onClick={() => void onConfirm()}
            >
              {submitting ? "Processing…" : "Confirm payment"}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
