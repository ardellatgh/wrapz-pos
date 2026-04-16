# Cursor Prompt — Stage 5: Kitchen and Serving Board

---

## Context

WRAPZ POS Stages 1–4 are complete. The app handles: menu/bundle/discount management, stock and cash control, order creation, payment, settlement, transactions, and ledger. All data is in Supabase.

Stage 5 builds the kitchen kanban board — a separate operational view for the kitchen/serving team, optimized for iPad readability.

Do NOT modify Stage 1–4 functionality. This is a new page with new interactions.

---

## What to Build in Stage 5

### 1. Kitchen / Serving Board Page (`/kitchen`)

**Layout:**
- Four-column kanban layout (horizontal scroll on small screens)
- Columns: Queued | In Progress | Ready to Serve | Served
- Each column has a header with the column name and count of cards in that column
- Column header color accents:
  - Queued: neutral gray
  - In Progress: brand-yellow accent
  - Ready to Serve: **semantic success green** accent (readiness — not a brand color alongside red/yellow)
  - Served: light gray, muted

**Data fetching:**
- On load + on every poll interval: fetch all orders WHERE serving_status ≠ 'not_sent'
- Also fetch all order_items for those orders
- Poll interval: every 20 seconds
- Show "Last updated: X seconds ago" counter
- Show a "Refresh" button (large, easily tappable on iPad)
- If fetch fails: show error banner "Could not refresh. Showing last known data." — do NOT clear the board

---

### 2. Order Cards

Each card in a column shows:

**Queue Number:**
- Very large text (min 36px, recommend 48px)
- DM Mono font
- Brand-red color
- Most prominent element on card

**Customer Name:**
- If provided: show below queue number in smaller text (14–16px)
- If not provided: omit entirely

**Line Items Checklist:**
- One row per order_item
- Each row: checkbox (or circle toggle) + item name + "× quantity"
- Example: `[ ] Wrap Ayam Crispy × 2`
- Touch target per row: minimum 44px height
- When checked: row shows strikethrough and is visually de-emphasized (lighter color)
- Checkbox state: `order_items.is_checked`

**Card actions (based on column):**

*In Queued column:*
- "Start" button → moves card to In Progress (UPDATE orders.serving_status = 'in_progress')

*In In Progress column:*
- Checklist items
- "Mark Ready" button:
  - DISABLED (grayed out) if any order_item.is_checked = false
  - ENABLED (**semantic** green/active affordance when enabled) when ALL order_items for this order have is_checked = true
  - On click: UPDATE orders.serving_status = 'ready_to_serve'

*In Ready to Serve column:*
- "Served" button (**semantic** green, prominent — success/complete action, not brand green) → UPDATE orders.serving_status = 'served'

*In Served column:*
- No action buttons
- Cards shown in muted/gray style
- Column is scrollable; older served orders remain visible

---

### 3. Checkbox Interaction

On checkbox tap/click:
1. Optimistically toggle UI state immediately (for responsiveness on iPad)
2. UPDATE `order_items` in Supabase: `is_checked = !current_value`
3. On success: keep updated state
4. On failure: revert to prior state + show brief error toast

---

### 4. Fullscreen / Kiosk Mode

- Add a "Fullscreen" toggle button in the top-right corner of the kitchen page
- On activate: hides the sidebar nav, maximizes the kanban area, button changes to "Exit Fullscreen"
- This is important for iPad use — the kitchen team should see only the board
- Use browser fullscreen API if desired, or simply CSS-based hide nav approach

---

### 5. Responsive Design for iPad

- Target: iPad Pro 11" or 12.9" in landscape mode (1194px+ wide)
- Four columns should be visible side by side
- Cards should have generous padding and large touch targets
- Font sizes must be larger than typical desktop UI:
  - Queue number: 40–48px
  - Item names in checklist: 16–18px
  - Column headers: 20–24px
- Avoid hover-only states — all interactions must work on touch

---

## What NOT to Build in Stage 5

- Do NOT add financial data (amounts, payments) to kitchen cards
- Do NOT build notifications or push alerts
- Do NOT implement Supabase realtime subscriptions — use polling
- Do NOT add a "move back" functionality (v1 is one-directional)
- Do NOT modify cashier or payment flows
- Do NOT build dashboard or export

---

## Acceptance Criteria

- [ ] Kitchen page shows four columns: Queued, In Progress, Ready to Serve, Served
- [ ] Orders with serving_status ≠ 'not_sent' appear in the correct column
- [ ] Each card shows: queue number (large, DM Mono, red), customer name (if any), checklist of order items
- [ ] Checklist is per LINE ITEM (not per unit) — one row per order_item record
- [ ] Checking/unchecking a checklist item updates `order_items.is_checked` in Supabase
- [ ] "Mark Ready" button is disabled until all items in the order are checked
- [ ] Moving Queued → In Progress works via "Start" button
- [ ] Moving In Progress → Ready to Serve works via "Mark Ready" (only when all checked)
- [ ] Moving Ready to Serve → Served works via "Served" button
- [ ] Board auto-refreshes every 20 seconds
- [ ] "Last updated X seconds ago" counter is shown
- [ ] Manual "Refresh" button works
- [ ] Error banner shown if fetch fails; last known board state preserved
- [ ] Fullscreen toggle hides nav and expands board
- [ ] Board is usable on iPad (large touch targets, large text)
- [ ] All column header colors follow the design direction

---

## Warnings

- Do NOT use Supabase realtime subscriptions — polling is intentional and sufficient for this event
- Do NOT add financial information to kitchen cards
- Do NOT allow moving cards backwards between columns
- Do NOT clear the board if a refresh fails — always preserve last known state
- Preserve all Stage 1–4 functionality
- Do NOT modify the order flow or payment logic
