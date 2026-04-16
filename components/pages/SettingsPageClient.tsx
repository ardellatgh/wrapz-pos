"use client";

import { useCallback, useEffect, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useToast } from "@/components/ui/Toast";
import { EVENT_SETTINGS_ROW_ID } from "@/lib/constants";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type Row = {
  event_name: string;
  queue_start: number;
  default_low_stock_threshold: number;
  /** Whole rupiah goal for dashboard; empty = no target */
  target_revenue: string;
};

export function SettingsPageClient() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Row>({
    event_name: "",
    queue_start: 1,
    default_low_stock_threshold: 10,
    target_revenue: "",
  });
  const [loadError, setLoadError] = useState<string | null>(null);

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
        .from("event_settings")
        .select("event_name, queue_start, default_low_stock_threshold, target_revenue")
        .eq("id", EVENT_SETTINGS_ROW_ID)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const tr = data.target_revenue;
        setForm({
          event_name: data.event_name ?? "",
          queue_start: data.queue_start ?? 1,
          default_low_stock_threshold: data.default_low_stock_threshold ?? 10,
          target_revenue:
            tr != null && Number(tr) > 0 ? String(Math.round(Number(tr))) : "",
        });
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) return;
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const rawTarget = form.target_revenue.trim().replace(/\s/g, "");
      const parsedTarget = rawTarget === "" ? null : Math.max(0, Math.round(Number(rawTarget) || 0));
      const target_revenue =
        parsedTarget == null || parsedTarget === 0 ? null : parsedTarget;

      const { error } = await supabase.from("event_settings").upsert(
        {
          id: EVENT_SETTINGS_ROW_ID,
          event_name: form.event_name.trim(),
          queue_start: Math.max(1, Number(form.queue_start) || 1),
          default_low_stock_threshold: Math.max(
            0,
            Number(form.default_low_stock_threshold) || 0
          ),
          target_revenue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      if (error) throw error;
      showToast("Event settings saved.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader
          title="Event settings"
          description="Singleton configuration for the event (Asia/Jakarta). Requires an internet connection to Supabase."
        />
        <SupabaseSetupBanner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Event settings"
        description="Singleton configuration for the wisuda stall (Asia/Jakarta). Requires an internet connection to Supabase."
      />

      {loadError && (
        <Card className="border-brand-red/25 bg-brand-red/5">
          <p className="text-sm text-brand-red">{loadError}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      )}

      <Card>
        {loading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-full animate-pulse rounded-lg bg-brand-text/8" />
            ))}
          </div>
        ) : (
          <form onSubmit={onSave} className="space-y-4">
            <div>
              <Label htmlFor="event_name">Event name</Label>
              <Input
                id="event_name"
                value={form.event_name}
                onChange={(e) => setForm((f) => ({ ...f, event_name: e.target.value }))}
                placeholder="WRAPZ Wisuda"
              />
            </div>
            <div>
              <Label htmlFor="tz">Timezone</Label>
              <Input
                id="tz"
                readOnly
                value="Asia/Jakarta (UTC+7)"
                className="cursor-not-allowed bg-brand-bg/80"
              />
            </div>
            <div>
              <Label htmlFor="queue_start">Queue start number</Label>
              <Input
                id="queue_start"
                type="number"
                min={1}
                value={form.queue_start}
                onChange={(e) =>
                  setForm((f) => ({ ...f, queue_start: Number(e.target.value) || 1 }))
                }
              />
            </div>
            <div>
              <Label htmlFor="low">Default low stock threshold</Label>
              <Input
                id="low"
                type="number"
                min={0}
                value={form.default_low_stock_threshold}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    default_low_stock_threshold: Number(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="target_revenue">Target revenue (optional)</Label>
              <Input
                id="target_revenue"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="e.g. 5000000"
                value={form.target_revenue}
                onChange={(e) => setForm((f) => ({ ...f, target_revenue: e.target.value }))}
              />
              <p className="mt-1 text-xs text-brand-text/55">
                Whole rupiah sales goal for the event. Used on the dashboard (net sales vs target). Leave empty
                to hide progress.
              </p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
