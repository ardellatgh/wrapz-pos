import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { formatBackupZipBasename } from "@/lib/format";

/** Tables included in the backup ZIP, in a stable documented order. */
export const EXPORT_TABLES = [
  "event_settings",
  "menu_items",
  "bundle_components",
  "discount_presets",
  "stock_movements",
  "cash_sessions",
  "cash_movements",
  "ledger_entries",
  "orders",
  "order_items",
  "payments",
  "settlements",
] as const;

export type ExportTableName = (typeof EXPORT_TABLES)[number];

function stringifyCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "string") return v.replace(/\t/g, " ").replace(/\r\n/g, " ").replace(/\n/g, " ");
  if (typeof v === "object") {
    try {
      return JSON.stringify(v).replace(/\t/g, " ").replace(/\r\n/g, " ").replace(/\n/g, " ");
    } catch {
      return "";
    }
  }
  return String(v)
    .replace(/\t/g, " ")
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ");
}

function collectColumns(rows: Record<string, unknown>[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) set.add(k);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function rowsToTsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join("\t");
  if (rows.length === 0) return `${header}\n`;
  const body = rows.map((r) => columns.map((c) => stringifyCell(r[c])).join("\t")).join("\n");
  return `${header}\n${body}\n`;
}

async function fetchAllFromTable(
  supabase: SupabaseClient,
  table: ExportTableName
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table as never).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const chunk = (data ?? []) as Record<string, unknown>[];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * Fetches every export table, builds TSVs, returns a ZIP blob — or throws before any partial download.
 */
export async function buildFullBackupZip(supabase: SupabaseClient): Promise<{ blob: Blob; filename: string }> {
  const tsvParts: { name: string; content: string }[] = [];

  for (const table of EXPORT_TABLES) {
    const rows = await fetchAllFromTable(supabase, table);
    const columns = collectColumns(rows);
    const tsv = rowsToTsv(rows, columns);
    tsvParts.push({ name: `${table}.tsv`, content: tsv });
  }

  const zip = new JSZip();
  for (const p of tsvParts) {
    zip.file(p.name, p.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, filename: `${formatBackupZipBasename()}.zip` };
}
