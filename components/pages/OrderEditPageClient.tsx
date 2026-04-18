"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import {
  computeComboPricing,
  type ComboCartLine,
  type ComboPackageDef,
  type GroupMembersMap,
} from "@/lib/comboPricing";
import { EVENT_SETTINGS_ROW_ID } from "@/lib/constants";
import { formatQueueDisplay, formatRupiah } from "@/lib/format";
import type { DiscountMode } from "@/lib/newOrderDraft";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type MenuRow = {
  id: string;
  name: string;
  price: number;
  is_bundle: boolean;
};

type PresetRow = {
  id: string;
  name: string;
  discount_type: "percent" | "fixed";
  value: number;
  min_purchase: number | null;
};

type CartLine = { item: MenuRow; quantity: number };

export function OrderEditPageClient() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [guardMsg, setGuardMsg] = useState<string | null>(null);
  const [queueNum, setQueueNum] = useState(0);

  const [menu, setMenu] = useState<MenuRow[]>([]);
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [comboPackages, setComboPackages] = useState<ComboPackageDef[]>([]);
  const [comboMembersByGroup, setComboMembersByGroup] = useState<GroupMembersMap>({});
  const [comboRulesLoaded, setComboRulesLoaded] = useState(false);
  const [comboAutoApply, setComboAutoApply] = useState(true);

  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("none");
  const [presetId, setPresetId] = useState("");
  const [manualPercent, setManualPercent] = useState("");
  const [manualFixed, setManualFixed] = useState("");
  const [bestComboApplied, setBestComboApplied] = useState(false);

  const [saving, setSaving] = useState(false);
  const [sendingKitchen, setSendingKitchen] = useState(false);
  const skipComboReset = useRef(true);

  const loadAll = useCallback(async () => {
    if (!isSupabaseConfigured() || !orderId) {
      setLoading(false);
      return;
    }
    setGuardMsg(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();

      const { data: pay } = await supabase.from("payments").select("id").eq("order_id", orderId).maybeSingle();
      if (pay) {
        setGuardMsg("This order already has a payment recorded. Editing is disabled.");
        setLoading(false);
        return;
      }

      const { data: o, error: oErr } = await supabase
        .from("orders")
        .select(
          "queue_number, payment_status, serving_status, voided_at, customer_name, cashier_order_note, discount_type, discount_preset_id, discount_manual_percent, discount_manual_fixed"
        )
        .eq("id", orderId)
        .single();
      if (oErr) throw oErr;
      if (!o) throw new Error("Order not found");

      if ((o as { voided_at?: string | null }).voided_at != null) {
        setGuardMsg("Voided orders cannot be edited.");
        setLoading(false);
        return;
      }
      if ((o.payment_status as string) !== "pending") {
        setGuardMsg("Only pending (unpaid) orders can be edited here.");
        setLoading(false);
        return;
      }
      if ((o.serving_status as string) !== "not_sent") {
        setGuardMsg("This order is already in or past the kitchen queue. Open Transactions or Kitchen for operations.");
        setLoading(false);
        return;
      }

      setQueueNum(Number(o.queue_number));
      setCustomerName((o.customer_name as string | null) ?? "");
      setOrderNotes((o.cashier_order_note as string | null) ?? "");
      const dt = o.discount_type as string;
      if (dt === "none" || dt === "preset" || dt === "manual_percent" || dt === "manual_fixed") {
        setDiscountMode(dt);
      }
      setPresetId((o.discount_preset_id as string | null) ?? "");
      const dmp = o.discount_manual_percent as number | null;
      setManualPercent(dmp != null && Number.isFinite(Number(dmp)) ? String(dmp) : "");
      const dmf = o.discount_manual_fixed as number | null;
      setManualFixed(dmf != null ? String(Math.round(Number(dmf))) : "");

      const { data: lines, error: lErr } = await supabase
        .from("order_items")
        .select("menu_item_id, quantity")
        .eq("order_id", orderId);
      if (lErr) throw lErr;
      const qty: Record<string, number> = {};
      for (const r of lines ?? []) {
        qty[r.menu_item_id as string] = Number(r.quantity);
      }
      setCartQty(qty);
      skipComboReset.current = true;

      const { data: settings } = await supabase
        .from("event_settings")
        .select("combo_auto_apply")
        .eq("id", EVENT_SETTINGS_ROW_ID)
        .maybeSingle();
      if (settings && typeof (settings as { combo_auto_apply?: boolean }).combo_auto_apply === "boolean") {
        setComboAutoApply((settings as { combo_auto_apply: boolean }).combo_auto_apply);
      }

      try {
        const { data: pkgRows, error: pkgErr } = await supabase
          .from("combo_packages")
          .select("id, name, package_price, priority, is_active, is_configured");
        if (pkgErr) throw pkgErr;
        const { data: slotRows, error: slErr } = await supabase
          .from("combo_package_slots")
          .select("package_id, group_id, quantity, sort_order")
          .order("sort_order", { ascending: true });
        if (slErr) throw slErr;
        const { data: memRows, error: memErr } = await supabase.from("combo_group_members").select("group_id, menu_item_id");
        if (memErr) throw memErr;

        const slotsByPkg = new Map<string, { groupId: string; quantity: number; sortOrder: number }[]>();
        for (const r of slotRows ?? []) {
          const pid = r.package_id as string;
          const arr = slotsByPkg.get(pid) ?? [];
          arr.push({
            groupId: r.group_id as string,
            quantity: Number(r.quantity),
            sortOrder: Number(r.sort_order),
          });
          slotsByPkg.set(pid, arr);
        }
        const members: GroupMembersMap = {};
        for (const r of memRows ?? []) {
          const gid = r.group_id as string;
          const mid = r.menu_item_id as string;
          if (!members[gid]) members[gid] = [];
          members[gid].push(mid);
        }
        const defs: ComboPackageDef[] = (pkgRows ?? []).map((r) => ({
          id: r.id as string,
          name: r.name as string,
          packagePrice: Number(r.package_price),
          priority: Number(r.priority),
          isActive: Boolean(r.is_active),
          isConfigured: Boolean(r.is_configured),
          slots: (slotsByPkg.get(r.id as string) ?? []).map((s) => ({
            groupId: s.groupId,
            quantity: s.quantity,
            sortOrder: s.sortOrder,
          })),
        }));
        setComboPackages(defs);
        setComboMembersByGroup(members);
      } catch {
        setComboPackages([]);
        setComboMembersByGroup({});
      }
      setComboRulesLoaded(true);

      const { data: menuData, error: menuErr } = await supabase
        .from("menu_items")
        .select("id, name, price, is_active, is_bundle")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (menuErr) throw menuErr;
      setMenu(
        (menuData ?? []).map((r) => ({
          id: r.id as string,
          name: r.name as string,
          price: Number(r.price),
          is_bundle: Boolean(r.is_bundle),
        }))
      );

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
    } catch (e) {
      setGuardMsg(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (skipComboReset.current) {
      skipComboReset.current = false;
      return;
    }
    setBestComboApplied(false);
  }, [cartQty]);

  const cartLines = useMemo((): CartLine[] => {
    const out: CartLine[] = [];
    for (const item of menu) {
      const q = cartQty[item.id] ?? 0;
      if (q > 0) out.push({ item, quantity: q });
    }
    return out;
  }, [menu, cartQty]);

  const subtotal = useMemo(
    () => cartLines.reduce((s, l) => s + l.item.price * l.quantity, 0),
    [cartLines]
  );

  const comboCartLines = useMemo(
    (): ComboCartLine[] =>
      cartLines.map((l) => ({
        itemId: l.item.id,
        itemName: l.item.name,
        quantity: l.quantity,
        unitPrice: l.item.price,
        is_bundle: l.item.is_bundle,
      })),
    [cartLines]
  );

  const comboPricingResult = useMemo(() => {
    if (!comboRulesLoaded || comboPackages.length === 0) {
      return { applications: [] as const, comboSavingsAmount: 0, snapshot: [] as const };
    }
    return computeComboPricing(comboCartLines, comboPackages, comboMembersByGroup);
  }, [comboRulesLoaded, comboPackages, comboMembersByGroup, comboCartLines]);

  const comboSavingsActive = comboAutoApply || bestComboApplied;
  const comboSavingsAmount = comboSavingsActive ? comboPricingResult.comboSavingsAmount : 0;
  const comboSnapshotPersist = comboSavingsActive ? comboPricingResult.snapshot : [];

  const selectedPreset = useMemo(() => presets.find((p) => p.id === presetId) ?? null, [presets, presetId]);

  const discountBase = useMemo(
    () => Math.max(0, Math.round(subtotal - comboSavingsAmount)),
    [subtotal, comboSavingsAmount]
  );

  const discountAmount = useMemo(() => {
    if (discountMode === "none") return 0;
    if (discountMode === "preset" && selectedPreset) {
      if (selectedPreset.discount_type === "percent") {
        return Math.floor((selectedPreset.value / 100) * discountBase);
      }
      return Math.min(discountBase, Math.round(selectedPreset.value));
    }
    if (discountMode === "manual_percent") {
      const p = Number.parseFloat(manualPercent);
      if (!Number.isFinite(p) || p <= 0) return 0;
      return Math.floor((Math.min(100, p) / 100) * discountBase);
    }
    if (discountMode === "manual_fixed") {
      const digits = manualFixed.replace(/\D/g, "");
      const v = digits === "" ? 0 : Number.parseInt(digits, 10);
      return Math.min(discountBase, v);
    }
    return 0;
  }, [discountMode, selectedPreset, discountBase, manualPercent, manualFixed]);

  const totalAmount = useMemo(
    () => Math.max(0, Math.round(subtotal - comboSavingsAmount - discountAmount)),
    [subtotal, comboSavingsAmount, discountAmount]
  );

  async function persistOrderBody() {
    const supabase = getSupabaseBrowserClient();
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

    const { error: uErr } = await supabase
      .from("orders")
      .update({
        customer_name: customerName.trim() || null,
        cashier_order_note: orderNotes.trim() || null,
        subtotal,
        combo_savings_amount: comboSavingsAmount,
        combo_snapshot: comboSnapshotPersist.length > 0 ? (comboSnapshotPersist as unknown as object) : null,
        discount_type: discountMode,
        discount_preset_id: discountPresetId,
        discount_label: discountLabel,
        discount_manual_percent: discManualPct,
        discount_manual_fixed: discManualFixed,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("payment_status", "pending");

    if (uErr) throw uErr;

    const { error: dErr } = await supabase.from("order_items").delete().eq("order_id", orderId);
    if (dErr) throw dErr;

    const itemRows = cartLines.map((l) => ({
      order_id: orderId,
      menu_item_id: l.item.id,
      item_name: l.item.name,
      item_price: l.item.price,
      quantity: l.quantity,
      line_total: l.item.price * l.quantity,
    }));
    if (itemRows.length > 0) {
      const { error: iErr } = await supabase.from("order_items").insert(itemRows);
      if (iErr) throw iErr;
    }
  }

  async function onSave() {
    if (!isSupabaseConfigured() || cartLines.length === 0) {
      showToast("Cart cannot be empty.", "error");
      return;
    }
    if (discountMode === "preset" && !selectedPreset) {
      showToast("Select a discount preset.", "error");
      return;
    }
    setSaving(true);
    try {
      await persistOrderBody();
      showToast("Order updated.");
      await loadAll();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmKitchen() {
    if (!isSupabaseConfigured()) return;
    if (cartLines.length === 0) {
      showToast("Add at least one line before sending to the kitchen.", "error");
      return;
    }
    setSendingKitchen(true);
    try {
      await persistOrderBody();
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase
        .from("orders")
        .update({
          serving_status: "queued",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("payment_status", "pending")
        .eq("serving_status", "not_sent");
      if (error) throw error;
      showToast(`Order ${formatQueueDisplay(queueNum)} sent to kitchen (queued).`);
      router.push("/transactions");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update kitchen status", "error");
    } finally {
      setSendingKitchen(false);
    }
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

  const [addMenuId, setAddMenuId] = useState("");

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader eyebrow="Orders" title="Edit pending order" description="" />
        <SupabaseSetupBanner />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="h-8 animate-pulse rounded-lg bg-brand-text/8" />
      </div>
    );
  }

  if (guardMsg) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <PageHeader eyebrow="Orders" title="Edit pending order" description="" />
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{guardMsg}</Card>
        <Link href="/transactions" className="text-sm font-medium text-brand-red underline">
          Back to transactions
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Orders"
        title={`Edit order ${formatQueueDisplay(queueNum)}`}
        description="Pending payment · no payment row yet · change lines, discounts, then save or send to kitchen."
        actions={
          <Link
            href="/transactions"
            className="inline-flex min-h-10 items-center justify-center rounded-ref-sm border border-brand-text/12 bg-white px-4 py-2 text-xs font-semibold text-brand-text shadow-card hover:bg-brand-fill"
          >
            Transactions
          </Link>
        }
      />

      <Card className="space-y-4 p-4">
        <h2 className="font-display text-sm uppercase tracking-wide text-brand-yellow">Lines</h2>
        <ul className="space-y-2">
          {cartLines.map((l) => (
            <li key={l.item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-text/8 pb-2">
              <span className="font-medium">{l.item.name}</span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" className="min-h-8 min-w-8 px-0" onClick={() => deltaQty(l.item.id, -1)}>
                  −
                </Button>
                <span className="w-8 text-center font-sans tabular-nums">{l.quantity}</span>
                <Button type="button" className="min-h-8 min-w-8 px-0" onClick={() => deltaQty(l.item.id, 1)}>
                  +
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Label>Add menu item</Label>
            <select
              className="mt-1 w-full rounded-ref-sm border border-brand-text/12 bg-white px-2 py-2 text-sm"
              value={addMenuId}
              onChange={(e) => setAddMenuId(e.target.value)}
            >
              <option value="">Select…</option>
              {menu.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {formatRupiah(m.price)}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (!addMenuId) return;
              deltaQty(addMenuId, 1);
              setAddMenuId("");
            }}
          >
            Add
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <Label htmlFor="cust">Customer name</Label>
        <Input id="cust" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <Label htmlFor="notes">Cashier notes</Label>
        <Input id="notes" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
      </Card>

      <Card className="space-y-3 p-4">
        <Label>Discount</Label>
        <div className="flex flex-wrap gap-1.5">
          {(["none", "preset", "manual_percent", "manual_fixed"] as const).map((v) => (
            <label
              key={v}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${
                discountMode === v ? "border-brand-red bg-brand-red text-white" : "border-brand-text/20 bg-white"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                checked={discountMode === v}
                onChange={() => setDiscountMode(v)}
              />
              {v === "none" ? "None" : v === "preset" ? "Preset" : v === "manual_percent" ? "% Manual" : "Rp Manual"}
            </label>
          ))}
        </div>
        {discountMode === "preset" && (
          <select
            className="w-full rounded-ref-sm border border-brand-text/12 bg-brand-fill px-3 py-2 text-sm"
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
        )}
        {discountMode === "manual_percent" && (
          <Input type="number" value={manualPercent} onChange={(e) => setManualPercent(e.target.value)} placeholder="%" />
        )}
        {discountMode === "manual_fixed" && (
          <Input inputMode="numeric" value={manualFixed} onChange={(e) => setManualFixed(e.target.value)} placeholder="Rp" />
        )}
        <div className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            id="bc"
            checked={bestComboApplied}
            onChange={(e) => setBestComboApplied(e.target.checked)}
          />
          <label htmlFor="bc">Apply best combo when auto is off</label>
        </div>
        <p className="text-sm text-brand-text/80">
          Subtotal {formatRupiah(subtotal)} · Combo −{formatRupiah(comboSavingsAmount)} · Discount −{formatRupiah(discountAmount)}{" "}
          · <strong>Total {formatRupiah(totalAmount)}</strong>
        </p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void onSave()} disabled={saving || sendingKitchen}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="border-brand-green/40 bg-brand-green/15 text-brand-text"
          disabled={saving || sendingKitchen}
          onClick={() => void onConfirmKitchen()}
        >
          {sendingKitchen ? "Sending…" : "Confirm & send to kitchen"}
        </Button>
        <Link
          href={`/order/${orderId}/payment`}
          className="inline-flex min-h-10 items-center justify-center rounded-ref-sm border border-brand-text/12 bg-white px-4 py-2 text-xs font-semibold text-brand-text shadow-card hover:bg-brand-fill"
        >
          Go to payment
        </Link>
      </div>
    </div>
  );
}
