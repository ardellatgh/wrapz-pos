# WRAPZ POS — Final QA and Acceptance Checklist
### Pre-Event Readiness Verification

---

## How to Use This Checklist

Work through each section before declaring the app event-ready. Each item should be manually verified by running through the actual flows in the app connected to Supabase.

Mark each item: ✅ Pass | ❌ Fail | ⚠️ Partial

---

## 1. Business Logic

### Menu and Bundles
- [ ] Menu items can be created with name, image, price, low stock threshold, active status
- [ ] Bundle items can be created with `is_bundle = true`
- [ ] Bundle components can be added (select item + quantity per bundle)
- [ ] Bundle components are correctly stored in `bundle_components` table
- [ ] Deactivating a menu item removes it from the cashier's menu card grid
- [ ] Hard delete of menu items is NOT possible (deactivate only)
- [ ] Image upload saves to Supabase Storage, URL stored in `menu_items.image_url`

### Discount Logic
- [ ] Preset discount: percent type computes correctly
- [ ] Preset discount: fixed type computes correctly
- [ ] Preset with minimum purchase: blocked if subtotal < minimum
- [ ] Preset with minimum purchase: allowed if subtotal ≥ minimum
- [ ] Manual percent discount computes correctly
- [ ] Manual fixed discount computes correctly
- [ ] Discount cannot make total negative (floors at 0)
- [ ] Only one discount type can be selected per order

### Queue Numbers
- [ ] Queue number is assigned at ORDER CREATION, not at payment
- [ ] Queue number starts from configured value in Event Settings
- [ ] Queue number increments correctly (MAX + 1)
- [ ] Queue number is zero-padded to 3 digits for display (001, 007, etc.)
- [ ] Queue number is visible prominently on: payment page, settlement page, confirmation page, transactions, ledger, kitchen board

---

## 2. Order, Payment, Settlement

### New Order
- [ ] Cart adds items correctly on tap/click
- [ ] Cart increment/decrement works
- [ ] Cart shows correct subtotal
- [ ] Customer name is optional — order saves correctly with or without it
- [ ] Proceed to Payment is disabled when cart is empty
- [ ] Order is created in Supabase with all correct fields before payment page loads

### Exact Payment
- [ ] Exact payment creates `payments` record with `is_exact = true`
- [ ] Exact payment updates `orders.payment_status = 'paid'`
- [ ] Exact payment sets `orders.serving_status = 'queued'`
- [ ] Exact payment sets `orders.stock_deducted = true`
- [ ] Exact payment creates `ledger_entries` record with correct type and direction
- [ ] Exact cash payment creates `cash_movements` record of type `cash_in_sale`
- [ ] Exact QRIS/transfer payment does NOT create `cash_movements` record
- [ ] Redirects to confirmation page after exact payment

### Different Amount Payment
- [ ] Creates `payments` record with `is_exact = false`
- [ ] Redirects to settlement page
- [ ] Settlement page shows correct remaining due (underpayment) or change due (overpayment)

### Settlement — Underpayment
- [ ] Shows correct remaining due
- [ ] Settlement method can differ from initial payment method
- [ ] Settlement closes order when amount ≥ remaining due
- [ ] Order `payment_status` becomes `paid` on close
- [ ] `serving_status` becomes `queued` on close (if not already overridden)
- [ ] Stock deduction runs on settlement close (if not already deducted)
- [ ] `ledger_entries` created for settlement amount

### Settlement — Overpayment / Refund
- [ ] Shows correct change due
- [ ] Refund settlement closes immediately (per business rule — no loop)
- [ ] If refund ≠ change due: adjustment ledger entry created
- [ ] Adjustment entry has notes explaining the adjustment
- [ ] Order `payment_status` becomes `paid` regardless of refund amount

### Excess Settlement/Refund
- [ ] Closing settlement with excess amount creates adjustment ledger entry
- [ ] Adjustment entry direction is correct (in if excess collected, out if over-refunded)
- [ ] Settlement closes immediately — no new due is created
- [ ] Notes are populated on adjustment entry

### Manual Override to Serving
- [ ] "Send to Kitchen Now" button is visible on settlement page (when not yet overridden)
- [ ] Clicking override sets `serving_status = 'queued'`
- [ ] Clicking override sets `manually_overridden_to_serving = true`
- [ ] Clicking override triggers stock deduction immediately
- [ ] After override, button disappears from settlement page
- [ ] Completing settlement later does NOT reset serving_status

### No Void
- [ ] There is NO void button anywhere in the app
- [ ] There is NO cancel order functionality

### Payment Notes vs Settlement Notes
- [ ] Payment notes are captured on payment page
- [ ] Settlement notes are captured on settlement page
- [ ] Both are stored as SEPARATE fields in `orders`
- [ ] Both are visible separately in the transactions expanded view

---

## 3. Stock Checklist

- [ ] Opening stock bulk input creates `stock_movements` records with `movement_type = 'opening'`
- [ ] Stock refill bulk input creates `stock_movements` records with `movement_type = 'refill'`
- [ ] Current stock = `SUM(quantity_change)` from `stock_movements` per item (not stored as a column)
- [ ] Stock deduction on sale creates negative `quantity_change` records
- [ ] Bundle sale: stock is deducted from COMPONENT items, not the bundle itself
- [ ] Bundle component deduction = order_item.quantity × component.quantity per component
- [ ] Stock deduction guard works: `stock_deducted` flag prevents double deduction
- [ ] Zero/negative stock does NOT block any order flow
- [ ] Low stock warning shows on menu cards (yellow/red badge)
- [ ] Low stock does NOT disable any menu card
- [ ] Bundle items do NOT show a stock badge on menu cards
- [ ] Low stock threshold uses item-level threshold if set, else event_settings default

---

## 4. Cash Reconciliation

- [ ] Opening cash creates `cash_sessions` record with `status = 'open'`
- [ ] Opening cash creates `cash_movements` record of type `opening`
- [ ] Opening cash creates `ledger_entries` record of type `opening_cash`
- [ ] Mid-event cash refill creates `cash_movements` record of type `refill`
- [ ] Cash refill is clearly labeled as NOT revenue in the UI
- [ ] Expected closing cash formula is correct: opening + refills + cash_sales - cash_refunds
- [ ] Only CASH method payments contribute to cash_movements (QRIS/transfer do not)
- [ ] Closing session captures `closing_counted_amount` in `cash_sessions`
- [ ] Variance (actual - expected) is displayed clearly with color indication
- [ ] Session status set to `closed` on close

---

## 5. Kitchen / Serving Board

- [ ] Orders with `serving_status ≠ 'not_sent'` appear on the board
- [ ] Orders appear in the correct column based on `serving_status`
- [ ] Each card shows: queue number (large, DM Mono, red), customer name (if any), item checklist
- [ ] Checklist has ONE row per `order_item` record (not per unit)
- [ ] Checking a checklist item updates `order_items.is_checked` in Supabase
- [ ] "Mark Ready" button is disabled until ALL order_items for that order are checked
- [ ] Moving from Queued → In Progress works
- [ ] Moving from In Progress → Ready to Serve works (only when all items checked)
- [ ] Moving from Ready to Serve → Served works
- [ ] No backward movement possible in v1
- [ ] Board auto-polls every 20 seconds
- [ ] "Last updated X ago" indicator is visible
- [ ] Manual refresh button works
- [ ] Error banner shown if Supabase fetch fails, last known board preserved
- [ ] Fullscreen mode hides sidebar and expands board
- [ ] Board is usable on iPad (large text, large touch targets)

---

## 6. Transactions and Ledger

- [ ] Transactions page shows all orders in correct columns
- [ ] Queue number is the FIRST (leftmost) column, formatted correctly
- [ ] Time is displayed in UTC+7 (Asia/Jakarta)
- [ ] Payment status badges are color-coded (Paid = **semantic** green, Partial = yellow, Pending gray)
- [ ] Expanding a row shows full detail: items, payment, settlement, notes
- [ ] Payment notes and settlement notes are displayed separately and labeled
- [ ] Adjustment settlement records are flagged and show notes
- [ ] No void, edit, or cancel actions exist on any transaction row
- [ ] Ledger page shows all entries chronologically (newest first)
- [ ] Ledger entry types show human-readable labels
- [ ] Direction badges: IN (**semantic** green), OUT (red)
- [ ] Adjustment entries are visible with notes
- [ ] Ledger summary totals (Total In, Total Out, Net) are correct

---

## 7. Dashboard

- [ ] Gross Sales = SUM(subtotal) for paid orders
- [ ] Discount Total = SUM(discount_amount) for paid orders
- [ ] Net Sales = Gross Sales - Discount Total
- [ ] Total Orders = COUNT of paid orders
- [ ] AOV = Net Sales / Total Orders (shows 0 or "—" if no orders)
- [ ] Cash In by Method matches **ledger** totals (payment_* / settlement_* IN lines on paid orders), not raw `amount_tendered` sums — verify against a few orders with over-tender or split settlement
- [ ] Top Selling Menu shows top 5 items by units sold from paid orders
- [ ] Pre-event readiness checklist shows correct status
- [ ] Warning banners appear when cash session or opening stock is missing
- [ ] Dashboard auto-refreshes every 60 seconds

---

## 8. Export / Backup

- [ ] Export button triggers download of a ZIP file
- [ ] ZIP filename format: `Backup_DDMMYYYY_HHMM.zip` in UTC+7 time
- [ ] ZIP contains exactly 12 TSV files (listed in spec)
- [ ] Each TSV has correct column headers on first row
- [ ] Null values are empty strings (not "null" string)
- [ ] Dates are in ISO 8601 format
- [ ] Numbers are plain decimal without currency formatting
- [ ] If any Supabase fetch fails, export does NOT produce partial ZIP
- [ ] Error state is shown if export fails, with retry option

---

## 9. UI / UX Consistency

- [ ] Color palette: **off-white** background, **brand-red** primary actions, **brand-yellow** warnings
- [ ] **Semantic green** used only for narrow success/status cues (paid badge, direction IN, checklist readiness) — not as a third brand color
- [ ] Typography: DM Serif Display for headings, Manrope for body, DM Mono for numbers/queue
- [ ] All queue numbers use DM Mono, zero-padded, brand-red
- [ ] All currency amounts use Rupiah format consistently
- [ ] All timestamps use UTC+7 display consistently
- [ ] Primary buttons are brand-red on all pages
- [ ] Warning badges/banners use brand-yellow on all pages
- [ ] Empty states exist on all data pages
- [ ] Loading states exist on all data-fetching pages
- [ ] Mobile viewport (375px) does not have broken layouts
- [ ] Kitchen board is readable from arm's length on iPad

---

## 10. Single-Day Event Operational Readiness

**Pre-Event Checklist (run before event opens):**
- [ ] Supabase project is live and env vars are set in Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
- [ ] All menu items are created and active
- [ ] Bundle components are correctly configured
- [ ] Discount presets are set (if any)
- [ ] Opening stock has been entered for all items
- [ ] Cash session is opened with correct opening float
- [ ] Event Settings are configured (event name, queue start number, low stock threshold)
- [ ] Kitchen board URL is open and working on iPad
- [ ] Cashier URL is open and working on laptop
- [ ] Test order created and completed successfully (exact payment path)
- [ ] Test order visible on kitchen board
- [ ] Test order visible in transactions page
- [ ] Export produces a valid ZIP (dry run)

**Day-of Reminders:**
- [ ] Only one cash session should be open at a time
- [ ] Stock refill can be added any time during event
- [ ] Cash float refill can be added any time during event
- [ ] Export backup should be run at end of event (and ideally mid-day as well)
- [ ] Closing cash reconciliation should be done after last order is complete

---

## 11. Data Integrity

- [ ] Live Postgres schema matches the **combined** stage migrations / project spec (all required tables and columns present — Stage 1 does not ship the full schema alone)
- [ ] All `order_items` records have `item_name` and `item_price` snapshots (not empty)
- [ ] No stock_movements records reference bundle items (`is_bundle = true` items have no stock movements)
- [ ] All `ledger_entries` have correct `direction` values (not null)
- [ ] Cash movements only exist for cash-method transactions (not QRIS/transfer)
- [ ] All orders have a queue number (no null queue numbers)
- [ ] No orders have `stock_deducted = true` with zero stock_movements referencing them (deduction must have run)
- [ ] No duplicate payment records for the same order

---

*End of QA Checklist.*
*All items should be ✅ before the event goes live.*
