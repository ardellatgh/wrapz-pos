import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Idempotent stock deduction for an order.
 * Uses orders.stock_deducted as the guard; sets it true only when claiming the deduction.
 * Expands bundles into component stock movements.
 */
export async function deductStock(
  supabase: SupabaseClient,
  orderId: string
): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
  const { data: claimed, error: claimErr } = await supabase
    .from("orders")
    .update({ stock_deducted: true, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("stock_deducted", false)
    .select("id, manually_overridden_to_serving")
    .maybeSingle();

  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed) {
    return { ok: true, skipped: true };
  }

  const movementType = claimed.manually_overridden_to_serving
    ? "manual_override_sale"
    : "sale";

  const { data: lines, error: linesErr } = await supabase
    .from("order_items")
    .select("menu_item_id, quantity")
    .eq("order_id", orderId);
  if (linesErr) return { ok: false, error: linesErr.message };

  const inserts: {
    menu_item_id: string;
    movement_type: string;
    quantity_change: number;
    reference_order_id: string;
    notes: string;
  }[] = [];

  for (const line of lines ?? []) {
    const menuItemId = line.menu_item_id as string;
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const { data: mi, error: miErr } = await supabase
      .from("menu_items")
      .select("is_bundle")
      .eq("id", menuItemId)
      .single();
    if (miErr) return { ok: false, error: miErr.message };

    if (!mi?.is_bundle) {
      inserts.push({
        menu_item_id: menuItemId,
        movement_type: movementType,
        quantity_change: -qty,
        reference_order_id: orderId,
        notes: "Order sale",
      });
      continue;
    }

    const { data: comps, error: cErr } = await supabase
      .from("bundle_components")
      .select("component_item_id, quantity")
      .eq("bundle_id", menuItemId);
    if (cErr) return { ok: false, error: cErr.message };

    for (const c of comps ?? []) {
      const compId = c.component_item_id as string;
      const perBundle = Number(c.quantity);
      const totalComp = qty * perBundle;
      inserts.push({
        menu_item_id: compId,
        movement_type: movementType,
        quantity_change: -totalComp,
        reference_order_id: orderId,
        notes: "Bundle component sale",
      });
    }
  }

  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from("stock_movements").insert(inserts);
    if (insErr) return { ok: false, error: insErr.message };
  }

  return { ok: true };
}
