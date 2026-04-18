/** localStorage-backed structured planning docs for future event-ops engines (blueprint phase only). */

export const STORAGE_PREFIX = "wrapz_event_ops_blueprint:";

export type LoginPlanningSlice = {
  assumptions: string;
  hardcodedLoginNote: string;
  rememberDevice24h: string;
  internalUseOnly: string;
  nextSteps: string;
};

export type StockComponentBlueprint = {
  version: 1;
  scopeNotes: string;
  /** Event-ready components only — not raw commissary inventory */
  componentInventoryConcept: string;
  componentMasterNote: string;
  menuComponentMappingNote: string;
  openingStockNote: string;
  restockNote: string;
  theoreticalUsageNote: string;
  theoreticalEndingNote: string;
  actualEndingNote: string;
  varianceTotalNote: string;
  avgTheoreticalPerPortionNote: string;
  avgActualPerPortionNote: string;
  variancePerPortionNote: string;
  variancePctNote: string;
  notesAlwaysAvailable: string;
  dynamicCounterConcept: string;
  counterExampleBuildable: string;
  counterExampleBlockedBy: string;
  limitingComponentNote: string;
  standardCostPerBaseUnitNote: string;
  foodCostPackagingCostNote: string;
  theoreticalGpVsActualishGpNote: string;
  manualOpeningClosingNote: string;
  varianceReasonTagsNote: string;
  caveats: string;
  implementationSteps: string;
};

export type ClosingPaymentBlueprint = {
  version: 1;
  cashReceivableNote: string;
  qrisReceivableNote: string;
  transferReceivableNote: string;
  actualCashNote: string;
  actualQrisNote: string;
  actualTransferNote: string;
  variancePerChannelNote: string;
  totalVarianceNote: string;
  closingNotesField: string;
  assumptions: string;
  nextSteps: string;
};

export type ClosingReportBlueprint = {
  version: 1;
  paymentClosingSummaryNote: string;
  stockClosingSummaryNote: string;
  componentVarianceNote: string;
  avgUsagePerPortionNote: string;
  variancePctReportNote: string;
  notesSectionNote: string;
  eventSummaryNote: string;
  pdfExportConceptNote: string;
  tsvExportConceptNote: string;
  assumptions: string;
  nextSteps: string;
};

export type DashboardPlanningBlueprint = {
  version: 1;
  futureMetricsNotes: string;
  targetVsActualMenuNote: string;
  top3GmvNote: string;
  top3PortionsNote: string;
  revenueByProductNote: string;
  futureFoodPackagingCostNote: string;
  futureGpVisibilityNote: string;
  lowStockBlockersNote: string;
  comboSavingsSummaryNote: string;
  wasteVarianceHighlightsNote: string;
};

const DEFAULT_STOCK_COMPONENT: StockComponentBlueprint = {
  version: 1,
  scopeNotes:
    "Track sellable components used to assemble menu items at the event. Not full commissary or ingredient-level ERP.",
  componentInventoryConcept:
    "Each component row is a countable floor unit (e.g. tortilla sleeve, protein batch). Opening and closing are manual counts per event segment.",
  componentMasterNote:
    "Single source list of components with base UOM and optional standard cost per base unit (reference only in this phase).",
  menuComponentMappingNote:
    "Each menu item maps to per-portion component consumption (recipe / BOM). Used for theoretical usage and buildable-portion counters.",
  openingStockNote: "Manual opening qty per component after prep for service.",
  restockNote: "Manual restock adds during service; feeds actual movement vs theoretical.",
  theoreticalUsageNote:
    "Derived from sold portions × mapping (and combo allocations when applicable). Compare to POS net sales timing.",
  theoreticalEndingNote: "Opening + restock − theoretical usage.",
  actualEndingNote: "Manual closing count per component.",
  varianceTotalNote: "Actual ending − theoretical ending (qty).",
  avgTheoreticalPerPortionNote: "Theoretical component usage ÷ portions sold (menu-level rollups possible).",
  avgActualPerPortionNote: "Component variance allocated per portion sold for quick diagnostics.",
  variancePerPortionNote: "Actual vs theoretical usage normalized per portion.",
  variancePctNote: "(Variance ÷ theoretical usage) where theoretical > 0.",
  notesAlwaysAvailable:
    "Every variance row should accept operator notes (overportioning, spoilage, waste, prep issue, other).",
  dynamicCounterConcept:
    "Per menu SKU: compute how many portions can still be built from current component availability; identify the bottleneck.",
  counterExampleBuildable: "0",
  counterExampleBlockedBy: "Tortilla",
  limitingComponentNote:
    "The component that caps buildable portions first; highlight for expediting restock or menu 86.",
  standardCostPerBaseUnitNote:
    "Reference unit cost — initial basis links to theoretical COGS from menu pricing where defined.",
  foodCostPackagingCostNote:
    "Split direct materials vs packaging where tracked; sum to total direct cost per theoretical portion.",
  theoreticalGpVsActualishGpNote:
    "Compare list-margin after food+packaging vs adjusted margin after applying closing variance assumptions (planning-only until engine exists).",
  manualOpeningClosingNote:
    "Operators enter opening/closing counts; variance rolls to totals and optional per-portion averages.",
  varianceReasonTagsNote:
    "Structured tags: overportioning, spoilage, waste, prep issue, other — plus free text.",
  caveats:
    "No automated deduction from component stock at order time in this blueprint phase; engines come later.",
  implementationSteps:
    "1) Schema for components + mappings 2) Manual counts UI 3) Theoretical rollups 4) Variance reporting 5) Counter service.",
};

const DEFAULT_CLOSING_PAYMENT: ClosingPaymentBlueprint = {
  version: 1,
  cashReceivableNote: "Sum of order totals expected to settle as cash for the closing window.",
  qrisReceivableNote: "Expected QRIS-settled revenue for the window.",
  transferReceivableNote: "Expected transfer-settled revenue for the window.",
  actualCashNote: "Physical cash counted + ledger cash movements reconciled to POS.",
  actualQrisNote: "Acquirer statements / settlement feed vs POS QRIS totals.",
  actualTransferNote: "Bank-in vs POS transfer totals.",
  variancePerChannelNote: "Actual − receivable per payment channel after refunds/adjustments.",
  totalVarianceNote: "Sum of channel variances; ties to closing notes.",
  closingNotesField: "Free-text supervisor notes for finance handoff.",
  assumptions:
    "Cut-off times, refund handling, and float excluded from revenue — document per event.",
  nextSteps: "Wire receivable from paid orders + settlements; add approval workflow.",
};

const DEFAULT_CLOSING_REPORT: ClosingReportBlueprint = {
  version: 1,
  paymentClosingSummaryNote: "Net collected by channel vs receivable; variance explanation.",
  stockClosingSummaryNote: "Menu-stock and component-stock closing positions vs theoretical.",
  componentVarianceNote: "Roll-up of component qty variance with tagged reasons.",
  avgUsagePerPortionNote: "Average theoretical vs actual usage per portion sold.",
  variancePctReportNote: "Variance % by component and menu aggregate.",
  notesSectionNote: "Operational + finance narrative for the closing pack.",
  eventSummaryNote: "High-level KPI snapshot for stakeholders.",
  pdfExportConceptNote:
    "Export pack: closing summary + charts placeholders — PDF renderer not implemented in this phase.",
  tsvExportConceptNote: "Tab-separated extracts for spreadsheets — field map TBD.",
  assumptions: "Reporting period aligns with cash session boundaries where applicable.",
  nextSteps: "Define report templates and signing-off roles.",
};

const DEFAULT_LOGIN_PLANNING: LoginPlanningSlice = {
  assumptions: "Internal crew devices only; no public customer accounts.",
  hardcodedLoginNote:
    "Phase 1: shared operator PIN or fixed credential in env — upgrade to proper auth later.",
  rememberDevice24h:
    "Browser sessionStorage/localStorage flag with 24h TTL to skip repeat PIN on trusted devices.",
  internalUseOnly:
    "Still no role separation beyond optional PIN; kiosk remains single-event trusted environment.",
  nextSteps: "Introduce Supabase Auth or similar when multi-user audit is required.",
};

const DEFAULT_DASHBOARD_PLANNING: DashboardPlanningBlueprint = {
  version: 1,
  futureMetricsNotes:
    "Live tiles below will populate when order-level aggregates and recipe costs exist; no fabricated numbers until engines ship.",
  targetVsActualMenuNote:
    "Per-menu SKU: target portions or revenue vs actual from paid orders — requires targets table.",
  top3GmvNote: "Rank menu rows by line_total sum on paid orders.",
  top3PortionsNote: "Rank by quantity sold from order_items.",
  revenueByProductNote: "Pivot of revenue × menu_item for the period.",
  futureFoodPackagingCostNote:
    "Roll theoretical food + packaging cost using recipe mapping vs net sales.",
  futureGpVisibilityNote: "Net sales minus theoretical direct cost — compare to actual-ish GP after closing variance.",
  lowStockBlockersNote:
    "Surface SKUs at risk based on menu→component counter (future engine).",
  comboSavingsSummaryNote: "Sum combo_savings_amount across orders — already derivable from orders row.",
  wasteVarianceHighlightsNote: "Pull tagged variance rows from component closing (future).",
};

export function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (parsed == null || typeof parsed !== "object") return fallback;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function defaultStockComponentBlueprint(): StockComponentBlueprint {
  return { ...DEFAULT_STOCK_COMPONENT };
}

export function defaultClosingPaymentBlueprint(): ClosingPaymentBlueprint {
  return { ...DEFAULT_CLOSING_PAYMENT };
}

export function defaultClosingReportBlueprint(): ClosingReportBlueprint {
  return { ...DEFAULT_CLOSING_REPORT };
}

export function defaultLoginPlanning(): LoginPlanningSlice {
  return { ...DEFAULT_LOGIN_PLANNING };
}

export function defaultDashboardPlanningBlueprint(): DashboardPlanningBlueprint {
  return { ...DEFAULT_DASHBOARD_PLANNING };
}
