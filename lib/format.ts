const JAKARTA_TZ = "Asia/Jakarta";

export function formatRupiah(amount: number): string {
  const n = Math.round(amount);
  return `Rp ${n.toLocaleString("id-ID")}`;
}

/** Display timestamps in WIB (UTC+7) for operator-facing UI. */
export function formatJakartaDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Queue display: 3-digit zero-padded (single-cashier queue assignment in app). */
export function formatQueueDisplay(queueNumber: number): string {
  const n = Math.max(0, Math.floor(queueNumber));
  return String(n).padStart(3, "0");
}

export function formatDiscountValue(
  type: "percent" | "fixed",
  value: number
): string {
  if (type === "percent") return `${value}%`;
  return formatRupiah(value);
}
