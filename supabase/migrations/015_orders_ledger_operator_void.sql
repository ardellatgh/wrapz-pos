-- Operator notes + soft void (audit-friendly; no hard delete of financial rows)

alter table public.orders add column if not exists operator_note text;
alter table public.orders add column if not exists operator_note_edited_at timestamptz;
alter table public.orders add column if not exists voided_at timestamptz;
alter table public.orders add column if not exists void_reason text;

comment on column public.orders.operator_note is
  'Short operational note on the order (transactions UI); not payment/settlement system notes.';
comment on column public.orders.voided_at is
  'When set, order is voided (soft); original row retained for audit.';
comment on column public.orders.void_reason is
  'Required context when voided_at is set.';

alter table public.ledger_entries add column if not exists operator_note text;
alter table public.ledger_entries add column if not exists operator_note_edited_at timestamptz;
alter table public.ledger_entries add column if not exists voided_at timestamptz;
alter table public.ledger_entries add column if not exists void_reason text;

comment on column public.ledger_entries.operator_note is
  'Cashier/operator note on this ledger row; editable after insert.';
comment on column public.ledger_entries.voided_at is
  'When set, row is voided for display/totals; original amounts preserved.';
comment on column public.ledger_entries.void_reason is
  'Reason supplied when voiding this ledger entry.';
