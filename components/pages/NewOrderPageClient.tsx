"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatRupiah } from "@/lib/format";
import { EVENT_SETTINGS_ROW_ID } from "@/lib/constants";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type MenuRow = {
  id: string;
  name: string;
  image_url: string | null;
  price: number;
  low_stock_threshold: number | null;
  is_bundle: boolean;
};

type PresetRow = {
  id: string;
  name: string;
  discount_type: "percent" | "fixed";
  value: number;
  min_purchase: number | null;
};

type DiscountMode = "none" | "preset" | "manual_percent" | "manual_fixed";

type CartLine = { item: MenuRow; quantity: number };

type BundleComp = { componentItemId: string; qtyPerBundle: number };

type ItemMeta = { name: string; low_stock_threshold: number | null };

type StockIssue = {
  id: string;
  kind: "out" | "low";
  name: string;
  detail: string;
  orderedQty: number;
  available: number;
  threshold: number;
};

function thresholdFor(meta: ItemMeta | undefined, defaultLow: number): number {
  if (meta?.low_stock_threshold != null) return meta.low_stock_threshold;
  return defaultLow;
}

/** Aggregate required units per component/menu line (bundles expanded). */
function componentNeedByItemId(
  cartLines: CartLine[],
  bundleComponentsByBundleId: Record<string, BundleComp[]>
): Map<string, { need: number; label: string }> {
  const map = new Map<string, { need: number; label: string }>();
  for (const line of cartLines) {
    if (line.item.is_bundle) {
      const comps = bundleComponentsByBundleId[line.item.id] ?? [];
      for (const c of comps) {
        const add = line.quantity * c.qtyPerBundle;
        const prev = map.get(c.componentItemId) ?? { need: 0, label: line.item.name };
        prev.need += add;
        map.set(c.componentItemId, prev);
      }
    } else {
      const id = line.item.id;
      const prev = map.get(id) ?? { need: 0, label: line.item.name };
      prev.need += line.quantity;
      map.set(id, prev);
    }
  }
  return map;
}

function analyzeStockIssues(
  cartLines: CartLine[],
  stockById: Record<string, number>,
  itemMetaById: Record<string, ItemMeta>,
  defaultLow: number,
  bundleComponentsByBundleId: Record<string, BundleComp[]>
): StockIssue[] {
  const needMap = componentNeedByItemId(cartLines, bundleComponentsByBundleId);
  const issues: StockIssue[] = [];
  for (const [itemId, { need, label }] of needMap) {
    if (need <= 0) continue;
    const available = stockById[itemId] ?? 0;
    const meta = itemMetaById[itemId];
    const name = meta?.name ?? label;
    const th = thresholdFor(meta, defaultLow);
    if (available < need) {
      issues.push({
        id: `${itemId}-out`,
        kind: "out",
        name,
        detail: `Cart requires ${need} units; recorded stock is ${available}. Stock data may be outdated.`,
        orderedQty: need,
        available,
        threshold: th,
      });
    } else if (available <= th) {
      issues.push({
        id: `${itemId}-low`,
        kind: "low",
        name,
        detail: `Recorded stock ${available} is at or below low threshold (${th}). Stock data may be outdated.`,
        orderedQty: need,
        available,
        threshold: th,
      });
    }
  }
  return issues;
}

export function NewOrderPageClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const [menu, setMenu] = useState<MenuRow[]>([]);
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [defaultLow, setDefaultLow] = useState(10);
  const [stockById, setStockById] = useState<Record<string, number>>({});
  const [bundleComponentsByBundleId, setBundleComponentsByBundleId] = useState<
    Record<string, BundleComp[]>
  >({});
  const [itemMetaById, setItemMetaById] = useState<Record<string, ItemMeta>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("none");
  const [presetId, setPresetId] = useState<string>("");
  const [manualPercent, setManualPercent] = useState("");
  const [manualFixed, setManualFixed] = useState("");

  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockIssues, setStockIssues] = useState<StockIssue[]>([]);
  const [stockAckPhysical, setStockAckPhysical] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: settings } = await supabase
        .from("event_settings")
        .select("default_low_stock_threshold")
        .eq("id", EVENT_SETTINGS_ROW_ID)
        .maybeSingle();
      if (settings?.default_low_stock_threshold != null) {
        setDefaultLow(Number(settings.default_low_stock_threshold));
      }

      const { data: menuData, error: menuErr } = await supabase
        .from("menu_items")
        .select("id, name, image_url, price, low_stock_threshold, is_active, is_bundle")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (menuErr) throw menuErr;
      const rows = (menuData ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        image_url: (r.image_url as string | null) ?? null,
        price: Number(r.price),
        low_stock_threshold:
          r.low_stock_threshold == null ? null : Number(r.low_stock_threshold),
        is_bundle: Boolean(r.is_bundle),
      }));
      setMenu(rows);

      const meta: Record<string, ItemMeta> = {};
      for (const r of rows) {
        meta[r.id] = { name: r.name, low_stock_threshold: r.low_stock_threshold };
      }

      const bundleIds = rows.filter((m) => m.is_bundle).map((m) => m.id);
      const bundleMap: Record<string, BundleComp[]> = {};
      const componentIds = new Set<string>();
      if (bundleIds.length > 0) {
        const { data: bcRows, error: bcErr } = await supabase
          .from("bundle_components")
          .select("bundle_id, component_item_id, quantity")
          .in("bundle_id", bundleIds);
        if (bcErr) throw bcErr;
        for (const row of bcRows ?? []) {
          const bid = row.bundle_id as string;
          const cid = row.component_item_id as string;
          const q = Number(row.quantity);
          if (!bundleMap[bid]) bundleMap[bid] = [];
          bundleMap[bid].push({ componentItemId: cid, qtyPerBundle: q });
          componentIds.add(cid);
        }
      }
      setBundleComponentsByBundleId(bundleMap);

      const compIdsToFetch = [...componentIds].filter((id) => !meta[id]);
      if (compIdsToFetch.length > 0) {
        const { data: compMenu, error: cmErr } = await supabase
          .from("menu_items")
          .select("id, name, low_stock_threshold")
          .in("id", compIdsToFetch);
        if (cmErr) throw cmErr;
        for (const r of compMenu ?? []) {
          meta[r.id as string] = {
            name: r.name as string,
            low_stock_threshold:
              r.low_stock_threshold == null ? null : Number(r.low_stock_threshold),
          };
        }
      }
      setItemMetaById(meta);

      const { data: presetData, error: pErr } = await supabase
        .from("discount_presets")
        .select("id, name, discount_type, value, min_purchase")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (pErr) throw pErr;
      setPresets(
        (presetData ?? []).map((p) => ({
          id: p.id as string,
          name: p.name as string,
          discount_type: p.discount_type as "percent" | "fixed",
          value: Number(p.value),
          min_purchase: p.min_purchase == null ? null : Number(p.min_purchase),
        }))
      );

      const sellableIds = rows.filter((m) => !m.is_bundle).map((m) => m.id);
      const stockIds = [...new Set([...sellableIds, ...componentIds])];
      if (stockIds.length === 0) {
        setStockById({});
        return;
      }
      const { data: mov, error: movErr } = await supabase
        .from("stock_movements")
        .select("menu_item_id, quantity_change")
        .in("menu_item_id", stockIds);
      if (movErr) throw movErr;
      const sums: Record<string, number> = {};
      for (const id of stockIds) sums[id] = 0;
      for (const row of mov ?? []) {
        const id = row.menu_item_id as string;
        sums[id] = (sums[id] ?? 0) + Number(row.quantity_change);
      }
      setStockById(sums);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cartLines = useMemo((): CartLine[] => {
    const out: CartLine[] = [];
    for (const item of menu) {
      const q = cartQty[item.id] ?? 0;
      if (q > 0) out.push({ item, quantity: q });
    }
    return out;
  }, [menu, cartQty]);

  const subtotal = useMemo(() => {
    return cartLines.reduce((s, l) => s + l.item.price * l.quantity, 0);
  }, [cartLines]);

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === presetId) ?? null,
    [presets, presetId]
  );

  const discountAmount = useMemo(() => {
    if (discountMode === "none") return 0;
    if (discountMode === "preset" && selectedPreset) {
      if (selectedPreset.discount_type === "percent") {
        return Math.floor((selectedPreset.value / 100) * subtotal);
      }
      return Math.min(subtotal, Math.round(selectedPreset.value));
    }
    if (discountMode === "manual_percent") {
      const p = Number.parseFloat(manualPercent);
      if (!Number.isFinite(p) || p <= 0) return 0;
      const clamped = Math.min(100, Math.max(0, p));
      return Math.floor((clamped / 100) * subtotal);
    }
    if (discountMode === "manual_fixed") {
      const digits = manualFixed.replace(/\D/g, "");
      const v = digits === "" ? 0 : Number.parseInt(digits, 10);
      return Math.min(subtotal, v);
    }
    return 0;
  }, [discountMode, selectedPreset, subtotal, manualPercent, manualFixed]);

  const totalAmount = useMemo(
    () => Math.max(0, Math.round(subtotal - discountAmount)),
    [subtotal, discountAmount]
  );

  function addOne(id: string) {
    setCartQty((q) => ({ ...q, [id]: (q[id] ?? 0) + 1 }));
  }

  function deltaQty(id: string, delta: number) {
    setCartQty((q) => {
      const next = Math.max(0, (q[id] ?? 0) + delta);
      const copy = { ...q };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  function validateDiscountForProceed(): string | null {
    if (discountMode === "preset") {
      if (!selectedPreset) return "Select a discount preset.";
      const min = selectedPreset.min_purchase;
      if (min != null && min > 0 && subtotal < min) {
        return `Minimum purchase ${formatRupiah(min)} not met for this preset.`;
      }
    }
    return null;
  }

  async function runCreateOrder(stockPrePaymentOverridden: boolean) {
    if (!isSupabaseConfigured() || cartLines.length === 0) return;
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();

      const { data: maxRow } = await supabase
        .from("orders")
        .select("queue_number")
        .order("queue_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: settings } = await supabase
        .from("event_settings")
        .select("queue_start")
        .eq("id", EVENT_SETTINGS_ROW_ID)
        .maybeSingle();
      const queueStart = settings?.queue_start != null ? Number(settings.queue_start) : 1;
      const nextQueue =
        maxRow?.queue_number != null ? Number(maxRow.queue_number) + 1 : queueStart;

      let discountLabel: string | null = null;
      let discountPresetId: string | null = null;
      let discManualPct: number | null = null;
      let discManualFixed: number | null = null;

      if (discountMode === "preset" && selectedPreset) {
        discountLabel = selectedPreset.name;
        discountPresetId = selectedPreset.id;
      } else if (discountMode === "manual_percent") {
        const p = Number.parseFloat(manualPercent);
        discManualPct = Number.isFinite(p) ? p : null;
        discountLabel = discManualPct != null ? `Manual ${discManualPct}%` : "Manual %";
      } else if (discountMode === "manual_fixed") {
        const digits = manualFixed.replace(/\D/g, "");
        discManualFixed = digits === "" ? 0 : Number.parseInt(digits, 10);
        discountLabel = "Manual fixed";
      }

      const overrideAt = stockPrePaymentOverridden ? new Date().toISOString() : null;

      const { data: orderRow, error: oErr } = await supabase
        .from("orders")
        .insert({
          queue_number: nextQueue,
          customer_name: customerName.trim() || null,
          subtotal,
          discount_type: discountMode,
          discount_preset_id: discountPresetId,
          discount_label: discountLabel,
          discount_manual_percent: discManualPct,
          discount_manual_fixed: discManualFixed,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          payment_status: "pending",
          serving_status: "not_sent",
          stock_pre_payment_overridden: stockPrePaymentOverridden,
          stock_pre_payment_override_at: overrideAt,
        })
        .select("id")
        .single();
      if (oErr) throw oErr;
      const orderId = orderRow.id as string;

      const itemRows = cartLines.map((l) => ({
        order_id: orderId,
        menu_item_id: l.item.id,
        item_name: l.item.name,
        item_price: l.item.price,
        quantity: l.quantity,
        line_total: l.item.price * l.quantity,
      }));
      const { error: iErr } = await supabase.from("order_items").insert(itemRows);
      if (iErr) throw iErr;

      showToast(`Order #${String(nextQueue).padStart(3, "0")} created.`);
      router.push(`/order/${orderId}/payment`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not create order", "error");
    } finally {
      setSaving(false);
    }
  }

  async function onProceed() {
    if (!isSupabaseConfigured() || cartLines.length === 0) return;
    const dErr = validateDiscountForProceed();
    if (dErr) {
      showToast(dErr, "error");
      return;
    }
    const issues = analyzeStockIssues(
      cartLines,
      stockById,
      itemMetaById,
      defaultLow,
      bundleComponentsByBundleId
    );
    if (issues.length === 0) {
      await runCreateOrder(false);
      return;
    }
    setStockIssues(issues);
    setStockAckPhysical(false);
    setStockModalOpen(true);
  }

  function handleStockModalGoBack() {
    if (saving) return;
    setStockModalOpen(false);
    setStockAckPhysical(false);
  }

  async function handleStockModalProceed() {
    const hasOut = stockIssues.some((i) => i.kind === "out");
    if (hasOut && !stockAckPhysical) return;
    setStockModalOpen(false);
    setStockAckPhysical(false);
    await runCreateOrder(hasOut);
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-2xl font-semibold text-brand-text">New order</h1>
        <SupabaseSetupBanner />
      </div>
    );
  }

  const stockHasOut = stockIssues.some((i) => i.kind === "out");

  return (
    <>
    <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-brand-text">New order</h1>
          <p className="mt-1 text-sm text-brand-text/70">
            Tap + to add items. Queue number is assigned when you proceed to payment.
          </p>
        </div>
        {loadError && (
          <Card className="border-red-200 bg-red-50/80 p-3 text-sm text-red-800">{loadError}</Card>
        )}
        {loading ? (
          <p className="text-sm text-brand-text/60">Loading menu…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {menu.map((item) => {
              const q = cartQty[item.id] ?? 0;
              const stock = item.is_bundle ? null : stockById[item.id] ?? 0;
              const th =
                item.low_stock_threshold != null ? item.low_stock_threshold : defaultLow;
              const low = !item.is_bundle && stock != null && stock > 0 && stock <= th;
              const out = !item.is_bundle && stock != null && stock <= 0;
              return (
                <Card key={item.id} className="flex flex-col overflow-hidden p-0">
                  <div className="relative aspect-[4/3] bg-brand-bg">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-brand-text/40">
                        No image
                      </div>
                    )}
                    {!item.is_bundle && (
                      <div className="absolute right-2 top-2">
                        {out ? (
                          <Badge className="bg-red-100 text-red-800">Out</Badge>
                        ) : low ? (
                          <Badge tone="warning">{stock} left</Badge>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="font-medium leading-snug text-brand-text">{item.name}</div>
                    <div className="text-sm font-mono text-brand-text/80">
                      {formatRupiah(item.price)}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-2"
                        onClick={() => deltaQty(item.id, -1)}
                        disabled={q === 0}
                      >
                        −
                      </Button>
                      <span className="min-w-[2ch] text-center font-mono text-sm">{q}</span>
                      <Button type="button" className="px-2" onClick={() => addOne(item.id)}>
                        +
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-96 lg:self-start">
        <Card className="space-y-4 p-4">
          <h2 className="font-display text-lg font-semibold text-brand-text">Cart</h2>
          {cartLines.length === 0 ? (
            <p className="text-sm text-brand-text/60">Cart is empty.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {cartLines.map((l) => (
                <li
                  key={l.item.id}
                  className="flex items-start justify-between gap-2 border-b border-brand-text/5 pb-2"
                >
                  <div>
                    <div className="font-medium">{l.item.name}</div>
                    <div className="text-xs text-brand-text/60">
                      {formatRupiah(l.item.price)} × {l.quantity}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-sm">{formatRupiah(l.item.price * l.quantity)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 px-2 py-0 text-xs"
                      onClick={() => setCartQty((q) => {
                        const copy = { ...q };
                        delete copy[l.item.id];
                        return copy;
                      })}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div>
            <Label htmlFor="cust">Customer name (optional)</Label>
            <Input
              id="cust"
              className="mt-1"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Guest"
            />
          </div>

          <div className="space-y-2">
            <Label>Discount</Label>
            <div className="flex flex-col gap-2 text-sm">
              {(
                [
                  ["none", "None"],
                  ["preset", "Preset"],
                  ["manual_percent", "Manual %"],
                  ["manual_fixed", "Manual Rp"],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="disc"
                    checked={discountMode === v}
                    onChange={() => setDiscountMode(v)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {discountMode === "preset" && (
              <div className="mt-2">
                <select
                  className="w-full rounded-lg border border-brand-text/20 bg-white px-3 py-2 text-sm"
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value)}
                >
                  <option value="">Select preset…</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {selectedPreset?.min_purchase != null && selectedPreset.min_purchase > 0 && (
                  <p className="mt-1 text-xs text-brand-text/60">
                    Min purchase {formatRupiah(selectedPreset.min_purchase)}
                  </p>
                )}
              </div>
            )}
            {discountMode === "manual_percent" && (
              <div className="mt-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={manualPercent}
                  onChange={(e) => setManualPercent(e.target.value)}
                  placeholder="%"
                />
              </div>
            )}
            {discountMode === "manual_fixed" && (
              <div className="mt-2">
                <Input
                  inputMode="numeric"
                  value={manualFixed}
                  onChange={(e) => setManualFixed(e.target.value)}
                  placeholder="Rp"
                />
              </div>
            )}
            <p className="text-sm text-brand-text/80">
              Discount: <span className="font-mono">{formatRupiah(discountAmount)}</span>
            </p>
          </div>

          <div className="space-y-1 border-t border-brand-text/10 pt-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono">{formatRupiah(subtotal)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="font-mono">{formatRupiah(totalAmount)}</span>
            </div>
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={cartLines.length === 0 || saving || stockModalOpen}
            onClick={() => void onProceed()}
          >
            {saving ? "Creating…" : "Proceed to payment"}
          </Button>
        </Card>
      </aside>
    </div>

    <Modal
      open={stockModalOpen}
      title="Stock review before payment"
      size="wide"
      onClose={() => !saving && handleStockModalGoBack()}
    >
      <p className="text-sm text-brand-text/80">
        Stock levels are computed from recorded movements in Supabase. Another register or delay can make
        this view outdated.
      </p>
      {stockHasOut && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50/90 p-2 text-sm text-red-900">
          At least one item is below the quantity needed for this cart. Go back to change quantities, or
          override only if you have verified physical stock.
        </p>
      )}

      <div className="mt-4 space-y-4 text-sm">
        {stockIssues.filter((i) => i.kind === "out").length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Out of stock (book)</p>
            <ul className="mt-2 space-y-2">
              {stockIssues
                .filter((i) => i.kind === "out")
                .map((i) => (
                  <li key={i.id} className="rounded-lg border border-red-200/80 bg-red-50/50 p-3">
                    <p className="font-medium text-brand-text">{i.name}</p>
                    <p className="mt-1 text-xs text-brand-text/75">{i.detail}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-brand-text/85">
                      <dt>Units required (cart)</dt>
                      <dd className="text-right tabular-nums">{i.orderedQty}</dd>
                      <dt>Recorded available</dt>
                      <dd className="text-right tabular-nums">{i.available}</dd>
                    </dl>
                  </li>
                ))}
            </ul>
          </div>
        )}
        {stockIssues.filter((i) => i.kind === "low").length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-yellow">Low stock (warning)</p>
            <ul className="mt-2 space-y-2">
              {stockIssues
                .filter((i) => i.kind === "low")
                .map((i) => (
                  <li key={i.id} className="rounded-lg border border-brand-yellow/50 bg-brand-yellow/10 p-3">
                    <p className="font-medium text-brand-text">{i.name}</p>
                    <p className="mt-1 text-xs text-brand-text/75">{i.detail}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-brand-text/85">
                      <dt>Units required (cart)</dt>
                      <dd className="text-right tabular-nums">{i.orderedQty}</dd>
                      <dt>Recorded available</dt>
                      <dd className="text-right tabular-nums">{i.available}</dd>
                      <dt>Low threshold</dt>
                      <dd className="text-right tabular-nums">{i.threshold}</dd>
                    </dl>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      {stockHasOut && (
        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-brand-text">
          <input
            type="checkbox"
            className="mt-1"
            checked={stockAckPhysical}
            onChange={(e) => setStockAckPhysical(e.target.checked)}
          />
          <span>I confirm the physical stock is still available</span>
        </label>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-brand-text/10 pt-4">
        <Button type="button" variant="secondary" disabled={saving} onClick={handleStockModalGoBack}>
          Go Back to Edit Order
        </Button>
        {!stockHasOut ? (
          <Button type="button" disabled={saving} onClick={() => void handleStockModalProceed()}>
            {saving ? "Creating…" : "Continue to payment"}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={saving || !stockAckPhysical}
            onClick={() => void handleStockModalProceed()}
          >
            {saving ? "Creating…" : "Override and Continue"}
          </Button>
        )}
      </div>
    </Modal>
    </>
  );
}
