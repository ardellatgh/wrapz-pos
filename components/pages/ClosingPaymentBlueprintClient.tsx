"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import {
  defaultClosingPaymentBlueprint,
  loadJson,
  type ClosingPaymentBlueprint,
  saveJson,
} from "@/lib/eventOpsBlueprint";

const KEY = "closing_payment_v1";

export function ClosingPaymentBlueprintClient() {
  const { showToast } = useToast();
  const [data, setData] = useState<ClosingPaymentBlueprint>(defaultClosingPaymentBlueprint);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setData(loadJson<ClosingPaymentBlueprint>(KEY, defaultClosingPaymentBlueprint()));
    setHydrated(true);
  }, []);

  const save = useCallback(() => {
    saveJson(KEY, data);
    showToast("Closing payment planning saved locally.");
  }, [data, showToast]);

  const reset = useCallback(() => {
    if (!window.confirm("Reset to default planning text?")) return;
    const d = defaultClosingPaymentBlueprint();
    setData(d);
    saveJson(KEY, d);
    showToast("Reset.");
  }, [showToast]);

  if (!hydrated) return <p className="p-4 text-sm text-brand-text/60">Loading…</p>;

  const field = (label: string, key: keyof ClosingPaymentBlueprint, rows = 3) => (
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
        title="Closing payment (blueprint)"
        description={
          <>
            Structured plan for the future <strong>end-of-session payment reconciliation</strong>. Saved only in{" "}
            <code className="rounded bg-white px-1">localStorage</code>.
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

      <Card className="space-y-3 border-brand-red/15 bg-brand-red-soft/40 p-4 text-sm">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-text">Planned outputs</h2>
        <ul className="list-inside list-disc space-y-1 text-brand-text/85">
          <li>Cash / QRIS / transfer receivable vs actual tendered or settled amounts</li>
          <li>Variance per channel and total variance</li>
          <li>Closing notes for supervisor sign-off</li>
        </ul>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-yellow">Receivable (planned)</h2>
        {field("Cash receivable concept", "cashReceivableNote")}
        {field("QRIS receivable concept", "qrisReceivableNote")}
        {field("Transfer receivable concept", "transferReceivableNote")}
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-yellow">Actual (planned)</h2>
        {field("Actual cash", "actualCashNote")}
        {field("Actual QRIS", "actualQrisNote")}
        {field("Actual transfer", "actualTransferNote")}
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-yellow">Variance & notes</h2>
        {field("Variance per channel", "variancePerChannelNote")}
        {field("Total variance", "totalVarianceNote")}
        {field("Closing notes field purpose", "closingNotesField")}
        {field("Assumptions", "assumptions")}
        {field("Next implementation steps", "nextSteps")}
      </Card>
    </div>
  );
}
