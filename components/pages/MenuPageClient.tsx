"use client";

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
import { formatRupiah } from "@/lib/format";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type MenuItem = {
  id: string;
  name: string;
  image_url: string | null;
  price: number;
  low_stock_threshold: number | null;
  is_active: boolean;
  is_bundle: boolean;
};

type BundleLine = { component_item_id: string; quantity: number };

type Tab = "all" | "items" | "bundles";

const BUCKET = "menu-images";

function mapMenuRow(r: Record<string, unknown>): MenuItem {
  return {
    id: r.id as string,
    name: r.name as string,
    image_url: (r.image_url as string | null) ?? null,
    price: Number(r.price),
    low_stock_threshold:
      r.low_stock_threshold == null ? null : Number(r.low_stock_threshold),
    is_active: Boolean(r.is_active),
    is_bundle: Boolean(r.is_bundle),
  };
}

export function MenuPageClient() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [rows, setRows] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({
    name: "",
    price: "" as string | number,
    low_stock_threshold: "" as string | number,
    is_active: true,
    is_bundle: false,
  });
  const [bundleLines, setBundleLines] = useState<BundleLine[]>([]);
  const [bundleComponentCounts, setBundleComponentCounts] = useState<Record<string, number>>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const [{ data, error }, bcRes] = await Promise.all([
        supabase.from("menu_items").select("*").order("created_at", { ascending: false }),
        supabase.from("bundle_components").select("bundle_id"),
      ]);
      if (error) throw error;
      if (bcRes.error) throw bcRes.error;
      const counts: Record<string, number> = {};
      for (const r of bcRes.data ?? []) {
        const bid = r.bundle_id as string;
        counts[bid] = (counts[bid] ?? 0) + 1;
      }
      setBundleComponentCounts(counts);
      setRows((data ?? []).map(mapMenuRow));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load menu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const componentCandidates = useMemo(() => {
    return rows.filter((r) => !r.is_bundle && (!editing || r.id !== editing.id));
  }, [rows, editing]);

  const filtered = useMemo(() => {
    if (tab === "items") return rows.filter((r) => !r.is_bundle);
    if (tab === "bundles") return rows.filter((r) => r.is_bundle);
    return rows;
  }, [rows, tab]);

  async function loadBundleLines(bundleId: string) {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("bundle_components")
      .select("component_item_id, quantity")
      .eq("bundle_id", bundleId);
    if (error) throw error;
    setBundleLines(
      (data ?? []).map((d) => ({
        component_item_id: d.component_item_id as string,
        quantity: Number(d.quantity),
      }))
    );
  }

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      price: "",
      low_stock_threshold: "",
      is_active: true,
      is_bundle: false,
    });
    setBundleLines([]);
    setImageFile(null);
    setModalOpen(true);
  }

  async function openEdit(row: MenuItem) {
    setEditing(row);
    setForm({
      name: row.name,
      price: row.price,
      low_stock_threshold: row.low_stock_threshold ?? "",
      is_active: row.is_active,
      is_bundle: row.is_bundle,
    });
    setImageFile(null);
    if (row.is_bundle) {
      try {
        await loadBundleLines(row.id);
      } catch {
        setBundleLines([]);
      }
    } else {
      setBundleLines([]);
    }
    setModalOpen(true);
  }

  function addBundleLine() {
    const first = componentCandidates[0];
    if (!first) {
      showToast("Add a non-bundle menu item first to use as a component.", "error");
      return;
    }
    setBundleLines((lines) => [
      ...lines,
      { component_item_id: first.id, quantity: 1 },
    ]);
  }

  function updateBundleLine(i: number, patch: Partial<BundleLine>) {
    setBundleLines((lines) => {
      const next = [...lines];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function removeBundleLine(i: number) {
    setBundleLines((lines) => lines.filter((_, j) => j !== i));
  }

  async function uploadImage(menuItemId: string, file: File) {
    const supabase = getSupabaseBrowserClient();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${menuItemId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (upErr) throw upErr;
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: dbErr } = await supabase
      .from("menu_items")
      .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", menuItemId);
    if (dbErr) throw dbErr;
  }

  async function persistBundleComponents(bundleId: string, isBundle: boolean, lines: BundleLine[]) {
    const supabase = getSupabaseBrowserClient();
    await supabase.from("bundle_components").delete().eq("bundle_id", bundleId);
    if (!isBundle || lines.length === 0) return;
    const uniq = new Map<string, number>();
    for (const line of lines) {
      if (!line.component_item_id) continue;
      const q = Math.max(1, Math.floor(Number(line.quantity)) || 1);
      uniq.set(line.component_item_id, q);
    }
    const inserts = [...uniq.entries()].map(([component_item_id, quantity]) => ({
      bundle_id: bundleId,
      component_item_id,
      quantity,
    }));
    if (inserts.length === 0) return;
    const { error } = await supabase.from("bundle_components").insert(inserts);
    if (error) throw error;
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) return;
    const name = form.name.trim();
    if (!name) {
      showToast("Name is required", "error");
      return;
    }
    const price = Number(form.price);
    if (Number.isNaN(price) || price < 0) {
      showToast("Invalid price", "error");
      return;
    }
    const lowRaw = form.low_stock_threshold === "" ? null : Number(form.low_stock_threshold);
    const low_stock_threshold =
      lowRaw == null || Number.isNaN(lowRaw) ? null : Math.max(0, lowRaw);

    if (form.is_bundle) {
      const validLines = bundleLines.filter((l) => l.component_item_id);
      if (validLines.length === 0) {
        showToast("Add at least one bundle component.", "error");
        return;
      }
    }

    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const basePayload = {
        name,
        price,
        low_stock_threshold,
        is_active: form.is_active,
        is_bundle: form.is_bundle,
        updated_at: new Date().toISOString(),
      };

      let menuId: string;
      if (editing) {
        const { error } = await supabase.from("menu_items").update(basePayload).eq("id", editing.id);
        if (error) throw error;
        menuId = editing.id;
      } else {
        const { data, error } = await supabase
          .from("menu_items")
          .insert({ ...basePayload, image_url: null })
          .select("id")
          .single();
        if (error) throw error;
        menuId = data.id as string;
      }

      if (imageFile) {
        try {
          await uploadImage(menuId, imageFile);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Image upload failed";
          showToast(
            `${msg} — ensure Storage bucket "${BUCKET}" exists and policies allow uploads.`,
            "error"
          );
        }
      }

      await persistBundleComponents(menuId, form.is_bundle, bundleLines);

      showToast("Menu item saved.");
      setModalOpen(false);
      setImageFile(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: MenuItem) {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase
        .from("menu_items")
        .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw error;
      showToast(row.is_active ? "Item deactivated." : "Item activated.");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold text-brand-text">Menu Database</h1>
        <SupabaseSetupBanner />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-brand-text">Menu Database</h1>
          <p className="mt-1 text-sm text-brand-text/65">
            Menu items and bundles. Images use Supabase Storage bucket{" "}
            <code className="rounded bg-white px-1 font-mono text-xs">{BUCKET}</code>.
          </p>
        </div>
        <Button onClick={openCreate}>Add menu item</Button>
      </div>

      <div className="mt-4 flex gap-2">
        {(
          [
            ["all", "All"],
            ["items", "Menu items"],
            ["bundles", "Bundles"],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            variant={tab === k ? "primary" : "secondary"}
            className="px-3 py-1.5 text-xs"
            onClick={() => setTab(k)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loadError && (
        <Card className="mt-4 border-brand-red/25 bg-brand-red/5">
          <p className="text-sm text-brand-red">{loadError}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      )}

      <Card className="mt-6 p-0 overflow-hidden">
        {loading ? (
          <p className="p-4 text-sm text-brand-text/60">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-brand-text/60">No rows match this filter.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-14">Img</Th>
                <Th>Name</Th>
                <Th>Price</Th>
                <Th>Type</Th>
                <Th>Low stock</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <Td>
                    {r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.image_url}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-md object-cover"
                      />
                    ) : (
                      <span className="text-xs text-brand-text/40">—</span>
                    )}
                  </Td>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="font-mono text-xs">{formatRupiah(r.price)}</Td>
                  <Td>
                    {r.is_bundle ? (
                      <span className="flex flex-wrap items-center gap-1">
                        <Badge tone="warning">Bundle</Badge>
                        {(bundleComponentCounts[r.id] ?? 0) === 0 ? (
                          <Badge tone="warning">No components</Badge>
                        ) : null}
                      </span>
                    ) : (
                      <Badge tone="muted">Item</Badge>
                    )}
                  </Td>
                  <Td className="font-mono text-xs">
                    {r.low_stock_threshold ?? "—"}
                  </Td>
                  <Td>
                    {r.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="muted">Inactive</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" className="mr-1 px-2 py-1 text-xs" onClick={() => void openEdit(r)}>
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      onClick={() => void toggleActive(r)}
                    >
                      {r.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? "Edit menu item" : "New menu item"}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={onSave} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <Label htmlFor="mn">Name</Label>
            <Input
              id="mn"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="mp">Price (Rp)</Label>
            <Input
              id="mp"
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="ml">Low stock threshold (optional)</Label>
            <Input
              id="ml"
              type="number"
              min={0}
              value={form.low_stock_threshold}
              onChange={(e) => setForm((f) => ({ ...f, low_stock_threshold: e.target.value }))}
              placeholder="Uses event default if empty"
            />
          </div>
          <div>
            <Label htmlFor="img">Image (optional)</Label>
            <Input
              id="img"
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-xs text-brand-text/55">
              Uploads to <span className="font-mono">{BUCKET}</span> after the row is saved (new or
              existing).
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_bundle}
              onChange={(e) =>
                setForm((f) => {
                  const is_bundle = e.target.checked;
                  return { ...f, is_bundle };
                })
              }
            />
            Bundle (composite item)
          </label>

          {form.is_bundle && (
            <div className="rounded-lg border border-brand-yellow/40 bg-brand-yellow/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-brand-text">Bundle components</span>
                <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={addBundleLine}>
                  Add row
                </Button>
              </div>
              <p className="mt-1 text-xs text-brand-text/60">
                Each row is a non-bundle menu item and quantity. Duplicates collapse on save.
              </p>
              <div className="mt-2 space-y-2">
                {bundleLines.length === 0 ? (
                  <p className="text-xs text-brand-text/55">No components yet.</p>
                ) : (
                  bundleLines.map((line, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[140px] flex-1">
                        <Label className="text-xs">Component</Label>
                        <select
                          className="mt-0.5 w-full rounded-lg border border-brand-text/15 bg-white px-2 py-2 text-sm"
                          value={line.component_item_id}
                          onChange={(e) => updateBundleLine(i, { component_item_id: e.target.value })}
                        >
                          {componentCandidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            updateBundleLine(i, { quantity: Math.max(1, Number(e.target.value) || 1) })
                          }
                        />
                      </div>
                      <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => removeBundleLine(i)}>
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
