# Stage 6 Brief — Dashboard, Export, and Final Polish

---

## Why This Stage Exists

Stage 6 completes the product. It adds:
1. A real-time operational dashboard showing key event metrics
2. A full one-click backup export (all tables as TSV in a ZIP)
3. Final UI polish: empty states, warning states, consistency, and a pre-event readiness checklist

This stage should only begin after all previous stages are functional and stable.

---

## Dashboard Metrics

The dashboard is a read-only operational summary. It should refresh on load and have a manual refresh button. Polling every 60 seconds is acceptable.

### Metric Definitions

| Metric | Calculation |
|---|---|
| **Gross Sales** | SUM(orders.subtotal) WHERE payment_status = 'paid' |
| **Discount Total** | SUM(orders.discount_amount) WHERE payment_status = 'paid' |
| **Net Sales** | Gross Sales − Discount Total |
| **Cash In by Method** | **Ledger-first:** For orders with `payment_status = 'paid'`, sum **`ledger_entries.amount`** for rows with `direction = 'in'` and `entry_type` in (`payment_cash`, `payment_qris`, `payment_transfer`, `settlement_cash`, `settlement_qris`, `settlement_transfer`), bucketed by method implied by the type suffix (`_cash` → Cash, `_qris` → QRIS, `_transfer` → Transfer). **Do not** drive this card from `SUM(payments.amount_tendered)` by method — tendered amounts can overstate recognized inflow (e.g. over-tender, partial then settled). Posted ledger lines are the source of truth for this KPI. Exclude non-sales inflows such as `opening_cash` and `cash_refill` from this breakdown. |
| **Total Orders** | COUNT(orders) WHERE payment_status = 'paid' |
| **AOV** | Net Sales ÷ Total Orders (show 0 if no orders) |
| **Top Selling Menu** | SUM(order_items.quantity) per menu_item_id, for paid orders, sorted descending — show top 5 |

### Dashboard Layout

**Row 1 — Primary KPIs (3 cards):**
- Net Sales (largest, most prominent)
- Total Orders
- AOV

**Row 2 — Breakdown (3 cards):**
- Gross Sales
- Discount Total
- Cash In by Method (small table inside card: Cash | QRIS | Transfer with amounts)

**Row 3 — Menu Performance:**
- Top Selling Menu: ranked list (rank number, item name, units sold)
- Optionally: a simple horizontal bar chart (using a lightweight charting lib)

**Visual style:**
- KPI cards: clean, white card on off-white (**brand-bg**) background
- Numbers: large, DM Mono, high contrast
- **Brand-yellow** accent for KPI values or card borders where emphasis is needed
- Top selling items: rank number in **brand-red** circle

---

## Export / Backup

### Behavior
- One-click export button on the Export page (`/export`)
- On click: fetch all data from Supabase → convert to TSV → bundle into ZIP → trigger browser download
- Show loading state during export (may take a few seconds for large datasets)
- Show last export timestamp after completion (stored in component state — not persisted)

### ZIP Naming
Format: `Backup_DDMMYYYY_HHMM.zip`
Time: Asia/Jakarta (UTC+7)
Example: `Backup_16042026_1430.zip`

### TSV Files Included

| File | Contents |
|---|---|
| `event_settings.tsv` | Event settings |
| `menu_items.tsv` | All menu items |
| `bundle_components.tsv` | Bundle component definitions |
| `discount_presets.tsv` | Discount presets |
| `orders.tsv` | All orders |
| `order_items.tsv` | All order line items |
| `payments.tsv` | Payment records |
| `settlements.tsv` | Settlement records |
| `stock_movements.tsv` | Stock movement history |
| `cash_sessions.tsv` | Cash session(s) |
| `cash_movements.tsv` | Cash movement events |
| `ledger_entries.tsv` | Ledger entries |

### TSV Format
- Tab-separated values
- First row: column headers
- Each subsequent row: one record
- Dates: ISO 8601 format (UTC)
- Numbers: plain decimal (no Rp prefix)
- Nulls: empty string

### Library Recommendation
Use `jszip` for ZIP creation (npm package). Convert each table to TSV using a simple utility function.

---

## Final Polish

### Empty States
Every page must have a meaningful empty state:
- Dashboard: "No orders yet. Start the event by creating the first order."
- Transactions: "No transactions yet."
- Ledger: "No ledger entries yet."
- Kitchen board: "No orders in the kitchen yet."
- Stock page: "No stock movements recorded. Set opening stock before the event starts."
- Cash page: "No cash session open. Set opening cash before the event starts."

### Warning States
- Dashboard: if no cash session open → yellow banner "No cash session open. Go to Cash Control to set opening cash."
- Dashboard: if no opening stock recorded → yellow banner "Opening stock not set. Go to Stock to set opening stock."
- Menu page: if a bundle has no components → show warning badge "No components defined."
- Stock page: items with zero or negative stock → red badge
- Any Supabase error: show a consistent error toast/banner, never a blank page

### Consistency Polish
- Verify all timestamps use UTC+7 / Asia/Jakarta format consistently
- Verify all currency amounts use consistent Rupiah formatting (Rp with thousand separators)
- Verify queue numbers always use DM Mono font, zero-padded
- Verify all primary action buttons use **brand-red** consistently
- Verify all warning indicators use **brand-yellow**
- Verify all nav items are correctly labeled and linked
- Verify mobile responsiveness on at least 375px width (iPhone SE equivalent)

---

## Pre-Event Readiness Checklist

Add a small "Event Readiness" section or card on the Dashboard page (or Settings page) that shows:

| Check | Status |
|---|---|
| Event name configured | ✅ / ⚠️ |
| At least one active menu item exists | ✅ / ⚠️ |
| Opening stock recorded | ✅ / ⚠️ |
| Cash session open | ✅ / ⚠️ |

Each item: **semantic** success checkmark (e.g. green icon) if condition met, **brand-yellow** warning if not. The green check is a **narrow status affordance**, not part of the brand palette (brand remains off-white + red + yellow).

This is a pre-flight checklist for the event operator.

---

## What This Stage Should NOT Change

- Do NOT modify order, payment, or settlement flows
- Do NOT add void functionality
- Do NOT change the data model
- Do NOT add authentication
- Do NOT redesign earlier pages — polish and fix, do not rebuild
