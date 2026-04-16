"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PURGE_CONFIRM_PHRASE } from "@/lib/constants";
import { buildFullBackupZip, EXPORT_TABLES } from "@/lib/fullExport";
import { formatDateTime } from "@/lib/format";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type PurgeStep = "idle" | "warning" | "confirm";

export function ExportPageClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExportOk, setSessionExportOk] = useState(false);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [lastFilename, setLastFilename] = useState<string | null>(null);

  const [purgeStep, setPurgeStep] = useState<PurgeStep>("idle");
  const [purgeIncludeMaster, setPurgeIncludeMaster] = useState(false);
  const [purgePhrase, setPurgePhrase] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeRpcError, setPurgeRpcError] = useState<string | null>(null);
  const [purgeSucceeded, setPurgeSucceeded] = useState(false);

  const runExport = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setExporting(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { blob, filename } = await buildFullBackupZip(supabase);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setLastOkAt(Date.now());
      setLastFilename(filename);
      setSessionExportOk(true);
      setPurgeSucceeded(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      setError(msg);
    } finally {
      setExporting(false);
    }
  }, []);

  const closePurgeFlow = useCallback(() => {
    setPurgeStep("idle");
    setPurgePhrase("");
    setPurgeRpcError(null);
  }, []);

  const runPurge = useCallback(async () => {
    if (!isSupabaseConfigured() || !sessionExportOk) return;
    if (purgePhrase !== PURGE_CONFIRM_PHRASE) return;
    setPurging(true);
    setPurgeRpcError(null);
    try {
      const res = await fetch("/api/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmPhrase: PURGE_CONFIRM_PHRASE,
          includeMaster: purgeIncludeMaster,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? (res.statusText || "Purge failed"));
      }
      showToast("Event data purged.");
      setPurgeSucceeded(true);
      setSessionExportOk(false);
      closePurgeFlow();
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Purge failed";
      setPurgeRpcError(msg);
      showToast(msg, "error");
    } finally {
      setPurging(false);
    }
  }, [sessionExportOk, purgePhrase, purgeIncludeMaster, showToast, router, closePurgeFlow]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-2xl font-semibold text-brand-text">Backup &amp; Export</h1>
        <SupabaseSetupBanner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-brand-text">Backup &amp; Export</h1>
        <p className="mt-1 text-sm text-brand-text/70">
          Export a full backup of all event data as TSV files in a ZIP archive (built in the browser). If any
          table fails to load, no ZIP is downloaded. Requires a live connection to Supabase.
        </p>
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-brand-text">Included tables</h2>
        <ul className="mt-2 list-inside list-disc space-y-0.5 font-mono text-xs text-brand-text/75">
          {EXPORT_TABLES.map((t) => (
            <li key={t}>{t}.tsv</li>
          ))}
        </ul>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50/90 p-3 text-sm text-red-900">
          {error}{" "}
          <button type="button" className="font-medium underline" onClick={() => void runExport()}>
            Retry
          </button>
        </Card>
      )}

      {lastOkAt != null && lastFilename != null && (
        <Card className="border-semantic-success/30 bg-semantic-success/5 p-4 text-sm">
          <p className="font-medium text-semantic-success">Last successful export (this browser session)</p>
          <p className="mt-1 text-brand-text/80">
            <span className="text-brand-text/60">Time (WIB):</span> {formatDateTime(new Date(lastOkAt))}
          </p>
          <p className="mt-0.5 font-mono text-xs text-brand-text/85 break-all">
            <span className="font-sans text-brand-text/60">File:</span> {lastFilename}
          </p>
        </Card>
      )}

      <Button
        type="button"
        variant="primary"
        className="min-h-[48px] w-full text-base sm:text-sm"
        disabled={exporting}
        onClick={() => void runExport()}
      >
        {exporting ? "Preparing backup…" : "Export all data"}
      </Button>

      <Card className="border-2 border-red-800/40 bg-red-50/50 p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-red-900">Danger zone</h2>
        <p className="mt-1 text-sm text-red-950/90">
          Permanently delete data from Supabase. You must complete a successful full ZIP export in this session
          before purge is enabled. Export again after a purge to unlock another purge. Execution runs on the
          server with the service role key; the publishable browser key cannot call the purge function directly.
        </p>

        {!sessionExportOk && (
          <p className="mt-3 rounded-lg border border-red-300 bg-white/80 p-3 text-sm text-red-900">
            Purge is locked until you run a successful backup export from this page in this session.
          </p>
        )}

        {purgeSucceeded && (
          <div className="mt-4 rounded-lg border border-semantic-success/40 bg-white p-4 text-sm text-brand-text">
            <p className="font-semibold text-semantic-success">Purge completed</p>
            <p className="mt-1 text-brand-text/80">
              Data was removed from the database. Refresh navigation if any screen still shows old values.
            </p>
            <Button type="button" variant="secondary" className="mt-3" onClick={() => setPurgeSucceeded(false)}>
              Dismiss
            </Button>
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          className="mt-4 w-full border-2 border-red-800 bg-red-100 font-semibold text-red-950 hover:bg-red-200 disabled:opacity-50"
          disabled={!sessionExportOk || purging || exporting}
          onClick={() => {
            setPurgeStep("warning");
            setPurgePhrase("");
            setPurgeRpcError(null);
          }}
        >
          Purge event data…
        </Button>
      </Card>

      <Modal
        open={purgeStep === "warning"}
        title="Permanent data deletion"
        onClose={closePurgeFlow}
      >
        <p className="text-sm text-brand-text/85">
          Purging removes rows from your Supabase project. This cannot be undone. Ensure you have stored the
          downloaded ZIP somewhere safe — it is your recovery path.
        </p>
        <p className="mt-3 text-sm font-medium text-red-900">You will be asked to confirm by typing an exact phrase.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={closePurgeFlow}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => setPurgeStep("confirm")}>
            I understand — continue
          </Button>
        </div>
      </Modal>

      <Modal open={purgeStep === "confirm"} title="Confirm purge" onClose={closePurgeFlow} size="wide">
        <div className="space-y-5">
          <div
            className={`rounded-xl border-2 p-4 ${
              purgeIncludeMaster
                ? "border-red-800 bg-red-100/90"
                : "border-brand-yellow/70 bg-brand-yellow/15"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-text/70">Selected mode</p>
            <p className="mt-1 text-sm font-semibold text-brand-text">
              {purgeIncludeMaster
                ? "Purge everything (operational + menu, bundles, discounts, event settings)"
                : "Purge operational data only (orders, payments, stock movements, cash, ledger, …)"}
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-brand-text">Purge mode</legend>

            <label className="flex cursor-pointer gap-3 rounded-lg border border-brand-text/15 bg-white p-3 has-[:checked]:border-brand-red/50 has-[:checked]:ring-2 has-[:checked]:ring-brand-red/20">
              <input
                type="radio"
                name="purge_mode"
                className="mt-1"
                checked={!purgeIncludeMaster}
                onChange={() => setPurgeIncludeMaster(false)}
              />
              <span>
                <span className="font-medium text-brand-text">Operational data only</span>
                <span className="mt-1 block text-xs text-brand-text/65">
                  Removes orders, order_items, payments, settlements, stock_movements, cash_sessions,
                  cash_movements, ledger_entries. Keeps menu, bundles, discounts, and event settings.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer gap-3 rounded-lg border-2 border-red-800/50 bg-red-50/80 p-3 has-[:checked]:border-red-800 has-[:checked]:ring-2 has-[:checked]:ring-red-800/30">
              <input
                type="radio"
                name="purge_mode"
                className="mt-1"
                checked={purgeIncludeMaster}
                onChange={() => setPurgeIncludeMaster(true)}
              />
              <span>
                <span className="font-medium text-red-950">Purge everything</span>
                <span className="mt-1 block text-xs text-red-900/85">
                  Also deletes event_settings, menu_items, bundle_components, and discount_presets. The app will
                  need configuration and menu data restored before normal use.
                </span>
              </span>
            </label>
          </fieldset>

          <div>
            <Label htmlFor="purge_phrase">
              Type <span className="font-mono text-brand-text">{PURGE_CONFIRM_PHRASE}</span> to enable purge
            </Label>
            <Input
              id="purge_phrase"
              className="mt-1 font-mono"
              value={purgePhrase}
              onChange={(e) => setPurgePhrase(e.target.value)}
              autoComplete="off"
              placeholder={PURGE_CONFIRM_PHRASE}
            />
          </div>

          {purgeRpcError && (
            <p className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-900">{purgeRpcError}</p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-brand-text/10 pt-4">
            <Button type="button" variant="secondary" onClick={() => setPurgeStep("warning")}>
              Back
            </Button>
            <Button type="button" variant="secondary" onClick={closePurgeFlow}>
              Cancel
            </Button>
            <Button
              type="button"
              className="border-2 border-red-900 bg-red-800 text-white hover:bg-red-900"
              disabled={purging || purgePhrase !== PURGE_CONFIRM_PHRASE}
              onClick={() => void runPurge()}
            >
              {purging ? "Purging…" : "Execute purge"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
