"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { Table, Td, Th } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { formatJakartaDateTime } from "@/lib/format";
import { EVENT_SETTINGS_ROW_ID } from "@/lib/constants";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type MenuItem = {
  id: string;
  name: string;
  low_stock_threshold: number | null;
};

type StockMovementRow = {
  id: string;
  menu_item_id: string;
  movement_type: string;
  quantity_change: number;
  notes: string | null;
  created_at: string;
  menu_items: { name: string } | null;
};

function mapMenuRow(r: Record<string, unknown>): MenuItem {
  return {
    id: r.id as string,
    name: r.name as string,
    low_stock_threshold:
      r.low_stock_threshold == null ? null : Number(r.low_stock_threshold),
  };
}

function parsePositiveInt(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function StockPageClient() {
  const { showToast } = useToast();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [defaultLowStock, setDefaultLowStock] = useState(10);
  const [stockByItemId, setStockByItemId] = useState<Record<string, number>>({});
  const [openingItemIds, setOpeningItemIds] = useState<Set<string>>(new Set());
  const [logRows, setLogRows] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [openingModal, setOpeningModal] = useState(false);
  const [refillModal, setRefillModal] = useState(false);
  const [bulkQty, setBulkQty] = useState<Record<string, string>>({});
  const [savingBulk, setSavingBulk] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();

      const { data: settings, error: settingsError } = await supabase
        .from("event_settings")
        .select("default_low_stock_threshold")
        .eq("id", EVENT_SETTINGS_ROW_ID)
        .maybeSingle();
      if (settingsError) throw settingsError;
      if (settings?.default_low_stock_threshold != null) {
        setDefaultLowStock(Number(settings.default_low_stock_threshold));
      }

      const { data: menuData, error: menuError } = await supabase
        .from("menu_items")
        .select("id, name, low_stock_threshold")
        .eq("is_active", true)
        .eq("is_bundle", false)
        .order("name", { ascending: true });
      if (menuError) throw menuError;
      const menuRows = (menuData ?? []).map(mapMenuRow);
      setItems(menuRows);
      const ids = menuRows.map((m) => m.id);
      if (ids.length === 0) {
        setStockByItemId({});
        setOpeningItemIds(new Set());
        setLogRows([]);
        return;
      }

      const { data: movData, error: movError } = await supabase
        .from("stock_movements")
        .select("menu_item_id, quantity_change, movement_type")
        .in("menu_item_id", ids);
      if (movError) throw movError;

      const sums: Record<string, number> = {};
      const openings = new Set<string>();
      for (const id of ids) sums[id] = 0;
      for (const row of movData ?? []) {
        const mid = row.menu_item_id as string;
        const q = Number(row.quantity_change);
        sums[mid] = (sums[mid] ?? 0) + q;
        if (row.movement_type === "opening") openings.add(mid);
      }
      setStockByItemId(sums);
      setOpeningItemIds(openings);

      const { data: logData, error: logError } = await supabase
        .from("stock_movements")
        .select("id, menu_item_id, movement_type, quantity_change, notes, created_at, menu_items(name)")
        .in("menu_item_id", ids)
        .order("created_at", { ascending: false })
        .limit(100);
      if (logError) throw logError;
      setLogRows(
        (logData ?? []).map((r) => {
          const raw = r as Record<string, unknown>;
          const embed = raw.menu_items;
          const menuItemName =
            embed && typeof embed === "object" && !Array.isArray(embed) && "name" in embed
              ? String((embed as { name: unknown }).name)
              : Array.isArray(embed) && embed[0] && typeof embed[0] === "object" && "name" in embed[0]
                ? String((embed[0] as { name: unknown }).name)
                : null;
          return {
            id: raw.id as string,
            menu_item_id: raw.menu_item_id as string,
            movement_type: raw.movement_type as string,
            quantity_change: Number(raw.quantity_change),
            notes: (raw.notes as string | null) ?? null,
            created_at: raw.created_at as string,
            menu_items: menuItemName ? { name: menuItemName } : null,
          };
        })
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load stock");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rowsWithStatus = useMemo(() => {
    return items.map((item) => {
      const current = stockByItemId[item.id] ?? 0;
      const threshold =
        item.low_stock_threshold != null ? item.low_stock_threshold : defaultLowStock;
      const isOut = current <= 0;
      const isLow = !isOut && current <= threshold;
      return { item, current, threshold, isOut, isLow };
    });
  }, [items, stockByItemId, defaultLowStock]);

  function openBulkModal(kind: "opening" | "refill") {
    const init: Record<string, string> = {};
    for (const r of items) init[r.id] = "";
    setBulkQty(init);
    if (kind === "opening") setOpeningModal(true);
    else setRefillModal(true);
  }

  async function submitBulk(movementType: "opening" | "refill") {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    const notes = movementType === "opening" ? "Opening stock" : "Refill";
    const inserts: {
      menu_item_id: string;
      movement_type: string;
      quantity_change: number;
      notes: string;
    }[] = [];

    for (const item of items) {
      const n = parsePositiveInt(bulkQty[item.id] ?? "");
      if (n != null) {
        inserts.push({
          menu_item_id: item.id,
          movement_type: movementType,
          quantity_change: n,
          notes,
        });
      }
    }

    if (inserts.length === 0) {
      showToast("Enter a quantity greater than zero for at least one item.", "error");
      return;
    }

    setSavingBulk(true);
    try {
      const { error } = await supabase.from("stock_movements").insert(inserts);
      if (error) throw error;
      showToast(
        movementType === "opening"
          ? "Opening stock recorded."
          : "Refill recorded."
      );
      setOpeningModal(false);
      setRefillModal(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSavingBulk(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-brand-text">Stock</h1>
        <SupabaseSetupBanner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-brand-text">Stock</h1>
        <p className="mt-1 text-sm text-brand-text/70">
          Current stock is computed from movement history only (no manual overrides on menu
          rows).
        </p>
      </div>

      {loadError && (
        <Card className="border-red-200 bg-red-50/80 p-4 text-sm text-red-800">{loadError}</Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => openBulkModal("opening")}>
          Set opening stock
        </Button>
        <Button type="button" variant="secondary" onClick={() => openBulkModal("refill")}>
          Add refill
        </Button>
        <Button type="button" variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      <Card className="p-4">
        <h2 className="font-display text-lg font-semibold text-brand-text">Overview</h2>
        {loading ? (
          <p className="mt-3 text-sm text-brand-text/60">Loading…</p>
        ) : items.length === 0 ? (
          <p className="mt-3 text-sm text-brand-text/60">
            No active non-bundle items. Add items on the Menu page first.
          </p>
        ) : (
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Current stock</Th>
                <Th className="text-right">Low stock threshold</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rowsWithStatus.map(({ item, current, threshold, isOut, isLow }) => (
                <tr
                  key={item.id}
                  className={
                    isOut
                      ? "bg-red-50/60"
                      : isLow
                        ? "bg-brand-yellow/15"
                        : undefined
                  }
                >
                  <Td className="font-medium">{item.name}</Td>
                  <Td className="text-right font-mono tabular-nums">{current}</Td>
                  <Td className="text-right font-mono tabular-nums text-brand-text/80">
                    {item.low_stock_threshold != null ? item.low_stock_threshold : `(${defaultLowStock} default)`}
                  </Td>
                  <Td>
                    {isOut ? (
                      <Badge className="bg-red-100 text-red-800">Out of stock</Badge>
                    ) : isLow ? (
                      <Badge tone="warning">Low stock</Badge>
                    ) : (
                      <Badge tone="success">OK</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-display text-lg font-semibold text-brand-text">Movement log</h2>
        <p className="mt-1 text-xs text-brand-text/60">
          Newest first · Waktu ditampilkan dalam WIB (Asia/Jakarta)
        </p>
        {logRows.length === 0 ? (
          <p className="mt-3 text-sm text-brand-text/60">No movements yet.</p>
        ) : (
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Item</Th>
                <Th>Type</Th>
                <Th className="text-right">Qty</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {logRows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap font-mono text-xs text-brand-text/80">
                    {formatJakartaDateTime(r.created_at)}
                  </Td>
                  <Td>{r.menu_items?.name ?? "—"}</Td>
                  <Td className="capitalize">{r.movement_type}</Td>
                  <Td className="text-right font-mono tabular-nums">
                    {r.quantity_change > 0 ? `+${r.quantity_change}` : r.quantity_change}
                  </Td>
                  <Td className="text-brand-text/70">{r.notes ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={openingModal}
        title="Set opening stock"
        size="wide"
        onClose={() => !savingBulk && setOpeningModal(false)}
      >
        {openingItemIds.size > 0 && (
          <div className="mb-4 rounded-lg border border-brand-yellow/50 bg-brand-yellow/20 px-3 py-2 text-sm text-brand-text">
            Some items already have opening stock recorded. Submitting will add to their current
            stock.
          </div>
        )}
        <BulkStockTable
          items={items}
          stockByItemId={stockByItemId}
          bulkQty={bulkQty}
          setBulkQty={setBulkQty}
          disabled={savingBulk}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpeningModal(false)} disabled={savingBulk}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submitBulk("opening")} disabled={savingBulk}>
            {savingBulk ? "Saving…" : "Save opening stock"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={refillModal}
        title="Add refill"
        size="wide"
        onClose={() => !savingBulk && setRefillModal(false)}
      >
        <BulkStockTable
          items={items}
          stockByItemId={stockByItemId}
          bulkQty={bulkQty}
          setBulkQty={setBulkQty}
          disabled={savingBulk}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setRefillModal(false)} disabled={savingBulk}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submitBulk("refill")} disabled={savingBulk}>
            {savingBulk ? "Saving…" : "Save refill"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function BulkStockTable({
  items,
  stockByItemId,
  bulkQty,
  setBulkQty,
  disabled,
}: {
  items: MenuItem[];
  stockByItemId: Record<string, number>;
  bulkQty: Record<string, string>;
  setBulkQty: Dispatch<SetStateAction<Record<string, string>>>;
  disabled: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-brand-text/60">No items to show.</p>;
  }
  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-brand-text/10">
      <Table>
        <thead>
          <tr>
            <Th>Item</Th>
            <Th className="text-right">Current stock</Th>
            <Th className="w-40">Quantity to add</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <Td>{item.name}</Td>
              <Td className="text-right font-mono tabular-nums text-brand-text/80">
                {stockByItemId[item.id] ?? 0}
              </Td>
              <Td>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className="font-mono"
                  disabled={disabled}
                  value={bulkQty[item.id] ?? ""}
                  onChange={(e) =>
                    setBulkQty((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  placeholder="0"
                />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
