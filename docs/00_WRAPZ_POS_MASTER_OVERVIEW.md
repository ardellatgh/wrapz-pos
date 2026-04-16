# WRAPZ POS — Master Overview
### Wisuda April ITB 2026

---

## What This Is

WRAPZ POS is a lightweight, single-day event POS system built for a graduation merchandise/food stall at ITB's April 2026 wisuda. It is a web app hosted on Vercel, backed by Supabase as the persistent source of truth.

The system is designed for:
- One cashier operating on a laptop
- One kitchen/serving team viewing a kanban board on an iPad or secondary browser screen

---

## V1 Scope — What Gets Built

| Module | Included |
|---|---|
| Event Settings | ✅ |
| Menu Database (items + bundles) | ✅ |
| Discount Presets | ✅ |
| Opening Stock + Refill | ✅ |
| Opening Cash + Cash Refill + Closing Reconciliation | ✅ |
| Cashier New Order Flow | ✅ |
| Payment (single method initial) | ✅ |
| Settlement (underpay / overpay) | ✅ |
| Confirmation Board | ✅ |
| Transactions Log | ✅ |
| Operational Ledger | ✅ |
| Kitchen / Serving Kanban Board | ✅ |
| Dashboard (key metrics) | ✅ |
| Full TSV Backup Export (ZIP) | ✅ |

---

## Non-Goals — What Is NOT Built

- No login system
- No passcode / authentication
- No void transactions
- No ingredient-level inventory
- No supplier / purchase order / procurement
- No accounting system
- No staff permissions
- No multi-branch, multi-day, or multi-event support
- No split payment at initial payment step
- No loyalty or CRM features

---

## Architecture Summary

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router recommended) |
| Hosting | Vercel |
| Database + Backend | Supabase (Postgres) |
| File Storage | Supabase Storage (menu images) |
| Auth | None (Supabase publishable key only — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) |
| Export | Client-side: fetch from Supabase → TSV → ZIP |

**Supabase is the source of truth from Stage 1. No localStorage-first architecture.**

---

## Design Direction Summary

**Brand color palette:**
- **Off-white:** page backgrounds, surfaces
- **Red:** primary buttons, active states, queue number emphasis
- **Yellow:** accents, warnings, KPI highlights
- **Dark neutral:** body text

**Semantic green (not brand):** Where the UI needs a clear “OK / success / paid / inflow” signal (badges, checkmarks, ledger direction IN), use a **limited** success green. It is a **semantic helper**, not a third brand color next to red and yellow.

**Typography:**
- Display/headings: DM Serif Display (or similar)
- UI/body/forms: Manrope (or similar)
- Queue numbers/compact data: DM Mono (or similar)

**Component style:**
- Rounded corners, refined (not bubbly)
- Soft shadows sparingly
- Clear spacing and hierarchy
- Serving board: bold, high contrast, large text
- Dashboard: clean and premium

---

## Schema Rollout by Stage

Migrations are **staged** so Stage 1 does not ship the full transactional schema before those features exist.

| Stage | Tables introduced (add to Postgres as that stage is built) |
|---|---|
| **1** | `event_settings`, `menu_items`, `bundle_components`, `discount_presets` |
| **2** | `stock_movements`, `cash_sessions`, `cash_movements`, `ledger_entries` (plus enums / columns those flows need) |
| **3** | `orders`, `order_items`, `payments`, `settlements` (extends `ledger_entries` / `cash_movements` / `stock_movements` usage) |

Later stages primarily **consume** these tables; they do not redefine Stage 1 master data.

**Full logical model (all tables):** `event_settings`, `menu_items`, `bundle_components`, `discount_presets`, `stock_movements`, `cash_sessions`, `cash_movements`, `orders`, `order_items`, `payments`, `settlements`, `ledger_entries`.

---

## Implementation Constraints

1. Supabase is truth from Day 1 — not localStorage
2. Queue number is assigned at ORDER CREATION time
3. Stock is computed from stock_movements (not a mutable field on menu_items)
4. One discount per order — enforced at app layer
5. No void feature — do not add it
6. UTC+7 display throughout (store UTC in Supabase)
7. Snapshots: item name and price are snapshotted in order_items at time of order
8. No authentication — browser uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with RLS/policies appropriate to this deployment
9. Serving board: polling/refresh is acceptable, no need for complex realtime
10. Export is client-side (no server-side export function)

---

## Stage Roadmap

| Stage | Focus |
|---|---|
| Stage 1 | Foundation: app shell, visual system, Supabase for **master data** (event settings, menu, bundles, discount presets) — **master-data tables only** in the Stage 1 migration |
| Stage 2 | Stock and Cash Control: opening stock, refill, low stock logic, opening cash, cash refill, closing summary |
| Stage 3 | Order, Payment, Settlement: full cashier flow, cart, discount, payment, settlement, confirmation |
| Stage 4 | Transactions and Ledger: full transaction log, operational ledger |
| Stage 5 | Kitchen and Serving Board: kanban, line-item checklist, readiness rules |
| Stage 6 | Dashboard, Export, and Polish: metrics, TSV backup, empty states, final QA readiness |

---

## Key Pages

| Route | Page |
|---|---|
| `/dashboard` | Dashboard |
| `/settings` | Event Settings |
| `/menu` | Menu Database |
| `/discounts` | Discount Database |
| `/stock` | Stock Management |
| `/cash` | Cash Control |
| `/order/new` | New Order (Cashier) |
| `/order/:id/payment` | Payment |
| `/order/:id/settlement` | Settlement |
| `/order/:id/confirmation` | Confirmation Board |
| `/transactions` | Transactions Log |
| `/ledger` | Ledger |
| `/kitchen` | Kitchen / Serving Board |
| `/export` | Export / Backup |

---

## Data Model Summary (Key Tables)

- `event_settings` — singleton event config
- `menu_items` — all sellable items (including bundles via is_bundle flag)
- `bundle_components` — component items per bundle
- `discount_presets` — preset discounts
- `orders` — all orders
- `order_items` — line items per order (with snapshots)
- `payments` — initial payment records
- `settlements` — settlement records
- `stock_movements` — stock ledger (current stock = SUM)
- `cash_sessions` — cash float session
- `cash_movements` — cash movement events
- `ledger_entries` — unified operational ledger

---

*This document is the master reference. All stage-level Cursor prompts derive from this.*
