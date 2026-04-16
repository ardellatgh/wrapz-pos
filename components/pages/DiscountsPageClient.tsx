"use client";

import { useCallback, useEffect, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { Table, Td, Th } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { formatDiscountValue, formatRupiah } from "@/lib/format";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Preset = {
  id: string;
  name: string;
  discount_type: "percent" | "fixed";
  value: number;
  min_purchase: number | null;
  is_active: boolean;
};

const emptyForm = {
  name: "",
  discount_type: "percent" as "percent" | "fixed",
  value: "" as string | number,
  min_purchase: "" as string | number,
  is_active: true,
};

export function DiscountsPageClient() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Preset | null>(null);
  const [form, setForm] = useState(emptyForm);
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
      const { data, error } = await supabase
        .from("discount_presets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows(
        (data ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          discount_type: r.discount_type,
          value: Number(r.value),
          min_purchase: r.min_purchase == null ? null : Number(r.min_purchase),
          is_active: r.is_active,
        }))
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, value: "", min_purchase: "" });
    setModalOpen(true);
  }

  function openEdit(row: Preset) {
    setEditing(row);
    setForm({
      name: row.name,
      discount_type: row.discount_type,
      value: row.value,
      min_purchase: row.min_purchase ?? "",
      is_active: row.is_active,
    });
    setModalOpen(true);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) return;
    const name = form.name.trim();
    if (!name) {
      showToast("Name is required", "error");
      return;
    }
    const value = Number(form.value);
    if (Number.isNaN(value) || value < 0) {
      showToast("Invalid value", "error");
      return;
    }
    if (form.discount_type === "percent" && value > 100) {
      showToast("Percent cannot exceed 100", "error");
      return;
    }
    const minRaw = form.min_purchase === "" ? null : Number(form.min_purchase);
    const min_purchase =
      minRaw == null || Number.isNaN(minRaw) ? null : Math.max(0, minRaw);

    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const payload = {
        name,
        discount_type: form.discount_type,
        value,
        min_purchase,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase
          .from("discount_presets")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("discount_presets").insert(payload);
        if (error) throw error;
      }
      showToast("Discount preset saved.");
      setModalOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: Preset) {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase
        .from("discount_presets")
        .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw error;
      showToast(row.is_active ? "Preset deactivated." : "Preset activated.");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold text-brand-text">Discount Presets</h1>
        <SupabaseSetupBanner />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-brand-text">Discount Presets</h1>
          <p className="mt-1 text-sm text-brand-text/65">Preset discounts for the cashier (Stage 3).</p>
        </div>
        <Button onClick={openCreate}>Add preset</Button>
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
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-brand-text/60">
            No discount presets. Add one to offer discounts to customers.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Value</Th>
                <Th>Min purchase</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="capitalize">{r.discount_type}</Td>
                  <Td className="font-mono text-xs">
                    {formatDiscountValue(r.discount_type, r.value)}
                  </Td>
                  <Td className="font-mono text-xs">
                    {r.min_purchase != null ? formatRupiah(r.min_purchase) : "—"}
                  </Td>
                  <Td>
                    {r.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="muted">Inactive</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" className="mr-1 px-2 py-1 text-xs" onClick={() => openEdit(r)}>
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
        title={editing ? "Edit discount preset" : "New discount preset"}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={onSave} className="space-y-3">
          <div>
            <Label htmlFor="dn">Name</Label>
            <Input
              id="dn"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>Type</Label>
            <div className="mt-1 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dt"
                  checked={form.discount_type === "percent"}
                  onChange={() => setForm((f) => ({ ...f, discount_type: "percent" }))}
                />
                Percent
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dt"
                  checked={form.discount_type === "fixed"}
                  onChange={() => setForm((f) => ({ ...f, discount_type: "fixed" }))}
                />
                Fixed (Rp)
              </label>
            </div>
          </div>
          <div>
            <Label htmlFor="dv">{form.discount_type === "percent" ? "Percent (%)" : "Amount (Rp)"}</Label>
            <Input
              id="dv"
              type="number"
              min={0}
              max={form.discount_type === "percent" ? 100 : undefined}
              step={form.discount_type === "percent" ? 1 : 1}
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label htmlFor="minp">Minimum purchase (Rp, optional)</Label>
            <Input
              id="minp"
              type="number"
              min={0}
              value={form.min_purchase}
              onChange={(e) => setForm((f) => ({ ...f, min_purchase: e.target.value }))}
              placeholder="Leave empty for no minimum"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
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
