"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  computeComboPricing,
  type ComboCartLine,
  type ComboPackageDef,
  type GroupMembersMap,
} from "@/lib/comboPricing";
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

const NEW_ORDER_DRAFT_KEY = "wrapz_new_order_draft_v1";

type NewOrderDraftV1 = {
  v: 1;
  cartQty: Record<string, number>;
  customerName: string;
  orderNotes: string;
  discountMode: DiscountMode;
  presetId: string;
  manualPercent: string;
  manualFixed: string;
  bestComboApplied: boolean;
};

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
  const [orderNotes, setOrderNotes] = useState("");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("none");
  const [presetId, setPresetId] = useState<string>("");
  const [manualPercent, setManualPercent] = useState("");
  const [manualFixed, setManualFixed] = useState("");

  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockIssues, setStockIssues] = useState<StockIssue[]>([]);
  const [stockAckPhysical, setStockAckPhysical] = useState(false);

  const [comboAutoApply, setComboAutoApply] = useState(true);
  const [comboPackages, setComboPackages] = useState<ComboPackageDef[]>([]);
  const [comboMembersByGroup, setComboMembersByGroup] = useState<GroupMembersMap>({});
  const [comboRulesLoaded, setComboRulesLoaded] = useState(false);
  const [comboFetchError, setComboFetchError] = useState<string | null>(null);
  const [bestComboApplied, setBestComboApplied] = useState(false);
  const [cardFlashId, setCardFlashId] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const skipNextComboResetForCart = useRef(true);

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
        .select("default_low_stock_threshold, combo_auto_apply")
        .eq("id", EVENT_SETTINGS_ROW_ID)
        .maybeSingle();
      if (settings?.default_low_stock_threshold != null) {
        setDefaultLow(Number(settings.default_low_stock_threshold));
      }
      if (settings && typeof settings.combo_auto_apply === "boolean") {
        setComboAutoApply(settings.combo_auto_apply);
      } else {
        setComboAutoApply(true);
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
        const { data: memRows, error: memErr } = await supabase
          .from("combo_group_members")
          .select("group_id, menu_item_id");
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
        for (const k of Object.keys(members)) {
          members[k].sort((a, b) => a.localeCompare(b));
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
        setComboFetchError(null);
        setComboRulesLoaded(true);
      } catch (err) {
        setComboPackages([]);
        setComboMembersByGroup({});
        setComboFetchError(err instanceof Error ? err.message : "Gagal memuat aturan combo");
        setComboRulesLoaded(true);
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NEW_ORDER_DRAFT_KEY);
      if (!raw) {
        setDraftHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as Partial<NewOrderDraftV1>;
      if (parsed?.v !== 1) {
        setDraftHydrated(true);
        return;
      }
      if (parsed.cartQty && typeof parsed.cartQty === "object") setCartQty(parsed.cartQty);
      if (typeof parsed.customerName === "string") setCustomerName(parsed.customerName);
      if (typeof parsed.orderNotes === "string") setOrderNotes(parsed.orderNotes);
      if (
        parsed.discountMode === "none" ||
        parsed.discountMode === "preset" ||
        parsed.discountMode === "manual_percent" ||
        parsed.discountMode === "manual_fixed"
      ) {
        setDiscountMode(parsed.discountMode);
      }
      if (typeof parsed.presetId === "string") setPresetId(parsed.presetId);
      if (typeof parsed.manualPercent === "string") setManualPercent(parsed.manualPercent);
      if (typeof parsed.manualFixed === "string") setManualFixed(parsed.manualFixed);
      if (typeof parsed.bestComboApplied === "boolean") setBestComboApplied(parsed.bestComboApplied);
    } catch {
      /* ignore corrupt draft */
    } finally {
      setDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!draftHydrated || typeof window === "undefined") return;
    const draft: NewOrderDraftV1 = {
      v: 1,
      cartQty,
      customerName,
      orderNotes,
      discountMode,
      presetId,
      manualPercent,
      manualFixed,
      bestComboApplied,
    };
    try {
      localStorage.setItem(NEW_ORDER_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* quota / private mode */
    }
  }, [
    draftHydrated,
    cartQty,
    customerName,
    orderNotes,
    discountMode,
    presetId,
    manualPercent,
    manualFixed,
    bestComboApplied,
  ]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (skipNextComboResetForCart.current) {
      skipNextComboResetForCart.current = false;
      return;
    }
    setBestComboApplied(false);
  }, [cartQty, draftHydrated]);

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

  const comboCartLines = useMemo((): ComboCartLine[] => {
    return cartLines.map((l) => ({
      itemId: l.item.id,
      itemName: l.item.name,
      quantity: l.quantity,
      unitPrice: l.item.price,
      is_bundle: l.item.is_bundle,
    }));
  }, [cartLines]);

  const comboPricingResult = useMemo(() => {
    if (!comboRulesLoaded || comboPackages.length === 0) {
      return { applications: [] as const, comboSavingsAmount: 0, snapshot: [] as const };
    }
    return computeComboPricing(comboCartLines, comboPackages, comboMembersByGroup);
  }, [comboRulesLoaded, comboPackages, comboMembersByGroup, comboCartLines]);

  const comboSavingsActive = comboAutoApply || bestComboApplied;
  const comboSavingsAmount = comboSavingsActive ? comboPricingResult.comboSavingsAmount : 0;
  const comboSnapshotPersist = comboSavingsActive ? comboPricingResult.snapshot : [];

  const discountBase = useMemo(
    () => Math.max(0, Math.round(subtotal - comboSavingsAmount)),
    [subtotal, comboSavingsAmount]
  );

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === presetId) ?? null,
    [presets, presetId]
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
      const clamped = Math.min(100, Math.max(0, p));
      return Math.floor((clamped / 100) * discountBase);
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

  const potentialComboSavings = comboPricingResult.comboSavingsAmount;

  const hasMatcherPackages = useMemo(
    () =>
      comboPackages.some((p) => p.isActive && p.isConfigured && p.slots.length > 0),
    [comboPackages]
  );

  const subtotalAfterCombo = useMemo(
    () => Math.max(0, Math.round(subtotal - comboSavingsAmount)),
    [subtotal, comboSavingsAmount]
  );

  function addOneFromCard(id: string) {
    setCardFlashId(id);
    window.setTimeout(() => setCardFlashId((cur) => (cur === id ? null : cur)), 180);
    setCartQty((q) => ({ ...q, [id]: (q[id] ?? 0) + 1 }));
  }

  function addOne(id: string) {
    setCartQty((q) => ({ ...q, [id]: (q[id] ?? 0) + 1 }));
  }

  function clearDraft() {
    setCartQty({});
    setCustomerName("");
    setOrderNotes("");
    setDiscountMode("none");
    setPresetId("");
    setManualPercent("");
    setManualFixed("");
    setBestComboApplied(false);
    try {
      localStorage.removeItem(NEW_ORDER_DRAFT_KEY);
    } catch {
      /* ignore */
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
          cashier_order_note: orderNotes.trim() || null,
          subtotal,
          combo_savings_amount: comboSavingsAmount,
          combo_snapshot:
            comboSnapshotPersist.length > 0 ? (comboSnapshotPersist as unknown as object) : null,
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

      try {
        localStorage.removeItem(NEW_ORDER_DRAFT_KEY);
      } catch {
        /* ignore */
      }
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
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader
          eyebrow="Service"
          title="New order"
          description="Tap items to build a cart. Queue number is assigned when you proceed to payment."
        />
        <SupabaseSetupBanner />
      </div>
    );
  }

  const stockHasOut = stockIssues.some((i) => i.kind === "out");

  return (
    <>
    <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-4">
        <PageHeader
          eyebrow="Service"
          title="New order"
          description="Tap a menu card to add items. Queue number is assigned when you proceed to payment."
          actions={
            <Button type="button" variant="secondary" className="min-h-[44px]" onClick={clearDraft}>
              Clear
            </Button>
          }
        />
        {loadError && (
          <Card className="border-red-200 bg-red-50/80 p-3 text-sm text-red-800">{loadError}</Card>
        )}
        {loading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-full animate-pulse rounded-lg bg-brand-text/8" />
            ))}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {menu.map((item) => {
              const q = cartQty[item.id] ?? 0;
              const stock = item.is_bundle ? null : stockById[item.id] ?? 0;
              const th =
                item.low_stock_threshold != null ? item.low_stock_threshold : defaultLow;
              const low = !item.is_bundle && stock != null && stock > 0 && stock <= th;
              const out = !item.is_bundle && stock != null && stock <= 0;
              const active = q > 0;
              const flash = cardFlashId === item.id;
              return (
                <li
                  key={item.id}
                  className={`relative flex flex-col overflow-hidden rounded-xl border bg-white p-2 transition hover:shadow-card ${
                    active
                      ? "border-brand-yellow ring-2 ring-brand-yellow/90 ring-offset-1 ring-offset-white"
                      : "border-brand-text/10 hover:border-brand-red/30"
                  } ${flash ? "bg-brand-yellow-soft/70" : ""}`}
                >
                  <button
                    type="button"
                    className="-m-0.5 mb-1 flex min-h-[120px] flex-col rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
                    onClick={() => addOneFromCard(item.id)}
                    aria-label={`Add one ${item.name}`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-brand-bg">
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
                        <div className="absolute right-1.5 top-1.5">
                          {out ? (
                            <Badge tone="danger">Out</Badge>
                          ) : low ? (
                            <Badge tone="warning">{stock} left</Badge>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <p className="mt-1.5 px-0.5 text-sm font-semibold leading-snug text-brand-text">{item.name}</p>
                    <p className="mt-0.5 px-0.5 font-display text-base font-normal tabular-nums tracking-wide text-brand-text/70">
                      {formatRupiah(item.price)}
                    </p>
                  </button>
                  <div
                    className="mt-1 flex items-center justify-between gap-2 border-t border-brand-text/8 pt-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2"
                      onClick={() => deltaQty(item.id, -1)}
                      disabled={q === 0}
                    >
                      −
                    </Button>
                    <span
                      className={`min-w-[2ch] text-center font-display text-lg font-normal tabular-nums tracking-wide ${
                        flash ? "scale-110 font-semibold text-brand-red transition-transform" : "text-brand-text"
                      }`}
                    >
                      {q}
                    </span>
                    <Button type="button" className="px-2" onClick={() => addOne(item.id)}>
                      +
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-96 lg:self-start">
        <Card className="space-y-4 p-4">
          <h2 className="font-display text-xl font-normal uppercase tracking-wide text-brand-yellow">Cart</h2>
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
                    <span className="font-display text-lg font-normal tabular-nums tracking-wide text-brand-text">
                      {formatRupiah(l.item.price * l.quantity)}
                    </span>
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

          {comboFetchError ? (
            <Card className="border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-950">
              <strong className="font-semibold">Aturan combo tidak dimuat.</strong> {comboFetchError}
            </Card>
          ) : null}

          {comboRulesLoaded && hasMatcherPackages && cartLines.length > 0 ? (
            <div className="rounded-lg border-2 border-brand-yellow/50 bg-brand-yellow-soft/60 p-3 text-sm shadow-sm">
              <h3 className="font-display text-sm font-normal uppercase tracking-wide text-brand-text">
                Combo & paket
              </h3>
              {comboSavingsActive && comboSavingsAmount > 0 ? (
                <>
                  <p className="mt-2 text-xs font-semibold text-brand-text/80">Combo aktif — diterapkan ke total</p>
                  <ul className="mt-2 space-y-2">
                    {comboPricingResult.snapshot.length > 0 ? (
                      comboPricingResult.snapshot.map((row) => (
                        <li
                          key={row.package_id}
                          className="rounded-md border border-brand-text/10 bg-white/90 px-2 py-2"
                        >
                          <div className="font-semibold text-brand-text">
                            Paket {row.package_name}
                            {row.count > 1 ? ` ×${row.count}` : ""} diterapkan
                          </div>
                          <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-brand-text/75">
                            <span>
                              Harga list {formatRupiah(row.list_value)} → paket {formatRupiah(row.package_value)}
                            </span>
                            <span className="font-semibold text-emerald-900">
                              Hemat −{formatRupiah(Math.max(0, row.savings))}
                            </span>
                          </div>
                          {row.allocations.length > 0 ? (
                            <p className="mt-1 text-xs text-brand-text/55">
                              {row.allocations
                                .map((a) => `${a.quantity}× ${a.menu_item_name}`)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </li>
                      ))
                    ) : (
                      <li className="rounded-md bg-white/90 px-2 py-2 text-brand-text">
                        Hemat combo total:{" "}
                        <span className="font-semibold text-emerald-900">
                          −{formatRupiah(Math.max(0, comboSavingsAmount))}
                        </span>
                      </li>
                    )}
                  </ul>
                  <p className="mt-2 text-xs text-brand-text/65">
                    Total di bawah sudah memakai hemat combo (subtotal list tetap ditampilkan).
                  </p>
                </>
              ) : potentialComboSavings > 0 ? (
                <>
                  <p className="mt-2 text-xs text-brand-text/80">
                    Tersedia hemat combo sebesar{" "}
                    <span className="font-semibold text-emerald-900">{formatRupiah(potentialComboSavings)}</span>
                    {!comboAutoApply ? (
                      <>
                        . Tekan <strong>Terapkan combo terbaik</strong> untuk memakainya.
                      </>
                    ) : (
                      <> — seharusnya otomatis aktif; periksa pengaturan paket di menu Combo.</>
                    )}
                  </p>
                  {!comboAutoApply ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-3 w-full"
                      onClick={() => setBestComboApplied(true)}
                    >
                      Terapkan combo terbaik
                    </Button>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-xs text-brand-text/70">
                  Belum ada paket combo yang cocok dengan isi keranjang saat ini (cek kategori item & isi paket di
                  pengaturan).
                </p>
              )}
            </div>
          ) : comboRulesLoaded && cartLines.length > 0 && !hasMatcherPackages ? (
            <p className="text-xs text-brand-text/55">
              Belum ada paket combo yang siap dipakai. Atur di <strong>Pengaturan → Combo</strong>.
            </p>
          ) : null}

          <hr className="border-brand-text/10" />

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

          <div>
            <Label htmlFor="ord-notes">Notes (optional)</Label>
            <Input
              id="ord-notes"
              className="mt-1"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="Allergies, pickup detail, etc."
            />
            <p className="mt-1 text-xs text-brand-text/50">Shown on the kitchen board with other cashier notes.</p>
          </div>

          <hr className="border-brand-text/10" />

          <div className="space-y-2">
            <Label>Discount</Label>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["none", "None"],
                  ["preset", "Preset"],
                  ["manual_percent", "% Manual"],
                  ["manual_fixed", "Rp Manual"],
                ] as const
              ).map(([v, label]) => (
                <label
                  key={v}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition ${
                    discountMode === v
                      ? "border-brand-red bg-brand-red text-white"
                      : "border-brand-text/20 bg-white text-brand-text hover:border-brand-red/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="disc"
                    className="sr-only"
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
                  className="w-full rounded-ref-sm border border-brand-text/12 bg-brand-fill px-3 py-2 text-sm text-brand-text"
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
              Discount:{" "}
              <span className="font-display text-lg font-normal tabular-nums tracking-wide text-brand-text">
                {formatRupiah(discountAmount)}
              </span>
            </p>
            <p className="text-xs text-brand-text/55">
              Diskon dihitung setelah hemat combo. Minimum belanja preset tetap memakai subtotal harga list (
              {formatRupiah(subtotal)}).
            </p>
          </div>

          <div className="space-y-1 border-t border-brand-text/10 pt-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal (list)</span>
              <span className="font-sans tabular-nums">{formatRupiah(subtotal)}</span>
            </div>
            {comboRulesLoaded && hasMatcherPackages && cartLines.length > 0 ? (
              <>
                <div className="flex justify-between text-emerald-900">
                  <span>Hemat combo</span>
                  <span className="font-sans tabular-nums">
                    {comboSavingsAmount > 0 ? `−${formatRupiah(comboSavingsAmount)}` : "—"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-dashed border-brand-text/15 pt-1 text-brand-text/85">
                  <span>Setelah combo (sebelum diskon)</span>
                  <span className="font-sans font-medium tabular-nums">{formatRupiah(subtotalAfterCombo)}</span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between">
              <span>Discount</span>
              <span className="font-sans tabular-nums">−{formatRupiah(discountAmount)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total dibayar</span>
              <span className="font-sans tabular-nums">{formatRupiah(totalAmount)}</span>
            </div>
          </div>

          <Button
            type="button"
            className="w-full min-h-[48px] text-base"
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
                    <dl className="mt-2 grid grid-cols-2 gap-1 font-sans tabular-nums text-xs text-brand-text/85">
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
                    <dl className="mt-2 grid grid-cols-2 gap-1 font-sans tabular-nums text-xs text-brand-text/85">
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
