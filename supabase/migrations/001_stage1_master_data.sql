-- WRAPZ POS — Stage 1 master data only
-- Run in Supabase SQL Editor (or via Supabase CLI) before using the app.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- event_settings (singleton row expected; app upserts by id)
-- ---------------------------------------------------------------------------
create table public.event_settings (
  id uuid primary key default gen_random_uuid(),
  event_name text not null default '',
  queue_start integer not null default 1,
  default_low_stock_threshold integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_settings_queue_start_check check (queue_start >= 1),
  constraint event_settings_low_stock_check check (default_low_stock_threshold >= 0)
);

comment on table public.event_settings is 'Singleton-style event configuration (app uses first row or fixed id).';

-- ---------------------------------------------------------------------------
-- menu_items (regular + bundle rows via is_bundle)
-- ---------------------------------------------------------------------------
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  price numeric(14, 0) not null default 0,
  low_stock_threshold integer,
  is_active boolean not null default true,
  is_bundle boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_items_price_check check (price >= 0),
  constraint menu_items_low_stock_check check (low_stock_threshold is null or low_stock_threshold >= 0)
);

create index menu_items_is_active_idx on public.menu_items (is_active);
create index menu_items_is_bundle_idx on public.menu_items (is_bundle);

-- ---------------------------------------------------------------------------
-- bundle_components (components for bundle menu_items only)
-- ---------------------------------------------------------------------------
create table public.bundle_components (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.menu_items (id) on delete cascade,
  component_item_id uuid not null references public.menu_items (id) on delete restrict,
  quantity integer not null default 1,
  created_at timestamptz not null default now(),
  constraint bundle_components_qty_check check (quantity > 0),
  constraint bundle_components_no_self check (bundle_id <> component_item_id),
  constraint bundle_components_unique_component unique (bundle_id, component_item_id)
);

create index bundle_components_bundle_id_idx on public.bundle_components (bundle_id);

-- ---------------------------------------------------------------------------
-- discount_presets
-- ---------------------------------------------------------------------------
create table public.discount_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discount_type text not null,
  value numeric(14, 2) not null,
  min_purchase numeric(14, 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discount_presets_type_check check (discount_type in ('percent', 'fixed')),
  constraint discount_presets_value_check check (value >= 0),
  constraint discount_presets_min_purchase_check check (min_purchase is null or min_purchase >= 0)
);

create index discount_presets_is_active_idx on public.discount_presets (is_active);

-- ---------------------------------------------------------------------------
-- RLS: permissive policies for single-event kiosk use with publishable key
-- Tighten policies before any production exposure beyond trusted devices.
-- ---------------------------------------------------------------------------
alter table public.event_settings enable row level security;
alter table public.menu_items enable row level security;
alter table public.bundle_components enable row level security;
alter table public.discount_presets enable row level security;

create policy "event_settings_allow_all"
  on public.event_settings for all
  using (true) with check (true);

create policy "menu_items_allow_all"
  on public.menu_items for all
  using (true) with check (true);

create policy "bundle_components_allow_all"
  on public.bundle_components for all
  using (true) with check (true);

create policy "discount_presets_allow_all"
  on public.discount_presets for all
  using (true) with check (true);
