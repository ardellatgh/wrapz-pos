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

/** Alias for Stage 4 / docs naming — same as {@link formatJakartaDateTime}. */
export function formatDateTime(iso: string | Date): string {
  return formatJakartaDateTime(iso);
}

/** Queue display: 3-digit zero-padded (single-cashier queue assignment in app). */
export function formatQueueDisplay(queueNumber: number): string {
  const n = Math.max(0, Math.floor(queueNumber));
  return String(n).padStart(3, "0");
}

/** Alias for Stage 4 / docs naming — same as {@link formatQueueDisplay}. */
export function formatQueueNumber(queueNumber: number): string {
  return formatQueueDisplay(queueNumber);
}

export function formatDiscountValue(
  type: "percent" | "fixed",
  value: number
): string {
  if (type === "percent") return `${value}%`;
  return formatRupiah(value);
}

/** ZIP basename for full backup: `Backup_DDMMYYYY_HHMM` in Asia/Jakarta (no extension). */
export function formatBackupZipBasename(): string {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: JAKARTA_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year").replace(/\D/g, "").slice(-4);
  const hour = get("hour");
  const minute = get("minute");
  return `Backup_${day}${month}${year}_${hour}${minute}`;
}
