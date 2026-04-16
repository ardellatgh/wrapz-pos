# Cursor Prompt — Stage 2: Stock and Cash Control

---

## Context

You are continuing work on WRAPZ POS. Stage 1 is complete: the app shell, visual design system, **master-data** Supabase tables (`event_settings`, `menu_items`, `bundle_components`, `discount_presets`), event settings, menu database (including bundles), and discount presets are all working.

Stage 2 adds: **new migrations/tables** for stock and cash (`stock_movements`, `cash_sessions`, `cash_movements`, `ledger_entries`), plus opening stock, stock refill, low stock display logic, opening cash, cash float refill, and closing cash reconciliation foundation.

Do NOT modify any Stage 1 functionality. Do NOT build the order/payment flow yet.

---

## What to Build in Stage 2

### 1. Stock Management Page (`/stock`)

**Stock Overview Section:**
- Table showing all active, non-bundle menu items
- Columns: Item Name, Current Stock (computed), Low Stock Threshold, Status (OK / Low Stock badge)
- Current stock = `SUM(quantity_change)` from `stock_movements` WHERE `menu_item_id = item.id`
- Low stock: if current stock ≤ threshold (item threshold if set, else event_settings.default_low_stock_threshold)
- Low stock rows: yellow highlight or a yellow "Low Stock" badge
- Zero or negative stock: red "Out of Stock" badge

**Opening Stock Form:**
- Button: "Set Opening Stock"
- Opens a form/modal showing a table of all active non-bundle menu items
- Each row: item name, current stock (read-only), input field for "Opening Quantity"
- On submit: for each item with quantity > 0, insert into `stock_movements`:
  - `menu_item_id`, `movement_type = 'opening'`, `quantity_change = entered_qty`, `notes = 'Opening stock'`
- If any item already has a prior `opening` movement, show a non-blocking warning banner: "Some items already have opening stock recorded. Submitting will add to their current stock."
- Do NOT block submission.

**Stock Refill Form:**
- Button: "Add Refill"
- Same UI as opening stock form but labeled "Refill"
- `movement_type = 'refill'`
- No warning about repeating

**Stock Movement Log (optional but recommended):**
- Simple table at bottom of page: item name, movement type, quantity change, date/time
- Chronological, newest first
- For reference/audit use

---

### 2. Cash Control Page (`/cash`)

**State: No Active Cash Session**
- Show "Open Cash Session" form
- Field: Opening Cash Amount (Rp, number input)
- Optional notes field
- On submit:
  1. INSERT into `cash_sessions`: `opened_at = now()`, `opening_amount = entered`, `status = 'open'`
  2. INSERT into `cash_movements`: `cash_session_id = new_session.id`, `movement_type = 'opening'`, `amount = entered`
  3. INSERT into `ledger_entries`: `entry_type = 'opening_cash'`, `direction = 'in'`, `amount = entered`, `created_at = now()`
- Redirect / refresh to show active session view

**State: Active Cash Session Exists**
- Show session summary card:
  - Session opened at: [time in UTC+7]
  - Opening float: Rp X
  - Total refills added: Rp X (sum of refill movements)
  - Cash sales received: Rp X (sum of cash_in_sale movements — will be 0 until Stage 3)
  - Cash refunds paid out: Rp X (sum of cash_out_refund movements — will be 0 until Stage 3)
  - **Expected closing cash: Rp X** (opening + refills + cash_sales - cash_refunds)
- Show cash movement history table (type, amount, time, notes)

**Add Cash Refill:**
- Form: amount (Rp), optional notes
- On submit:
  1. INSERT into `cash_movements`: `movement_type = 'refill'`, `amount = entered`, `notes = entered_notes`
  2. INSERT into `ledger_entries`: `entry_type = 'cash_refill'`, `direction = 'in'`, `amount = entered`, `notes = entered_notes`
- Show clear label: "This is a cash float refill, not revenue."

**Close Session:**
- Button: "Close Session"
- Opens a closing reconciliation form:
  - Shows read-only: opening, refills, cash sales, refunds, expected closing cash
  - Input: "Actual Counted Cash" (Rp, number input)
  - Computed and shown: Variance = actual - expected (use **semantic success green** when zero for “balanced”, red if negative, yellow if positive — not a brand accent color)
- Confirm close button:
  1. UPDATE `cash_sessions`: `closed_at = now()`, `closing_counted_amount = entered`, `status = 'closed'`
- After close: show read-only summary of closed session (allow re-opening the page to see historical data)

---

## Data Touched in Stage 2

- READ: `menu_items`, `event_settings`
- READ + WRITE: `stock_movements`
- READ + WRITE: `cash_sessions`, `cash_movements`, `ledger_entries`

---

## What NOT to Build in Stage 2

- Do NOT build the order flow
- Do NOT build the payment or settlement screens
- Do NOT compute cash_in_sale or cash_out_refund from orders yet (those will be created in Stage 3)
- Do NOT build the kitchen board
- Do NOT build dashboard metrics
- Do NOT build export
- Do NOT modify any Stage 1 pages or components unless fixing a bug

---

## Acceptance Criteria

- [ ] Stock page shows all active non-bundle items with computed current stock
- [ ] Opening stock can be entered in bulk and saves to `stock_movements` with movement_type = opening
- [ ] Stock refill can be entered in bulk and saves to `stock_movements` with movement_type = refill
- [ ] Low stock items are visually flagged (yellow/red badge)
- [ ] Warning is shown if opening stock already exists, but submission is not blocked
- [ ] Cash Control page shows correct state based on whether a session exists
- [ ] Opening cash creates cash_session + cash_movements + ledger_entries records
- [ ] Cash refill creates cash_movements + ledger_entries records
- [ ] Cash refill is clearly labeled as NOT revenue
- [ ] Expected closing cash is correctly computed from movements
- [ ] Closing session stores closing_counted_amount and variance is displayed
- [ ] All times displayed in UTC+7 (Asia/Jakarta)
- [ ] All data persists in Supabase — no localStorage

---

## Warnings

- Do NOT add a `current_stock` column to `menu_items` — stock is always computed from `stock_movements`
- Do NOT hard-delete any stock movements — they are append-only
- Do NOT start building the order flow — it will be done in Stage 3
- Preserve Stage 1 **master-data** tables (`event_settings`, `menu_items`, `bundle_components`, `discount_presets`); extend the database with **Stage 2 migrations** for stock/cash/ledger tables instead of rewriting Stage 1 DDL
- Preserve all Stage 1 pages and navigation
