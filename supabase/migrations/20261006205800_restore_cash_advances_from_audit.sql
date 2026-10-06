-- Restore cash advances from audit_events
insert into public.cash_advances (
  id,
  advance_code,
  worker_id,
  advance_date,
  amount,
  paid_amount,
  status,
  notes,
  created_by,
  created_at,
  category,
  warung_id,
  warung_name,
  installment_count,
  installment_amount,
  installments_paid
)
overriding system value
select
  (old_data->>'id')::bigint,
  old_data->>'advance_code',
  (old_data->>'worker_id')::bigint,
  (old_data->>'advance_date')::date,
  (old_data->>'amount')::numeric,
  (old_data->>'paid_amount')::numeric,
  old_data->>'status',
  old_data->>'notes',
  (old_data->>'created_by')::uuid,
  (old_data->>'created_at')::timestamptz,
  coalesce(old_data->>'category', 'KASBON_WARUNG'),
  (old_data->>'warung_id')::uuid,
  old_data->>'warung_name',
  coalesce((old_data->>'installment_count')::int, 1),
  coalesce((old_data->>'installment_amount')::numeric, (old_data->>'amount')::numeric),
  coalesce((old_data->>'installments_paid')::int, 0)
from public.audit_events
where table_name = 'cash_advances'
  and action = 'DELETE'
on conflict (id) do update set
  advance_code = excluded.advance_code,
  worker_id = excluded.worker_id,
  advance_date = excluded.advance_date,
  amount = excluded.amount,
  paid_amount = excluded.paid_amount,
  status = excluded.status,
  notes = excluded.notes,
  category = excluded.category,
  warung_name = excluded.warung_name;
