"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SupabaseSetupBanner } from "@/components/SupabaseSetupBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { Table, Td, Th } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { formatJakartaDateTime, formatRupiah } from "@/lib/format";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type CashSession = {
  id: string;
  status: "open" | "closed";
  opening_amount: number;
  opening_notes: string | null;
  opened_at: string;
  closed_at: string | null;
  closing_counted_amount: number | null;
};

type CashMovement = {
  id: string;
  movement_type: string;
  amount: number;
  notes: string | null;
  created_at: string;
};

function mapSession(r: Record<string, unknown>): CashSession {
  return {
    id: r.id as string,
    status: r.status as "open" | "closed",
    opening_amount: Number(r.opening_amount),
    opening_notes: (r.opening_notes as string | null) ?? null,
    opened_at: r.opened_at as string,
    closed_at: (r.closed_at as string | null) ?? null,
    closing_counted_amount:
      r.closing_counted_amount == null ? null : Number(r.closing_counted_amount),
  };
}

function mapMovement(r: Record<string, unknown>): CashMovement {
  return {
    id: r.id as string,
    movement_type: r.movement_type as string,
    amount: Number(r.amount),
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
  };
}

function parseRupiahInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return 0;
  return Number.parseInt(digits, 10);
}

function summarizeMovements(movements: CashMovement[]) {
  let refills = 0;
  let cashSales = 0;
  let cashRefunds = 0;
  for (const m of movements) {
    if (m.movement_type === "refill") refills += m.amount;
    else if (m.movement_type === "cash_in_sale") cashSales += m.amount;
    else if (m.movement_type === "cash_out_refund") cashRefunds += m.amount;
  }
  return { refills, cashSales, cashRefunds };
}

function varianceClass(variance: number): string {
  if (variance === 0) return "text-brand-green font-semibold";
  if (variance < 0) return "text-brand-red font-semibold";
  return "text-amber-900 font-semibold";
}

export function CashPageClient() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [lastClosedSession, setLastClosedSession] = useState<CashSession | null>(null);
  const [lastClosedMovements, setLastClosedMovements] = useState<CashMovement[]>([]);

  const [openFormAmount, setOpenFormAmount] = useState("");
  const [openFormNotes, setOpenFormNotes] = useState("");
  const [opening, setOpening] = useState(false);

  const [refillAmount, setRefillAmount] = useState("");
  const [refillNotes, setRefillNotes] = useState("");
  const [refilling, setRefilling] = useState(false);

  /** null = closed; count = enter counted cash; confirm = explicit close after review */
  const [closeFlow, setCloseFlow] = useState<null | "count" | "confirm">(null);
  const [countedInput, setCountedInput] = useState("");
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoadError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();

      const { data: active, error: activeErr } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeErr) throw activeErr;

      if (active) {
        const s = mapSession(active as Record<string, unknown>);
        setOpenSession(s);
        const { data: mov, error: movErr } = await supabase
          .from("cash_movements")
          .select("id, movement_type, amount, notes, created_at")
          .eq("cash_session_id", s.id)
          .order("created_at", { ascending: false });
        if (movErr) throw movErr;
        setMovements((mov ?? []).map((r) => mapMovement(r as Record<string, unknown>)));
        setLastClosedSession(null);
        setLastClosedMovements([]);
      } else {
        setOpenSession(null);
        setMovements([]);
        const { data: closed, error: closedErr } = await supabase
          .from("cash_sessions")
          .select("*")
          .eq("status", "closed")
          .order("closed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (closedErr) throw closedErr;
        if (closed) {
          const s = mapSession(closed as Record<string, unknown>);
          setLastClosedSession(s);
          const { data: cm, error: cmErr } = await supabase
            .from("cash_movements")
            .select("id, movement_type, amount, notes, created_at")
            .eq("cash_session_id", s.id)
            .order("created_at", { ascending: false });
          if (cmErr) throw cmErr;
          setLastClosedMovements((cm ?? []).map((r) => mapMovement(r as Record<string, unknown>)));
        } else {
          setLastClosedSession(null);
          setLastClosedMovements([]);
        }
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load cash data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeSummary = useMemo(() => {
    if (!openSession) return null;
    const openingFloat = openSession.opening_amount;
    const { refills, cashSales, cashRefunds } = summarizeMovements(movements);
    const expected = openingFloat + refills + cashSales - cashRefunds;
    return {
      openingFloat,
      refills,
      cashSales,
      cashRefunds,
      expected,
    };
  }, [openSession, movements]);

  const closedSummary = useMemo(() => {
    if (!lastClosedSession) return null;
    const openingFloat = lastClosedSession.opening_amount;
    const { refills, cashSales, cashRefunds } = summarizeMovements(lastClosedMovements);
    const expected = openingFloat + refills + cashSales - cashRefunds;
    const actual = lastClosedSession.closing_counted_amount ?? 0;
    const variance = actual - expected;
    return {
      openingFloat,
      refills,
      cashSales,
      cashRefunds,
      expected,
      actual,
      variance,
      closedAt: lastClosedSession.closed_at,
    };
  }, [lastClosedSession, lastClosedMovements]);

  async function onOpenSession(e: FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) return;
    const amount = parseRupiahInput(openFormAmount);
    if (amount < 0) {
      showToast("Opening amount must be zero or positive.", "error");
      return;
    }
    setOpening(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionRow, error: sErr } = await supabase
        .from("cash_sessions")
        .insert({
          status: "open",
          opening_amount: amount,
          opening_notes: openFormNotes.trim() || null,
        })
        .select("id")
        .single();
      if (sErr) throw sErr;
      const sessionId = sessionRow.id as string;

      if (amount > 0) {
        const { error: mErr } = await supabase.from("cash_movements").insert({
          cash_session_id: sessionId,
          movement_type: "opening",
          amount,
          notes: openFormNotes.trim() || null,
        });
        if (mErr) throw mErr;

        const { error: lErr } = await supabase.from("ledger_entries").insert({
          cash_session_id: sessionId,
          entry_type: "opening_cash",
          direction: "in",
          amount,
          notes: openFormNotes.trim() || null,
        });
        if (lErr) throw lErr;
      }

      showToast("Cash session opened.");
      setOpenFormAmount("");
      setOpenFormNotes("");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not open session", "error");
    } finally {
      setOpening(false);
    }
  }

  async function onRefill(e: FormEvent) {
    e.preventDefault();
    if (!openSession) return;
    const amount = parseRupiahInput(refillAmount);
    if (amount <= 0) {
      showToast("Refill amount must be greater than zero.", "error");
      return;
    }
    setRefilling(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const notes = refillNotes.trim() || null;
      const { error: mErr } = await supabase.from("cash_movements").insert({
        cash_session_id: openSession.id,
        movement_type: "refill",
        amount,
        notes,
      });
      if (mErr) throw mErr;
      const { error: lErr } = await supabase.from("ledger_entries").insert({
        cash_session_id: openSession.id,
        entry_type: "cash_refill",
        direction: "in",
        amount,
        notes,
      });
      if (lErr) throw lErr;
      showToast("Cash refill recorded.");
      setRefillAmount("");
      setRefillNotes("");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Refill failed", "error");
    } finally {
      setRefilling(false);
    }
  }

  async function onConfirmClose() {
    if (!openSession || !activeSummary) return;
    const actual = parseRupiahInput(countedInput);
    if (actual < 0) {
      showToast("Counted cash must be zero or positive.", "error");
      return;
    }
    setClosing(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase
        .from("cash_sessions")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closing_counted_amount: actual,
        })
        .eq("id", openSession.id)
        .eq("status", "open");
      if (error) throw error;
      showToast("Session closed.");
      setCloseFlow(null);
      setCountedInput("");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not close session", "error");
    } finally {
      setClosing(false);
    }
  }

  const closePreviewVariance =
    activeSummary != null ? parseRupiahInput(countedInput) - activeSummary.expected : 0;

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader
          eyebrow="Drawer"
          title="Cash control"
          description={
            <>
              Opening float and refills are <strong>not</strong> revenue — they only change physical cash in the
              drawer. Times shown in WIB (Asia/Jakarta).
            </>
          }
        />
        <SupabaseSetupBanner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Drawer"
        title="Cash control"
        description={
          <>
            Opening float and refills are <strong>not</strong> revenue — they only change physical cash in the
            drawer. Times shown in WIB (Asia/Jakarta).
          </>
        }
      />

      {loadError && (
        <Card className="border-red-200 bg-red-50/80 p-4 text-sm text-red-800">{loadError}</Card>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="min-h-10 border border-brand-text/12 bg-white shadow-card"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-full animate-pulse rounded-lg bg-brand-text/8" />
          ))}
        </div>
      ) : openSession && activeSummary ? (
        <>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">
              Active session
            </p>
            <p className="mt-1 font-sans tabular-nums text-sm text-brand-text/70">
              Opened {formatJakartaDateTime(openSession.opened_at)}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt>Opening float</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(activeSummary.openingFloat)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Total refills</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(activeSummary.refills)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Cash sales received</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide text-brand-text/70">
                  {formatRupiah(activeSummary.cashSales)}
                  <span className="ml-1 text-xs">(Stage 3)</span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Cash refunds paid</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide text-brand-text/70">
                  {formatRupiah(activeSummary.cashRefunds)}
                  <span className="ml-1 text-xs">(Stage 3)</span>
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-brand-text/10 pt-2 text-base font-semibold">
                <dt>Expected closing cash</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(activeSummary.expected)}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <Button type="button" variant="secondary" onClick={() => setCloseFlow("count")}>
                Close session
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-sans text-lg font-semibold tracking-tight text-brand-text">Add cash refill</h2>
            <p className="mt-2 rounded-md border border-brand-yellow/40 bg-brand-yellow/15 px-3 py-2 text-sm text-brand-text">
              This adds physical float to the register. It is <strong>not</strong> counted as
              sales revenue.
            </p>
            <form className="mt-4 space-y-3" onSubmit={(e) => void onRefill(e)}>
              <div>
                <Label htmlFor="refill-amt">Amount (Rp)</Label>
                <Input
                  id="refill-amt"
                  inputMode="numeric"
                  className="mt-1 font-sans tabular-nums"
                  value={refillAmount}
                  onChange={(e) => setRefillAmount(e.target.value)}
                  placeholder="e.g. 500000"
                />
              </div>
              <div>
                <Label htmlFor="refill-notes">Notes (optional)</Label>
                <Input
                  id="refill-notes"
                  className="mt-1"
                  value={refillNotes}
                  onChange={(e) => setRefillNotes(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={refilling}>
                {refilling ? "Saving…" : "Record refill"}
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="font-sans text-lg font-semibold tracking-tight text-brand-text">Cash movements</h2>
            {movements.length === 0 ? (
              <p className="mt-2 text-sm text-brand-text/60">No movements yet.</p>
            ) : (
              <Table className="mt-3">
                <thead>
                  <tr>
                    <Th>Waktu</Th>
                    <Th>Type</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <Td className="whitespace-nowrap font-sans tabular-nums text-xs text-brand-text/80">
                        {formatJakartaDateTime(m.created_at)}
                      </Td>
                      <Td className="capitalize">{m.movement_type.replace(/_/g, " ")}</Td>
                      <Td className="text-right font-display text-base font-normal tabular-nums tracking-wide">
                        {formatRupiah(m.amount)}
                      </Td>
                      <Td className="text-brand-text/70">{m.notes ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      ) : (
        <>
          {closedSummary && (
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-text/50">
                Last closed session
              </p>
              {closedSummary.closedAt && (
                <p className="mt-1 font-sans tabular-nums text-sm text-brand-text/70">
                  Closed {formatJakartaDateTime(closedSummary.closedAt)}
                </p>
              )}
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt>Opening float</dt>
                  <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(closedSummary.openingFloat)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Total refills</dt>
                  <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(closedSummary.refills)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Cash sales / refunds</dt>
                  <dd className="font-display text-sm font-normal tabular-nums tracking-wide text-brand-text/75">
                    {formatRupiah(closedSummary.cashSales)} / {formatRupiah(closedSummary.cashRefunds)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Expected closing</dt>
                  <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(closedSummary.expected)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Counted cash</dt>
                  <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(closedSummary.actual)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-brand-text/10 pt-2">
                  <dt>Variance</dt>
                  <dd className={`font-display text-lg font-normal tabular-nums tracking-wide ${varianceClass(closedSummary.variance)}`}>
                    {formatRupiah(closedSummary.variance)}
                  </dd>
                </div>
              </dl>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="font-sans text-lg font-semibold tracking-tight text-brand-text">Open cash session</h2>
            <p className="mt-1 text-sm text-brand-text/70">
              Record the starting float before taking payments. This is not revenue.
            </p>
            <form className="mt-4 space-y-3" onSubmit={(e) => void onOpenSession(e)}>
              <div>
                <Label htmlFor="open-amt">Opening cash (Rp)</Label>
                <Input
                  id="open-amt"
                  inputMode="numeric"
                  className="mt-1 font-sans tabular-nums"
                  value={openFormAmount}
                  onChange={(e) => setOpenFormAmount(e.target.value)}
                  placeholder="e.g. 1000000"
                />
              </div>
              <div>
                <Label htmlFor="open-notes">Notes (optional)</Label>
                <Input
                  id="open-notes"
                  className="mt-1"
                  value={openFormNotes}
                  onChange={(e) => setOpenFormNotes(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={opening}>
                {opening ? "Opening…" : "Open session"}
              </Button>
            </form>
          </Card>
        </>
      )}

      <Modal
        open={closeFlow != null}
        title={closeFlow === "confirm" ? "Confirm close session" : "Close cash session"}
        onClose={() => !closing && setCloseFlow(null)}
      >
        {activeSummary && closeFlow === "count" && (
          <div className="space-y-4 text-sm">
            <p className="text-brand-text/85">
              You are starting the close flow for the <strong>active</strong> cash session. Enter the physical
              cash you counted, then review and confirm on the next step. Closing records final numbers in
              Supabase.
            </p>
            <dl className="space-y-2 rounded-lg bg-brand-bg/80 p-3">
              <div className="flex justify-between gap-4">
                <dt>Opening float</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(activeSummary.openingFloat)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Total refills</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(activeSummary.refills)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Cash sales</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(activeSummary.cashSales)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Cash refunds</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(activeSummary.cashRefunds)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-brand-text/10 pt-2 font-semibold">
                <dt>Expected closing cash</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(activeSummary.expected)}</dd>
              </div>
            </dl>
            <div>
              <Label htmlFor="counted">Counted cash (Rp)</Label>
              <Input
                id="counted"
                inputMode="numeric"
                className="mt-1 font-sans tabular-nums"
                value={countedInput}
                onChange={(e) => setCountedInput(e.target.value)}
              />
            </div>
            <p className="text-sm">
              Variance preview (counted − expected):{" "}
              <span className={`font-display text-xl font-normal tabular-nums tracking-wide ${varianceClass(closePreviewVariance)}`}>
                {formatRupiah(closePreviewVariance)}
              </span>
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCloseFlow(null)} disabled={closing}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const n = parseRupiahInput(countedInput);
                  if (n < 0) {
                    showToast("Counted cash must be zero or positive.", "error");
                    return;
                  }
                  setCloseFlow("confirm");
                }}
                disabled={closing}
              >
                Continue to confirmation
              </Button>
            </div>
          </div>
        )}
        {activeSummary && closeFlow === "confirm" && (
          <div className="space-y-4 text-sm">
            <p className="font-medium text-brand-text">
              You are about to <strong>close</strong> the active cash session. This finalizes the session in
              Supabase.
            </p>
            <dl className="space-y-2 rounded-lg border border-brand-text/15 bg-brand-bg/80 p-3">
              <div className="flex justify-between gap-4">
                <dt>Expected closing cash</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(activeSummary.expected)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Counted cash</dt>
                <dd className="font-display text-lg font-normal tabular-nums tracking-wide">{formatRupiah(parseRupiahInput(countedInput))}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-brand-text/10 pt-2 font-semibold">
                <dt>Variance</dt>
                <dd className={`font-display text-xl font-normal tabular-nums tracking-wide ${varianceClass(closePreviewVariance)}`}>
                  {formatRupiah(closePreviewVariance)}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCloseFlow(null)} disabled={closing}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCloseFlow("count")}
                disabled={closing}
              >
                Back
              </Button>
              <Button type="button" onClick={() => void onConfirmClose()} disabled={closing}>
                {closing ? "Closing…" : "Confirm close session"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
