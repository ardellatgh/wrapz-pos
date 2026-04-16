# Stage 2 Brief — Stock and Cash Control Foundation

---

## Why This Stage Exists

Before any order can be processed, two operational pre-event tasks must be completed:
1. Opening stock must be recorded for all sellable items
2. The opening cash float must be established

This stage builds those capabilities, along with the mid-event refill flows and the closing cash reconciliation summary foundation. It also establishes the logic for computing current stock from movement history, and defines how low stock warnings work.

**Database scope:** Stage 2 adds the first operational tables — `stock_movements`, `cash_sessions`, `cash_movements`, and `ledger_entries` (with enums/columns those flows need) — via a **Stage 2 migration**. Stage 1 created **master data only** (`event_settings`, `menu_items`, `bundle_components`, `discount_presets`).

Stage 2 must be completed before Stage 3 (Order + Payment), because the order flow depends on:
- Knowing current stock per item (to show warnings)
- Having a cash session open (for operational context)
- Stock deduction logic being well-defined

---

## Opening Stock

### Intent
Before the event starts, the cashier fills in how many units of each non-bundle menu item are available.

### Logic
- Show a bulk input form: a table of all active non-bundle menu items.
- Each row: item name, current stock (computed, shown read-only), input field for quantity to add as opening stock.
- On submit: for each item with a quantity entered > 0, create a `stock_movements` record with `movement_type = opening` and `quantity_change = entered_quantity` (positive).
- If opening stock has already been entered for an item (any prior `opening` movement exists), show a non-blocking warning message but allow it anyway. Both entries will be summed.
- Blank or zero entries are skipped.

### Why Stock Is Computed, Not Stored
Current stock per item = `SUM(quantity_change) WHERE menu_item_id = X` from `stock_movements`. This avoids race conditions and provides a full audit trail. Do not store current stock as a mutable field.

---

## Stock Refill

### Intent
During the event, more stock arrives and needs to be recorded.

### Logic
- Same bulk input UI as opening stock, but `movement_type = refill`.
- No warning for repeating — refills are expected multiple times.
- Same computation: adds to the running stock total.

---

## Low Stock Logic

### Threshold
- Each `menu_item` can have a `low_stock_threshold` value (nullable).
- If null, use `event_settings.default_low_stock_threshold`.
- If `current_stock <= threshold`: item is in low stock state.

### Behavior
- Low stock shows as a visual warning badge on menu cards (in Stage 3 cashier screen).
- Low stock shows as a visual indicator on the Stock page (e.g. yellow row highlight or badge).
- Low stock does NOT block any operation — it is informational only.
- The cashier can still add low-stock or zero-stock items to cart.
- Stock can go negative (e.g. if manual override to serving is used with insufficient stock).

---

## Opening Cash

### Intent
Before the event, the cashier records the initial cash float (money in the register for making change).

### Logic
- Navigate to Cash Control page.
- If no active `cash_sessions` record exists: show opening cash form.
- Cashier enters opening float amount.
- On submit:
  1. Create `cash_sessions` record: `status = open`, `opening_amount = entered_amount`, `opened_at = now()`.
  2. Create `cash_movements` entry: `movement_type = opening`, `amount = entered_amount`.
  3. Create `ledger_entries` entry: `entry_type = opening_cash`, `direction = in`, `amount = entered_amount`.
- Once session is open, opening cash form is hidden. Current session is displayed.

### Important
- Opening cash is NOT revenue.
- There should be exactly one open cash session at a time.
- If a session already exists, do not allow creating another without closing the first.

---

## Mid-Event Cash Float Refill

### Intent
More cash is added to the register during the event (e.g. to maintain change availability).

### Logic
- On Cash Control page with active session: show "Add Cash Refill" form with amount input and optional notes.
- On submit:
  1. Create `cash_movements` entry: `movement_type = refill`, `amount = entered_amount`.
  2. Create `ledger_entries` entry: `entry_type = cash_refill`, `direction = in`, `amount = entered_amount`, `notes = entered_notes`.
- This is clearly labeled as NOT revenue in the UI.
- Can be done any number of times.

---

## Cash Session State and Expected Closing Cash

### Running Totals to Display (on Cash Control page)
- Opening float: initial amount from opening
- Total refills: sum of all `refill` cash_movements
- Cash sales received: sum of all `cash_in_sale` cash_movements (from Stage 3 — may be 0 if no orders yet)
- Cash refunds paid: sum of all `cash_out_refund` cash_movements
- **Expected closing cash** = opening + refills + cash_sales - cash_refunds

### Closing Cash Reconciliation Foundation
- At end of event, cashier navigates to Cash Control and clicks "Close Session".
- Cashier inputs actual counted cash amount.
- System displays:
  - Opening float
  - Total refills
  - Cash sales in
  - Cash refunds out
  - Expected closing cash
  - Actual counted
  - Variance (= actual - expected), highlighted with **semantic success green** when zero (meaning “balanced”), red when negative, yellow when positive surplus — this green is a **narrow UI helper**, not part of the red/yellow **brand** palette
- Cashier confirms close.
- On confirm: update `cash_sessions` with `closed_at = now()`, `closing_counted_amount = entered_amount`, `status = closed`.

---

## How This Connects to Master Data (Stage 1)

- Stock page uses `menu_items` (from Stage 1) to list items.
- Non-bundle items only: filter by `is_bundle = false`.
- Active items only: filter by `is_active = true`.
- Low stock threshold uses `menu_items.low_stock_threshold` or falls back to `event_settings.default_low_stock_threshold`.
- Cash Control creates records in `cash_sessions`, `cash_movements`, and `ledger_entries` — these tables are **introduced in the Stage 2 migration** (they are outside Stage 1’s master-data DDL).

---

## Operational Constraints

- Opening stock is a pre-event setup task — warn if done after orders have been placed, but don't block.
- Cash opening should also be a pre-event setup task — warn on dashboard if no session is open.
- Stock movements are append-only — never update or delete existing movement records.
- Cash movements are append-only — same rule.
- The closing reconciliation summary in Stage 2 is a foundation — Stage 3 will add actual cash_in entries as orders are paid.

---

## What Later Stages Depend on from Stage 2

| Dependency | Used by Stage |
|---|---|
| `stock_movements` table populated | 3 (stock deduction), 3 (low stock display) |
| Stock computation logic (`SUM(quantity_change)`) | 3 |
| `cash_sessions` open record | 3 (cash-in entries from payments) |
| Cash reconciliation formula | 4, 6 |
| Low stock threshold logic | 3 |
