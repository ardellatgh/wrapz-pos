-- WRAPZ POS — Stage 5: kitchen / serving board
-- Forward-only: extends serving workflow and line-item checklist.
-- Run after 003_stage3_orders_payment_settlement.sql

-- ---------------------------------------------------------------------------
-- orders.serving_status — full kitchen column lifecycle
-- ---------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_serving_status_check;

alter table public.orders
  add constraint orders_serving_status_check check (
    serving_status in (
      'not_sent',
      'queued',
      'in_progress',
      'ready_to_serve',
      'served'
    )
  );

comment on column public.orders.serving_status is
  'Kitchen path: not_sent (hidden from board), queued → in_progress → ready_to_serve → served.';

-- ---------------------------------------------------------------------------
-- order_items — per-line checklist (one row = one checkbox, not per unit)
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists is_checked boolean not null default false;

comment on column public.order_items.is_checked is
  'Kitchen checklist: entire line (all units) ready when true.';

create index if not exists order_items_order_id_checked_idx
  on public.order_items (order_id, is_checked);
