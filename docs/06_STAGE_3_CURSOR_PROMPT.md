# Cursor Prompt — Stage 3: Order, Payment, and Settlement

---

## Context

WRAPZ POS Stages 1 and 2 are complete. The app has: **master data** from Stage 1 (`event_settings`, `menu_items`, `bundle_components`, `discount_presets`), **stock/cash/ledger tables** from Stage 2, event settings, menu and bundle management, discount presets, stock management, and cash control.

Stage 3 builds the revenue core: new order flow, cart, discount, payment, settlement, and confirmation — including **Stage 3 migrations** for `orders`, `order_items`, `payments`, and `settlements`.

This is the most complex stage. Be careful and thorough. Do NOT rush past edge cases.

---

## What to Build in Stage 3

### 1. New Order Page (`/order/new`)

**Menu card grid:**
- Display all active menu items (regular + bundles)
- Each card: item image (if any), item name, price, stock badge (for non-bundle items)
- Stock badge logic:
  - Compute current stock = `SUM(quantity_change)` from `stock_movements` for this item
  - If no threshold set on item, use event_settings.default_low_stock_threshold
  - If stock ≤ threshold: yellow badge with stock count + warning icon
  - If stock ≤ 0: red badge "Out of Stock"
  - Bundles: no stock badge
  - Cards are NEVER disabled — cashier can always add any item
- Tap card → add 1 unit to cart (or increment if already in cart)

**Cart panel (always visible):**
- List of cart items: item name, unit price, quantity stepper (− / +), line total
- Subtotal shown
- Remove item button per line (or decrement to 0 removes)

**Customer name input:**
- Optional text field, labeled "Customer Name (optional)"

**Discount section:**
- Radio group: None (default) / Preset / Manual Percent / Manual Fixed
- If Preset: dropdown of active discount presets (name + description)
  - If selected preset has min_purchase: show "Min purchase: Rp X" note
  - Validate on proceed: if subtotal < min_purchase, show error toast and block proceed
- If Manual Percent: number input (0–100, labeled "%")
- If Manual Fixed: number input (labeled "Rp")
- Show computed discount amount in real-time below the selector
- Show final total in real-time

**Proceed to Payment button:**
- Disabled if cart is empty
- On click:
  1. Compute discount_amount and total_amount
  2. Get next queue_number: `SELECT MAX(queue_number) FROM orders` → + 1, or use event_settings.queue_start if no orders exist
  3. INSERT into `orders`
  4. INSERT into `order_items` (with item_name and item_price snapshots from menu_items)
  5. Redirect to `/order/[id]/payment`

---

### 2. Payment Page (`/order/:id/payment`)

**Display:**
- Order summary: queue number (large, DM Mono, brand-red), customer name, item list, subtotal, discount, total
- Payment method: Cash | QRIS | Transfer (radio buttons or tabs, prominent)
- Amount: two options:
  - "Exact Amount" button (pre-fills input with order total)
  - "Enter Amount" input (free number entry, labeled "Rp")
  - Default to Exact Amount selected
- Payment notes: optional text field
- Confirm Payment button

**On confirm:**
- Validate: amount entered > 0
- INSERT `payments` record
- If is_exact = true (or entered amount = total_amount):
  - UPDATE `orders`: payment_status = 'paid', serving_status = 'queued', stock_deducted = true
  - Run stock deduction (see below)
  - INSERT `ledger_entries` (type: payment_cash/qris/transfer, direction: in, amount: total_amount)
  - If cash: INSERT `cash_movements` (type: cash_in_sale, amount: total_amount)
  - Redirect to `/order/[id]/confirmation`
- If entered amount ≠ total_amount:
  - UPDATE `orders`: payment_status = 'partially_paid'
  - INSERT `ledger_entries` for amount tendered
  - If cash: INSERT `cash_movements` for amount tendered
  - Redirect to `/order/[id]/settlement`

**Guard:** If a payment record already exists for this order, do not create a duplicate. Check first.

---

### 3. Settlement Page (`/order/:id/settlement`)

**Display:**
- Order summary (queue number, total)
- Settlement context:
  - Show "Amount Tendered So Far: Rp X"
  - If underpayment: "Remaining Due: Rp X"
  - If overpayment: "Change to Return: Rp X"
- Settlement method selector: Cash | QRIS | Transfer (can differ from initial)
- Amount input (labeled "Rp" — for underpayment: amount to receive; for overpayment: amount to refund)
- Settlement notes field (optional, separate from payment notes)
- "Confirm Settlement" button
- "Send to Kitchen Now" button (only visible if `orders.serving_status = 'not_sent'`)

**Send to Kitchen Now logic:**
- UPDATE `orders`: serving_status = 'queued', manually_overridden_to_serving = true, stock_deducted = true
- Run stock deduction (if not already deducted)
- Page reloads/stays on settlement — settlement is still required
- Button disappears after override

**Confirm Settlement logic:**

Underpayment case:
- remaining_due = total_amount - SUM(payments.amount_tendered)
- If settlement_amount ≥ remaining_due:
  - Close settlement: INSERT `settlements`, UPDATE `orders` payment_status = 'paid', serving_status = 'queued' (if not overridden), stock_deducted = true
  - If excess (settlement_amount > remaining_due): `adjustment_amount = settlement_amount - remaining_due`, INSERT `ledger_entries` type = adjustment
  - INSERT `ledger_entries` for settlement amount
  - If cash: INSERT `cash_movements`
  - Redirect to confirmation
- If settlement_amount < remaining_due:
  - Record partial settlement, update remaining due display
  - Do NOT close yet (rare case, handle gracefully)

Overpayment/refund case:
- change_due = SUM(payments.amount_tendered) - total_amount
- Cashier inputs refund amount
- Always close settlement on confirm (per business rule)
- If refund_amount ≠ change_due: `adjustment_amount = refund_amount - change_due`, INSERT `ledger_entries` type = adjustment with note "Refund adjustment"
- INSERT `settlements` record
- UPDATE `orders`: payment_status = 'paid', serving_status = 'queued' (if not overridden), stock_deducted = true
- INSERT `ledger_entries` for refund: direction = out (cash_out_refund type if cash)
- If cash: INSERT `cash_movements` type = cash_out_refund
- Redirect to confirmation

---

### 4. Stock Deduction Function

Create a shared utility function `deductStock(orderId)`:
- Fetch order_items for orderId
- For each order_item:
  - Fetch menu_item (to check is_bundle)
  - If NOT bundle: INSERT stock_movements with movement_type = 'sale', quantity_change = -(quantity), reference_order_id = orderId
  - If bundle: fetch bundle_components, for each component INSERT stock_movements with movement_type = 'sale', quantity_change = -(order_item.quantity × component.quantity), reference_order_id = orderId
- This function should be idempotent-guarded: only run if orders.stock_deducted = false at the time of call. Immediately set stock_deducted = true before inserting movements.

---

### 5. Confirmation Page (`/order/:id/confirmation`)

- Queue number: very large, DM Mono font, brand-red color, centered
- Customer name (if any): below queue number
- Item list: name, quantity, line total
- Total amount paid
- Three action buttons (clearly spaced, full-width on mobile):
  - "Add New Order" → `/order/new`
  - "Done" → `/dashboard`
  - "View Transactions" → `/transactions`

---

## What NOT to Build in Stage 3

- Do NOT build the transactions page yet
- Do NOT build the ledger page yet
- Do NOT build the kitchen board yet
- Do NOT build dashboard metrics
- Do NOT add void/cancel functionality
- Do NOT add split payment at initial payment step
- Do NOT modify Stage 1 or Stage 2 pages unless fixing a direct bug

---

## Key Edge Cases to Handle

- Cart is empty → Proceed to Payment is disabled
- Discount minimum purchase not met → toast error, block Proceed
- Discount would make total negative → floor total at Rp 0
- Duplicate payment attempt → check if payment already exists for order before inserting
- Stock deduction guard → check stock_deducted flag before running deduction
- Manual override then settlement completes → do NOT reset serving_status to 'not_sent'
- Settlement amount exactly equals due → clean close, no adjustment needed
- Settlement amount slightly exceeds due → close + log adjustment
- Cash method → always create cash_movements entries in addition to ledger_entries
- QRIS/Transfer → create ledger_entries only (no cash_movements)

---

## Acceptance Criteria

- [ ] Menu cards show all active items with stock badges (non-bundles only)
- [ ] Cart works correctly: add, increment, decrement, remove items
- [ ] Discount types all work: none, preset (with min_purchase validation), manual percent, manual fixed
- [ ] Order is created in Supabase with correct queue number, discount, total
- [ ] Order items are saved with item_name and item_price snapshots
- [ ] Exact payment creates payment record, updates order status, deducts stock, creates ledger + cash entries
- [ ] Different amount payment redirects to settlement
- [ ] Settlement handles underpayment, overpayment, and excess cases
- [ ] Excess settlement/refund creates adjustment ledger entry and closes settlement
- [ ] Manual override sends order to kitchen and deducts stock immediately
- [ ] Confirmation page shows queue number prominently with correct order details
- [ ] All three confirmation buttons navigate correctly
- [ ] Payment notes and settlement notes are separate fields
- [ ] All data written to Supabase — no localStorage

---

## Warnings

- Do NOT add void functionality — it is explicitly out of scope
- Do NOT allow split payment at initial payment — one method only
- Do NOT create another "due" or "loop" when settlement/refund exceeds — close immediately with adjustment entry
- Do NOT reset serving_status if manual override was used and settlement completes later
- Do NOT skip the stock_deducted guard — deducting twice would corrupt stock data
- Do NOT let the queue number be assigned anywhere except at order creation time
- Preserve all Stage 1 and Stage 2 functionality
