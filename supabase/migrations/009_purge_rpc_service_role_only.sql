-- WRAPZ POS — Stage 6 follow-up: purge RPC not callable with publishable (anon) key
-- Requires migration 008 (function exists). Run after 008 on Supabase.

revoke execute on function public.purge_event_data(boolean) from anon;
revoke execute on function public.purge_event_data(boolean) from authenticated;

grant execute on function public.purge_event_data(boolean) to service_role;
