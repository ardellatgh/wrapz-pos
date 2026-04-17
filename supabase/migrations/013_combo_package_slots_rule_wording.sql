-- WRAPZ POS — Optional wording per package rule (UI only; matcher unchanged)
-- Forward-only. Run after 012_combo_pricing_and_orders.sql

alter table public.combo_package_slots
  add column if not exists rule_wording text not null default 'pilih';

alter table public.combo_package_slots drop constraint if exists combo_package_slots_rule_wording_check;

alter table public.combo_package_slots
  add constraint combo_package_slots_rule_wording_check check (rule_wording in ('pilih', 'tambah'));

comment on column public.combo_package_slots.rule_wording is
  'Operator-facing line style: pilih = "Pilih n dari …", tambah = "Tambah n dari …". Engine ignores.';
