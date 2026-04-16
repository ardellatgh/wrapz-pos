-- WRAPZ POS — Stage 5: true "served" ordering for kitchen board (not updated_at)
-- Forward-only. Run after 006_order_items_kitchen_bundle_checks.sql (or latest orders migration).

alter table public.orders add column if not exists served_at timestamptz;

comment on column public.orders.served_at is
  'Set when the order is marked Served on the kitchen board; cleared when moved back out of Served.';

-- Existing served rows (pre-column): approximate served time from last row update
update public.orders
set served_at = coalesce(served_at, updated_at)
where serving_status = 'served' and served_at is null;
