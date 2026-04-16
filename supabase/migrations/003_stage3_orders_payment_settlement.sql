-- WRAPZ POS — Stage 3: orders, order_items, payments, settlements
-- Safe forward migration: extends Stage 2 tables additively where needed.
-- Run after 002_stage2_stock_cash_ledger.sql

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  queue_number integer not null,
  customer_name text,
  subtotal numeric(14, 0) not null,
  discount_type text not null,
  discount_preset_id uuid references public.discount_presets (id) on delete set null,
  discount_label text,
  discount_manual_percent numeric(7, 2),
  discount_manual_fixed numeric(14, 0),
  discount_amount numeric(14, 0) not null default 0,
  total_amount numeric(14, 0) not null,
  payment_status text not null default 'pending',
  serving_status text not null default 'not_sent',
  stock_deducted boolean not null default false,
  manually_overridden_to_serving boolean not null default false,
  payment_notes text,
  settlement_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_discount_type_check check (
    discount_type in ('none', 'preset', 'manual_percent', 'manual_fixed')
  ),
  constraint orders_payment_status_check check (
    payment_status in ('pending', 'partially_paid', 'paid')
  ),
  constraint orders_serving_status_check check (serving_status in ('not_sent', 'queued')),
  constraint orders_queue_number_check check (queue_number >= 1),
  constraint orders_subtotal_check check (subtotal >= 0),
  constraint orders_discount_amount_check check (discount_amount >= 0),
  constraint orders_total_amount_check check (total_amount >= 0)
);

create unique index orders_queue_number_uidx on public.orders (queue_number);
create index orders_created_at_idx on public.orders (created_at desc);
create index orders_payment_status_idx on public.orders (payment_status);

comment on table public.orders is 'Cashier orders; queue_number unique per event (single-cashier MAX+1 assignment in app).';

-- ---------------------------------------------------------------------------
-- order_items (snapshots at order time)
-- ---------------------------------------------------------------------------
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete restrict,
  item_name text not null,
  item_price numeric(14, 0) not null,
  quantity integer not null,
  line_total numeric(14, 0) not null,
  created_at timestamptz not null default now(),
  constraint order_items_quantity_check check (quantity > 0),
  constraint order_items_price_check check (item_price >= 0),
  constraint order_items_line_total_check check (line_total >= 0)
);

create index order_items_order_id_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- payments (exactly one initial payment row per order)
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  method text not null,
  amount_tendered numeric(14, 0) not null,
  is_exact boolean not null,
  created_at timestamptz not null default now(),
  constraint payments_method_check check (method in ('cash', 'qris', 'transfer')),
  constraint payments_amount_check check (amount_tendered >= 0),
  constraint payments_one_per_order unique (order_id)
);

create index payments_order_id_idx on public.payments (order_id);

-- ---------------------------------------------------------------------------
-- settlements (additional collection, refunds, adjustments — append-only)
-- ---------------------------------------------------------------------------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  method text not null,
  settlement_type text not null,
  amount numeric(14, 0) not null,
  is_adjustment boolean not null default false,
  adjustment_amount numeric(14, 0),
  notes text,
  created_at timestamptz not null default now(),
  constraint settlements_method_check check (method in ('cash', 'qris', 'transfer')),
  constraint settlements_type_check check (settlement_type in ('collect', 'refund')),
  constraint settlements_amount_check check (amount > 0)
);

create index settlements_order_id_idx on public.settlements (order_id);
create index settlements_created_at_idx on public.settlements (created_at desc);

-- ---------------------------------------------------------------------------
-- Stage 2 extensions: stock_movements → link to orders
-- ---------------------------------------------------------------------------
alter table public.stock_movements
  add column if not exists reference_order_id uuid references public.orders (id) on delete set null;

create index if not exists stock_movements_reference_order_id_idx
  on public.stock_movements (reference_order_id);

alter table public.stock_movements drop constraint if exists stock_movements_type_check;

alter table public.stock_movements
  add constraint stock_movements_type_check check (
    movement_type in (
      'opening',
      'refill',
      'sale',
      'adjustment',
      'manual_override_sale'
    )
  );

-- ---------------------------------------------------------------------------
-- Stage 2 extensions: ledger_entries → link to orders + wider entry types
-- ---------------------------------------------------------------------------
alter table public.ledger_entries
  add column if not exists order_id uuid references public.orders (id) on delete set null;

create index if not exists ledger_entries_order_id_idx on public.ledger_entries (order_id);

alter table public.ledger_entries drop constraint if exists ledger_entries_type_check;

alter table public.ledger_entries
  add constraint ledger_entries_type_check check (
    entry_type in (
      'opening_cash',
      'cash_refill',
      'cash_sale',
      'refund',
      'other',
      'payment_cash',
      'payment_qris',
      'payment_transfer',
      'settlement_cash',
      'settlement_qris',
      'settlement_transfer',
      'refund_cash',
      'adjustment'
    )
  );

-- ---------------------------------------------------------------------------
-- Stage 2 extensions: cash_movements → optional order link
-- ---------------------------------------------------------------------------
alter table public.cash_movements
  add column if not exists order_id uuid references public.orders (id) on delete set null;

create index if not exists cash_movements_order_id_idx on public.cash_movements (order_id);

-- ---------------------------------------------------------------------------
-- RLS (kiosk / publishable key — same pattern as prior stages)
-- ---------------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.settlements enable row level security;

create policy "orders_allow_all"
  on public.orders for all
  using (true) with check (true);

create policy "order_items_allow_all"
  on public.order_items for all
  using (true) with check (true);

create policy "payments_allow_all"
  on public.payments for all
  using (true) with check (true);

create policy "settlements_allow_all"
  on public.settlements for all
  using (true) with check (true);
