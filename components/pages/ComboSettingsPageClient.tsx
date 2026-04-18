"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import {
  applyOrderSummary,
  computeAutoPriorities,
  type RankMemberInput,
  type RankPackageInput,
  type RankSlotInput,
} from "@/lib/comboAdminPriority";
import { EVENT_SETTINGS_ROW_ID } from "@/lib/constants";
import { formatRupiah } from "@/lib/format";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type GroupRow = { id: string; name: string; sort_order: number; is_active: boolean };
type MemberRow = { id: string; group_id: string; menu_item_id: string };
type PackageRow = {
  id: string;
  name: string;
  package_price: number;
  priority: number;
  is_active: boolean;
  is_configured: boolean;
};
type SlotRow = {
  id: string;
  package_id: string;
  group_id: string;
  quantity: number;
  sort_order: number;
  rule_wording: "pilih" | "tambah";
};
type MenuPick = { id: string; name: string; is_bundle: boolean; price: number; image_url: string | null };

type CategoryModalState = null | { mode: "create" } | { mode: "edit"; groupId: string };
type PackageModalState = null | { mode: "create" } | { mode: "edit"; packageId: string };

type DataSnapshot = {
  packages: PackageRow[];
  slots: SlotRow[];
  members: MemberRow[];
};

function formatIsiLine(
  rule: "pilih" | "tambah",
  qty: number,
  categoryName: string
): string {
  if (rule === "tambah") {
    return `Add ${qty} from ${categoryName}`;
  }
  return `Choose ${qty} from ${categoryName}`;
}

export function ComboSettingsPageClient() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comboAutoApply, setComboAutoApply] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [menuItems, setMenuItems] = useState<MenuPick[]>([]);

  const [categoryModal, setCategoryModal] = useState<CategoryModalState>(null);
  const [packageModal, setPackageModal] = useState<PackageModalState>(null);

  const menuPriceById = useMemo(
    () => new Map(menuItems.map((m) => [m.id, m.price])),
    [menuItems]
  );

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groups]);

  const menuNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of menuItems) m.set(x.id, x.name);
    return m;
  }, [menuItems]);

  const menuImageById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const x of menuItems) m.set(x.id, x.image_url);
    return m;
  }, [menuItems]);

  const packagesDisplay = useMemo(
    () =>
      [...packages].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.name.localeCompare(b.name, "id");
      }),
    [packages]
  );

  const applyOrderText = useMemo(
    () =>
      applyOrderSummary(
        packages as RankPackageInput[],
        slots as RankSlotInput[],
        members as RankMemberInput[],
        menuPriceById
      ),
    [packages, slots, members, menuPriceById]
  );

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: es, error: eErr } = await supabase
        .from("event_settings")
        .select("combo_auto_apply")
        .eq("id", EVENT_SETTINGS_ROW_ID)
        .maybeSingle();
      if (eErr) throw eErr;
      if (es && typeof es.combo_auto_apply === "boolean") {
        setComboAutoApply(es.combo_auto_apply);
      }

      const { data: g, error: gErr } = await supabase
        .from("combo_groups")
        .select("id, name, sort_order, is_active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (gErr) throw gErr;
      setGroups(
        (g ?? []).map((r) => ({
          id: r.id as string,
          name: r.name as string,
          sort_order: Number(r.sort_order),
          is_active: Boolean(r.is_active),
        }))
      );

      const { data: m, error: mErr } = await supabase
        .from("combo_group_members")
        .select("id, group_id, menu_item_id");
      if (mErr) throw mErr;
      setMembers(
        (m ?? []).map((r) => ({
          id: r.id as string,
          group_id: r.group_id as string,
          menu_item_id: r.menu_item_id as string,
        }))
      );

      const { data: p, error: pErr } = await supabase
        .from("combo_packages")
        .select("id, name, package_price, priority, is_active, is_configured")
        .order("priority", { ascending: false })
        .order("name", { ascending: true });
      if (pErr) throw pErr;
      setPackages(
        (p ?? []).map((r) => ({
          id: r.id as string,
          name: r.name as string,
          package_price: Number(r.package_price),
          priority: Number(r.priority),
          is_active: Boolean(r.is_active),
          is_configured: Boolean(r.is_configured),
        }))
      );

      const { data: s, error: sErr } = await supabase
        .from("combo_package_slots")
        .select("id, package_id, group_id, quantity, sort_order, rule_wording")
        .order("sort_order", { ascending: true });
      if (sErr) throw sErr;
      setSlots(
        (s ?? []).map((r) => ({
          id: r.id as string,
          package_id: r.package_id as string,
          group_id: r.group_id as string,
          quantity: Number(r.quantity),
          sort_order: Number(r.sort_order),
          rule_wording: r.rule_wording === "tambah" ? "tambah" : "pilih",
        }))
      );

      const { data: mi, error: miErr } = await supabase
        .from("menu_items")
        .select("id, name, is_bundle, is_active, price, image_url")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (miErr) throw miErr;
      setMenuItems(
        (mi ?? []).map((r) => ({
          id: r.id as string,
          name: r.name as string,
          is_bundle: Boolean(r.is_bundle),
          price: Number(r.price),
          image_url: (r.image_url as string | null) ?? null,
        }))
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat pengaturan combo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persistPriorities = useCallback(
    async (snapshot: DataSnapshot): Promise<{ id: string; priority: number }[]> => {
      if (!isSupabaseConfigured()) return [];
      const supabase = getSupabaseBrowserClient();
      const rankPkgs: RankPackageInput[] = snapshot.packages.map((p) => ({
        id: p.id,
        name: p.name,
        package_price: p.package_price,
        is_active: p.is_active,
        is_configured: p.is_configured,
      }));
      const rankSlots: RankSlotInput[] = snapshot.slots.map((s) => ({
        package_id: s.package_id,
        group_id: s.group_id,
        quantity: s.quantity,
        sort_order: s.sort_order,
      }));
      const rankMembers: RankMemberInput[] = snapshot.members.map((m) => ({
        group_id: m.group_id,
        menu_item_id: m.menu_item_id,
      }));
      const updates = computeAutoPriorities(rankPkgs, rankSlots, rankMembers, menuPriceById);
      const ts = new Date().toISOString();
      for (const u of updates) {
        const { error } = await supabase
          .from("combo_packages")
          .update({ priority: u.priority, updated_at: ts })
          .eq("id", u.id);
        if (error) throw error;
      }
      return updates;
    },
    [menuPriceById]
  );

  const mergePriorities = useCallback((updates: { id: string; priority: number }[]) => {
    setPackages((prev) =>
      prev.map((p) => {
        const u = updates.find((x) => x.id === p.id);
        return u ? { ...p, priority: u.priority } : p;
      })
    );
  }, []);

  async function saveAutoApply(next: boolean) {
    if (!isSupabaseConfigured()) return;
    setSavingToggle(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase
        .from("event_settings")
        .update({
          combo_auto_apply: next,
          updated_at: new Date().toISOString(),
        })
        .eq("id", EVENT_SETTINGS_ROW_ID);
      if (error) throw error;
      setComboAutoApply(next);
      showToast(
        next
          ? "Combo diterapkan otomatis di layar pesanan baru."
          : "Combo tidak otomatis — kasir menekan “Terapkan combo terbaik” di keranjang."
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal menyimpan", "error");
    } finally {
      setSavingToggle(false);
    }
  }

  async function insertCategoryByName(rawName: string): Promise<string | null> {
    if (!isSupabaseConfigured()) return null;
    const name = rawName.trim();
    if (!name) return null;
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("combo_groups")
      .insert({
        name,
        sort_order: groups.length,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select("id, name, sort_order, is_active")
      .single();
    if (error) {
      showToast(error.message, "error");
      return null;
    }
    const row: GroupRow = {
      id: data.id as string,
      name: data.name as string,
      sort_order: Number(data.sort_order),
      is_active: Boolean(data.is_active),
    };
    setGroups((g) => [...g, row]);
    try {
      const u = await persistPriorities({ packages, slots, members });
      mergePriorities(u);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui urutan", "error");
    }
    return row.id;
  }

  async function removeCategory(id: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("combo_groups").delete().eq("id", id);
    if (error) {
      showToast(
        error.message.includes("violates") || error.code === "23503"
          ? "Hapus aturan isi paket yang memakai kategori ini terlebih dahulu."
          : error.message,
        "error"
      );
      return false;
    }
    const nextGroups = groups.filter((g) => g.id !== id);
    const nextMembers = members.filter((m) => m.group_id !== id);
    const nextSlots = slots.filter((s) => s.group_id !== id);
    setGroups(nextGroups);
    setMembers(nextMembers);
    setSlots(nextSlots);
    showToast("Kategori dihapus.");
    try {
      const u = await persistPriorities({ packages, slots: nextSlots, members: nextMembers });
      mergePriorities(u);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui urutan", "error");
    }
    return true;
  }

  async function renameCategory(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed || !isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from("combo_groups")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name: trimmed } : g)));
  }

  async function addMemberToCategory(groupId: string, menuItemId: string) {
    if (!isSupabaseConfigured() || !menuItemId) return;
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("combo_group_members")
      .insert({ group_id: groupId, menu_item_id: menuItemId })
      .select("id, group_id, menu_item_id")
      .single();
    if (error) {
      showToast(error.message, "error");
      return;
    }
    const row: MemberRow = {
      id: data.id as string,
      group_id: data.group_id as string,
      menu_item_id: data.menu_item_id as string,
    };
    const nextMembers = [...members, row];
    setMembers(nextMembers);
    showToast("Item ditambahkan ke kategori.");
    try {
      const u = await persistPriorities({ packages, slots, members: nextMembers });
      mergePriorities(u);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui urutan", "error");
    }
  }

  async function removeMemberRow(id: string) {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("combo_group_members").delete().eq("id", id);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    const nextMembers = members.filter((m) => m.id !== id);
    setMembers(nextMembers);
    try {
      const u = await persistPriorities({ packages, slots, members: nextMembers });
      mergePriorities(u);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui urutan", "error");
    }
  }

  async function insertPackageByNamePrice(nameRaw: string, priceRaw: string): Promise<string | null> {
    if (!isSupabaseConfigured()) return null;
    const name = nameRaw.trim();
    const price = Math.max(0, Math.round(Number(priceRaw.replace(/\D/g, "")) || 0));
    if (!name) return null;
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("combo_packages")
      .insert({
        name,
        package_price: price,
        priority: 0,
        is_active: true,
        is_configured: false,
        updated_at: new Date().toISOString(),
      })
      .select("id, name, package_price, priority, is_active, is_configured")
      .single();
    if (error) {
      showToast(error.message, "error");
      return null;
    }
    const row: PackageRow = {
      id: data.id as string,
      name: data.name as string,
      package_price: Number(data.package_price),
      priority: Number(data.priority),
      is_active: Boolean(data.is_active),
      is_configured: Boolean(data.is_configured),
    };
    const nextPackages = [...packages, row];
    setPackages(nextPackages);
    try {
      const u = await persistPriorities({ packages: nextPackages, slots, members });
      mergePriorities(u);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui urutan", "error");
    }
    return row.id;
  }

  async function updatePackageDb(
    id: string,
    patch: Partial<PackageRow>,
    opts?: { slotsOverride?: SlotRow[] }
  ) {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.package_price !== undefined) row.package_price = patch.package_price;
    if (patch.is_active !== undefined) row.is_active = patch.is_active;
    if (patch.is_configured !== undefined) row.is_configured = patch.is_configured;
    const { error } = await supabase.from("combo_packages").update(row).eq("id", id);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    const nextPackages = packages.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setPackages(nextPackages);
    const slotsForPersist = opts?.slotsOverride ?? slots;
    try {
      const u = await persistPriorities({ packages: nextPackages, slots: slotsForPersist, members });
      mergePriorities(u);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui urutan", "error");
    }
  }

  async function removePackage(id: string) {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("combo_packages").delete().eq("id", id);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    const nextPackages = packages.filter((p) => p.id !== id);
    const nextSlots = slots.filter((s) => s.package_id !== id);
    setPackages(nextPackages);
    setSlots(nextSlots);
    try {
      const u = await persistPriorities({ packages: nextPackages, slots: nextSlots, members });
      mergePriorities(u);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui urutan", "error");
    }
  }

  function slotsForPackage(packageId: string): SlotRow[] {
    return [...slots.filter((s) => s.package_id === packageId)].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.id.localeCompare(b.id);
    });
  }

  async function addRuleToPackage(packageId: string) {
    if (!isSupabaseConfigured()) return;
    const groupId = groups[0]?.id ?? "";
    if (!groupId) {
      showToast("Buat kategori item combo dulu.", "error");
      return;
    }
    const existing = slotsForPackage(packageId);
    const nextSort = existing.length === 0 ? 0 : Math.max(...existing.map((s) => s.sort_order)) + 1;
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("combo_package_slots")
      .insert({
        package_id: packageId,
        group_id: groupId,
        quantity: 1,
        sort_order: nextSort,
        rule_wording: "pilih",
      })
      .select("id, package_id, group_id, quantity, sort_order, rule_wording")
      .single();
    if (error) {
      showToast(error.message, "error");
      return;
    }
    const row: SlotRow = {
      id: data.id as string,
      package_id: data.package_id as string,
      group_id: data.group_id as string,
      quantity: Number(data.quantity),
      sort_order: Number(data.sort_order),
      rule_wording: data.rule_wording === "tambah" ? "tambah" : "pilih",
    };
    const nextSlots = [...slots, row];
    setSlots(nextSlots);
    const slotCount = nextSlots.filter((s) => s.package_id === packageId).length;
    await updatePackageDb(packageId, { is_configured: slotCount > 0 }, { slotsOverride: nextSlots });
  }

  async function updateRule(slot: SlotRow, patch: Partial<SlotRow>) {
    if (!isSupabaseConfigured()) return;
    const next = { ...slot, ...patch };
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from("combo_package_slots")
      .update({
        group_id: next.group_id,
        quantity: Math.max(1, Math.round(next.quantity)),
        sort_order: next.sort_order,
        rule_wording: next.rule_wording,
      })
      .eq("id", slot.id);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    const nextSlots = slots.map((s) => (s.id === slot.id ? next : s));
    setSlots(nextSlots);
    try {
      const u = await persistPriorities({ packages, slots: nextSlots, members });
      mergePriorities(u);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui urutan", "error");
    }
  }

  async function removeRule(slotId: string) {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    const removed = slots.find((s) => s.id === slotId);
    const { error } = await supabase.from("combo_package_slots").delete().eq("id", slotId);
    if (error) {
      showToast(error.message, "error");
      return;
    }
    const nextSlots = slots.filter((s) => s.id !== slotId);
    setSlots(nextSlots);
    if (removed) {
      const pid = removed.package_id;
      const slotCount = nextSlots.filter((s) => s.package_id === pid).length;
      await updatePackageDb(pid, { is_configured: slotCount > 0 }, { slotsOverride: nextSlots });
      return;
    }
    try {
      const u = await persistPriorities({ packages, slots: nextSlots, members });
      mergePriorities(u);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui urutan", "error");
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          eyebrow="Catalog"
          title="Combo packages"
          description="Manage combo item categories and package pricing. Orders stay per menu item."
        />
        <SupabaseSetupBanner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Catalog"
        title="Combo packages"
        description="Manage combo categories and package pricing for the register. Orders stay line-by-line on the menu; the combo engine allocates units without double-counting."
      />

      {loadError && (
        <Card className="border-brand-red/25 bg-brand-red/5 p-3 text-sm text-brand-red">
          {loadError}
          <Button variant="secondary" className="mt-2" type="button" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-brand-text/60">Loading…</p>
      ) : (
        <>
          <Card className="space-y-3 p-4">
            <h2 className="font-display text-lg font-normal uppercase tracking-wide text-brand-text">
              Quick settings
            </h2>
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-brand-text">
              <input
                type="checkbox"
                className="mt-1"
                checked={comboAutoApply}
                disabled={savingToggle}
                onChange={(e) => void saveAutoApply(e.target.checked)}
              />
              <span>
                <span className="font-semibold">Auto-apply best combo on New Order</span>
                <span className="mt-1 block text-xs text-brand-text/65">
                  When on, New Order picks the best qualifying package price automatically. When off, the cashier taps
                  one cart action: <strong>Apply best combo</strong>.
                </span>
              </span>
            </label>
          </Card>

          <Card className="border border-brand-text/10 bg-brand-fill/60 p-4 text-sm text-brand-text/85">
            <span className="font-semibold text-brand-text">Auto-apply order: </span>
            <span>{applyOrderText}</span>
            <p className="mt-1 text-xs text-brand-text/55">
              Order is derived from package size and estimated savings; you do not maintain raw numeric priorities.
            </p>
          </Card>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-normal uppercase tracking-wide text-brand-text">
                  Combo item categories
                </h2>
                <p className="mt-1 text-sm text-brand-text/70">
                  Summary cards only — full edit opens in a modal.
                </p>
              </div>
              <Button type="button" onClick={() => setCategoryModal({ mode: "create" })}>
                + New category
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {groups.map((g) => {
                const catMembers = members.filter((m) => m.group_id === g.id);
                const firstMemberImg = catMembers
                  .map((m) => menuImageById.get(m.menu_item_id))
                  .find((url) => url != null && url.length > 0);
                return (
                  <Card key={g.id} className="flex flex-col gap-2 overflow-hidden p-2.5">
                    <div className="relative aspect-[5/3] w-full overflow-hidden rounded-md bg-brand-bg">
                      {firstMemberImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={firstMemberImg} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-brand-text/40">
                          {catMembers.length === 0 ? "Kosong" : "No image"}
                        </div>
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs font-semibold leading-tight text-brand-text">{g.name}</p>
                    <p className="text-[10px] text-brand-text/50">{catMembers.length} item</p>
                    <div className="mt-auto flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-[36px] flex-1 px-2 text-xs"
                        onClick={() => setCategoryModal({ mode: "edit", groupId: g.id })}
                      >
                        Edit Kategori
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-[36px] px-2 text-xs text-brand-red"
                        onClick={() => void removeCategory(g.id)}
                      >
                        Hapus
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-normal uppercase tracking-wide text-brand-text">
                  Paket combo
                </h2>
                <p className="mt-1 text-sm text-brand-text/70">Ringkasan paket. Edit lengkap di dalam jendela.</p>
              </div>
              <Button type="button" onClick={() => setPackageModal({ mode: "create" })}>
                + Paket baru
              </Button>
            </div>

            <div className="space-y-3">
              {packagesDisplay.map((p) => {
                const pkgSlots = slotsForPackage(p.id);
                const statusBadge =
                  !p.is_active ? (
                    <Badge tone="muted">Nonaktif</Badge>
                  ) : pkgSlots.length === 0 ? (
                    <Badge tone="warning">Belum aturan</Badge>
                  ) : (
                    <Badge tone="success">Aktif</Badge>
                  );
                return (
                  <Card key={p.id} className="space-y-2 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-base font-normal uppercase tracking-wide text-brand-text">
                          {p.name}
                        </p>
                        <p className="mt-0.5 font-display text-lg font-normal tabular-nums tracking-wide text-brand-text/80">
                          {formatRupiah(p.package_price)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {statusBadge}
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            variant="secondary"
                            className="min-h-[36px] px-2 text-xs"
                            onClick={() => setPackageModal({ mode: "edit", packageId: p.id })}
                          >
                            Edit Paket
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-[36px] px-2 text-xs text-brand-red"
                            onClick={() => void removePackage(p.id)}
                          >
                            Hapus
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-md border border-brand-yellow/25 bg-brand-yellow-soft/40 px-2 py-1.5 text-xs text-brand-text/90">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-text/50">Pratinjau isi</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5">
                        {pkgSlots.length === 0 ? (
                          <li className="list-none text-brand-text/55">—</li>
                        ) : (
                          pkgSlots.map((s) => (
                            <li key={s.id}>
                              {formatIsiLine(
                                s.rule_wording,
                                s.quantity,
                                groupNameById.get(s.group_id) ?? "Kategori"
                              )}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </Card>
                );
              })}
              {packages.length === 0 ? (
                <Card className="p-6 text-center text-sm text-brand-text/65">Belum ada paket combo.</Card>
              ) : null}
            </div>
          </section>

          <Modal
            open={categoryModal != null}
            title={
              categoryModal?.mode === "create"
                ? "Kategori baru"
                : `Edit kategori — ${groups.find((g) => g.id === categoryModal?.groupId)?.name ?? ""}`
            }
            size="wide"
            onClose={() => setCategoryModal(null)}
          >
            {categoryModal?.mode === "create" ? (
              <CategoryCreateModalBody
                onCancel={() => setCategoryModal(null)}
                onCreate={async (name) => {
                  const id = await insertCategoryByName(name);
                  if (id) {
                    showToast("Kategori ditambahkan.");
                    setCategoryModal({ mode: "edit", groupId: id });
                  }
                }}
              />
            ) : categoryModal?.mode === "edit" ? (
              (() => {
                const g = groups.find((x) => x.id === categoryModal.groupId);
                if (!g) {
                  return <p className="text-sm text-brand-text/70">Kategori tidak ditemukan.</p>;
                }
                return (
                  <CategoryEditModalBody
                    group={g}
                    members={members.filter((m) => m.group_id === categoryModal.groupId)}
                    menuItems={menuItems}
                    menuNameById={menuNameById}
                    onRename={(name) => void renameCategory(categoryModal.groupId, name)}
                    onRemoveMember={(id) => void removeMemberRow(id)}
                    onAddMember={(menuId) => void addMemberToCategory(categoryModal.groupId, menuId)}
                    onDelete={async () => {
                      if (await removeCategory(categoryModal.groupId)) setCategoryModal(null);
                    }}
                    onClose={() => setCategoryModal(null)}
                  />
                );
              })()
            ) : null}
          </Modal>

          <Modal
            open={packageModal != null}
            title={packageModal?.mode === "create" ? "Paket baru" : "Edit paket"}
            size="wide"
            onClose={() => setPackageModal(null)}
          >
            {packageModal?.mode === "create" ? (
              <PackageCreateModalBody
                onCancel={() => setPackageModal(null)}
                onCreate={async (name, priceDigits) => {
                  const id = await insertPackageByNamePrice(name, priceDigits);
                  if (id) {
                    showToast("Paket ditambahkan.");
                    setPackageModal({ mode: "edit", packageId: id });
                  }
                }}
              />
            ) : packageModal?.mode === "edit" ? (
              (() => {
                const p = packages.find((x) => x.id === packageModal.packageId);
                if (!p) {
                  return <p className="text-sm text-brand-text/70">Paket tidak ditemukan.</p>;
                }
                return (
                  <PackageEditModalBody
                    pkg={p}
                    pkgSlots={slotsForPackage(packageModal.packageId)}
                    groups={groups}
                    groupNameById={groupNameById}
                    onClose={() => setPackageModal(null)}
                    updatePackageDb={updatePackageDb}
                    updateRule={updateRule}
                    removeRule={removeRule}
                    addRuleToPackage={addRuleToPackage}
                  />
                );
              })()
            ) : null}
          </Modal>
        </>
      )}
    </div>
  );
}

function CategoryCreateModalBody({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void (async () => {
          setBusy(true);
          try {
            await onCreate(name);
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      <div>
        <Label htmlFor="cat-create-name">Nama kategori</Label>
        <Input
          id="cat-create-name"
          className="mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="mis. Wrap Ayam"
          autoFocus
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-brand-text/10 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Batal
        </Button>
        <Button type="submit" disabled={!name.trim() || busy}>
          {busy ? "Menyimpan…" : "Buat"}
        </Button>
      </div>
    </form>
  );
}

function CategoryEditModalBody({
  group,
  members,
  menuItems,
  menuNameById,
  onRename,
  onRemoveMember,
  onAddMember,
  onDelete,
  onClose,
}: {
  group: GroupRow;
  members: MemberRow[];
  menuItems: MenuPick[];
  menuNameById: Map<string, string>;
  onRename: (name: string) => void;
  onRemoveMember: (memberRowId: string) => void;
  onAddMember: (menuItemId: string) => void;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="cat-edit-name">Nama kategori</Label>
        <Input
          id="cat-edit-name"
          className="mt-1 font-semibold"
          defaultValue={group.name}
          key={`cat-name-${group.id}-${group.name}`}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== group.name) onRename(v);
          }}
        />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-text/55">Isi kategori</p>
        {members.length === 0 ? (
          <p className="mt-1 text-sm text-brand-text/55">Belum ada item.</p>
        ) : (
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-md border border-brand-text/8 bg-brand-fill/40 px-2 py-1"
              >
                <span>{menuNameById.get(m.menu_item_id) ?? m.menu_item_id}</span>
                <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onRemoveMember(m.id)}>
                  Hapus
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <CategoryAddItemRow
        menuItems={menuItems}
        existingMemberIds={new Set(members.map((m) => m.menu_item_id))}
        onAdd={(menuId) => onAddMember(menuId)}
      />
      <div className="flex flex-wrap justify-between gap-2 border-t border-brand-text/10 pt-4">
        <Button
          type="button"
          variant="ghost"
          className="text-brand-red"
          disabled={deleting}
          onClick={() =>
            void (async () => {
              setDeleting(true);
              try {
                await onDelete();
              } finally {
                setDeleting(false);
              }
            })()
          }
        >
          {deleting ? "Menghapus…" : "Hapus kategori"}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Selesai
        </Button>
      </div>
    </div>
  );
}

function PackageCreateModalBody({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (name: string, priceDigits: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void (async () => {
          setBusy(true);
          try {
            await onCreate(name, price);
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      <div>
        <Label htmlFor="pkg-create-name">Nama paket</Label>
        <Input
          id="pkg-create-name"
          className="mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="mis. Solo"
          autoFocus
        />
      </div>
      <div className="w-full sm:max-w-xs">
        <Label htmlFor="pkg-create-price">Harga (Rp)</Label>
        <Input
          id="pkg-create-price"
          className="mt-1"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-brand-text/10 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Batal
        </Button>
        <Button type="submit" disabled={!name.trim() || busy}>
          {busy ? "Menyimpan…" : "Buat"}
        </Button>
      </div>
    </form>
  );
}

function PackageEditModalBody({
  pkg,
  pkgSlots,
  groups,
  groupNameById,
  onClose,
  updatePackageDb,
  updateRule,
  removeRule,
  addRuleToPackage,
}: {
  pkg: PackageRow;
  pkgSlots: SlotRow[];
  groups: GroupRow[];
  groupNameById: Map<string, string>;
  onClose: () => void;
  updatePackageDb: (id: string, patch: Partial<PackageRow>) => Promise<void>;
  updateRule: (slot: SlotRow, patch: Partial<SlotRow>) => Promise<void>;
  removeRule: (slotId: string) => Promise<void>;
  addRuleToPackage: (packageId: string) => Promise<void>;
}) {
  return (
    <div className="max-h-[min(80vh,640px)] space-y-4 overflow-y-auto pr-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="pkg-edit-name">Nama paket</Label>
          <Input
            id="pkg-edit-name"
            className="font-display text-lg font-normal uppercase tracking-wide text-brand-text"
            defaultValue={pkg.name}
            key={`pkg-name-${pkg.id}-${pkg.name}`}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== pkg.name) void updatePackageDb(pkg.id, { name: v });
            }}
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-text">
            <input
              type="checkbox"
              checked={pkg.is_active}
              onChange={(e) => void updatePackageDb(pkg.id, { is_active: e.target.checked })}
            />
            <span className="font-semibold">Aktif</span>
          </label>
          <p className="text-xs text-brand-text/55">
            Paket dipakai di kasir hanya jika aktif dan sudah ada aturan isi. Aturan mengatur status teknis secara otomatis.
          </p>
        </div>
      </div>
      <div>
        <Label htmlFor="pkg-edit-price">Harga paket (Rp)</Label>
        <Input
          id="pkg-edit-price"
          className="mt-1 max-w-xs"
          inputMode="numeric"
          defaultValue={String(pkg.package_price)}
          key={`pkg-price-${pkg.id}-${pkg.package_price}`}
          onBlur={(e) => {
            const v = Math.max(0, Math.round(Number(e.target.value.replace(/\D/g, "")) || 0));
            if (v !== pkg.package_price) void updatePackageDb(pkg.id, { package_price: v });
          }}
        />
        <p className="mt-1 font-display text-xl font-normal tracking-wide text-brand-text">{formatRupiah(pkg.package_price)}</p>
      </div>
      <div className="rounded-lg border border-brand-text/10 bg-brand-bg/40 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-text/55">Aturan isi paket</p>
        {pkgSlots.length === 0 ? (
          <p className="mt-2 text-sm text-brand-text/60">Tambah aturan untuk menjelaskan isi paket.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pkgSlots.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-2 rounded-md border border-brand-text/10 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-end"
              >
                <div className="min-w-[140px]">
                  <Label className="text-xs">Frasa</Label>
                  <select
                    className="mt-1 w-full rounded-ref-sm border border-brand-text/12 bg-brand-fill px-2 py-2 text-sm"
                    value={s.rule_wording}
                    onChange={(e) =>
                      void updateRule(s, {
                        rule_wording: e.target.value === "tambah" ? "tambah" : "pilih",
                      })
                    }
                  >
                    <option value="pilih">Pilih … dari kategori</option>
                    <option value="tambah">Tambah … dari kategori</option>
                  </select>
                </div>
                <div className="w-20">
                  <Label className="text-xs">Jumlah</Label>
                  <Input
                    type="number"
                    min={1}
                    className="mt-1"
                    defaultValue={String(s.quantity)}
                    key={`qty-${s.id}-${s.quantity}`}
                    onBlur={(e) => {
                      const v = Math.max(1, Math.round(Number(e.target.value) || 1));
                      if (v !== s.quantity) void updateRule(s, { quantity: v });
                    }}
                  />
                </div>
                <div className="min-w-[160px] flex-1">
                  <Label className="text-xs">Kategori</Label>
                  <select
                    className="mt-1 w-full rounded-ref-sm border border-brand-text/12 bg-brand-fill px-2 py-2 text-sm"
                    value={s.group_id}
                    onChange={(e) => void updateRule(s, { group_id: e.target.value })}
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs text-brand-red sm:ml-auto"
                  onClick={() => void removeRule(s.id)}
                >
                  Hapus aturan
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="secondary" className="mt-3" onClick={() => void addRuleToPackage(pkg.id)}>
          + Tambah aturan isi
        </Button>
      </div>
      <div className="rounded-lg border border-brand-yellow/30 bg-brand-yellow-soft/30 px-3 py-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-text/55">Pratinjau isi</p>
        <ul className="mt-2 list-inside list-disc space-y-0.5 text-brand-text/90">
          {pkgSlots.length === 0 ? (
            <li className="list-none text-brand-text/55">—</li>
          ) : (
            pkgSlots.map((s) => (
              <li key={s.id}>
                {formatIsiLine(s.rule_wording, s.quantity, groupNameById.get(s.group_id) ?? "Kategori")}
              </li>
            ))
          )}
        </ul>
      </div>
      <div className="flex justify-end border-t border-brand-text/10 pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Selesai
        </Button>
      </div>
    </div>
  );
}

function CategoryAddItemRow({
  menuItems,
  existingMemberIds,
  onAdd,
}: {
  menuItems: MenuPick[];
  existingMemberIds: Set<string>;
  onAdd: (menuItemId: string) => void;
}) {
  const [pick, setPick] = useState("");
  const choices = menuItems.filter((m) => !existingMemberIds.has(m.id));
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-brand-text/10 pt-3">
      <div className="min-w-0 flex-1">
        <Label className="text-xs">Tambah item ke kategori</Label>
        <select
          className="mt-1 w-full rounded-ref-sm border border-brand-text/12 bg-brand-fill px-2 py-2 text-sm"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">Pilih item menu…</option>
          {choices.map((mi) => (
            <option key={mi.id} value={mi.id}>
              {mi.name}
              {mi.is_bundle ? " (paket menu)" : ""}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={!pick}
        onClick={() => {
          onAdd(pick);
          setPick("");
        }}
      >
        Tambah
      </Button>
    </div>
  );
}
