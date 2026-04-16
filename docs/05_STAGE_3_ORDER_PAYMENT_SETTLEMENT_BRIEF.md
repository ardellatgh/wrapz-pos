# Stage 3 Brief — Order, Payment, and Settlement

---

## Why This Stage Exists

Stage 3 is the revenue core of the entire system. It implements the complete cashier loop: creating an order, selecting items, applying a discount, taking payment, handling settlement if needed, and displaying the confirmation.

This is the most complex stage. Getting this right is critical — every downstream feature (transactions, ledger, dashboard, kitchen board) depends on the data this stage creates.

**Database scope:** Stage 3 introduces **`orders`**, **`order_items`**, **`payments`**, and **`settlements`** (and uses `stock_movements`, `cash_movements`, and `ledger_entries` created in earlier stages) via a **Stage 3 migration**. Stage 1 delivered master data only; Stage 2 delivered stock/cash/ledger tables.

---

## Cashier Order Flow

### New Order (`/order/new`)

1. Cashier sees a grid of menu cards for all active menu items (regular + bundles).
2. Tapping a card adds it to the cart (or increments quantity).
3. Cart is always visible (sidebar on desktop, slide-up panel on mobile).
4. Cart shows: items, quantities, per-item total, subtotal.
5. Customer name field: optional, free text.
6. Discount section: radio/select for None / Preset / Manual Percent / Manual Fixed.
   - If Preset: show dropdown of active presets.
   - If Manual Percent: show percentage input.
   - If Manual Fixed: show Rp amount input.
7. Total summary: subtotal, discount amount, final total.
8. "Proceed to Payment" button — disabled if cart is empty.

**Queue number assignment:** When "Proceed to Payment" is clicked and the order is committed to Supabase, the queue number is assigned. It is NOT assigned before order creation. Queue number = MAX(queue_number from orders) + 1, or `event_settings.queue_start` if no orders exist yet. Zero-padded to 3 digits for display (001, 002...).

**Order creation in Supabase:**
- INSERT into `orders`: queue_number, customer_name, subtotal, discount fields, total_amount, payment_status = 'pending', serving_status = 'not_sent', stock_deducted = false
- INSERT into `order_items`: for each cart item, with item_name and item_price snapshots

---

## Discount Logic

| Type | Behavior |
|---|---|
| None | discount_amount = 0 |
| Preset | Look up preset. If min_purchase > 0 and subtotal < min_purchase: show error, block. Else compute. |
| Manual Percent | (value / 100) × subtotal. Floor at 0. |
| Manual Fixed | Fixed amount. Floor total_amount at 0. |

Only one discount per order. `orders.discount_amount` stores the computed amount deducted.

---

## Payment Flow (`/order/:id/payment`)

### Page content:
- Order summary (queue number, customer name, items, subtotal, discount, total)
- Payment method selector: Cash | QRIS | Transfer (radio or tab)
- Amount tendered: "Exact Amount" button + "Enter Amount" input
- Payment notes field (optional)
- Confirm Payment button

### Exact Payment path:
- Tendered = total_amount
- On confirm:
  1. INSERT `payments`: method, amount_tendered, is_exact = true
  2. UPDATE `orders`: payment_status = 'paid', serving_status = 'queued', stock_deducted = true
  3. Run stock deduction (see stock deduction section below)
  4. CREATE `ledger_entries`: appropriate type (payment_cash/qris/transfer), direction = in
  5. If method = cash: CREATE `cash_movements`: type = cash_in_sale, amount = total_amount
  6. Redirect to Confirmation page

### Different Amount path:
- Tendered ≠ total_amount
- On confirm:
  1. INSERT `payments`: method, amount_tendered, is_exact = false
  2. If tendered < total: UPDATE `orders`: payment_status = 'partially_paid'
  3. If tendered > total: UPDATE `orders`: payment_status = 'partially_paid' (pending change settlement)
  4. CREATE `ledger_entries` for the initial tendered amount
  5. If method = cash: CREATE `cash_movements`
  6. Redirect to Settlement page

---

## Settlement Flow (`/order/:id/settlement`)

### Page content:
- Order summary
- Settlement context:
  - If underpayment: "Amount Due: Rp X" (total - tendered)
  - If overpayment: "Change Due: Rp X" (tendered - total)
- Settlement method selector (can differ from initial payment method)
- Amount input
- Settlement notes field (separate from payment notes)
- "Confirm Settlement" button
- **"Send to Kitchen Now" override button** (visible if order not yet in kitchen)

### Settlement logic (underpayment case):
- `settlement_amount_due = orders.total_amount - SUM(payments.amount_tendered)`
- Cashier inputs received amount.
- If received ≥ amount_due: close settlement.
  1. INSERT `settlements`: method, amount_received, amount_due, is_adjustment = false
  2. UPDATE `orders`: payment_status = 'paid', serving_status = 'queued' (if not already overridden), stock_deducted = true
  3. Stock deduction (if not already deducted)
  4. CREATE ledger_entries for settlement amount
  5. If cash: CREATE cash_movements

### Settlement logic (overpayment/refund case):
- `change_due = SUM(payments.amount_tendered) - orders.total_amount`
- Cashier inputs refund amount.
- If refund_amount = change_due: close normally.
- If refund_amount ≠ change_due (any excess or short):
  1. Close settlement immediately.
  2. `adjustment_amount = refund_amount - change_due`
  3. INSERT `settlements`: is_adjustment = true, adjustment_amount = adjustment_amount
  4. CREATE `ledger_entries`: type = adjustment, direction = in (if short) or out (if excess), notes = "Excess refund adjustment"
  5. UPDATE `orders`: payment_status = 'paid'

**No loops.** No new due. Settlement closes.

### Excess settlement simplification:
If settlement amount exceeds remaining due: same rule — close settlement, log excess as adjustment in ledger. Done.

---

## Manual Override to Serving

The "Send to Kitchen Now" button on the Settlement page:
- Sets `orders.serving_status = 'queued'`, `orders.manually_overridden_to_serving = true`
- Triggers stock deduction immediately (if `orders.stock_deducted = false`)
- Sets `orders.stock_deducted = true`
- Settlement flow continues as normal afterward
- When settlement completes, `payment_status` updates to 'paid'
- `serving_status` is already 'queued' — do not reset it

---

## Stock Deduction Logic

Called when: exact payment confirmed, OR settlement completes, OR manual override triggered.
Guard: only run if `orders.stock_deducted = false`. Set to true immediately before deducting.

For each `order_item` in the order:
- Look up `menu_items` record for `menu_item_id`
- If `is_bundle = false`:
  - INSERT `stock_movements`: `menu_item_id`, `movement_type = 'sale'` (or `manual_override_sale` if override), `quantity_change = -(order_item.quantity)`, `reference_order_id = order.id`
- If `is_bundle = true`:
  - Look up all `bundle_components` for this bundle
  - For each component:
    - INSERT `stock_movements`: `menu_item_id = component.component_item_id`, `movement_type = 'sale'`, `quantity_change = -(order_item.quantity × component.quantity)`, `reference_order_id = order.id`

Stock can go negative. Do not block. Do not throw an error.

---

## Confirmation Board (`/order/:id/confirmation`)

After full payment/settlement (or exact payment):
- Large queue number (DM Mono, brand-red, very large)
- Customer name (if provided)
- List of ordered items + quantities
- Total amount paid
- Three buttons:
  - "Add New Order" → navigate to `/order/new`
  - "Done" → navigate to `/dashboard`
  - "View Transactions" → navigate to `/transactions`

---

## Payment Notes vs Settlement Notes

- `orders.payment_notes`: captured on the Payment page
- `orders.settlement_notes`: captured on the Settlement page
- These are separate fields, separately displayed in Transactions

---

## Low Stock Display on Menu Cards

In the New Order menu card grid:
- Compute current stock for each non-bundle item.
- If is_bundle = true: no stock badge.
- If stock ≤ threshold: yellow/orange badge with current stock count + warning icon.
- If stock = 0 or negative: red badge "Out of Stock".
- Card is NOT disabled or hidden. Cashier can still add it.

---

## Key Data Created in Stage 3

- `orders` records (with queue_number, discount, totals, status fields)
- `order_items` records (with name/price snapshots)
- `payments` records
- `settlements` records
- `stock_movements` records (sale type, negative quantities)
- `ledger_entries` records (payment/settlement/refund/adjustment types)
- `cash_movements` records (cash_in_sale, cash_out_refund, for cash-method payments)

---

## Operational Constraints

- Never create a payment record for the same order twice (check if payment already exists before creating)
- Never deduct stock twice (check `stock_deducted` flag before running deduction)
- Queue number is assigned at order creation — cannot change after
- Discount is locked after order creation — cannot change
- If cashier navigates away mid-payment, the order exists in 'pending' state with queue number assigned
- This is acceptable — no void feature means pending orders may persist

---

## What Later Stages Depend on from Stage 3

| Dependency | Used by Stage |
|---|---|
| `orders` table with full status fields | 4, 5, 6 |
| `order_items` with snapshots | 4, 5 |
| `payments` and `settlements` records | 4, 6 |
| `ledger_entries` populated | 4, 6 |
| `stock_movements` sale entries | 2 (refill), 6 |
| `orders.serving_status` field | 5 |
| Confirmation board UX | — |
