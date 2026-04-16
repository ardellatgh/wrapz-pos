-- WRAPZ POS — Stage 2: stock movements, cash sessions, cash movements, ledger entries
-- Run after 001_stage1_master_data.sql

-- ---------------------------------------------------------------------------
-- stock_movements (append-only; current stock = SUM(quantity_change) per item)
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items (id) on delete restrict,
  movement_type text not null,
  quantity_change integer not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint stock_movements_type_check check (
    movement_type in ('opening', 'refill', 'sale', 'adjustment')
  ),
  constraint stock_movements_qty_nonzero check (quantity_change <> 0)
);

create index stock_movements_menu_item_id_idx on public.stock_movements (menu_item_id);
create index stock_movements_created_at_idx on public.stock_movements (created_at desc);

comment on table public.stock_movements is 'Stock ledger; never update/delete rows from the app.';

-- ---------------------------------------------------------------------------
-- cash_sessions (at most one row with status = open)
-- ---------------------------------------------------------------------------
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open',
  opening_amount numeric(14, 0) not null,
  opening_notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closing_counted_amount numeric(14, 0),
  created_at timestamptz not null default now(),
  constraint cash_sessions_status_check check (status in ('open', 'closed')),
  constraint cash_sessions_opening_amount_check check (opening_amount >= 0),
  constraint cash_sessions_closing_amount_check check (
    closing_counted_amount is null or closing_counted_amount >= 0
  )
);

create unique index cash_sessions_one_open_at_a_time
  on public.cash_sessions ((1))
  where (status = 'open');

create index cash_sessions_opened_at_idx on public.cash_sessions (opened_at desc);

-- ---------------------------------------------------------------------------
-- cash_movements (append-only)
-- ---------------------------------------------------------------------------
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions (id) on delete restrict,
  movement_type text not null,
  amount numeric(14, 0) not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint cash_movements_type_check check (
    movement_type in ('opening', 'refill', 'cash_in_sale', 'cash_out_refund')
  ),
  constraint cash_movements_amount_positive check (amount > 0)
);

create index cash_movements_session_id_idx on public.cash_movements (cash_session_id);
create index cash_movements_created_at_idx on public.cash_movements (created_at desc);

-- ---------------------------------------------------------------------------
-- ledger_entries (append-only operational ledger)
-- ---------------------------------------------------------------------------
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid references public.cash_sessions (id) on delete set null,
  entry_type text not null,
  direction text not null,
  amount numeric(14, 0) not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint ledger_entries_type_check check (
    entry_type in (
      'opening_cash',
      'cash_refill',
      'cash_sale',
      'refund',
      'other'
    )
  ),
  constraint ledger_entries_direction_check check (direction in ('in', 'out')),
  constraint ledger_entries_amount_check check (amount >= 0)
);

create index ledger_entries_created_at_idx on public.ledger_entries (created_at desc);
create index ledger_entries_session_id_idx on public.ledger_entries (cash_session_id);

-- ---------------------------------------------------------------------------
-- RLS (match Stage 1 kiosk pattern)
-- ---------------------------------------------------------------------------
alter table public.stock_movements enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.ledger_entries enable row level security;

create policy "stock_movements_allow_all"
  on public.stock_movements for all
  using (true) with check (true);

create policy "cash_sessions_allow_all"
  on public.cash_sessions for all
  using (true) with check (true);

create policy "cash_movements_allow_all"
  on public.cash_movements for all
  using (true) with check (true);

create policy "ledger_entries_allow_all"
  on public.ledger_entries for all
  using (true) with check (true);
