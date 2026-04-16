# Stage 4 Brief — Transactions and Ledger

---

## Why This Stage Exists

Stage 3 generates a large volume of financial data: orders, payments, settlements, and ledger entries. Stage 4 makes this data visible and reviewable through two dedicated pages: Transactions and Ledger.

These pages are read-heavy. They do not create new data — they present what Stage 3 created in an operationally useful format.

This stage is critical for operational confidence: the cashier and event operator need to verify that payments are correctly recorded, see any anomalies, and review settlement history.

---

## Transactions Page

### Purpose
Full log of all orders with payment context. The cashier or event operator should be able to scan this page quickly to answer: "What happened with order 005?", "Which orders are still pending?", "What were today's cash payments?"

### Layout
- Table (with sticky header on scroll)
- Column order matters for scannability:
  1. Queue # (far left, monospace badge, DM Mono, brand-red)
  2. Time (UTC+7 display)
  3. Customer Name (or dash if none)
  4. Items (compact list: "Wrap x2, Drink x1")
  5. Subtotal
  6. Discount
  7. Total
  8. Payment Method(s)
  9. Payment Status badge (Pending / Partial / Paid)
  10. Notes icon/expander (shows payment notes + settlement notes)

### Detail Expand
- Clicking a row (or expand button) shows full detail:
  - Full item list with quantities and line totals
  - Payment record: method, amount tendered, is_exact
  - Settlement record(s) if any: method, amount, notes, adjustment flag
  - Payment notes
  - Settlement notes

### Filters (nice-to-have, not required in v1)
- Filter by payment status
- Filter by payment method

### Sorting
- Default: newest first (by created_at)

### Important Rules
- No void button, no cancel button, no edit button on any row
- Queue number must be on the far left, always visible
- UTC+7 display for all timestamps
- "Notes" (both payment and settlement notes) should be visible but not dominant — show in expanded detail view
- Settlement notes are separate from payment notes

---

## Ledger Page

### Purpose
Operational money movement log. Every money-in and money-out event is shown here chronologically. The event operator should be able to use this page to understand the full cash and digital payment picture.

### What Appears in the Ledger
- Opening cash entry
- Cash refill entries
- Payment cash/QRIS/transfer entries (one per payment)
- Settlement cash/QRIS/transfer entries (one per settlement)
- Refund entries (cash out, QRIS out, transfer out)
- Adjustment entries (excess settlement/refund handling)

### Layout
- Chronological table, newest first
- Columns:
  1. Time (UTC+7)
  2. Type (human-readable: "Opening Cash", "Cash Sale", "QRIS Payment", "Cash Refund", etc.)
  3. Direction badge: IN (**semantic success green**) / OUT (red)
  4. Amount (Rp, formatted)
  5. Queue # (if order-related — monospace badge)
  6. Notes

### Totals Summary (at top or bottom of page)
- Total In: SUM of all direction = 'in' entries
- Total Out: SUM of all direction = 'out' entries
- Net: Total In - Total Out

### Notes Visibility
- Notes should be visible inline in the table (truncated if long, full text on hover/expand)
- Adjustment entries MUST show their notes — they are the explanation

---

## Queue Number Visibility

Queue number must be visible prominently wherever an order is referenced:
- In Transactions table: first column, monospace badge
- In Ledger table: monospace badge in the Queue # column (blank for non-order entries)
- In any expanded detail view

Format: zero-padded to 3 digits for display (e.g. 007), using DM Mono font.

---

## Settlement Visibility in Transactions

Each transaction row should indicate clearly if a settlement occurred:
- Payment Method column should show both initial payment and settlement method if different (e.g. "Cash → QRIS")
- Or show in expanded detail
- Settlement status: "Settled", "Pending", "Partially Settled", "Overpaid (Adjusted)"

---

## Ledger Adjustments

Adjustment entries arise when:
- Settlement amount exceeds remaining due (excess collected)
- Refund amount differs from change due (excess or short refund)

These must be clearly visible in the ledger:
- Entry type: "Adjustment"
- Direction: in or out (based on whether excess was collected or over-refunded)
- Notes: explain the adjustment (e.g. "Excess settlement on order 007" or "Refund adjustment")
- Always linked to the relevant queue number

---

## Operational Clarity Requirements

- Tables must be legible at a glance — good contrast, proper spacing
- Numbers must be right-aligned and formatted with Rp prefix and thousand separators
- Status badges must be color-coded and consistently applied:
  - Paid: **semantic** green badge (success state — not a brand color alongside red/yellow)
  - Partially Paid: yellow badge (brand accent / warning lane)
  - Pending: gray badge
- Use DM Mono for queue numbers and amounts in the tables
- Empty states: if no transactions yet, show a friendly empty state ("No orders yet. Start the first order from New Order.")

---

## What Later Stages Depend on from Stage 4

Stage 4 is primarily a consumer of Stage 3 data. It does not create data that later stages depend on structurally. However:
- Dashboard (Stage 6) uses the same order/payment/ledger data — Stage 4 establishes the query patterns
- Stage 4 UX sets expectations for data clarity that the dashboard inherits
