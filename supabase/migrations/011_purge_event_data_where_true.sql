-- WRAPZ POS — Purge RPC: satisfy pg_safeupdate (DELETE must include WHERE)
-- Supabase commonly enables pg_safeupdate; bare "DELETE FROM t" inside functions then fails.
-- Run after 008. Replaces function body only; grants unchanged.

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
    delete from public.bundle_components where true;
    delete from public.discount_presets where true;
    delete from public.menu_items where true;
    delete from public.event_settings where true;
  end if;
end;
$$;

comment on function public.purge_event_data(boolean) is
  'Danger: deletes operational data; if true, also deletes menu/bundles/discounts/event_settings. Uses WHERE true for pg_safeupdate.';
