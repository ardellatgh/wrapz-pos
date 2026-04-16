# Cursor Prompt — Stage 6: Dashboard, Export, and Final Polish

---

## Context

WRAPZ POS Stages 1–5 are complete. The full application is functional: menu management, stock and cash control, order flow, payment and settlement, transactions, ledger, and kitchen board.

Stage 6 completes the product: real dashboard metrics, full backup export, empty/warning states, consistency polish, and a pre-event readiness checklist.

Do NOT modify Stage 1–5 functionality. Fix bugs only if encountered.

---

## What to Build in Stage 6

### 1. Dashboard Page (`/dashboard`)

**Queries needed:**

Gross Sales = SELECT SUM(subtotal) FROM orders WHERE payment_status = 'paid'
Discount Total = SELECT SUM(discount_amount) FROM orders WHERE payment_status = 'paid'
Net Sales = Gross Sales - Discount Total
Total Orders = SELECT COUNT(*) FROM orders WHERE payment_status = 'paid'
AOV = Net Sales / Total Orders (handle divide by zero: show 0)

**Cash In by Method (ledger-based — required approach):**

Do **not** use `SUM(payments.amount_tendered)` grouped by `payment_method` as the source for this KPI — tendered amounts can exceed amounts ultimately recognized, and split payment/settlement flows are already normalized in **`ledger_entries`**.

Instead, for **paid** orders, aggregate **posted ledger inflows** by tender type:

1. Select `ledger_entries` rows joined to `orders` where `orders.payment_status = 'paid'`.
2. Filter to `direction = 'in'` and `entry_type` in:
   - `payment_cash`, `payment_qris`, `payment_transfer`
   - `settlement_cash`, `settlement_qris`, `settlement_transfer`
3. Map each row’s `entry_type` suffix to **Cash**, **QRIS**, or **Transfer** and **SUM(amount)** per bucket.
4. **Exclude** `opening_cash`, `cash_refill`, and other non-sales inflows from this card.
5. Refunds and adjustment lines follow existing Stage 3 posting rules; net “cash in by method” for the dashboard should reflect **finalized** ledger logic consistent with the Ledger page (IN payment/settlement lines as above).

Implement with one or more queries or an in-app aggregation — clarity and correctness matter more than SQL style.

Top Selling Menu:
SELECT oi.menu_item_id, oi.item_name, SUM(oi.quantity) as total_qty
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
WHERE o.payment_status = 'paid'
GROUP BY oi.menu_item_id, oi.item_name
ORDER BY total_qty DESC
LIMIT 5

**Layout:**

Row 1 (large KPI cards — 3 column grid):
- Net Sales: large number, DM Mono, brand-yellow accent
- Total Orders: large number
- AOV: large number

Row 2 (supporting KPIs — 3 column grid):
- Gross Sales
- Discount Total
- Cash In by Method: table inside card (Cash | QRIS | Transfer | Totals)

Row 3 (menu performance):
- Top Selling Menu: ranked list with rank number (brand-red circle), item name, units sold

**Pre-Event Readiness Section** (show at top of dashboard as a card or banner):
- Event name configured? Check `event_settings` has event_name set
- At least one active menu item? Check `menu_items` WHERE is_active = true, COUNT > 0
- Opening stock recorded? Check `stock_movements` WHERE movement_type = 'opening', COUNT > 0
- Cash session open? Check `cash_sessions` WHERE status = 'open', COUNT > 0

Show each as a row with **semantic** success (e.g. green ✅) or **brand-yellow** ⚠️ — green here is a **status helper**, not a brand color.

**Warning banners (below readiness section):**
- If cash session not open: yellow banner "Cash session not open. Set opening cash before processing orders."
- If no opening stock: yellow banner "Opening stock not recorded. Set stock before the event starts."

**Refresh:** Auto-refresh every 60 seconds. Manual "Refresh" button.

---

### 2. Export Page (`/export`)

**Layout:**
- Page title: "Backup & Export"
- Brief description: "Export a full backup of all event data as TSV files in a ZIP archive."
- List of what's included (the 12 TSV files)
- Large "Export All Data" button (brand-red, full width on mobile)
- Loading state while exporting: "Preparing backup..."
- After export: "Last exported: [time in UTC+7]" (in component state)

**Export logic:**

1. Fetch all rows from each of the 12 tables (sequential queries to Supabase)
2. Convert each to TSV:
   - First row: column headers (sorted alphabetically or in logical order)
   - Each record: tab-separated values, nulls as empty string, dates as ISO 8601
3. Create ZIP using `jszip`:
   - Add each TSV as a file in the ZIP root
   - TSV filenames: `event_settings.tsv`, `menu_items.tsv`, etc. (as listed in brief)
4. Generate ZIP filename: `Backup_DDMMYYYY_HHMM.zip` using Asia/Jakarta time
5. Trigger browser download using a URL object

**Error handling:** If any table fetch fails, show error toast and do NOT produce a partial ZIP. Retry button.

---

### 3. Empty States

Implement empty states for all pages that can have no data:

| Page | Empty State Message |
|---|---|
| `/dashboard` | "No orders yet. Start the event by creating the first order." |
| `/transactions` | "No transactions yet." |
| `/ledger` | "No ledger entries yet." |
| `/kitchen` | "No active kitchen orders." |
| `/stock` | "No stock movements recorded. Set opening stock to get started." |
| `/discounts` | "No discount presets. Add one to offer discounts to customers." |

Empty states should be centered, use a neutral icon or illustration (simple SVG), and have a friendly message. They should NOT look like errors.

---

### 4. Polish Tasks

Go through all pages and fix these consistency issues:

- [ ] All timestamps displayed in UTC+7 using `formatDateTime()` utility consistently
- [ ] All currency amounts use `formatRupiah()` utility consistently
- [ ] All queue numbers use `formatQueueNumber()` and DM Mono font consistently
- [ ] All primary buttons use brand-red background
- [ ] All warning indicators use brand-yellow
- [ ] Success / “OK” states use **semantic** green (sparingly — not a brand accent)
- [ ] Navigation sidebar: active item is correctly highlighted for all routes
- [ ] Page titles in browser tab (`<title>`) are set correctly for each page
- [ ] Mobile viewport (375px): check that all pages are at minimum usable on small screens
- [ ] No broken layouts or overflowing content
- [ ] Loading states on all data-fetching pages (skeleton or spinner)

---

### 5. Install Required Library

Install `jszip` for ZIP creation:
```bash
npm install jszip
```

---

## What NOT to Build in Stage 6

- Do NOT add void functionality
- Do NOT add authentication
- Do NOT redesign any prior stage pages (polish only)
- Do NOT change the data model
- Do NOT add features not listed above
- Do NOT add multi-event support

---

## Acceptance Criteria

- [ ] Dashboard shows correct Gross Sales, Discount Total, Net Sales for paid orders
- [ ] Dashboard shows Total Orders and AOV
- [ ] Dashboard shows Cash In by Method (Cash, QRIS, Transfer) from **ledger** payment/settlement IN lines for paid orders — **not** from raw `amount_tendered` aggregation
- [ ] Dashboard shows Top 5 selling menu items by units sold
- [ ] Pre-event readiness checklist shows correct status for all 4 checks
- [ ] Warning banners appear when cash session not open or opening stock not recorded
- [ ] Dashboard auto-refreshes every 60 seconds
- [ ] Export page has working Export button
- [ ] Export produces a ZIP named `Backup_DDMMYYYY_HHMM.zip` in UTC+7 time
- [ ] ZIP contains all 12 TSV files with correct headers and data
- [ ] TSV nulls are empty strings, dates are ISO 8601
- [ ] Empty states are implemented on all listed pages
- [ ] All timestamps consistently use UTC+7 format
- [ ] All currency consistently uses Rupiah format
- [ ] All queue numbers consistently use DM Mono font
- [ ] No broken layouts on mobile (375px)
- [ ] Loading states are shown during data fetches

---

## Warnings

- Do NOT produce a partial ZIP if any table fetch fails — show error and require retry
- Handle AOV divide-by-zero (no orders yet) gracefully — show 0 or "—"
- Cash In by Method must follow **ledger-finalized** amounts for payment/settlement IN entries — do not substitute tendered totals where they can overstate
- Do NOT skip polish tasks — consistency is part of the deliverable
- Preserve all Stage 1–5 functionality
