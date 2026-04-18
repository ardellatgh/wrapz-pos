"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import {
  defaultClosingReportBlueprint,
  loadJson,
  type ClosingReportBlueprint,
  saveJson,
} from "@/lib/eventOpsBlueprint";

const KEY = "closing_report_v1";

export function ClosingReportBlueprintClient() {
  const { showToast } = useToast();
  const [data, setData] = useState<ClosingReportBlueprint>(defaultClosingReportBlueprint);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setData(loadJson<ClosingReportBlueprint>(KEY, defaultClosingReportBlueprint()));
    setHydrated(true);
  }, []);

  const save = useCallback(() => {
    saveJson(KEY, data);
    showToast("Closing report planning saved locally.");
  }, [data, showToast]);

  const reset = useCallback(() => {
    if (!window.confirm("Reset to default planning text?")) return;
    const d = defaultClosingReportBlueprint();
    setData(d);
    saveJson(KEY, d);
    showToast("Reset.");
  }, [showToast]);

  if (!hydrated) return <p className="p-4 text-sm text-brand-text/60">Loading…</p>;

  const field = (label: string, key: keyof ClosingReportBlueprint, rows = 3) => (
    <div>
      <Label className="text-xs text-brand-text/70">{label}</Label>
      <textarea
        className="mt-1 w-full rounded-ref-sm border border-brand-text/12 bg-white px-2 py-1.5 text-sm"
        rows={rows}
        value={String(data[key])}
        onChange={(e) => setData((prev) => ({ ...prev, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Planning"
        title="Closing report (blueprint)"
        description={
          <>
            Defines the intended <strong>closing pack</strong> outputs (PDF/TSV concepts included as planning notes only).
            Persistence: <code className="rounded bg-white px-1">localStorage</code>.
          </>
        }
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={reset}>
              Reset defaults
            </Button>
            <Button type="button" onClick={save}>
              Save planning
            </Button>
          </div>
        }
      />

      <Card className="space-y-3 p-4 text-sm">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-yellow">Planned report sections</h2>
        <ul className="list-inside list-disc space-y-1 text-brand-text/85">
          <li>Payment closing summary</li>
          <li>Stock closing summary</li>
          <li>Component variance & average usage</li>
          <li>Event narrative + export hooks</li>
        </ul>
      </Card>

      <Card className="space-y-4 p-4">
        {field("Payment closing summary", "paymentClosingSummaryNote")}
        {field("Stock closing summary", "stockClosingSummaryNote")}
        {field("Component variance", "componentVarianceNote")}
        {field("Average usage per portion", "avgUsagePerPortionNote")}
        {field("Variance % (report)", "variancePctReportNote")}
        {field("Notes section", "notesSectionNote")}
        {field("Event summary", "eventSummaryNote")}
        {field("PDF export concept", "pdfExportConceptNote")}
        {field("TSV export concept", "tsvExportConceptNote")}
        {field("Assumptions", "assumptions")}
        {field("Next steps", "nextSteps")}
      </Card>
    </div>
  );
}
