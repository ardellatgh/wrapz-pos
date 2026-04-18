"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import {
  defaultStockComponentBlueprint,
  loadJson,
  type StockComponentBlueprint,
  saveJson,
} from "@/lib/eventOpsBlueprint";

const KEY = "stock_component_v1";

function Field({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <Label className="text-xs text-brand-text/70">{label}</Label>
      <textarea
        className="mt-1 w-full rounded-ref-sm border border-brand-text/12 bg-white px-2 py-1.5 text-sm text-brand-text shadow-sm outline-none focus:border-brand-yellow/50 focus:ring-1 focus:ring-brand-yellow/20"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function StockComponentBlueprintClient() {
  const { showToast } = useToast();
  const [data, setData] = useState<StockComponentBlueprint>(defaultStockComponentBlueprint);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setData(loadJson<StockComponentBlueprint>(KEY, defaultStockComponentBlueprint()));
    setHydrated(true);
  }, []);

  const save = useCallback(() => {
    saveJson(KEY, data);
    showToast("Component stock planning saved locally.");
  }, [data, showToast]);

  const reset = useCallback(() => {
    if (!window.confirm("Reset this page to default planning text?")) return;
    const d = defaultStockComponentBlueprint();
    setData(d);
    saveJson(KEY, d);
    showToast("Reset to defaults.");
  }, [showToast]);

  if (!hydrated) {
    return <p className="p-4 text-sm text-brand-text/60">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Planning"
        title="Stock per component (blueprint)"
        description={
          <>
            Editable design document for the future <strong>event-ready component stock</strong> engine. No live
            database engine in this build — state is stored in <code className="rounded bg-white px-1">localStorage</code>{" "}
            only.
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={reset}>
              Reset defaults
            </Button>
            <Button type="button" onClick={save}>
              Save planning
            </Button>
          </div>
        }
      />

      <Card className="space-y-3 border-brand-yellow/30 bg-brand-yellow-soft/40 p-4 text-sm text-brand-text">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-text">Planned logic (summary)</h2>
        <p>
          <strong>Event-ready component stock only</strong> — not full commissary or raw ingredient inventory. A
          component master, menu→component usage map, opening and restock events, theoretical vs actual ending, variance
          in qty and per portion, standard/reference cost per base unit, food + packaging, and GP views (all future
          implementation).
        </p>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-yellow">Scope &amp; master data</h2>
        <Field label="Scope & operational assumptions" value={data.scopeNotes} onChange={(v) => setData((d) => ({ ...d, scopeNotes: v }))} rows={2} />
        <Field
          label="Component inventory concept (event floor units)"
          value={data.componentInventoryConcept}
          onChange={(v) => setData((d) => ({ ...d, componentInventoryConcept: v }))}
        />
        <Field label="Component master" value={data.componentMasterNote} onChange={(v) => setData((d) => ({ ...d, componentMasterNote: v }))} />
        <Field
          label="Menu → component usage mapping"
          value={data.menuComponentMappingNote}
          onChange={(v) => setData((d) => ({ ...d, menuComponentMappingNote: v }))}
        />
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-yellow">Counts & movement</h2>
        <Field label="Opening stock (manual)" value={data.openingStockNote} onChange={(v) => setData((d) => ({ ...d, openingStockNote: v }))} />
        <Field label="Restock (manual)" value={data.restockNote} onChange={(v) => setData((d) => ({ ...d, restockNote: v }))} />
        <Field label="Theoretical usage" value={data.theoreticalUsageNote} onChange={(v) => setData((d) => ({ ...d, theoreticalUsageNote: v }))} />
        <Field label="Theoretical ending" value={data.theoreticalEndingNote} onChange={(v) => setData((d) => ({ ...d, theoreticalEndingNote: v }))} />
        <Field label="Actual ending (manual close)" value={data.actualEndingNote} onChange={(v) => setData((d) => ({ ...d, actualEndingNote: v }))} />
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-yellow">Variance</h2>
        <Field label="Variance total (qty)" value={data.varianceTotalNote} onChange={(v) => setData((d) => ({ ...d, varianceTotalNote: v }))} />
        <Field
          label="Average theoretical usage per portion"
          value={data.avgTheoreticalPerPortionNote}
          onChange={(v) => setData((d) => ({ ...d, avgTheoreticalPerPortionNote: v }))}
        />
        <Field
          label="Average actual usage per portion"
          value={data.avgActualPerPortionNote}
          onChange={(v) => setData((d) => ({ ...d, avgActualPerPortionNote: v }))}
        />
        <Field label="Variance per portion" value={data.variancePerPortionNote} onChange={(v) => setData((d) => ({ ...d, variancePerPortionNote: v }))} />
        <Field label="Variance %" value={data.variancePctNote} onChange={(v) => setData((d) => ({ ...d, variancePctNote: v }))} />
        <Field
          label="Notes always available + reason tags (overportioning, spoilage, waste, prep issue, other)"
          value={data.notesAlwaysAvailable}
          onChange={(v) => setData((d) => ({ ...d, notesAlwaysAvailable: v }))}
        />
        <Field
          label="Manual opening/closing flow & variance roll-up"
          value={data.manualOpeningClosingNote}
          onChange={(v) => setData((d) => ({ ...d, manualOpeningClosingNote: v }))}
        />
        <Field label="Variance reason tags (detail)" value={data.varianceReasonTagsNote} onChange={(v) => setData((d) => ({ ...d, varianceReasonTagsNote: v }))} />
      </Card>

      <Card className="space-y-4 border-brand-red/15 bg-brand-bg/80 p-4">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-red">Dynamic buildable counter (per menu)</h2>
        <p className="text-xs text-brand-text/65">
          Planned UX: show how many portions can still be built from current component availability; identify the limiting
          factor.
        </p>
        <Field
          label="Concept — dynamic counter"
          value={data.dynamicCounterConcept}
          onChange={(v) => setData((d) => ({ ...d, dynamicCounterConcept: v }))}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Example — buildable now</Label>
            <input
              className="mt-1 w-full rounded-ref-sm border border-brand-text/12 px-2 py-1.5 text-sm"
              value={data.counterExampleBuildable}
              onChange={(e) => setData((d) => ({ ...d, counterExampleBuildable: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-xs">Example — blocked by</Label>
            <input
              className="mt-1 w-full rounded-ref-sm border border-brand-text/12 px-2 py-1.5 text-sm"
              value={data.counterExampleBlockedBy}
              onChange={(e) => setData((d) => ({ ...d, counterExampleBlockedBy: e.target.value }))}
            />
          </div>
        </div>
        <Field
          label="Limiting component / blocker behaviour"
          value={data.limitingComponentNote}
          onChange={(v) => setData((d) => ({ ...d, limitingComponentNote: v }))}
          rows={2}
        />
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-display text-sm font-normal uppercase tracking-wide text-brand-yellow">Cost / GP (planning)</h2>
        <p className="text-xs text-brand-text/60">
          Uses existing theoretical COGS thinking as the basis — no live cost engine in this pass.
        </p>
        <Field
          label="Standard / reference cost per base unit"
          value={data.standardCostPerBaseUnitNote}
          onChange={(v) => setData((d) => ({ ...d, standardCostPerBaseUnitNote: v }))}
        />
        <Field
          label="Food cost + packaging cost"
          value={data.foodCostPackagingCostNote}
          onChange={(v) => setData((d) => ({ ...d, foodCostPackagingCostNote: v }))}
        />
        <Field
          label="Theoretical GP vs actual-ish GP potential (after closing variance)"
          value={data.theoreticalGpVsActualishGpNote}
          onChange={(v) => setData((d) => ({ ...d, theoreticalGpVsActualishGpNote: v }))}
        />
      </Card>

      <Card className="space-y-3 p-4">
        <Field label="Caveats" value={data.caveats} onChange={(v) => setData((d) => ({ ...d, caveats: v }))} rows={2} />
        <Field
          label="Next implementation steps"
          value={data.implementationSteps}
          onChange={(v) => setData((d) => ({ ...d, implementationSteps: v }))}
        />
      </Card>
    </div>
  );
}
