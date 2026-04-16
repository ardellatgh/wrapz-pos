"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatQueueDisplay, formatRupiah } from "@/lib/format";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type OrderRow = {
  queue_number: number;
  customer_name: string | null;
  total_amount: number;
  payment_status: string;
};

type LineRow = { item_name: string; quantity: number; line_total: number };

export function OrderConfirmationPageClient() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);

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
        .select("queue_number, customer_name, total_amount, payment_status")
        .eq("id", orderId)
        .single();
      if (oErr) throw oErr;
      const ord: OrderRow = {
        queue_number: Number(o.queue_number),
        customer_name: (o.customer_name as string | null) ?? null,
        total_amount: Number(o.total_amount),
        payment_status: o.payment_status as string,
      };
      setOrder(ord);
      if (ord.payment_status === "partially_paid") {
        router.replace(`/order/${orderId}/settlement`);
        return;
      }
      if (ord.payment_status !== "paid") {
        router.replace(`/order/${orderId}/payment`);
        return;
      }
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
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <SupabaseSetupBanner />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl text-center text-sm text-brand-text/60">Loading…</div>
    );
  }

  if (loadError || !order) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-4 text-sm text-red-800">{loadError ?? "Not found"}</Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        eyebrow="Queue"
        title={formatQueueDisplay(order.queue_number)}
        titleClassName="font-display text-5xl font-normal normal-case tabular-nums tracking-wide text-brand-red md:text-6xl leading-none"
        description={
          order.customer_name ? <p className="text-lg text-brand-text">{order.customer_name}</p> : undefined
        }
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <Button type="button" className="w-full sm:w-auto" onClick={() => router.push("/order/new")}>
              Add new order
            </Button>
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => router.push("/dashboard")}>
              Done
            </Button>
            <Link href="/transactions" className="w-full sm:w-auto">
              <Button type="button" variant="ghost" className="w-full">
                View transactions
              </Button>
            </Link>
          </div>
        }
      />

      <Card className="p-4 text-left">
        <h2 className="font-sans text-lg font-semibold tracking-tight text-brand-text">Items</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>
                {l.item_name} × {l.quantity}
              </span>
              <span className="shrink-0 font-display text-lg font-normal tabular-nums tracking-wide text-brand-text">
                {formatRupiah(l.line_total)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-brand-text/10 pt-3 text-base font-semibold">
          <span>Total paid</span>
          <span className="font-display text-2xl font-normal tabular-nums tracking-wide text-brand-red">
            {formatRupiah(order.total_amount)}
          </span>
        </div>
      </Card>
    </div>
  );
}
