-- Migration: Add audit triggers to petty_cash_transactions and attendance_records
-- to guarantee they are always tracked in audit_events and can be recovered anytime.

do $$
declare
  t text;
  tr text;
begin
  foreach t in array array['petty_cash_transactions', 'attendance_records'] loop
    tr := 'audit_' || t;
    if not exists (select 1 from pg_trigger where tgname = tr) then
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.smpt_audit_row_change()',
        tr, t
      );
    end if;
  end loop;
end $$;
