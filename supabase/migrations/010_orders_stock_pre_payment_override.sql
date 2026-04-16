-- WRAPZ POS — Pre-payment stock override audit (new order flow)
-- Forward-only. Run after prior orders migrations.

alter table public.orders add column if not exists stock_pre_payment_overridden boolean not null default false;

alter table public.orders add column if not exists stock_pre_payment_override_at timestamptz;

comment on column public.orders.stock_pre_payment_overridden is
  'Cashier confirmed physical stock despite computed shortfall before payment.';

comment on column public.orders.stock_pre_payment_override_at is
  'Timestamp when pre-payment stock override was confirmed.';
