"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { useKioskMode } from "@/components/layout/KioskModeProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { formatJakartaDateTime, formatQueueDisplay } from "@/lib/format";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

const POLL_MS = 20_000;

const MOVE_BACK_CONFIRM =
  "Are you sure you want to move this order back to the previous status?";

type BoardServingStatus = "queued" | "in_progress" | "ready_to_serve" | "served";

type BundleComponentLine = {
  component_item_id: string;
  component_name: string;
  qtyPerBundle: number;
  /** Total units for this line (per-bundle qty × order line qty) */
  qtyTotal: number;
  checked: boolean;
};

type KitchenLine = {
  id: string;
  order_id: string;
  menu_item_id: string;
  item_name: string;
  quantity: number;
  is_checked: boolean;
  /** True when this line uses nested component checklist (bundle with ≥1 component) */
  is_bundle: boolean;
  bundleComponents: BundleComponentLine[] | null;
  /** Persisted map component_item_id → checked */
  kitchen_bundle_checks: Record<string, boolean>;
};

type KitchenOrder = {
  id: string;
  queue_number: number;
  customer_name: string | null;
  serving_status: BoardServingStatus;
  created_at: string;
  updated_at: string;
  /** Set when marked Served; null if never served or after move-back; not touched by kitchen note saves */
  served_at: string | null;
  payment_notes: string | null;
  settlement_notes: string | null;
  kitchen_operational_note: string | null;
  payment_method: string | null;
  confirmed_at: string | null;
  items: KitchenLine[];
};

const COLUMNS: { key: BoardServingStatus; label: string; headerClass: string }[] = [
  { key: "queued", label: "Queued", headerClass: "border-b-4 border-brand-text/25 text-brand-text" },
  { key: "in_progress", label: "In Progress", headerClass: "border-b-4 border-brand-yellow text-brand-text" },
  {
    key: "ready_to_serve",
    label: "Ready to Serve",
    headerClass: "border-b-4 border-semantic-success text-brand-text",
  },
  { key: "served", label: "Served", headerClass: "border-b-4 border-brand-text/15 text-brand-text/70" },
];

function isBoardStatus(s: string): s is BoardServingStatus {
  return s === "queued" || s === "in_progress" || s === "ready_to_serve" || s === "served";
}

function unwrapOne<T>(row: T | T[] | null | undefined): T | null {
  if (row == null) return null;
  if (Array.isArray(row)) return row[0] ?? null;
  return row;
}

function formatPayMethod(method: string | null): string {
  if (!method) return "—";
  if (method === "cash") return "Cash";
  if (method === "qris") return "QRIS";
  if (method === "transfer") return "Transfer";
  return method;
}

function latestIso(dates: string[]): string | null {
  if (dates.length === 0) return null;
  let best = dates[0]!;
  let bestMs = new Date(best).getTime();
  for (let i = 1; i < dates.length; i++) {
    const t = new Date(dates[i]!).getTime();
    if (t >= bestMs) {
      bestMs = t;
      best = dates[i]!;
    }
  }
  return best;
}

function formatWaitingShort(iso: string, nowMs: number): string {
  const d = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((nowMs - d) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function previousBoardStatus(s: BoardServingStatus): BoardServingStatus | null {
  if (s === "in_progress") return "queued";
  if (s === "ready_to_serve") return "in_progress";
  if (s === "served") return "ready_to_serve";
  return null;
}

/** Parse JSONB map: only explicit `true` counts as checked */
function parseBundleChecks(raw: unknown): Record<string, boolean> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === true) out[k] = true;
  }
  return out;
}

/** Mark ready: line satisfied when all component checks true (bundle) or is_checked (plain / bundle fallback) */
function lineKitchenComplete(line: KitchenLine): boolean {
  if (line.is_bundle && line.bundleComponents && line.bundleComponents.length > 0) {
    return line.bundleComponents.every((c) => c.checked);
  }
  return line.is_checked;
}

/** Counts only rows staff actually check off (components for expanded bundles; else one unit per order line). */
function checklistProgress(order: KitchenOrder): { done: number; total: number; pct: number } {
  let done = 0;
  let total = 0;
  for (const line of order.items) {
    if (line.is_bundle && line.bundleComponents && line.bundleComponents.length > 0) {
      for (const c of line.bundleComponents) {
        total += 1;
        if (c.checked) done += 1;
      }
    } else {
      total += 1;
      if (line.is_checked) done += 1;
    }
  }
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

function sortOrdersInColumn(list: KitchenOrder[], column: BoardServingStatus): void {
  if (column === "served") {
    list.sort((a, b) => {
      const ta = a.served_at != null ? new Date(a.served_at).getTime() : Number.NEGATIVE_INFINITY;
      const tb = b.served_at != null ? new Date(b.served_at).getTime() : Number.NEGATIVE_INFINITY;
      if (tb !== ta) return tb - ta;
      if (b.queue_number !== a.queue_number) return b.queue_number - a.queue_number;
      return b.id.localeCompare(a.id);
    });
  } else {
    list.sort((a, b) => {
      const ca = new Date(a.created_at).getTime();
      const cb = new Date(b.created_at).getTime();
      if (ca !== cb) return ca - cb;
      if (a.queue_number !== b.queue_number) return a.queue_number - b.queue_number;
      return a.id.localeCompare(b.id);
    });
  }
}

function patchLineBundleState(line: KitchenLine, checks: Record<string, boolean>): KitchenLine {
  if (!line.bundleComponents || line.bundleComponents.length === 0) {
    return { ...line, kitchen_bundle_checks: checks };
  }
  const bundleComponents = line.bundleComponents.map((c) => ({
    ...c,
    checked: checks[c.component_item_id] === true,
  }));
  const allDone = bundleComponents.every((c) => c.checked);
  return {
    ...line,
    kitchen_bundle_checks: checks,
    is_checked: allDone,
    bundleComponents,
  };
}

function mapRowToKitchenOrder(
  r: Record<string, unknown>,
  itemsByOrder: Map<string, KitchenLine[]>
): KitchenOrder | null {
  const st = r.serving_status as string;
  if (!isBoardStatus(st)) return null;

  const pay = unwrapOne<Record<string, unknown>>(r.payments as Record<string, unknown> | Record<string, unknown>[]);
  const settlementsRaw = r.settlements as Record<string, unknown>[] | null | undefined;
  const settlementList = Array.isArray(settlementsRaw) ? settlementsRaw : [];

  const settlementTimes = settlementList
    .map((x) => x.created_at as string | undefined)
    .filter((x): x is string => Boolean(x));

  const paymentTime = pay?.created_at != null ? String(pay.created_at) : null;
  const confirmed_at =
    settlementTimes.length > 0 ? latestIso(settlementTimes) : paymentTime;

  const payment_method = pay?.method != null ? String(pay.method) : null;

  const id = r.id as string;

  return {
    id,
    queue_number: Number(r.queue_number),
    customer_name: (r.customer_name as string | null) ?? null,
    serving_status: st,
    created_at: r.created_at as string,
    updated_at: (r.updated_at as string) ?? (r.created_at as string),
    served_at: (r.served_at as string | null) ?? null,
    payment_notes: (r.payment_notes as string | null) ?? null,
    settlement_notes: (r.settlement_notes as string | null) ?? null,
    kitchen_operational_note: (r.kitchen_operational_note as string | null) ?? null,
    payment_method,
    confirmed_at,
    items: itemsByOrder.get(id) ?? [],
  };
}

type BundleDef = {
  component_item_id: string;
  quantity: number;
  component_name: string;
};

export function KitchenPageClient() {
  const { showToast } = useToast();
  const { kiosk, setKiosk } = useKioskMode();
  const boardHostRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const loadBoard = useCallback(async (opts?: { silent?: boolean }) => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: ordRows, error: oErr } = await supabase
        .from("orders")
        .select(
          "id, queue_number, customer_name, serving_status, created_at, updated_at, served_at, payment_notes, settlement_notes, kitchen_operational_note, payments(method, created_at), settlements(created_at)"
        )
        .neq("serving_status", "not_sent")
        .order("created_at", { ascending: true });
      if (oErr) throw oErr;

      const raw = ordRows ?? [];
      const ids = raw.map((r) => r.id as string);
      let itemRows: Record<string, unknown>[] = [];
      if (ids.length > 0) {
        const { data: items, error: iErr } = await supabase
          .from("order_items")
          .select("id, order_id, menu_item_id, item_name, quantity, is_checked, kitchen_bundle_checks")
          .in("order_id", ids);
        if (iErr) throw iErr;
        itemRows = items ?? [];
      }

      const menuIds = [...new Set(itemRows.map((r) => r.menu_item_id as string))];
      const menuIsBundle = new Map<string, boolean>();
      const bundleDefs = new Map<string, BundleDef[]>();

      if (menuIds.length > 0) {
        const { data: menus, error: mErr } = await supabase.from("menu_items").select("id, is_bundle").in("id", menuIds);
        if (mErr) throw mErr;
        for (const m of menus ?? []) {
          menuIsBundle.set(m.id as string, Boolean(m.is_bundle));
        }
        const bundleIds = [...menuIsBundle.entries()].filter(([, b]) => b).map(([id]) => id);
        if (bundleIds.length > 0) {
          const { data: bc, error: bcErr } = await supabase
            .from("bundle_components")
            .select("bundle_id, component_item_id, quantity")
            .in("bundle_id", bundleIds);
          if (bcErr) throw bcErr;
          const compIds = [...new Set((bc ?? []).map((b) => b.component_item_id as string))];
          const nameById = new Map<string, string>();
          if (compIds.length > 0) {
            const { data: names, error: nErr } = await supabase.from("menu_items").select("id, name").in("id", compIds);
            if (nErr) throw nErr;
            for (const n of names ?? []) {
              nameById.set(n.id as string, n.name as string);
            }
          }
          for (const b of bc ?? []) {
            const bid = b.bundle_id as string;
            const cid = b.component_item_id as string;
            const arr = bundleDefs.get(bid) ?? [];
            arr.push({
              component_item_id: cid,
              quantity: Number(b.quantity),
              component_name: nameById.get(cid) ?? "Component",
            });
            bundleDefs.set(bid, arr);
          }
          for (const [, arr] of bundleDefs) {
            arr.sort((a, b) => a.component_name.localeCompare(b.component_name));
          }
        }
      }

      const byOrder = new Map<string, KitchenLine[]>();
      for (const r of itemRows) {
        const oid = r.order_id as string;
        const mid = r.menu_item_id as string;
        const checks = parseBundleChecks(r.kitchen_bundle_checks);
        const menuBundle = menuIsBundle.get(mid) ?? false;
        const defs = bundleDefs.get(mid);
        const lineQty = Number(r.quantity);
        const hasNested = menuBundle && defs != null && defs.length > 0;

        let bundleComponents: BundleComponentLine[] | null = null;
        let is_bundle = false;
        if (hasNested) {
          is_bundle = true;
          bundleComponents = defs!.map((d) => ({
            component_item_id: d.component_item_id,
            component_name: d.component_name,
            qtyPerBundle: d.quantity,
            qtyTotal: d.quantity * lineQty,
            checked: checks[d.component_item_id] === true,
          }));
        }

        const list = byOrder.get(oid) ?? [];
        list.push({
          id: r.id as string,
          order_id: oid,
          menu_item_id: mid,
          item_name: r.item_name as string,
          quantity: lineQty,
          is_checked: Boolean(r.is_checked),
          is_bundle,
          bundleComponents,
          kitchen_bundle_checks: checks,
        });
        byOrder.set(oid, list);
      }

      const next: KitchenOrder[] = [];
      for (const r of raw) {
        const mapped = mapRowToKitchenOrder(r as Record<string, unknown>, byOrder);
        if (mapped) next.push(mapped);
      }

      setOrders(next);
      setFetchError(null);
      setLastUpdatedAt(Date.now());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not refresh board";
      setFetchError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard({ silent: false });
  }, [loadBoard]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadBoard({ silent: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [loadBoard]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      setKiosk(false);
      try {
        if (document.fullscreenElement) void document.exitFullscreen();
      } catch {
        /* ignore */
      }
    };
  }, [setKiosk]);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) {
        setKiosk(false);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [setKiosk]);

  const secondsSinceUpdate = useMemo(() => {
    if (lastUpdatedAt == null) return null;
    return Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000));
  }, [lastUpdatedAt, tick]);

  const ordersByColumn = useMemo(() => {
    const m = new Map<BoardServingStatus, KitchenOrder[]>();
    for (const c of COLUMNS) m.set(c.key, []);
    for (const o of orders) {
      const bucket = m.get(o.serving_status);
      if (bucket) bucket.push(o);
    }
    for (const c of COLUMNS) {
      const list = m.get(c.key);
      if (list) sortOrdersInColumn(list, c.key);
    }
    return m;
  }, [orders]);

  async function enterKiosk() {
    setKiosk(true);
    const el = boardHostRef.current;
    if (el?.requestFullscreen) {
      try {
        await el.requestFullscreen();
      } catch {
        /* optional; CSS kiosk still applies */
      }
    }
  }

  async function exitKiosk() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
    setKiosk(false);
  }

  async function updateServingStatus(orderId: string, next: BoardServingStatus) {
    const supabase = getSupabaseBrowserClient();
    const prevSnapshot = orders;
    const nowIso = new Date().toISOString();
    const servedAt = next === "served" ? nowIso : null;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, serving_status: next, updated_at: nowIso, served_at: servedAt } : o
      )
    );
    const { error } = await supabase
      .from("orders")
      .update({
        serving_status: next,
        updated_at: nowIso,
        served_at: servedAt,
      })
      .eq("id", orderId);
    if (error) {
      setOrders(prevSnapshot);
      showToast(error.message || "Could not update order");
    }
  }

  function onMoveBack(orderId: string, column: BoardServingStatus) {
    const prev = previousBoardStatus(column);
    if (!prev) return;
    if (!window.confirm(MOVE_BACK_CONFIRM)) return;
    void updateServingStatus(orderId, prev);
  }

  async function toggleLineChecked(line: KitchenLine) {
    if (line.is_bundle) return;
    const next = !line.is_checked;
    const supabase = getSupabaseBrowserClient();
    const prevSnapshot = orders;
    setOrders((prev) =>
      prev.map((o) =>
        o.id !== line.order_id
          ? o
          : {
              ...o,
              items: o.items.map((li) => (li.id === line.id ? { ...li, is_checked: next } : li)),
            }
      )
    );
    const { error } = await supabase.from("order_items").update({ is_checked: next }).eq("id", line.id);
    if (error) {
      setOrders(prevSnapshot);
      showToast(error.message || "Could not update checklist");
    }
  }

  async function toggleBundleComponent(line: KitchenLine, componentId: string) {
    if (!line.is_bundle || !line.bundleComponents?.length) return;
    const checks = { ...line.kitchen_bundle_checks };
    const cur = checks[componentId] === true;
    checks[componentId] = !cur;
    const allDone = line.bundleComponents.every((c) => checks[c.component_item_id] === true);

    const supabase = getSupabaseBrowserClient();
    const prevSnapshot = orders;
    setOrders((prev) =>
      prev.map((o) =>
        o.id !== line.order_id
          ? o
          : {
              ...o,
              items: o.items.map((li) => (li.id === line.id ? patchLineBundleState(li, checks) : li)),
            }
      )
    );
    const { error } = await supabase
      .from("order_items")
      .update({
        kitchen_bundle_checks: checks,
        is_checked: allDone,
      })
      .eq("id", line.id);
    if (error) {
      setOrders(prevSnapshot);
      showToast(error.message || "Could not update checklist");
    }
  }

  async function saveKitchenNote(orderId: string, text: string) {
    const trimmed = text.trim();
    const value = trimmed.length > 0 ? trimmed : null;
    const supabase = getSupabaseBrowserClient();
    const prevSnapshot = orders;
    const nowIso = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, kitchen_operational_note: value, updated_at: nowIso } : o
      )
    );
    const { error } = await supabase
      .from("orders")
      .update({ kitchen_operational_note: value, updated_at: new Date().toISOString() })
      .eq("id", orderId);
    if (error) {
      setOrders(prevSnapshot);
      showToast(error.message || "Could not save note");
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-2xl font-semibold text-brand-text">Kitchen</h1>
        <SupabaseSetupBanner />
      </div>
    );
  }

  const nowMs = Date.now();

  return (
    <div ref={boardHostRef} className={`flex min-h-0 flex-col ${kiosk ? "min-h-screen bg-brand-bg" : ""}`}>
      <div
        className={`mb-3 flex flex-shrink-0 flex-wrap items-end justify-between gap-2 ${
          kiosk ? "border-b border-brand-text/10 bg-white px-3 py-2" : ""
        }`}
      >
        <div>
          <h1 className="font-display text-xl font-semibold text-brand-text md:text-2xl">Kitchen</h1>
          <p className="mt-0.5 text-xs text-brand-text/65">
            {lastUpdatedAt != null && secondsSinceUpdate != null
              ? `Last updated ${secondsSinceUpdate}s ago · auto-refresh every ${POLL_MS / 1000}s`
              : "Loading board…"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="min-h-[40px] px-3 text-xs" onClick={() => void loadBoard({ silent: true })}>
            Refresh
          </Button>
          {kiosk ? (
            <Button type="button" variant="primary" className="min-h-[40px] px-3 text-xs" onClick={() => void exitKiosk()}>
              Exit fullscreen
            </Button>
          ) : (
            <Button type="button" variant="secondary" className="min-h-[40px] px-3 text-xs" onClick={() => void enterKiosk()}>
              Fullscreen
            </Button>
          )}
        </div>
      </div>

      {fetchError && (
        <Card className="mb-3 flex-shrink-0 border-amber-200 bg-amber-50/90 p-2.5 text-xs text-amber-950">
          Could not refresh. Showing last known data. ({fetchError})
        </Card>
      )}

      {loading && orders.length === 0 ? (
        <p className="text-sm text-brand-text/60">Loading orders…</p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-1.5 overflow-x-auto pb-1.5">
          {COLUMNS.map((col) => {
            const list = ordersByColumn.get(col.key) ?? [];
            return (
              <section
                key={col.key}
                className="flex w-[min(100%,288px)] shrink-0 flex-col rounded-lg border border-brand-text/10 bg-white shadow-card"
              >
                <header className={`rounded-t-lg bg-white px-2 py-1.5 ${col.headerClass}`}>
                  <h2 className="font-display text-base font-semibold tracking-tight">{col.label}</h2>
                  <p className="mt-0 font-mono text-[10px] text-brand-text/55">{list.length} orders</p>
                </header>
                <div className="flex max-h-[calc(100vh-188px)] flex-col gap-1.5 overflow-y-auto p-1.5">
                  {list.map((order) => (
                    <KitchenOrderCard
                      key={order.id}
                      order={order}
                      column={col.key}
                      nowMs={nowMs}
                      muted={col.key === "served"}
                      onStart={() => void updateServingStatus(order.id, "in_progress")}
                      onMarkReady={() => void updateServingStatus(order.id, "ready_to_serve")}
                      onServed={() => void updateServingStatus(order.id, "served")}
                      onToggleLine={(line) => void toggleLineChecked(line)}
                      onToggleBundleComponent={(line, cid) => void toggleBundleComponent(line, cid)}
                      onMoveBack={() => onMoveBack(order.id, col.key)}
                      onSaveNote={(text) => void saveKitchenNote(order.id, text)}
                    />
                  ))}
                  {list.length === 0 && (
                    <p className="py-4 text-center text-xs text-brand-text/45">No orders</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

const noteTextareaClass =
  "w-full resize-y rounded border border-brand-text/10 bg-white/80 px-1.5 py-1 text-[11px] leading-snug text-brand-text/85 shadow-none outline-none transition placeholder:text-brand-text/32 focus:border-brand-red/35 focus:ring-1 focus:ring-brand-red/12";

function KitchenOrderCard({
  order,
  column,
  nowMs,
  muted,
  onStart,
  onMarkReady,
  onServed,
  onToggleLine,
  onToggleBundleComponent,
  onMoveBack,
  onSaveNote,
}: {
  order: KitchenOrder;
  column: BoardServingStatus;
  nowMs: number;
  muted: boolean;
  onStart: () => void;
  onMarkReady: () => void;
  onServed: () => void;
  onToggleLine: (line: KitchenLine) => void;
  onToggleBundleComponent: (line: KitchenLine, componentId: string) => void;
  onMoveBack: () => void;
  onSaveNote: (text: string) => void;
}) {
  const allChecked = order.items.length > 0 && order.items.every(lineKitchenComplete);
  const progress = useMemo(() => checklistProgress(order), [order]);
  const queueLabel = formatQueueDisplay(order.queue_number);
  const displayName =
    order.customer_name != null && order.customer_name.trim().length > 0
      ? order.customer_name.trim()
      : "No Name";

  const checklistInteractive = column === "in_progress" || column === "ready_to_serve";
  const showMoveBack = previousBoardStatus(column) != null;

  const [noteDraft, setNoteDraft] = useState(order.kitchen_operational_note ?? "");
  useEffect(() => {
    setNoteDraft(order.kitchen_operational_note ?? "");
  }, [order.id, order.kitchen_operational_note]);

  const waitingLabel = formatWaitingShort(order.created_at, nowMs);
  const hasCashierNotes =
    (order.payment_notes != null && order.payment_notes.trim().length > 0) ||
    (order.settlement_notes != null && order.settlement_notes.trim().length > 0);

  return (
    <Card
      className={`flex flex-col gap-1.5 p-2 ${muted ? "border-brand-text/10 bg-brand-bg/80" : "border-brand-text/12 bg-white"}`}
    >
      <header className="space-y-0 border-b border-brand-text/10 pb-1.5">
        <p
          className={`font-mono text-lg font-bold tabular-nums leading-tight tracking-tight text-brand-red ${
            muted ? "text-brand-text/40" : ""
          }`}
        >
          {queueLabel}
        </p>
        <p className={`text-[11px] font-semibold leading-tight ${muted ? "text-brand-text/50" : "text-brand-text"}`}>
          {displayName}
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 pt-0.5">
          <span className="text-[9px] font-medium uppercase tracking-wide text-brand-text/45">Waiting</span>
          <span className={`font-mono text-[11px] font-semibold ${muted ? "text-brand-text/50" : "text-brand-text"}`}>
            {waitingLabel}
          </span>
        </div>
        <p className="text-[9px] leading-tight text-brand-text/40">Since order placed</p>
      </header>

      <div className="space-y-0.5" role="group" aria-label="Checklist progress">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-medium uppercase tracking-wide text-brand-text/40">Progress</span>
          <span className="font-mono text-[9px] tabular-nums text-brand-text/50">
            {progress.done}/{progress.total}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-brand-text/10">
          <div
            className="h-full rounded-full bg-semantic-success/55 transition-[width] duration-200 ease-out"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>

      <div className="space-y-0 rounded-md bg-brand-bg/50 px-1.5 py-1 text-[11px] leading-tight">
        <div className="flex justify-between gap-2">
          <span className="text-brand-text/50">Payment</span>
          <span className="font-medium text-brand-text">{formatPayMethod(order.payment_method)}</span>
        </div>
        <div className="flex flex-col gap-0">
          <span className="text-[9px] text-brand-text/45">Confirmed</span>
          <span className="font-mono text-[9px] leading-snug text-brand-text">
            {order.confirmed_at ? formatJakartaDateTime(order.confirmed_at) : "—"}
          </span>
        </div>
      </div>

      <ul className="space-y-0">
        {order.items.map((line) => {
          const bundleDone = line.is_bundle && line.bundleComponents ? lineKitchenComplete(line) : line.is_checked;

          if (line.is_bundle && line.bundleComponents && line.bundleComponents.length > 0) {
            return (
              <li key={line.id} className="border-t border-brand-text/10 first:border-t-0">
                <div className="flex min-h-[38px] items-start gap-1.5 py-1 pl-0.5">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-brand-text/20 ${
                      bundleDone ? "border-semantic-success/80 bg-semantic-success/10" : "bg-white"
                    }`}
                    aria-hidden
                  >
                    {bundleDone ? <span className="text-xs leading-none text-semantic-success">✓</span> : null}
                  </span>
                  <span
                    className={`text-xs font-semibold leading-snug ${
                      bundleDone ? "text-brand-text/45 line-through" : muted ? "text-brand-text/55" : "text-brand-text"
                    }`}
                  >
                    {line.item_name} × {line.quantity}
                  </span>
                </div>
                <ul className="mb-0.5 ml-5 border-l border-brand-text/10 pl-1.5">
                  {line.bundleComponents.map((comp) => (
                    <li key={comp.component_item_id}>
                      <button
                        type="button"
                        disabled={!checklistInteractive}
                        onClick={() =>
                          checklistInteractive && onToggleBundleComponent(line, comp.component_item_id)
                        }
                        className={`flex min-h-[38px] w-full items-start gap-1.5 py-0.5 text-left ${
                          !checklistInteractive ? "cursor-default opacity-65" : "active:bg-brand-bg/80"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-brand-text/25 ${
                            comp.checked ? "border-semantic-success bg-semantic-success/15" : "bg-white"
                          }`}
                          aria-hidden
                        >
                          {comp.checked ? (
                            <span className="text-xs leading-none text-semantic-success">✓</span>
                          ) : null}
                        </span>
                        <span
                          className={`text-xs font-medium leading-snug ${
                            comp.checked
                              ? "text-brand-text/45 line-through"
                              : muted
                                ? "text-brand-text/55"
                                : "text-brand-text"
                          }`}
                        >
                          <span className="font-semibold">{comp.component_name}</span>
                          <span className="ml-1 font-mono text-[11px] text-brand-text/55">×{comp.qtyTotal}</span>
                          <span className="ml-1 text-[10px] text-brand-text/40">({comp.qtyPerBundle} per bundle)</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            );
          }

          return (
            <li key={line.id} className="border-t border-brand-text/10 first:border-t-0">
              <button
                type="button"
                disabled={!checklistInteractive}
                onClick={() => checklistInteractive && onToggleLine(line)}
                className={`flex min-h-[38px] w-full items-start gap-1.5 py-1 text-left ${
                  !checklistInteractive ? "cursor-default opacity-65" : "active:bg-brand-bg/80"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-brand-text/25 ${
                    line.is_checked ? "border-semantic-success bg-semantic-success/15" : "bg-white"
                  }`}
                  aria-hidden
                >
                  {line.is_checked ? <span className="text-xs leading-none text-semantic-success">✓</span> : null}
                </span>
                <span
                  className={`text-xs font-semibold leading-snug ${
                    line.is_checked ? "text-brand-text/45 line-through" : muted ? "text-brand-text/55" : "text-brand-text"
                  }`}
                >
                  {line.item_name} × {line.quantity}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {hasCashierNotes && (
        <div className="space-y-0.5 rounded border border-brand-text/10 bg-white px-1.5 py-1 text-[9px] leading-snug">
          <p className="font-medium uppercase tracking-wide text-brand-text/40">Cashier notes</p>
          {order.payment_notes != null && order.payment_notes.trim().length > 0 && (
            <p className="text-brand-text/75">
              <span className="text-brand-text/45">Payment: </span>
              {order.payment_notes.trim()}
            </p>
          )}
          {order.settlement_notes != null && order.settlement_notes.trim().length > 0 && (
            <p className="text-brand-text/75">
              <span className="text-brand-text/45">Settlement: </span>
              {order.settlement_notes.trim()}
            </p>
          )}
        </div>
      )}

      <div className="space-y-0.5 rounded border border-dashed border-brand-text/10 bg-brand-bg/25 px-1.5 py-1">
        <label className="text-[9px] font-medium uppercase tracking-wide text-brand-text/38" htmlFor={`kn-${order.id}`}>
          Kitchen note
        </label>
        <textarea
          id={`kn-${order.id}`}
          rows={2}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Optional…"
          className={noteTextareaClass}
        />
        <Button
          type="button"
          variant="secondary"
          className="w-full min-h-[34px] px-2 text-[9px]"
          onClick={() => onSaveNote(noteDraft)}
        >
          Save note
        </Button>
      </div>

      <div className="mt-auto flex flex-col gap-1 border-t border-brand-text/10 pt-1.5">
        {column === "queued" && (
          <Button type="button" variant="primary" className="min-h-[38px] w-full text-xs" onClick={onStart}>
            Start
          </Button>
        )}
        {column === "in_progress" && (
          <Button
            type="button"
            variant="primary"
            className={`min-h-[38px] w-full text-xs ${allChecked ? "bg-semantic-success hover:bg-semantic-success/90" : ""}`}
            disabled={!allChecked}
            onClick={onMarkReady}
          >
            Mark ready
          </Button>
        )}
        {column === "ready_to_serve" && (
          <Button
            type="button"
            variant="primary"
            className="min-h-[38px] w-full bg-semantic-success text-xs hover:bg-semantic-success/90"
            onClick={onServed}
          >
            Served
          </Button>
        )}
        {showMoveBack && (
          <Button type="button" variant="ghost" className="min-h-[34px] w-full text-[9px] text-brand-text/65" onClick={onMoveBack}>
            Move back one step
          </Button>
        )}
      </div>
    </Card>
  );
}
