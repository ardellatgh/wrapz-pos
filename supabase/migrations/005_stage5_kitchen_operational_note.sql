-- WRAPZ POS — Stage 5 extension: kitchen operational note (optional, trackable)
-- Forward-only. Run after 004_stage5_kitchen_serving.sql

alter table public.orders add column if not exists kitchen_operational_note text;

comment on column public.orders.kitchen_operational_note is
  'Short operational / problem note visible on the kitchen board; kitchen-editable.';
