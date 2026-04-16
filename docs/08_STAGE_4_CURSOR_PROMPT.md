# Cursor Prompt — Stage 4: Transactions and Ledger

---

## Context

WRAPZ POS Stages 1–3 are complete. The app now creates orders, handles payments and settlements, manages stock, and maintains cash control. All data is in Supabase.

Stage 4 builds two read-heavy pages that make the data visible: the Transactions page and the Ledger page.

Do NOT modify any Stage 1–3 functionality. These are display pages only.

---

## What to Build in Stage 4

### 1. Transactions Page (`/transactions`)

**Main view: sortable/filterable table**

Column order (left to right):
1. **Queue #** — monospace (DM Mono), brand-red badge, zero-padded (001, 007, etc.)
2. **Time** — order created_at, displayed in UTC+7 (Asia/Jakarta)
3. **Customer** — customer_name or "—" if null
4. **Items** — compact summary: "Wrap Ayam x2, Es Teh x1" (truncate if too long)
5. **Subtotal** — Rp formatted
6. **Discount** — Rp formatted (or "—" if no discount)
7. **Total** — Rp formatted, bold
8. **Method** — initial payment method + settlement method if different (e.g. "Cash" or "Cash → QRIS")
9. **Status** — payment_status badge: Paid (**semantic** green), Partially Paid (yellow), Pending (gray)
10. **Notes** — icon button to expand notes if any exist

**Expand row / detail view:**
Clicking a row or expand button shows:
- Full item list: each item name, quantity, unit price, line total
- Payment record: method, amount tendered, is_exact (Yes/No)
- Settlement record(s): method, amount received, amount due, is_adjustment, adjustment_amount, notes
- Payment notes
- Settlement notes

**Default sort:** created_at descending (newest first)

**Empty state:** "No orders yet. Create the first order from New Order."

**No action buttons on any row.** No edit, no void, no cancel.

---

### 2. Ledger Page (`/ledger`)

**Summary totals at the top:**
- Total In: SUM of all ledger_entries WHERE direction = 'in'
- Total Out: SUM of all ledger_entries WHERE direction = 'out'
- Net Total: Total In − Total Out
- Display as three KPI cards, compact

**Main view: ledger entries table (chronological, newest first)**

Columns:
1. **Time** — created_at in UTC+7
2. **Type** — human-readable label:
   - opening_cash → "Opening Cash"
   - cash_refill → "Cash Refill"
   - payment_cash → "Cash Payment"
   - payment_qris → "QRIS Payment"
   - payment_transfer → "Transfer Payment"
   - settlement_cash → "Cash Settlement"
   - settlement_qris → "QRIS Settlement"
   - settlement_transfer → "Transfer Settlement"
   - refund_cash → "Cash Refund"
   - refund_qris → "QRIS Refund"
   - refund_transfer → "Transfer Refund"
   - adjustment → "Adjustment"
3. **Direction** — badge: IN (**semantic** green) | OUT (red)
4. **Amount** — Rp formatted, DM Mono, right-aligned
5. **Queue #** — DM Mono badge if reference_order_id is set, else "—"
6. **Notes** — show inline (truncated if long); full text on hover or click

**Empty state:** "No ledger entries yet."

---

### 3. Formatting Utilities

Create or verify the following utilities exist in `lib/utils`:
- `formatRupiah(amount)` → "Rp 15.000" or "Rp 150.000" with Indonesian thousand separators
- `formatDateTime(utcTimestamp)` → local display in Asia/Jakarta timezone, format: "16 Apr 2026, 14:30"
- `formatQueueNumber(number)` → zero-padded 3 digits: "007"

These should be used consistently across all pages going forward.

---

## What NOT to Build in Stage 4

- Do NOT add void, edit, or cancel actions to any transaction
- Do NOT build the kitchen board (Stage 5)
- Do NOT build dashboard metrics (Stage 6)
- Do NOT build export (Stage 6)
- Do NOT modify Stage 1–3 functionality

---

## Acceptance Criteria

- [ ] Transactions page shows all orders in a table with correct columns
- [ ] Queue number is on the far left, formatted correctly in DM Mono
- [ ] Time is displayed in UTC+7 (Asia/Jakarta)
- [ ] Items column shows compact item summary
- [ ] Payment status badge is color-coded (Paid = **semantic** green, Partial = yellow, Pending = gray)
- [ ] Expanding a row shows full order detail including payment and settlement records
- [ ] Payment notes and settlement notes are both visible in expanded view, clearly labeled separately
- [ ] Adjustment entries are flagged clearly in the expanded settlement section
- [ ] Ledger page shows all entries chronologically
- [ ] Ledger type column uses human-readable labels
- [ ] Direction badges are IN (**semantic** green) / OUT (red)
- [ ] Queue # column is populated for order-related entries, "—" for others
- [ ] Ledger notes are visible inline
- [ ] Summary totals (Total In, Total Out, Net) are shown at top of Ledger page
- [ ] Both pages handle empty states gracefully
- [ ] `formatRupiah`, `formatDateTime`, `formatQueueNumber` utilities exist and are used

---

## Warnings

- Do NOT add any data-modification actions to the transactions or ledger pages
- Do NOT skip the queue number column placement — it must be the first (leftmost) column
- Do NOT merge payment notes and settlement notes into one field — they are separate
- Preserve all prior stage functionality
- Do NOT refactor Supabase query patterns in other pages — only add new queries for Stage 4 pages
