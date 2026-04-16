-- WRAPZ POS — Stage 5: per-component kitchen checklist for bundle order lines
-- Forward-only. One order_item row per bundle; component checks stored as JSON map.
-- Run after 005_stage5_kitchen_operational_note.sql (or any prior order_items migration).

alter table public.order_items add column if not exists kitchen_bundle_checks jsonb not null default '{}'::jsonb;

comment on column public.order_items.kitchen_bundle_checks is
  'Kitchen-only: object mapping bundle component menu_item_id (uuid string) to checked boolean.';
