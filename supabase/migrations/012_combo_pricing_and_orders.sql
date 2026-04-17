-- WRAPZ POS — Combo / package pricing + order snapshot columns
-- Forward-only. Run after 011_purge_event_data_where_true.sql

-- ---------------------------------------------------------------------------
-- event_settings: combo auto-apply
-- ---------------------------------------------------------------------------
alter table public.event_settings
  add column if not exists combo_auto_apply boolean not null default true;

comment on column public.event_settings.combo_auto_apply is
  'When true, new order flow applies best eligible combo packages automatically. When false, cashier uses Apply Best Combo.';

-- ---------------------------------------------------------------------------
-- combo_groups: eligibility buckets (e.g. Ayam wraps, Drinks)
-- ---------------------------------------------------------------------------
create table public.combo_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index combo_groups_is_active_idx on public.combo_groups (is_active);

comment on table public.combo_groups is 'Named groups of menu items used by combo package slot requirements.';

-- ---------------------------------------------------------------------------
-- combo_group_members: menu_item belongs to a group
-- ---------------------------------------------------------------------------
create table public.combo_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.combo_groups (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint combo_group_members_unique unique (group_id, menu_item_id)
);

create index combo_group_members_group_id_idx on public.combo_group_members (group_id);
create index combo_group_members_menu_item_id_idx on public.combo_group_members (menu_item_id);

-- ---------------------------------------------------------------------------
-- combo_packages: named package with fixed price and priority
-- ---------------------------------------------------------------------------
create table public.combo_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  package_price numeric(14, 0) not null,
  priority integer not null default 0,
  is_active boolean not null default true,
  is_configured boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint combo_packages_price_check check (package_price >= 0)
);

create index combo_packages_active_priority_idx on public.combo_packages (is_active, priority desc);

comment on table public.combo_packages is 'Fixed-price combo/package definitions; matcher uses priority (higher first).';
comment on column public.combo_packages.is_configured is
  'When false, matcher skips this package (placeholder e.g. Family until rules are finalized).';

-- ---------------------------------------------------------------------------
-- combo_package_slots: per-package requirements (group + quantity)
-- ---------------------------------------------------------------------------
create table public.combo_package_slots (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.combo_packages (id) on delete cascade,
  group_id uuid not null references public.combo_groups (id) on delete restrict,
  quantity integer not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint combo_package_slots_qty_check check (quantity > 0)
);

create index combo_package_slots_package_id_idx on public.combo_package_slots (package_id);
create index combo_package_slots_group_id_idx on public.combo_package_slots (group_id);

-- ---------------------------------------------------------------------------
-- orders: persisted combo trace (list subtotal unchanged)
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists combo_savings_amount numeric(14, 0) not null default 0;

alter table public.orders
  add column if not exists combo_snapshot jsonb;

comment on column public.orders.combo_savings_amount is
  'Total list price minus package prices for matched combo applications (non-negative; only applications that reduce list vs package price).';

alter table public.orders drop constraint if exists orders_combo_savings_nonneg_check;

alter table public.orders
  add constraint orders_combo_savings_nonneg_check check (combo_savings_amount >= 0);

comment on column public.orders.combo_snapshot is
  'JSON trace of applied combo packages at order time for receipts and transparency.';

-- ---------------------------------------------------------------------------
-- RLS (same kiosk pattern as prior stages)
-- ---------------------------------------------------------------------------
alter table public.combo_groups enable row level security;
alter table public.combo_group_members enable row level security;
alter table public.combo_packages enable row level security;
alter table public.combo_package_slots enable row level security;

create policy "combo_groups_allow_all"
  on public.combo_groups for all
  using (true) with check (true);

create policy "combo_group_members_allow_all"
  on public.combo_group_members for all
  using (true) with check (true);

create policy "combo_packages_allow_all"
  on public.combo_packages for all
  using (true) with check (true);

create policy "combo_package_slots_allow_all"
  on public.combo_package_slots for all
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Purge: delete combo master data before menu_items / event_settings
-- ---------------------------------------------------------------------------
create or replace function public.purge_event_data(p_include_master boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.ledger_entries where true;
  delete from public.cash_movements where true;
  delete from public.settlements where true;
  delete from public.payments where true;
  delete from public.orders where true;
  delete from public.stock_movements where true;
  delete from public.cash_sessions where true;

  if p_include_master then
    delete from public.combo_package_slots where true;
    delete from public.combo_packages where true;
    delete from public.combo_group_members where true;
    delete from public.combo_groups where true;
    delete from public.bundle_components where true;
    delete from public.discount_presets where true;
    delete from public.menu_items where true;
    delete from public.event_settings where true;
  end if;
end;
$$;

comment on function public.purge_event_data(boolean) is
  'Danger: deletes operational data; if true, also deletes combo rules, menu/bundles/discounts/event_settings. Uses WHERE true for pg_safeupdate.';
