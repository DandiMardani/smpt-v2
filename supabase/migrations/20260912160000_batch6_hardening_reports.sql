-- SMPT V2 FINAL - Batch 6: hardening, audit, reporting, performance indexes

create sequence if not exists public.smpt_audit_code_seq start with 1;
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  audit_code text not null unique default ('AUD-'||lpad(nextval('public.smpt_audit_code_seq')::text,9,'0')),
  occurred_at timestamptz not null default now(), actor_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  table_name text not null,record_id text,action text not null,old_data jsonb,new_data jsonb,notes text
);
create index if not exists audit_events_table_idx on public.audit_events(table_name,occurred_at desc,id desc);
create index if not exists audit_events_actor_idx on public.audit_events(actor_user_id,occurred_at desc);

create or replace function public.smpt_audit_row_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then insert into public.audit_events(table_name,record_id,action,new_data) values(tg_table_name,coalesce(to_jsonb(new)->>'id',''),tg_op,to_jsonb(new));return new;
  elsif tg_op='UPDATE' then insert into public.audit_events(table_name,record_id,action,old_data,new_data) values(tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',''),tg_op,to_jsonb(old),to_jsonb(new));return new;
  else insert into public.audit_events(table_name,record_id,action,old_data) values(tg_table_name,coalesce(to_jsonb(old)->>'id',''),tg_op,to_jsonb(old));return old;end if;
end $$;

-- Audit critical business state changes. We intentionally do not audit immutable ledger inserts here to avoid doubling high-volume rows.
do $$
declare t text;tr text;
begin
  foreach t in array array['production_orders','production_checks','qc_inspections','qc_reworks','embarkation_shipments','payroll_runs','operator_payroll_runs','cash_advances','manufacturing_transactions'] loop
    tr:='audit_'||t;
    if not exists(select 1 from pg_trigger where tgname=tr) then execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.smpt_audit_row_change()',tr,t);end if;
  end loop;
end $$;

-- Duplicate-finalization guards.
create unique index if not exists payroll_runs_period_uq on public.payroll_runs(payroll_type,period_start,period_end) where status<>'DIBATALKAN';
create unique index if not exists operator_payroll_runs_period_uq on public.operator_payroll_runs(period_start,period_end) where status<>'DIBATALKAN';

-- Read-performance indexes for common dashboard paths.
create index if not exists production_checks_date_idx on public.production_checks(check_date desc,status,order_item_id);
create index if not exists qc_date_idx on public.qc_inspections(inspection_date desc,status,finished_good_id);
create index if not exists finished_balances_loc_idx on public.logistics_stock_balances(location_id,item_kind,quantity desc);
create index if not exists shipment_status_idx on public.embarkation_shipments(status,shipment_date desc,id desc);
create index if not exists attendance_worker_period_idx on public.attendance_records(worker_id,attendance_date desc,verification_status);
create index if not exists cash_advance_worker_idx on public.cash_advances(worker_id,status,advance_date desc);
create index if not exists petty_date_idx on public.petty_cash_transactions(transaction_date desc,status,id desc);
create index if not exists finance_date_idx on public.finance_transactions(transaction_date desc,status,id desc);
create index if not exists mfg_date_idx on public.manufacturing_transactions(transaction_date desc,flow_type,status,id desc);

create or replace view public.v_production_progress with (security_invoker=true) as
select o.id order_id,o.spk_code,o.project_id,o.product_id,o.operator_worker_id,w.name operator_name,o.checker_email,o.status,
       sum(i.assigned_qty) assigned_qty,
       coalesce(sum(c.good_qty) filter(where c.status='AKTIF'),0) approved_qty,
       coalesce(sum(c.reject_qty) filter(where c.status='AKTIF'),0) rejected_qty
from public.production_orders o
join public.workers w on w.id=o.operator_worker_id
join public.production_order_items i on i.order_id=o.id
left join public.production_checks c on c.order_item_id=i.id
group by o.id,o.spk_code,o.project_id,o.product_id,o.operator_worker_id,w.name,o.checker_email,o.status;

create or replace view public.v_finished_stock with (security_invoker=true) as
select b.id,b.item_kind,b.finished_good_id,b.set_id,b.location_id,l.name location_name,b.quantity,
       case when b.item_kind='FINISHED_GOOD' then f.name else s.name end item_name,
       case when b.item_kind='FINISHED_GOOD' then f.unit else s.unit end unit
from public.logistics_stock_balances b
join public.locations l on l.id=b.location_id
left join public.finished_goods f on f.id=b.finished_good_id
left join public.product_sets s on s.id=b.set_id;

create or replace view public.v_cash_advance_balance with (security_invoker=true) as
select a.id,a.advance_code,a.worker_id,w.name worker_name,a.advance_date,a.amount,a.paid_amount,greatest(a.amount-a.paid_amount,0) remaining_amount,a.status,a.notes
from public.cash_advances a join public.workers w on w.id=a.worker_id;

create or replace view public.v_finance_activity with (security_invoker=true) as
select 'KEUANGAN'::text source,transaction_code code,transaction_date,direction,category,amount,description,status from public.finance_transactions
union all
select 'KAS_KECIL',transaction_code,transaction_date,direction,category,amount,description,status from public.petty_cash_transactions;

create or replace function public.smpt_final_health() returns jsonb
language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'production_orders', (select count(*) from public.production_orders),
 'production_checks', (select count(*) from public.production_checks where status='AKTIF'),
 'qc_inspections', (select count(*) from public.qc_inspections where status='AKTIF'),
 'finished_goods', (select count(*) from public.finished_goods where status='AKTIF'),
 'shipments_open', (select count(*) from public.embarkation_shipments where status in ('DISIAPKAN','DIKIRIM')),
 'attendance_records', (select count(*) from public.attendance_records),
 'payroll_runs', (select count(*) from public.payroll_runs where status='FINAL'),
 'negative_raw_stock', (select count(*) from public.stock_balances where quantity<0),
 'negative_logistics_stock', (select count(*) from public.logistics_stock_balances where quantity<0)
) $$;
revoke all on function public.smpt_final_health() from public;grant execute on function public.smpt_final_health() to authenticated;

alter table public.audit_events enable row level security;
drop policy if exists audit_events_select on public.audit_events;create policy audit_events_select on public.audit_events for select to authenticated using(upper(coalesce(public.current_user_role(),''))='ADMIN' or public.has_permission('laporan.view'));
grant select on public.audit_events to authenticated;
grant select on public.v_production_progress,public.v_finished_stock,public.v_cash_advance_balance,public.v_finance_activity to authenticated;

-- No destructive reset/cleanup is included. Production data cleaning is a separate explicit cutover step only after user approval.
