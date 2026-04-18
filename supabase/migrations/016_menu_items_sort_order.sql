-- Manual POS menu display order (Menu page drag-and-drop, New Order grid).
-- Safe additive migration: backfill from existing created_at order.

alter table public.menu_items add column if not exists sort_order integer;

update public.menu_items m
set sort_order = sub.ord
from (
  select id, (row_number() over (order by created_at asc)) - 1 as ord
  from public.menu_items
) sub
where m.id = sub.id and (m.sort_order is null);

alter table public.menu_items alter column sort_order set default 0;
update public.menu_items set sort_order = 0 where sort_order is null;
alter table public.menu_items alter column sort_order set not null;

create index if not exists menu_items_sort_order_idx on public.menu_items (sort_order);

comment on column public.menu_items.sort_order is 'Display order for POS menu (lower = earlier). Managed from Menu page.';
