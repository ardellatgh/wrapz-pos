# Stage 1 Brief — Foundation
## App Shell + Visual System + Master Data

---

## Why This Stage Exists

Stage 1 creates the skeleton that everything else is built on: working routes for the **app shell**, a live Supabase connection for **master data**, a stable schema for that slice of the data model, and a consistent visual system.

This stage is NOT just scaffolding. It produces real, working, Supabase-backed CRUD for:
- Event Settings
- Menu Items (including bundle type)
- Bundle Components
- Discount Presets

Transactional tables (orders, payments, stock movements, ledger, and so on) are introduced in **later stages** with their own migrations. Stage 1 must **not** create the full app schema.

---

## What Is In Scope for Stage 1

- Next.js project setup (App Router)
- Vercel deployment configuration
- Supabase connection for master data (env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
- Visual design foundation: color tokens, typography setup, base component styles (**off-white** background, **red** primary, **yellow** accents — see UI Direction)
- **App shell:** nav/sidebar, layout, page structure
- Nav may include links to routes that remain **minimal placeholders** (title or short “built in Stage X” copy) until those stages ship — **implementation depth** in Stage 1 is master data only
- Event Settings page — fully functional, backed by Supabase
- Menu Database page — fully functional CRUD, backed by Supabase (items + bundles)
- Bundle management — fully functional via `menu_items.is_bundle` + `bundle_components`, backed by Supabase
- Discount Presets page — fully functional CRUD, backed by Supabase
- **Supabase SQL migration: Stage 1 master-data tables only** (see Schema Direction)
- Image upload to Supabase Storage for menu items

---

## What Is Out of Scope for Stage 1

- Database tables outside the Stage 1 master-data set (no `orders`, `stock_movements`, `ledger_entries`, etc. in this migration)
- Order flow (Stage 3)
- Payment and settlement (Stage 3)
- Stock management (Stage 2)
- Cash control (Stage 2)
- Transactions and ledger (Stage 4)
- Kitchen board (Stage 5)
- Dashboard metrics (Stage 6)
- Export (Stage 6)

---

## Page-Level Intent

### Event Settings (`/settings`)
- Singleton: one row in `event_settings` table
- Fields: event name, timezone (display only — locked to Asia/Jakarta), queue start number (default 1), default low stock threshold (default 10)
- Save persists to Supabase

### Menu Database (`/menu`)
- List view: show all menu items (regular + bundles), with name, price, active status, low stock threshold
- Add/Edit form: name, image upload, price, low stock threshold override, is_active toggle, is_bundle toggle
- Bundle mode: when is_bundle = true, show bundle component editor (add component items + quantity per component)
- Activate/deactivate toggle per item
- Soft delete only (deactivate, never hard delete)

### Discount Presets (`/discounts`)
- List: all presets with name, type, value, min purchase, active status
- Add/Edit: name, type (percent/fixed), value, optional min_purchase, is_active
- Activate/deactivate toggle

---

## Supabase Schema Direction (Stage 1 only)

Stage 1 ships **one migration** that creates **only** these tables:

| Table | Purpose |
|---|---|
| `event_settings` | Singleton event configuration |
| `menu_items` | All sellable rows (regular + bundles via `is_bundle`) |
| `bundle_components` | Components per bundle (FKs to `menu_items`) |
| `discount_presets` | Preset discounts |

Follow column types, FKs, and defaults described in the master overview / downstream briefs as they apply to these tables.

**Introduced in later stages (not in the Stage 1 migration):** `stock_movements`, `cash_sessions`, `cash_movements`, `orders`, `order_items`, `payments`, `settlements`, `ledger_entries` — see master overview **Schema rollout by stage**.

**Decisions locked with Stage 1 master data:**
- `menu_items.is_bundle` — bundle vs regular item
- `bundle_components.bundle_id` and `bundle_components.component_item_id` — both reference `menu_items`
- `order_items` snapshots (`item_name`, `item_price`) and `orders.queue_number` are specified for Stages 3+ when those tables exist

---

## UI Direction for Stage 1

- Implement the **brand** palette via CSS custom properties or Tailwind config:
  - `--color-bg`: off-white (e.g. #FAF9F6 or similar)
  - `--color-primary`: red (e.g. #D93025 or similar)
  - `--color-accent`: yellow (e.g. #F5C518 or similar)
  - `--color-text`: dark neutral (e.g. #1A1A1A)
- **Semantic green (optional, narrow):** if a control needs a clear success state (e.g. “Saved”), use a muted success green as a **helper only** — not a brand accent alongside red and yellow.
- Google Fonts: DM Serif Display, Manrope, DM Mono
- Reusable base components: Button (primary/secondary/ghost), Input, Card, Badge, Table, Modal/Drawer
- App shell: persistent left sidebar on desktop, top nav on mobile
- Navigation items reflect the full product IA (Dashboard, New Order, Menu, Discounts, Stock, Cash, Transactions, Ledger, Kitchen, Export, Settings); **only** Settings, Menu, and Discounts are fully implemented in Stage 1
- Active nav item: highlighted in red

---

## Operational Constraints

- All form saves go to Supabase — no localStorage
- Menu items that later gain order references cannot be hard-deleted — only deactivated (enforced once `orders` / `order_items` exist)
- Bundle items do not have stock — when `stock_movements` exists (Stage 2+), entries must not reference `menu_items` where `is_bundle = true`
- Queue start number: when `orders` exists (Stage 3+), warn before changing if any orders already exist

---

## What Later Stages Depend On from Stage 1

| Dependency | Used by Stage |
|---|---|
| `menu_items` table and data | 2, 3, 5 |
| `bundle_components` table | 3 |
| `discount_presets` table | 3 |
| `event_settings.queue_start` | 3 |
| `event_settings.default_low_stock_threshold` | 2 |
| Visual design system (colors, fonts, components) | All |
| App shell and routing structure | All |
| Supabase client setup | All |

---

## Practical Notes

- The developer supplies:
  - Supabase project URL
  - Supabase **publishable** key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the public client key from the Supabase dashboard)
  - Set in `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`
- Image uploads: Supabase Storage bucket `menu-images` with public read access
- Use Supabase JS client v2 (`@supabase/supabase-js`)
- No end-user auth — RLS/policies should allow access appropriate for this single-event, publishable-key deployment
