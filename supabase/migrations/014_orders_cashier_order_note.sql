-- New Order notes: persisted on order, shown in Kitchen as cashier-facing order note.
alter table public.orders add column if not exists cashier_order_note text;

comment on column public.orders.cashier_order_note is
  'Optional note entered at New Order; visible on kitchen board with other cashier-facing notes.';
