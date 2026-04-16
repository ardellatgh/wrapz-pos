# Cursor Prompt — Stage 1: Foundation

---

## Context

You are building WRAPZ POS, a single-day event point-of-sale web app for a graduation stall at ITB's April 2026 wisuda. This is Stage 1 of 6.

The app is a Next.js (App Router) project deployed on Vercel. The backend is Supabase. Supabase is the ONLY persistent data source — do NOT use localStorage for any real data.

---

## What to Build in Stage 1

### 1. Project Setup
- Initialize a Next.js project with App Router
- Install dependencies: `@supabase/supabase-js`, a UI library if desired (or use Tailwind CSS directly)
- Set up Tailwind CSS with the following custom color tokens:
  - `brand-red`: primary action color (e.g. #D93025)
  - `brand-yellow`: accent/warning color (e.g. #F5C518)
  - `brand-bg`: off-white background (e.g. #FAF9F6)
  - `brand-text`: dark neutral text (e.g. #1A1A1A)
  - Optional **semantic** `success` green (muted) for narrow UI states (saved, active toggle “on”) — **not** a third brand marketing color
- Import Google Fonts: DM Serif Display (headings), Manrope (body/UI), DM Mono (numbers/labels)
- Set up Supabase client in `lib/supabase.ts` using env vars: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### 2. Stage 1 Supabase Migration (master data only)
Write and provide a SQL migration that creates **only** the Stage 1 tables:

```sql
-- event_settings (singleton)
-- menu_items (is_bundle boolean)
-- bundle_components (FK to menu_items twice)
-- discount_presets
```

Include all appropriate columns, types, FK constraints, and default values as described in the master overview for these tables. **Do not** create `orders`, `payments`, `stock_movements`, `ledger_entries`, or other transactional tables in Stage 1 — those ship with later stages (see master overview **Schema rollout by stage**).

### 3. App Shell
- Persistent left sidebar on desktop (collapsible optional)
- Navigation items: Dashboard, New Order, Menu, Discounts, Stock, Cash, Transactions, Ledger, Kitchen, Export, Settings
- Active nav item highlighted with brand-red
- Top bar with app name "WRAPZ POS" in DM Serif Display
- **Fully build** Event Settings, Menu (including bundles), and Discounts. Other routes: minimal placeholder (page title / short note pointing to the stage that implements them)

### 4. Event Settings Page (`/settings`)
- Form with fields: Event Name (text), Queue Start Number (integer, min 1, default 1), Default Low Stock Threshold (integer, default 10)
- Timezone shown as read-only: "Asia/Jakarta (UTC+7)"
- On load: fetch single row from `event_settings` table (or empty defaults if none)
- Save button: upsert to `event_settings` (use a fixed singleton ID or `ON CONFLICT DO UPDATE`)
- Show success toast on save

### 5. Menu Database Page (`/menu`)
- Tabs or toggle: "Menu Items" and "Bundles" (or show all with type indicator)
- Menu Items list: table or card grid showing name, price, type (item/bundle), active status, low stock threshold
- Add/Edit Menu Item form (modal or drawer):
  - Name (text, required)
  - Image upload (to Supabase Storage bucket `menu-images`, store URL in image_url)
  - Price (number, required)
  - Low stock threshold (number, optional — overrides event default)
  - Active toggle (default on)
  - Bundle toggle: if on, show Bundle Components sub-section
- Bundle Components sub-section (visible when is_bundle = true):
  - List of components: each row = select a non-bundle menu item + quantity
  - Can add/remove component rows
  - On save: upsert bundle_components rows, delete removed ones
- Deactivate/Activate toggle button per item (no hard delete)
- Show item type badge (Item / Bundle) in list

### 6. Discount Presets Page (`/discounts`)
- List: table with name, type, value (formatted as "10%" or "Rp 5,000"), min purchase (or "-"), active status
- Add/Edit Discount form (modal or drawer):
  - Name (text, required)
  - Type: radio or select — Percent or Fixed Amount
  - Value (number, required): labeled "%" or "Rp" based on type
  - Minimum Purchase (number, optional — 0 or blank = no minimum)
  - Active toggle
- Deactivate/Activate toggle per preset

### 7. Base UI Components
Build reusable components (in `components/ui/`):
- `Button` — variants: primary (brand-red), secondary (outline), ghost
- `Input` — text, number inputs with consistent styling
- `Label`
- `Card` — wrapper with soft shadow and rounded corners
- `Badge` — colored badge for statuses
- `Modal` or `Drawer` — for forms
- `Toast` — success/error notifications
- `Table` — base table wrapper with styled headers and rows

---

## What NOT to Build in Stage 1

- Do NOT create transactional tables (`orders`, `stock_movements`, `ledger_entries`, etc.) in the Stage 1 migration
- Do NOT build the order/payment/settlement flow
- Do NOT build the stock management page beyond a placeholder route if listed in nav
- Do NOT build the cash control page beyond a placeholder
- Do NOT build dashboard metrics logic
- Do NOT build the kitchen board
- Do NOT build the export/backup feature
- Do NOT add authentication or login
- Do NOT use localStorage for any persistent data

---

## Design Constraints

- Background color: brand-bg (off-white)
- Primary actions: brand-red buttons
- Warnings/accents: brand-yellow
- Headings use DM Serif Display
- Body and UI use Manrope
- Numbers, queue numbers, metadata: DM Mono
- Rounded corners: refined (8–12px range), not overly bubbly
- Soft shadows: sparingly
- The UI must look clean, warm, and operational — not a marketing page

---

## Acceptance Criteria

- [ ] Supabase client is configured and connects successfully using env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
- [ ] SQL migration creates **only** the four Stage 1 master-data tables with correct types and constraints
- [ ] Event Settings saves to and loads from Supabase
- [ ] Menu items can be created, edited, deactivated (no hard delete)
- [ ] Bundle items can be created with components (add/remove component rows)
- [ ] Bundle components are saved to `bundle_components` table correctly
- [ ] Images upload to Supabase Storage and URL is stored in `menu_items.image_url`
- [ ] Discount presets can be created, edited, deactivated
- [ ] App shell and nav links exist; non–Stage 1 routes are placeholders
- [ ] Visual design matches the color/font direction (off-white, red, yellow; optional narrow semantic green)
- [ ] No localStorage used for any real data
- [ ] No order/payment/stock/kitchen/dashboard **logic** built yet

---

## Warnings

- Do NOT put the full 12-table schema into Stage 1 — later stages own their DDL
- Do NOT create a localStorage-based data layer "as a temp solution" — it will cause migration pain later
- Do NOT refactor or change scaffolding carelessly once later stages add pages to it
- Do NOT overengineer the UI component library — basic, reusable, and consistent is the goal
- Do NOT add speculative features (multi-user, roles, complex filtering) — they are not in scope
- Supabase Storage bucket `menu-images` must exist and be set to public read — note this as a manual setup step for the developer
