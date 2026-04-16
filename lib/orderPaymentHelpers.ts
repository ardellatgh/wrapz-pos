import type { SupabaseClient } from "@supabase/supabase-js";

export type PayMethod = "cash" | "qris" | "transfer";

export function ledgerPaymentEntryType(m: PayMethod): string {
  if (m === "cash") return "payment_cash";
  if (m === "qris") return "payment_qris";
  return "payment_transfer";
}

export function ledgerSettlementCollectEntryType(m: PayMethod): string {
  if (m === "cash") return "settlement_cash";
  if (m === "qris") return "settlement_qris";
  return "settlement_transfer";
}

export async function fetchOpenCashSessionId(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}
