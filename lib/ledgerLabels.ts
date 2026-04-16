/** Human-readable labels for `ledger_entries.entry_type` (read-only UI). */
export function ledgerEntryTypeLabel(entryType: string): string {
  const map: Record<string, string> = {
    opening_cash: "Opening cash",
    cash_refill: "Cash refill",
    cash_sale: "Cash sale",
    refund: "Refund",
    other: "Other",
    payment_cash: "Cash payment",
    payment_qris: "QRIS payment",
    payment_transfer: "Transfer payment",
    settlement_cash: "Cash settlement",
    settlement_qris: "QRIS settlement",
    settlement_transfer: "Transfer settlement",
    refund_cash: "Cash refund",
    adjustment: "Adjustment",
  };
  return map[entryType] ?? entryType.replace(/_/g, " ");
}
