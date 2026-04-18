"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import {
  defaultDashboardPlanningBlueprint,
  defaultLoginPlanning,
  loadJson,
  type DashboardPlanningBlueprint,
  type LoginPlanningSlice,
  saveJson,
} from "@/lib/eventOpsBlueprint";

const KEY_LOGIN = "login_planning_v1";
const KEY_DASH = "dashboard_planning_v1";

export function EventOpsPlanningHubClient() {
  const { showToast } = useToast();
  const [login, setLogin] = useState<LoginPlanningSlice>(defaultLoginPlanning);
  const [dash, setDash] = useState<DashboardPlanningBlueprint>(defaultDashboardPlanningBlueprint);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLogin(loadJson(KEY_LOGIN, defaultLoginPlanning()));
    setDash(loadJson(KEY_DASH, defaultDashboardPlanningBlueprint()));
    setHydrated(true);
  }, []);

  const saveAll = useCallback(() => {
    saveJson(KEY_LOGIN, login);
    saveJson(KEY_DASH, dash);
    showToast("Planning notes saved locally.");
  }, [dash, login, showToast]);

  if (!hydrated) return <p className="p-4 text-sm text-brand-text/60">Loading…</p>;

  const ta = (label: string, value: string, onChange: (v: string) => void, rows = 3) => (
    <div>
      <Label className="text-xs text-brand-text/70">{label}</Label>
      <textarea
        className="mt-1 w-full rounded-ref-sm border border-brand-text/12 bg-white px-2 py-1.5 text-sm"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <PageHeader
        eyebrow="Planning"
        title="Event ops planning hub"
        description={
          <>
            Entry point for blueprint documents (local-only). Use sidebar links or the cards below.
          </>
        }
        actions={
          <Button type="button" onClick={saveAll}>
            Save login &amp; dashboard planning notes
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/stock/components" className="block rounded-ref border border-brand-text/10 bg-white p-4 shadow-card transition hover:border-brand-yellow/40">
          <p className="font-display text-sm uppercase tracking-wide text-brand-yellow">Stock per component</p>
          <p className="mt-1 text-xs text-brand-text/65">Blueprint for component stock engine</p>
        </Link>
        <Link href="/closing/payment" className="block rounded-ref border border-brand-text/10 bg-white p-4 shadow-card transition hover:border-brand-yellow/40">
          <p className="font-display text-sm uppercase tracking-wide text-brand-yellow">Closing payment</p>
          <p className="mt-1 text-xs text-brand-text/65">Payment reconciliation blueprint</p>
        </Link>
        <Link href="/closing/report" className="block rounded-ref border border-brand-text/10 bg-white p-4 shadow-card transition hover:border-brand-yellow/40">
          <p className="font-display text-sm uppercase tracking-wide text-brand-yellow">Closing report</p>
          <p className="mt-1 text-xs text-brand-text/65">Closing pack blueprint</p>
        </Link>
        <Link href="/dashboard" className="block rounded-ref border border-brand-text/10 bg-white p-4 shadow-card transition hover:border-brand-yellow/40">
          <p className="font-display text-sm uppercase tracking-wide text-brand-yellow">Dashboard</p>
          <p className="mt-1 text-xs text-brand-text/65">Live KPIs + planning block at bottom</p>
        </Link>
      </div>

      <Card className="space-y-4 border-brand-text/10 p-4">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-red">Future login (planning only)</h2>
        <p className="text-xs text-brand-text/60">
          Not implemented — editable notes describe the intended lightweight internal auth.
        </p>
        {ta("Assumptions", login.assumptions, (v) => setLogin((x) => ({ ...x, assumptions: v })))}
        {ta("Hardcoded login phase", login.hardcodedLoginNote, (v) => setLogin((x) => ({ ...x, hardcodedLoginNote: v })))}
        {ta("Remember device (~24h)", login.rememberDevice24h, (v) => setLogin((x) => ({ ...x, rememberDevice24h: v })))}
        {ta("Internal use only", login.internalUseOnly, (v) => setLogin((x) => ({ ...x, internalUseOnly: v })))}
        {ta("Next steps", login.nextSteps, (v) => setLogin((x) => ({ ...x, nextSteps: v })))}
      </Card>

      <Card className="space-y-4 border-brand-yellow/25 bg-brand-yellow-soft/40 p-4">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-text">
          Dashboard planning notes (future metrics)
        </h2>
        <p className="text-xs text-brand-text/65">
          Synced copy for the planning block on the Dashboard; edit here or on the Dashboard page.
        </p>
        {ta("Future metrics overview", dash.futureMetricsNotes, (v) => setDash((x) => ({ ...x, futureMetricsNotes: v })))}
        {ta("Target vs actual by menu", dash.targetVsActualMenuNote, (v) => setDash((x) => ({ ...x, targetVsActualMenuNote: v })))}
        {ta("Top 3 by GMV", dash.top3GmvNote, (v) => setDash((x) => ({ ...x, top3GmvNote: v })))}
        {ta("Top 3 by portions sold", dash.top3PortionsNote, (v) => setDash((x) => ({ ...x, top3PortionsNote: v })))}
        {ta("Revenue by product", dash.revenueByProductNote, (v) => setDash((x) => ({ ...x, revenueByProductNote: v })))}
        {ta("Future food/packaging cost comparison", dash.futureFoodPackagingCostNote, (v) =>
          setDash((x) => ({ ...x, futureFoodPackagingCostNote: v }))
        )}
        {ta("Future GP visibility", dash.futureGpVisibilityNote, (v) => setDash((x) => ({ ...x, futureGpVisibilityNote: v })))}
        {ta("Low-stock blockers / buildable bottlenecks", dash.lowStockBlockersNote, (v) =>
          setDash((x) => ({ ...x, lowStockBlockersNote: v }))
        )}
        {ta("Combo savings summary (when wired)", dash.comboSavingsSummaryNote, (v) =>
          setDash((x) => ({ ...x, comboSavingsSummaryNote: v }))
        )}
        {ta("Waste / variance highlights", dash.wasteVarianceHighlightsNote, (v) =>
          setDash((x) => ({ ...x, wasteVarianceHighlightsNote: v }))
        )}
      </Card>
    </div>
  );
}
