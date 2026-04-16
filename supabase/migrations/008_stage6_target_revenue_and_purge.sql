-- WRAPZ POS — Stage 6: dashboard target revenue + safe ordered purge RPC
-- Forward-only. Run on Supabase after prior migrations.

-- ---------------------------------------------------------------------------
-- event_settings.target_revenue (optional goal for dashboard progress)
-- ---------------------------------------------------------------------------
alter table public.event_settings add column if not exists target_revenue numeric(14, 0);

comment on column public.event_settings.target_revenue is
  'Optional event sales goal (IDR, whole rupiah). Null or zero = no target on dashboard.';

-- ---------------------------------------------------------------------------
-- purge_event_data: delete rows in FK-safe order (invoker = respects RLS)
-- ---------------------------------------------------------------------------
create or replace function public.purge_event_data(p_include_master boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.ledger_entries;
  delete from public.cash_movements;
  delete from public.settlements;
  delete from public.payments;
  delete from public.orders;
  delete from public.stock_movements;
  delete from public.cash_sessions;

  if p_include_master then
    delete from public.bundle_components;
    delete from public.discount_presets;
    delete from public.menu_items;
    delete from public.event_settings;
  end if;
end;
$$;

comment on function public.purge_event_data(boolean) is
  'Danger: deletes operational data; if true, also deletes menu/bundles/discounts/event_settings.';

revoke all on function public.purge_event_data(boolean) from public;
grant execute on function public.purge_event_data(boolean) to anon;
grant execute on function public.purge_event_data(boolean) to authenticated;
grant execute on function public.purge_event_data(boolean) to service_role;
