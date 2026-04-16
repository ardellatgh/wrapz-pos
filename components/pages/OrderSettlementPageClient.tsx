"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useToast } from "@/components/ui/Toast";
import { deductStock } from "@/lib/deductStock";
import { formatQueueDisplay, formatRupiah } from "@/lib/format";
import {
  fetchOpenCashSessionId,
  ledgerSettlementCollectEntryType,
  type PayMethod,
} from "@/lib/orderPaymentHelpers";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type OrderRow = {
  id: string;
  queue_number: number;
  total_amount: number;
  payment_status: string;
  serving_status: string;
  stock_deducted: boolean;
  manually_overridden_to_serving: boolean;
};

type PaymentRow = {
  method: PayMethod;
  amount_tendered: number;
};

type SettlementRow = {
  id: string;
  settlement_type: "collect" | "refund";
  amount: number;
  method: PayMethod;
};

function parseRp(raw: string): number {
  const d = raw.replace(/\D/g, "");
  if (d === "") return 0;
  return Number.parseInt(d, 10);
}

export function OrderSettlementPageClient() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);

  const [method, setMethod] = useState<PayMethod>("cash");
  const [amountInput, setAmountInput] = useState("");
  const [settlementNotes, setSettlementNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [noCashSession, setNoCashSession] = useState(false);

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
          "id, queue_number, total_amount, payment_status, serving_status, stock_deducted, manually_overridden_to_serving"
        )
        .eq("id", orderId)
        .single();
      if (oErr) throw oErr;
      const ord: OrderRow = {
        id: o.id as string,
        queue_number: Number(o.queue_number),
        total_amount: Number(o.total_amount),
        payment_status: o.payment_status as string,
        serving_status: o.serving_status as string,
        stock_deducted: Boolean(o.stock_deducted),
        manually_overridden_to_serving: Boolean(o.manually_overridden_to_serving),
      };
      setOrder(ord);

      if (ord.payment_status === "paid") {
        router.replace(`/order/${orderId}/confirmation`);
        return;
      }

      const { data: pay, error: pErr } = await supabase
        .from("payments")
        .select("method, amount_tendered")
        .eq("order_id", orderId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!pay) {
        router.replace(`/order/${orderId}/payment`);
        return;
      }
      setPayment({
        method: pay.method as PayMethod,
        amount_tendered: Number(pay.amount_tendered),
      });

      const { data: st, error: sErr } = await supabase
        .from("settlements")
        .select("id, settlement_type, amount, method")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (sErr) throw sErr;
      setSettlements(
        (st ?? []).map((r) => ({
          id: r.id as string,
          settlement_type: r.settlement_type as "collect" | "refund",
          amount: Number(r.amount),
          method: r.method as PayMethod,
        }))
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    if (!order || !payment) return null;
    const total = Math.round(order.total_amount);
    const creditsIn =
      payment.amount_tendered +
      settlements.filter((s) => s.settlement_type === "collect").reduce((a, s) => a + s.amount, 0);
    const debitsOut = settlements
      .filter((s) => s.settlement_type === "refund")
      .reduce((a, s) => a + s.amount, 0);
    const net = creditsIn - debitsOut;
    const diff = net - total;
    return { total, creditsIn, debitsOut, net, diff, remainingUnder: diff < 0 ? -diff : 0, changeOver: diff > 0 ? diff : 0 };
  }, [order, payment, settlements]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (method !== "cash" || !totals) {
        if (!cancelled) setNoCashSession(false);
        return;
      }
      const needsCash =
        (totals.remainingUnder > 0 && totals.changeOver === 0) ||
        (totals.changeOver > 0 && totals.remainingUnder === 0);
      if (!needsCash) {
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
    void run();
    return () => {
      cancelled = true;
    };
  }, [method, totals]);

  async function onSendKitchen() {
    if (!order || !isSupabaseConfigured()) return;
    setOverrideLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: uErr } = await supabase
        .from("orders")
        .update({
          serving_status: "queued",
          manually_overridden_to_serving: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("serving_status", "not_sent");
      if (uErr) throw uErr;
      const d = await deductStock(supabase, orderId);
      if (!d.ok) throw new Error(d.error);
      showToast("Sent to kitchen. Complete settlement when ready.");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Override failed", "error");
    } finally {
      setOverrideLoading(false);
    }
  }

  async function finalizePaid(supabase: ReturnType<typeof getSupabaseBrowserClient>) {
    const { error: uErr } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        serving_status: "queued",
        settlement_notes: settlementNotes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (uErr) throw uErr;
    const d = await deductStock(supabase, orderId);
    if (!d.ok) throw new Error(d.error);
  }

  async function onConfirmSettlement() {
    if (!order || !payment || !totals || !isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    const amount = parseRp(amountInput);
    if (amount <= 0) {
      showToast("Enter an amount greater than zero.", "error");
      return;
    }

    if (method === "cash") {
      const sid = await fetchOpenCashSessionId(supabase);
      if (!sid) {
        showToast(
          "Open a cash session on Cash Control before recording cash settlement or cash refunds.",
          "error"
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const { total, remainingUnder, changeOver } = totals;

      if (remainingUnder > 0 && changeOver === 0) {
        if (amount < remainingUnder) {
          const entryType = ledgerSettlementCollectEntryType(method);
          const cashSessionId = method === "cash" ? await fetchOpenCashSessionId(supabase) : null;
          const { error: sErr } = await supabase.from("settlements").insert({
            order_id: orderId,
            method,
            settlement_type: "collect",
            amount,
            is_adjustment: false,
            notes: settlementNotes.trim() || null,
          });
          if (sErr) throw sErr;
          const { error: lErr } = await supabase.from("ledger_entries").insert({
            cash_session_id: cashSessionId,
            order_id: orderId,
            entry_type: entryType,
            direction: "in",
            amount,
            notes: "Settlement (partial collect)",
          });
          if (lErr) throw lErr;
          if (method === "cash" && cashSessionId) {
            const { error: cErr } = await supabase.from("cash_movements").insert({
              cash_session_id: cashSessionId,
              order_id: orderId,
              movement_type: "cash_in_sale",
              amount,
              notes: `Order ${formatQueueDisplay(order.queue_number)} partial`,
            });
            if (cErr) throw cErr;
          }
          const { error: nErr } = await supabase
            .from("orders")
            .update({
              settlement_notes: settlementNotes.trim() || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", orderId);
          if (nErr) throw nErr;
          showToast("Partial payment recorded.");
          setAmountInput("");
          await load();
          return;
        }

        const excess = amount - remainingUnder;
        const cashSessionId = method === "cash" ? await fetchOpenCashSessionId(supabase) : null;
        const entryType = ledgerSettlementCollectEntryType(method);
        const { error: sErr } = await supabase.from("settlements").insert({
          order_id: orderId,
          method,
          settlement_type: "collect",
          amount,
          is_adjustment: excess !== 0,
          adjustment_amount: excess !== 0 ? excess : null,
          notes: settlementNotes.trim() || null,
        });
        if (sErr) throw sErr;

        const { error: l1 } = await supabase.from("ledger_entries").insert({
          cash_session_id: cashSessionId,
          order_id: orderId,
          entry_type: entryType,
          direction: "in",
          amount: remainingUnder,
          notes: "Settlement (close balance)",
        });
        if (l1) throw l1;
        if (excess !== 0) {
          const { error: l2 } = await supabase.from("ledger_entries").insert({
            cash_session_id: cashSessionId,
            order_id: orderId,
            entry_type: "adjustment",
            direction: excess > 0 ? "in" : "out",
            amount: Math.abs(excess),
            notes: "Excess settlement adjustment",
          });
          if (l2) throw l2;
        }
        if (method === "cash" && cashSessionId) {
          const { error: cErr } = await supabase.from("cash_movements").insert({
            cash_session_id: cashSessionId,
            order_id: orderId,
            movement_type: "cash_in_sale",
            amount,
            notes: `Order ${formatQueueDisplay(order.queue_number)} settle`,
          });
          if (cErr) throw cErr;
        }
        await finalizePaid(supabase);
        showToast("Order paid.");
        router.push(`/order/${orderId}/confirmation`);
        return;
      }

      if (changeOver > 0 && remainingUnder === 0) {
        const changeDue = changeOver;
        const adjustmentSigned = amount - changeDue;
        const cashSessionId = method === "cash" ? await fetchOpenCashSessionId(supabase) : null;

        const { error: sErr } = await supabase.from("settlements").insert({
          order_id: orderId,
          method,
          settlement_type: "refund",
          amount,
          is_adjustment: adjustmentSigned !== 0,
          adjustment_amount: adjustmentSigned !== 0 ? adjustmentSigned : null,
          notes: settlementNotes.trim() || null,
        });
        if (sErr) throw sErr;

        const refundEntry = method === "cash" ? "refund_cash" : "refund";
        const { error: l1 } = await supabase.from("ledger_entries").insert({
          cash_session_id: cashSessionId,
          order_id: orderId,
          entry_type: refundEntry,
          direction: "out",
          amount,
          notes: "Settlement refund / change",
        });
        if (l1) throw l1;
        if (adjustmentSigned !== 0) {
          const { error: l2 } = await supabase.from("ledger_entries").insert({
            cash_session_id: cashSessionId,
            order_id: orderId,
            entry_type: "adjustment",
            direction: adjustmentSigned > 0 ? "out" : "in",
            amount: Math.abs(adjustmentSigned),
            notes: "Refund adjustment",
          });
          if (l2) throw l2;
        }
        if (method === "cash" && cashSessionId) {
          const { error: cErr } = await supabase.from("cash_movements").insert({
            cash_session_id: cashSessionId,
            order_id: orderId,
            movement_type: "cash_out_refund",
            amount,
            notes: `Order ${formatQueueDisplay(order.queue_number)} change`,
          });
          if (cErr) throw cErr;
        }
        await finalizePaid(supabase);
        showToast("Settlement complete.");
        router.push(`/order/${orderId}/confirmation`);
        return;
      }

      showToast("Nothing to settle — check order state.", "error");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Settlement failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader
          eyebrow="Checkout"
          title="Settlement"
          description="Confirm change, refunds, and serving handoff for this order."
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
          title="Settlement"
          description="Confirm change, refunds, and serving handoff for this order."
        />
        <p className="text-sm text-brand-text/60">Loading…</p>
      </div>
    );
  }

  if (loadError || !order || !payment || !totals) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <PageHeader
          eyebrow="Checkout"
          title="Settlement"
          description="Confirm change, refunds, and serving handoff for this order."
        />
        <Card className="p-4 text-sm text-red-800">{loadError ?? "Loading…"}</Card>
      </div>
    );
  }

  const { total, remainingUnder, changeOver, net } = totals;
  const showKitchenBtn = order.serving_status === "not_sent";
  const cashBlocked = method === "cash" && noCashSession && (remainingUnder > 0 || changeOver > 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Checkout"
        title="Settlement"
        extra={
          <p className="font-display text-4xl font-normal tabular-nums tracking-wide text-brand-red md:text-5xl">
            #{formatQueueDisplay(order.queue_number)}
          </p>
        }
        description="Confirm change, refunds, and serving handoff for this order."
      />

      <Card className="space-y-2 p-4 text-sm">
        <div className="flex justify-between">
          <span>Order total</span>
          <span className="font-display text-xl font-normal tabular-nums tracking-wide text-brand-text">
            {formatRupiah(total)}
          </span>
        </div>
        <div className="flex justify-between text-brand-text/80">
          <span>Net received after refunds</span>
          <span className="font-display text-lg font-normal tabular-nums tracking-wide text-brand-text">
            {formatRupiah(net)}
          </span>
        </div>
        {remainingUnder > 0 && (
          <div className="rounded-ref-sm bg-brand-yellow-soft px-3 py-2 text-sm font-medium text-brand-text ring-1 ring-brand-yellow/30">
            Remaining due:{" "}
            <span className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(remainingUnder)}</span>
          </div>
        )}
        {changeOver > 0 && (
          <div className="rounded-ref-sm bg-brand-yellow-soft px-3 py-2 text-sm font-medium text-brand-text ring-1 ring-brand-yellow/30">
            Change to return:{" "}
            <span className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(changeOver)}</span>
          </div>
        )}
      </Card>

      {showKitchenBtn && (
        <Card className="p-4">
          <p className="text-sm text-brand-text/80">
            Send this order to the kitchen before payment is fully settled (stock is deducted
            immediately).
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            disabled={overrideLoading}
            onClick={() => void onSendKitchen()}
          >
            {overrideLoading ? "Updating…" : "Send to kitchen now"}
          </Button>
        </Card>
      )}

      {cashBlocked && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <strong className="font-semibold">No open cash session.</strong> Open a session on the
          Cash page before recording cash collection or cash refunds. QRIS and Transfer do not
          require a cash session.
        </Card>
      )}

      {remainingUnder === 0 && changeOver === 0 && order.payment_status === "partially_paid" ? (
        <Card className="space-y-4 p-4">
          <p className="text-sm text-brand-text/80">
            Order is fully balanced. Confirm to mark paid and finish.
          </p>
          <div>
            <Label htmlFor="sn-b">Settlement notes (optional)</Label>
            <Input
              id="sn-b"
              className="mt-1"
              value={settlementNotes}
              onChange={(e) => setSettlementNotes(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={submitting}
            onClick={async () => {
              if (!isSupabaseConfigured()) return;
              setSubmitting(true);
              try {
                const supabase = getSupabaseBrowserClient();
                await finalizePaid(supabase);
                showToast("Order complete.");
                router.push(`/order/${orderId}/confirmation`);
              } catch (e) {
                showToast(e instanceof Error ? e.message : "Failed", "error");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Saving…" : "Mark paid & finish"}
          </Button>
        </Card>
      ) : (
        <Card className="space-y-4 p-4">
          <Label>Settlement method</Label>
          <div className="flex flex-wrap gap-3 text-sm">
            {(["cash", "qris", "transfer"] as const).map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 capitalize">
                <input
                  type="radio"
                  name="sm"
                  checked={method === m}
                  onChange={() => setMethod(m)}
                />
                {m}
              </label>
            ))}
          </div>

          <div>
            <Label htmlFor="sa">
              {remainingUnder > 0 ? "Amount to receive (Rp)" : "Refund / change amount (Rp)"}
            </Label>
            <Input
              id="sa"
              inputMode="numeric"
              className="mt-1 font-sans tabular-nums"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="sn">Settlement notes (optional)</Label>
            <Input
              id="sn"
              className="mt-1"
              value={settlementNotes}
              onChange={(e) => setSettlementNotes(e.target.value)}
            />
          </div>

          <Button
            type="button"
            disabled={submitting || cashBlocked}
            onClick={() => void onConfirmSettlement()}
          >
            {submitting ? "Saving…" : "Confirm settlement"}
          </Button>
        </Card>
      )}
    </div>
  );
}
