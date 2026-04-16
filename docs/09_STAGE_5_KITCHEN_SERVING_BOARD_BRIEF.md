# Stage 5 Brief — Kitchen and Serving Board

---

## Why This Stage Exists

The kitchen/serving team needs their own operational view: a kanban board showing orders as they move through preparation. This board is viewed on an iPad or secondary browser and must be highly readable from a distance, fast to interact with on touch, and reliably updated.

This is a separate concern from the cashier flow — it consumes order data created in Stage 3 and reflects the serving_status field.

---

## Kanban Board Structure

### Columns (left to right):
1. **Queued** — orders with serving_status = 'queued'
2. **In Progress** — orders with serving_status = 'in_progress'
3. **Ready to Serve** — orders with serving_status = 'ready_to_serve'
4. **Served** — orders with serving_status = 'served'

### Orders that appear:
- Only orders where serving_status ≠ 'not_sent'
- Orders enter the board when:
  - Payment is confirmed (exact payment or full settlement complete)
  - OR cashier uses "Send to Kitchen Now" manual override

### Orders that stay on the board:
- All orders except those with serving_status = 'not_sent'
- "Served" orders should remain visible in the Served column for operational reference (do not auto-hide)
- Consider allowing the Served column to be collapsed or scrollable independently

---

## Order Cards

Each card displays:
- **Queue Number** — large, prominent, DM Mono, brand-red
- **Customer Name** — if provided, below queue number
- **Line Items with Checklist:**
  - Each `order_item` is a checklist row
  - Checkbox (or tap-to-check circle) per line item
  - Shows: item name + quantity (e.g. "Wrap Ayam Crispy × 2")
  - When checked: strikethrough style, visually de-emphasized
  - Checklist state is stored in `order_items.is_checked` field in Supabase

---

## Checklist Behavior

**Critical rule:** Checklist is PER LINE ITEM, not per unit.

- An order with "Wrap x2" has ONE checklist item for "Wrap x2", not two separate items.
- Checking "Wrap x2" means all 2 wraps for that line are ready.
- This is intentional — it keeps the checklist simple for a fast-paced event.

**Checking behavior:**
- Tap checkbox → `order_items.is_checked = true` → save to Supabase immediately (optimistic UI okay)
- Unchecking: allowed (tap again → `is_checked = false`)

---

## Moving Between Columns

### Queued → In Progress:
- Manual button on card: "Start" or arrow button
- No checklist requirement

### In Progress → Ready to Serve:
- Requires ALL `order_items.is_checked = true` for this order
- Button "Mark Ready" is disabled (grayed out) until all items are checked
- When ready: button becomes active
- On click: UPDATE `orders.serving_status = 'ready_to_serve'`

### Ready to Serve → Served:
- Manual button: "Served" or checkmark
- No additional requirement
- On click: UPDATE `orders.serving_status = 'served'`

### No going back:
- In v1, there is no "move back" button. Movement is one-directional.
- This is intentional for operational simplicity.

---

## Board Refresh / Update Strategy

Use polling — NOT Supabase realtime subscriptions. This keeps the implementation simple and reliable.

- Poll interval: 15–30 seconds recommended
- Show "Last updated: X seconds ago" indicator
- Manual "Refresh" button (prominent, for when kitchen team needs immediate update)
- On poll: re-fetch all orders with serving_status ≠ 'not_sent' and their order_items

This is acceptable for a single-day event. Real-time complexity is not worth the risk.

---

## iPad and Readability Optimization

The kitchen board is designed to be readable from 1–2 meters away on an iPad (tablet).

**Design requirements:**
- Queue number: minimum 32px, ideally 48px+ on cards
- Item names: minimum 16px, bold
- Checklist rows: large touch targets (minimum 44px height)
- Column headers: clear, large, high contrast
- Cards: high contrast between card background and text
- Avoid dense information — whitespace is important
- Consider a "fullscreen / kiosk mode" toggle that hides the sidebar nav

**Color usage on board:**
- Off-white card backgrounds
- Brand-red for queue numbers
- Brand-yellow for "In Progress" column header accent
- **Semantic success green** for "Ready to Serve" state (readiness to serve — **not** a third brand color; brand remains off-white + red + yellow)
- Gray/neutral for "Served" state
- Use column header color accents to quickly distinguish columns visually

---

## Interaction with Settlement Eligibility and Manual Override

The kitchen board does NOT need to know about payment status or settlement state.

Orders appear on the board when `serving_status = 'queued'` — this is set by:
- Stage 3 exact payment confirmation
- Stage 3 settlement completion
- Stage 3 manual override ("Send to Kitchen Now")

The kitchen board only reads and updates `serving_status` and `order_items.is_checked`. It does not touch payment or settlement records.

---

## What This Stage Does NOT Do

- Does not handle payment or settlement
- Does not create orders
- Does not deduct stock
- Does not show financial data (no amounts on kitchen cards)
- Does not send notifications to cashier when order is "Ready to Serve" (out of scope for v1)

---

## Key Operational Notes

- The kitchen board should be opened in its own browser tab/window on the iPad
- It should work independently of what the cashier is doing
- Both the cashier view and the kitchen board read from the same Supabase database — they are naturally in sync via polling
- If the iPad loses connection briefly, it will re-sync on next poll
- Show a connection error banner if Supabase fetch fails (with last known state preserved until refresh)
