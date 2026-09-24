-- ============================================================
-- SMPT V2 - Setup & Data Test final maintenance stage
-- New migration only. Existing migrations remain immutable.
--
-- Adds:
-- 1) Consistent database-side business backup + guarded restore.
-- 2) Selective Reset / Full Dev Reset with FK dependency cleanup.
-- 3) End-to-end Dummy Full with run ID and automatic diagnostics.
-- 4) Exact Dummy Run cleanup using insert-capture triggers.
--
-- Protected from reset/restore snapshot scope:
-- auth schema, roles, permissions, role_permissions, profiles,
-- user_permission_overrides, stock_locations, payroll_settings,
-- audit_events, system_test_runs, maintenance backups/entities.
-- ============================================================

create sequence if not exists public.smpt_data_backup_seq start with 1;

create table if not exists public.system_data_backups (
  id bigint generated always as identity primary key,
  backup_code text not null unique,
  label text,
  scope text not null default 'BUSINESS_DATA' check(scope in ('BUSINESS_DATA')),
  status text not null default 'READY' check(status in ('READY','RESTORED','INVALID')),
  schema_fingerprint text not null,
  snapshot jsonb not null,
  table_counts jsonb not null default '{}'::jsonb,
  byte_size bigint not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_restored_by uuid references auth.users(id) on delete set null,
  last_restored_at timestamptz
);
create index if not exists system_data_backups_date_idx on public.system_data_backups(created_at desc,id desc);

create table if not exists public.system_test_run_entities (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.system_test_runs(id) on delete cascade,
  table_name text not null,
  row_id bigint not null,
  created_at timestamptz not null default now(),
  unique(run_id,table_name,row_id)
);
create index if not exists system_test_run_entities_run_idx on public.system_test_run_entities(run_id,table_name,row_id);

alter table public.system_data_backups enable row level security;
alter table public.system_test_run_entities enable row level security;

drop policy if exists system_data_backups_admin_select on public.system_data_backups;
create policy system_data_backups_admin_select on public.system_data_backups for select to authenticated
using(public.has_permission('setup_test.admin'));

drop policy if exists system_test_run_entities_admin_select on public.system_test_run_entities;
create policy system_test_run_entities_admin_select on public.system_test_run_entities for select to authenticated
using(public.has_permission('setup_test.admin'));

grant select on public.system_data_backups,public.system_test_run_entities to authenticated;

-- Explicit business-data whitelist. Keeping this explicit is intentional:
-- a future system/configuration table will never be wiped merely because it exists.
create or replace function public.smpt_maintenance_tables()
returns text[]
language sql
stable
security definer
set search_path=''
as $$
select array[
  'projects','project_products','materials','work_items','bom_requirements','workers','cutting_components',
  'stock_events','stock_balances','stock_ledger_entries','warehouse_receipts','material_requests','material_request_items',
  'warehouse_issues','cutting_material_usages','cutting_daily_results','ready_production_usages','user_worker_links',
  'production_orders','production_order_items','production_checks','finished_goods','locations','vendors','embarkations',
  'product_sets','product_set_components','logistics_stock_events','logistics_stock_balances','logistics_stock_ledger',
  'qc_inspections','qc_reworks','finished_goods_transfers','external_finished_receipts','packing_runs','embarkation_targets',
  'embarkation_shipments','embarkation_issues','attendance_records','payroll_runs','payroll_run_items','operator_payroll_runs',
  'operator_payroll_items','cash_advances','cash_advance_payments','petty_cash_transactions','finance_transactions',
  'manufacturing_transactions','payroll_attendance_reviews','attendance_month_closures','payroll_run_details','payroll_payouts',
  'payroll_payout_details','payroll_payout_adjustments','payroll_payout_deductions','salary_submissions','attendance_import_batches',
  'attendance_import_rows','work_item_dependencies','production_wip_consumptions','production_anomalies','material_lots',
  'warehouse_issue_lots','ready_production_usage_lots','material_suppliers','purchase_plans','purchase_plan_lines',
  'purchase_orders','purchase_order_lines'
]::text[];
$$;

create or replace function public.smpt_maintenance_schema_fingerprint()
returns text
language sql
stable
security definer
set search_path=''
as $$
select md5(coalesce(string_agg(
  c.table_name||'|'||c.ordinal_position::text||'|'||c.column_name||'|'||c.data_type||'|'||c.is_nullable||'|'||coalesce(c.column_default,''),
  E'\n' order by c.table_name,c.ordinal_position
),''))
from information_schema.columns c
where c.table_schema='public'
  and c.table_name::text=any(public.smpt_maintenance_tables());
$$;

-- Returns the requested tables plus every FK child in the maintenance whitelist.
-- This prevents a selective reset from orphaning child data or failing halfway.
create or replace function public.smpt_expand_reset_tables(p_seed text[])
returns text[]
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_allowed text[]:=public.smpt_maintenance_tables();
  v_tables text[]:=array[]::text[];
  v_new text[];
  v_name text;
begin
  foreach v_name in array coalesce(p_seed,array[]::text[]) loop
    if v_name=any(v_allowed) and not v_name=any(v_tables) then v_tables:=array_append(v_tables,v_name); end if;
  end loop;

  loop
    select array_agg(distinct child.relname::text)
    into v_new
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child on child.oid=c.conrelid
    join pg_catalog.pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
    join pg_catalog.pg_class parent on parent.oid=c.confrelid
    join pg_catalog.pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
    where c.contype='f'
      and parent.relname::text=any(v_tables)
      and child.relname::text=any(v_allowed)
      and not child.relname::text=any(v_tables)
      and child.oid<>parent.oid;
    exit when v_new is null or cardinality(v_new)=0;
    v_tables:=v_tables||v_new;
  end loop;
  return v_tables;
end;
$$;

-- Internal delete helper. Deletes child tables first based on live FK metadata.
create or replace function public.smpt_delete_table_set(p_tables text[])
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_allowed text[]:=public.smpt_maintenance_tables();
  v_remaining text[]:=array[]::text[];
  v_table text;
  v_name text;
  v_count bigint;
  v_counts jsonb:='{}'::jsonb;
begin
  foreach v_name in array coalesce(p_tables,array[]::text[]) loop
    if v_name=any(v_allowed) and not v_name=any(v_remaining) then v_remaining:=array_append(v_remaining,v_name); end if;
  end loop;

  while cardinality(v_remaining)>0 loop
    select candidate into v_table
    from unnest(v_remaining) candidate
    where not exists(
      select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class child on child.oid=c.conrelid
      join pg_catalog.pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
      join pg_catalog.pg_class parent on parent.oid=c.confrelid
      join pg_catalog.pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
      where c.contype='f'
        and parent.relname=candidate
        and child.relname::text=any(v_remaining)
        and child.relname<>parent.relname
    )
    order by candidate
    limit 1;

    if v_table is null then
      raise exception 'Reset dihentikan: ditemukan siklus FK pada table %.',array_to_string(v_remaining,', ');
    end if;

    execute pg_catalog.format('delete from public.%I',v_table);
    get diagnostics v_count=row_count;
    v_counts:=jsonb_set(v_counts,array[v_table],to_jsonb(v_count),true);
    v_remaining:=array_remove(v_remaining,v_table);
  end loop;
  return v_counts;
end;
$$;

-- Business snapshot is taken in one DB transaction, so table contents are mutually consistent.
create or replace function public.smpt_create_data_backup(p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_code text;
  v_table text;
  v_rows jsonb;
  v_snapshot jsonb:='{}'::jsonb;
  v_counts jsonb:='{}'::jsonb;
  v_count bigint;
  v_id bigint;
  v_bytes bigint;
  v_run_code text;
begin
  if not public.has_permission('setup_test.admin') then
    raise exception 'Tidak memiliki izin Backup Data.' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));
  v_code:='BKP-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||lpad(nextval('public.smpt_data_backup_seq')::text,4,'0');

  foreach v_table in array public.smpt_maintenance_tables() loop
    if pg_catalog.to_regclass('public.'||v_table) is null then continue; end if;
    execute pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb),count(*) from public.%I t',v_table)
      into v_rows,v_count;
    v_snapshot:=jsonb_set(v_snapshot,array[v_table],coalesce(v_rows,'[]'::jsonb),true);
    v_counts:=jsonb_set(v_counts,array[v_table],to_jsonb(v_count),true);
  end loop;
  v_bytes:=pg_catalog.octet_length(v_snapshot::text);

  insert into public.system_data_backups(backup_code,label,schema_fingerprint,snapshot,table_counts,byte_size,created_by)
  values(v_code,nullif(btrim(coalesce(p_label,'')),''),public.smpt_maintenance_schema_fingerprint(),v_snapshot,v_counts,v_bytes,auth.uid())
  returning id into v_id;

  v_run_code:='BKP-RUN-'||lpad(nextval('public.smpt_system_test_run_seq')::text,6,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,started_at,finished_at,created_by)
  values(v_run_code,'BACKUP','PASS',jsonb_build_object('backup_id',v_id,'backup_code',v_code,'byte_size',v_bytes,'table_counts',v_counts),now(),now(),auth.uid());

  return jsonb_build_object('backup_id',v_id,'backup_code',v_code,'byte_size',v_bytes,'table_counts',v_counts,'status','PASS');
end;
$$;

-- Restore requires the exact same application table shape. This avoids a silently-partial restore
-- after a future migration changes columns.
create or replace function public.smpt_restore_data_backup(p_backup_id bigint,p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_backup public.system_data_backups%rowtype;
  v_expected text:=public.smpt_maintenance_schema_fingerprint();
  v_tables text[]:=public.smpt_maintenance_tables();
  v_remaining text[];
  v_table text;
  v_rows jsonb;
  v_identity boolean;
  v_inserted bigint;
  v_counts jsonb:='{}'::jsonb;
  v_run_code text;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Restore Data.' using errcode='42501'; end if;
  if upper(btrim(coalesce(p_confirmation,'')))<>'RESTORE' then raise exception 'Ketik RESTORE untuk mengonfirmasi restore.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));

  select * into v_backup from public.system_data_backups where id=p_backup_id and status in ('READY','RESTORED') for update;
  if not found then raise exception 'Backup tidak ditemukan/valid.'; end if;
  if v_backup.schema_fingerprint<>v_expected then
    raise exception 'Schema sudah berubah sejak backup dibuat. Restore dihentikan untuk mencegah data parsial.';
  end if;

  -- Restoring business IDs makes previous dummy row-id captures unsafe. Invalidate them first.
  delete from public.system_test_run_entities;
  update public.system_test_runs
  set result=result||jsonb_build_object('maintenance_invalidated_at',now(),'maintenance_reason','RESTORE '||v_backup.backup_code)
  where run_type='DUMMY_FULL' and status='PASS' and coalesce(result->>'reset_at','')='' and coalesce(result->>'maintenance_invalidated_at','')='';

  perform public.smpt_delete_table_set(v_tables);
  v_remaining:=v_tables;

  -- Parent-first insert order, computed from live FK metadata.
  while cardinality(v_remaining)>0 loop
    select candidate into v_table
    from unnest(v_remaining) candidate
    where not exists(
      select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class child on child.oid=c.conrelid
      join pg_catalog.pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
      join pg_catalog.pg_class parent on parent.oid=c.confrelid
      join pg_catalog.pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
      where c.contype='f'
        and child.relname=candidate
        and parent.relname::text=any(v_remaining)
        and child.relname<>parent.relname
    )
    order by candidate
    limit 1;

    if v_table is null then raise exception 'Restore dihentikan: siklus FK pada %.',array_to_string(v_remaining,', '); end if;
    v_rows:=coalesce(v_backup.snapshot->v_table,'[]'::jsonb);
    if jsonb_array_length(v_rows)>0 then
      select exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name=v_table and is_identity='YES'
      ) into v_identity;
      if v_identity then
        execute pg_catalog.format(
          'insert into public.%I overriding system value select * from jsonb_populate_recordset(null::public.%I,$1)',v_table,v_table
        ) using v_rows;
      else
        execute pg_catalog.format(
          'insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',v_table,v_table
        ) using v_rows;
      end if;
      get diagnostics v_inserted=row_count;
    else v_inserted:=0;
    end if;
    v_counts:=jsonb_set(v_counts,array[v_table],to_jsonb(v_inserted),true);
    v_remaining:=array_remove(v_remaining,v_table);
  end loop;

  update public.system_data_backups set status='RESTORED',last_restored_by=auth.uid(),last_restored_at=now() where id=v_backup.id;
  v_run_code:='RST-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,started_at,finished_at,created_by)
  values(v_run_code,'RESTORE','PASS',jsonb_build_object('backup_id',v_backup.id,'backup_code',v_backup.backup_code,'restored_rows',v_counts),now(),now(),auth.uid());

  return jsonb_build_object('status','PASS','run_code',v_run_code,'backup_code',v_backup.backup_code,'restored_rows',v_counts);
end;
$$;

-- Insert capture is enabled only while Dummy Full sets the local run id.
create or replace function public.smpt_capture_test_entity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_run text;
begin
  v_run:=current_setting('smpt.test_run_id',true);
  if coalesce(v_run,'')<>'' then
    insert into public.system_test_run_entities(run_id,table_name,row_id)
    values(v_run::bigint,tg_table_name,(to_jsonb(new)->>'id')::bigint)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Attach lightweight capture only to whitelisted tables with numeric `id`.
do $$
declare r record; v_trigger text;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    where c.table_schema='public' and c.column_name='id'
      and c.table_name::text=any(public.smpt_maintenance_tables())
    order by c.table_name
  loop
    v_trigger:='smpt_test_capture_'||r.table_name;
    if not exists(
      select 1 from pg_catalog.pg_trigger t
      join pg_catalog.pg_class cl on cl.oid=t.tgrelid
      join pg_catalog.pg_namespace n on n.oid=cl.relnamespace
      where n.nspname='public' and cl.relname=r.table_name and t.tgname=v_trigger and not t.tgisinternal
    ) then
      execute pg_catalog.format('create trigger %I after insert on public.%I for each row execute function public.smpt_capture_test_entity()',v_trigger,r.table_name);
    end if;
  end loop;
end $$;

-- End-to-end deterministic dummy. The business-data block is all-or-nothing:
-- if one step fails, all dummy rows from this run roll back, while the failed test-run record survives.
create or replace function public.smpt_run_dummy_full()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run_id bigint;
  v_run_code text;
  v_step text:='INIT';
  v_steps jsonb:='[]'::jsonb;
  v_result jsonb;
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_project bigint; v_product bigint; v_material bigint; v_supplier bigint; v_ms bigint; v_bom bigint; v_component bigint;
  v_supervisor bigint; v_operator bigint; v_work1 bigint; v_work2 bigint; v_dep bigint; v_fg bigint; v_pusat bigint;
  v_plan bigint; v_plan_line bigint; v_po bigint; v_po_line bigint; v_receipt1 jsonb; v_receipt2 jsonb; v_replay jsonb; v_lot1 bigint;
  v_req_raw bigint; v_req_raw_item bigint; v_req_wip bigint; v_req_wip_item bigint;
  v_spk bigint; v_spk_item1 bigint; v_spk_item2 bigint; v_check1 bigint; v_check2 bigint; v_qc bigint;
  v_set bigint; v_emb bigint; v_target bigint; v_shipment bigint;
  v_negative_raw bigint; v_negative_log bigint; v_pending bigint;
  v_fail_message text; v_fail_state text;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Dummy Full.' using errcode='42501'; end if;
  if v_email='' then raise exception 'Email akun login tidak tersedia. Dummy Full memerlukan akun Auth aktif.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));

  -- QC runtime depends on canonical location PUSAT. Treat this as baseline config, not dummy data.
  select id into v_pusat from public.locations where upper(name)='PUSAT' and status='AKTIF' order by id limit 1;
  if v_pusat is null then
    insert into public.locations(name,location_type,status,notes) values('PUSAT','GUDANG','AKTIF','Baseline lokasi sistem untuk QC/FG') returning id into v_pusat;
  end if;

  v_run_code:='DMY-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,created_by)
  values(v_run_code,'DUMMY_FULL','RUNNING',jsonb_build_object('current_step','INIT'),auth.uid()) returning id into v_run_id;

  begin
    perform set_config('smpt.test_run_id',v_run_id::text,true);

    v_step:='MASTER';
    insert into public.projects(project_code,name,product_category,customer_name,start_date,end_date,status,created_by,updated_by)
    values(v_run_code,'DUMMY E2E '||v_run_code,'TEST','SYSTEM TEST',current_date,current_date+30,'Aktif',auth.uid(),auth.uid()) returning id into v_project;
    insert into public.project_products(project_id,name,target_production,unit,status,notes)
    values(v_project,'DUMMY PRODUCT',10,'PCS','AKTIF',v_run_code) returning id into v_product;
    insert into public.materials(name,standard_unit,category,status,calculation_type,lot_tracking_mode)
    values('DUMMY MATERIAL '||v_run_code,'YARD','KAIN','AKTIF','ROLL_LENGTH','ROLL') returning id into v_material;
    insert into public.vendors(name,status,default_currency,lead_time_days,notes)
    values('DUMMY SUPPLIER '||v_run_code,'AKTIF','IDR',3,v_run_code) returning id into v_supplier;
    v_ms:=public.save_material_supplier(v_material,v_supplier,'DMY-SKU','DUMMY ROLL','YARD',1,25000,true,1,3,'YARD',v_run_code,'AKTIF');
    insert into public.bom_requirements(project_id,product_id,material_id,component_type,component_name,unit,qty_per_unit,unit_price,status,
      fulfillment_source,calculation_method,net_usage_per_product,net_requirement,allowance_percent,allowance_qty,waste_percent,waste_qty,final_requirement,calculation_input_snapshot,calculated_at,calculated_by)
    values(v_project,v_product,v_material,'BAHAN','DUMMY MATERIAL','YARD',2,25000,'AKTIF','COMPANY_PURCHASE','CONSUMPTION',2,20,0,0,0,0,20,
      jsonb_build_object('dummy_run',v_run_code,'target',10,'consumption',2),now(),auth.uid()) returning id into v_bom;
    insert into public.cutting_components(project_id,product_id,name,qty_per_product,unit,color,notes,status)
    values(v_project,v_product,'DUMMY CUT PART',1,'PCS','TEST',v_run_code,'AKTIF') returning id into v_component;
    insert into public.workers(name,department,position,pay_system,status,notes)
    values('DUMMY SPV '||v_run_code,'PRODUKSI','SUPERVISOR PRODUKSI','BULANAN','AKTIF',v_run_code) returning id into v_supervisor;
    insert into public.workers(name,department,position,pay_system,status,notes)
    values('DUMMY OPERATOR '||v_run_code,'PRODUKSI','OPERATOR JAHIT','BORONGAN','AKTIF',v_run_code) returning id into v_operator;
    insert into public.work_items(project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,output_final)
    values(v_project,v_product,'DUMMY PROSES AWAL','PCS',1,1000,1200,'AKTIF',false) returning id into v_work1;
    insert into public.work_items(project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,output_final)
    values(v_project,v_product,'DUMMY FINAL','PCS',1,1500,1800,'AKTIF',true) returning id into v_work2;
    v_dep:=public.upsert_work_item_dependency(v_product,v_work1,v_work2,'SEQUENTIAL','HARD',v_run_code);
    insert into public.finished_goods(project_id,product_id,name,category,unit,source,final_work_item_id,status,notes)
    values(v_project,v_product,'DUMMY FG '||v_run_code,'TEST','PCS','INTERNAL',v_work2,'AKTIF',v_run_code) returning id into v_fg;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('project',v_project,'product',v_product,'material',v_material,'supplier',v_supplier),'expected','Master test lengkap dan HARD route aktif.'));

    v_step:='PURCHASE_PLANNING';
    v_plan:=public.smpt_create_purchase_plan(v_project,v_product,current_date,v_run_code);
    select id into v_plan_line from public.purchase_plan_lines where purchase_plan_id=v_plan and material_id=v_material limit 1;
    if v_plan_line is null then raise exception 'Purchase plan line dummy tidak terbentuk.'; end if;
    perform public.smpt_update_purchase_plan_line(v_plan_line,0,20,v_supplier,25000,v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('plan_id',v_plan,'planned_qty',20),'expected','Net need 20 YARD.'));

    v_step:='PO_DRAFT_ISSUE';
    v_po:=public.smpt_create_draft_purchase_order(v_plan,v_supplier,current_date,current_date+7,v_run_code);
    select id into v_po_line from public.purchase_order_lines where purchase_order_id=v_po and material_id=v_material limit 1;
    if v_po_line is null then raise exception 'PO line dummy tidak terbentuk.'; end if;
    perform public.smpt_issue_purchase_order(v_po);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('po_id',v_po,'line_id',v_po_line),'expected','Draft direview lalu status ISSUED.'));

    v_step:='PO_PARTIAL_RECEIPT_ROLL';
    v_receipt1:=public.smpt_receive_purchase_order_line(v_po_line,current_date,10,'YARD',1,'DMY-PO-1',v_run_code||'-ROLL-1','SUP-LOT-1',v_run_code,v_run_code||'-POR1');
    v_lot1:=(v_receipt1->>'lot_id')::bigint;
    v_receipt2:=public.smpt_receive_purchase_order_line(v_po_line,current_date,10,'YARD',1,'DMY-PO-2',v_run_code||'-ROLL-2','SUP-LOT-2',v_run_code,v_run_code||'-POR2');
    v_replay:=public.smpt_receive_purchase_order_line(v_po_line,current_date,10,'YARD',1,'DMY-PO-1',v_run_code||'-ROLL-1','SUP-LOT-1',v_run_code,v_run_code||'-POR1');
    if coalesce((v_replay->>'idempotent_replay')::boolean,false) is not true then raise exception 'Idempotency replay PO gagal.'; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('receipt1',v_receipt1,'receipt2',v_receipt2,'replay',v_replay),'expected','2 x 10 YARD, PO RECEIVED, dua roll aktual, replay tidak menggandakan stok.'));

    v_step:='GUDANG_TO_CUTTING';
    v_req_raw:=public.create_material_request_header(current_date,v_project,v_product,v_supervisor,'CUTTING',v_run_code);
    v_req_raw_item:=public.add_material_request_item(v_req_raw,'BAHAN BAKU',v_bom,10,v_run_code);
    perform public.submit_material_request(v_req_raw);
    perform public.fulfill_material_request_with_lot(current_date,v_req_raw_item,v_lot1,v_operator,null,v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('request_id',v_req_raw,'lot_id',v_lot1),'expected','SPV request muncul dan Gudang memenuhi Roll/Lot ke Cutting.'));

    v_step:='CUTTING';
    perform public.consume_material_lot(current_date,v_lot1,10,'YARD','CUTTING',null,'DUMMY CUTTER',v_run_code);
    perform public.record_cutting_result(current_date,v_component,2,0,'DUMMY CUTTER',v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual','10 YARD consumed; 2 PCS WIP returned to Gudang Hasil','expected','Cutting tidak kirim langsung ke proses berikutnya.'));

    v_step:='SABLON_CUSTODY';
    perform public.move_wip_stock(current_date,v_component,v_product,2,'TANDAI_SABLON',v_run_code);
    perform public.move_wip_stock(current_date,v_component,v_product,2,'KIRIM_SABLON',v_run_code);
    perform public.move_wip_stock(current_date,v_component,v_product,2,'KEMBALI_DARI_SABLON',v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual','Gudang Hasil -> Sablon -> Gudang Hasil Selesai Sablon','expected','Gudang tetap pusat custody.'));

    v_step:='SPV_REQUEST_GUDANG';
    v_req_wip:=public.create_material_request_header(current_date,v_project,v_product,v_supervisor,'PRODUKSI',v_run_code);
    v_req_wip_item:=public.add_material_request_item(v_req_wip,'HASIL SABLON',v_component,2,v_run_code);
    perform public.submit_material_request(v_req_wip);
    perform public.fulfill_material_request_item(v_req_wip_item,current_date,2,v_operator,null,null,'HASIL_SABLON',v_run_code);
    perform public.record_ready_production_usage(current_date,'CUTTING_COMPONENT',v_component,v_project,v_product,2,'DUMMY PRODUKSI',v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('request_id',v_req_wip,'item_id',v_req_wip_item),'expected','SPV WIP -> Gudang inbox -> fulfill -> Siap Produksi.'));

    v_step:='SPK_OPERATOR_CHECKER_HARD';
    v_spk:=public.create_production_order(current_date,v_project,v_product,v_operator,v_email,v_supervisor,current_date+7,v_run_code);
    v_spk_item1:=public.add_production_order_item(v_spk,v_work1,2);
    v_spk_item2:=public.add_production_order_item(v_spk,v_work2,2);
    perform public.publish_production_order(v_spk);
    v_check1:=public.record_checker_result(v_spk_item1,current_date,2,0,v_run_code||' predecessor');
    v_check2:=public.record_checker_result(v_spk_item2,current_date,2,0,v_run_code||' final HARD');
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('spk',v_spk,'predecessor_check',v_check1,'final_check',v_check2),'expected','Operator assignment oleh SPV; Checker final lolos HARD only setelah predecessor.'));

    v_step:='QC_BARANG_JADI';
    v_qc:=public.record_quality_control(v_check2,current_date,2,0,0,v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('qc_id',v_qc,'good_qty',2),'expected','QC menambah 2 PCS Barang Jadi di PUSAT.'));

    v_step:='PACKING_SET';
    insert into public.product_sets(project_id,name,unit,status,notes) values(v_project,'DUMMY SET '||v_run_code,'SET','AKTIF',v_run_code) returning id into v_set;
    insert into public.product_set_components(set_id,finished_good_id,qty_per_set) values(v_set,v_fg,1);
    perform public.pack_product_set(current_date,v_set,v_pusat,1,v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual','1 SET packed at PUSAT','expected','FG consumed 1, SET stock +1.'));

    v_step:='SHIPMENT';
    insert into public.embarkations(name,short_code,status,notes) values('DUMMY EMBARKASI '||v_run_code,'DMY','AKTIF',v_run_code) returning id into v_emb;
    insert into public.embarkation_targets(embarkation_id,item_kind,set_id,target_qty,status,notes)
    values(v_emb,'SET',v_set,1,'AKTIF',v_run_code) returning id into v_target;
    v_shipment:=public.create_embarkation_shipment(v_target,current_date,v_pusat,1,'DMY-DOC','DUMMY DRIVER','DMY-01',v_run_code);
    perform public.send_embarkation_shipment(v_shipment);
    perform public.receive_embarkation_shipment(v_shipment,1,0,0,0,v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('shipment_id',v_shipment,'received',1),'expected','SET dikirim lalu diterima penuh.'));

    v_step:='FINAL_HEALTH';
    select count(*) into v_negative_raw from public.stock_balances where quantity<0;
    select count(*) into v_negative_log from public.logistics_stock_balances where quantity<0;
    select count(*) into v_pending from public.material_requests where project_id=v_project and status in ('MENUNGGU GUDANG','SEBAGIAN');
    if v_negative_raw<>0 or v_negative_log<>0 or v_pending<>0 then
      raise exception 'Final health dummy gagal: negative raw %, negative logistics %, pending request %.',v_negative_raw,v_negative_log,v_pending;
    end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('negative_raw',v_negative_raw,'negative_logistics',v_negative_log,'pending_requests',v_pending),'expected','Negative stock 0 dan tidak ada request dummy tertinggal.'));

    perform set_config('smpt.test_run_id','',true);
  exception when others then
    v_fail_message:=sqlerrm; v_fail_state:=sqlstate;
    perform set_config('smpt.test_run_id','',true);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'step',v_step,'status','FAIL','actual',v_fail_message,'expected','Step selesai tanpa exception.',
      'error_database',v_fail_message,'sqlstate',v_fail_state,
      'possible_cause',case when v_fail_state='42501' then 'Permission/RLS belum sesuai atau akun test bukan ADMIN/berizin.'
                            when v_fail_state='23503' then 'Dependency/FK data dummy tidak lengkap.'
                            when v_fail_state='23505' then 'Duplicate/idempotency guard mendeteksi data ganda.'
                            else 'Periksa migration terbaru, function signature, stock state, dan diagnostic step ini.' end
    ));
  end;

  if v_fail_message is not null then
    v_result:=jsonb_build_object('run_code',v_run_code,'status','FAIL','failed_step',v_step,'steps',v_steps,'error',v_fail_message,'sqlstate',v_fail_state,'reference_test_run_id',v_run_id,'rolled_back_dummy_data',true);
    update public.system_test_runs set status='FAIL',result=v_result,finished_at=now() where id=v_run_id;
    return v_result;
  end if;

  v_result:=jsonb_build_object(
    'run_code',v_run_code,'status','PASS','project_id',v_project,'project_code',v_run_code,'steps',v_steps,
    'reference_test_run_id',v_run_id,
    'summary',jsonb_build_object('purchase_plan',v_plan,'purchase_order',v_po,'raw_request',v_req_raw,'spv_wip_request',v_req_wip,'spk',v_spk,'qc',v_qc,'shipment',v_shipment)
  );
  update public.system_test_runs set status='PASS',result=v_result,finished_at=now() where id=v_run_id;
  return v_result;
end;
$$;

-- Exact cleanup of a successful Dummy Full run using captured inserted-row IDs.
create or replace function public.smpt_reset_dummy_run(p_run_id bigint,p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run public.system_test_runs%rowtype;
  v_remaining text[];
  v_table text;
  v_ids bigint[];
  v_deleted bigint;
  v_counts jsonb:='{}'::jsonb;
  v_reset_code text;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Reset Dummy.' using errcode='42501'; end if;
  if upper(btrim(coalesce(p_confirmation,'')))<>'DELETE DUMMY' then raise exception 'Ketik DELETE DUMMY untuk menghapus run dummy.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));
  select * into v_run from public.system_test_runs where id=p_run_id and run_type='DUMMY_FULL' and status='PASS' for update;
  if not found then raise exception 'Dummy run PASS tidak ditemukan.'; end if;
  if coalesce((v_run.result->>'reset_at'),'')<>'' then raise exception 'Dummy run ini sudah pernah di-reset.'; end if;
  if coalesce((v_run.result->>'maintenance_invalidated_at'),'')<>'' then raise exception 'Tracking Dummy Run ini sudah diinvalidasi oleh maintenance/reset lain. Jangan hapus berdasarkan ID lama.'; end if;

  select array_agg(distinct table_name order by table_name) into v_remaining
  from public.system_test_run_entities where run_id=p_run_id;
  v_remaining:=coalesce(v_remaining,array[]::text[]);

  while cardinality(v_remaining)>0 loop
    select candidate into v_table
    from unnest(v_remaining) candidate
    where not exists(
      select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_class child on child.oid=c.conrelid
      join pg_catalog.pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
      join pg_catalog.pg_class parent on parent.oid=c.confrelid
      join pg_catalog.pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
      where c.contype='f' and parent.relname=candidate and child.relname::text=any(v_remaining) and child.relname<>parent.relname
    ) order by candidate limit 1;
    if v_table is null then raise exception 'Reset Dummy dihentikan: siklus FK pada %.',array_to_string(v_remaining,', '); end if;

    select array_agg(row_id) into v_ids from public.system_test_run_entities where run_id=p_run_id and table_name=v_table;
    if cardinality(coalesce(v_ids,array[]::bigint[]))>0 then
      execute pg_catalog.format('delete from public.%I where id=any($1)',v_table) using v_ids;
      get diagnostics v_deleted=row_count;
    else v_deleted:=0;
    end if;
    v_counts:=jsonb_set(v_counts,array[v_table],to_jsonb(v_deleted),true);
    v_remaining:=array_remove(v_remaining,v_table);
  end loop;

  delete from public.system_test_run_entities where run_id=p_run_id;
  update public.system_test_runs
  set result=result||jsonb_build_object('reset_at',now(),'reset_by',auth.uid(),'deleted_rows',v_counts)
  where id=p_run_id;

  v_reset_code:='RST-DMY-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,started_at,finished_at,created_by)
  values(v_reset_code,'RESET','PASS',jsonb_build_object('dummy_run_id',p_run_id,'dummy_run_code',v_run.run_code,'deleted_rows',v_counts),now(),now(),auth.uid());
  return jsonb_build_object('status','PASS','run_code',v_reset_code,'dummy_run_code',v_run.run_code,'deleted_rows',v_counts);
end;
$$;

create or replace function public.smpt_reset_business_data(
  p_groups text[],
  p_confirmation text,
  p_backup_before boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_group text;
  v_groups text[]:=array[]::text[];
  v_seed text[]:=array[]::text[];
  v_tables text[];
  v_backup jsonb;
  v_deleted jsonb;
  v_run_code text;
  v_full boolean:=false;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Reset Data.' using errcode='42501'; end if;
  foreach v_group in array coalesce(p_groups,array[]::text[]) loop
    v_group:=upper(btrim(v_group));
    if v_group not in ('PROCUREMENT','RAW_MATERIAL_FLOW','PRODUCTION_QC_LOGISTICS','HR_FINANCE','MASTER','ALL') then
      raise exception 'Kelompok reset tidak valid: %.',v_group;
    end if;
    if not v_group=any(v_groups) then v_groups:=array_append(v_groups,v_group); end if;
  end loop;
  if cardinality(v_groups)=0 then raise exception 'Pilih minimal satu kelompok data.'; end if;
  v_full:=('ALL'=any(v_groups) or 'MASTER'=any(v_groups));
  if v_full and upper(btrim(coalesce(p_confirmation,'')))<>'FULL RESET' then
    raise exception 'MASTER/ALL menghapus seluruh data bisnis. Ketik FULL RESET untuk melanjutkan.';
  elsif not v_full and upper(btrim(coalesce(p_confirmation,'')))<>'RESET' then
    raise exception 'Ketik RESET untuk melanjutkan Selective Reset.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));
  if coalesce(p_backup_before,true) then
    v_backup:=public.smpt_create_data_backup('AUTO BEFORE RESET '||array_to_string(v_groups,','));
  end if;

  if v_full then
    v_tables:=public.smpt_maintenance_tables();
  else
    if 'PROCUREMENT'=any(v_groups) then
      -- Procurement receipt changes canonical raw stock, so stock flow is reset together for consistency.
      v_seed:=v_seed||array['purchase_plans','stock_events','stock_balances','material_requests'];
    end if;
    if 'RAW_MATERIAL_FLOW'=any(v_groups) then
      -- Raw stock may contain PO receipts. Reset the linked procurement graph too so PO received/outstanding totals cannot drift.
      v_seed:=v_seed||array['purchase_plans','stock_events','stock_balances','material_requests'];
    end if;
    if 'PRODUCTION_QC_LOGISTICS'=any(v_groups) then
      v_seed:=v_seed||array['production_orders','logistics_stock_events','logistics_stock_balances','embarkation_shipments'];
    end if;
    if 'HR_FINANCE'=any(v_groups) then
      v_seed:=v_seed||array[
        'attendance_records','attendance_import_batches','payroll_runs','operator_payroll_runs','cash_advances',
        'petty_cash_transactions','finance_transactions','manufacturing_transactions','attendance_month_closures',
        'payroll_payouts','salary_submissions'
      ];
    end if;
    v_tables:=public.smpt_expand_reset_tables(v_seed);
  end if;

  v_deleted:=public.smpt_delete_table_set(v_tables);

  -- Any broad reset can remove only part of an older dummy run. Invalidate stale row-id captures.
  delete from public.system_test_run_entities;
  update public.system_test_runs
  set result=result||jsonb_build_object('maintenance_invalidated_at',now(),'maintenance_reason','RESET '||array_to_string(v_groups,','))
  where run_type='DUMMY_FULL' and status='PASS' and coalesce(result->>'reset_at','')='' and coalesce(result->>'maintenance_invalidated_at','')='';

  -- Recreate canonical PUSAT only for full/master reset; stock_locations are protected config and are never deleted.
  if v_full and not exists(select 1 from public.locations where upper(name)='PUSAT' and status='AKTIF') then
    insert into public.locations(name,location_type,status,notes) values('PUSAT','GUDANG','AKTIF','Baseline lokasi sistem untuk QC/FG');
  end if;

  v_run_code:='RST-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,started_at,finished_at,created_by)
  values(v_run_code,'RESET','PASS',jsonb_build_object('groups',v_groups,'expanded_tables',v_tables,'deleted_rows',v_deleted,'backup',v_backup,'protected','auth + roles + permissions + profiles + stock_locations + payroll_settings + audit_events'),now(),now(),auth.uid());

  return jsonb_build_object('status','PASS','run_code',v_run_code,'groups',v_groups,'deleted_rows',v_deleted,'backup',v_backup);
end;
$$;

revoke all on function public.smpt_maintenance_tables() from public;
revoke all on function public.smpt_maintenance_schema_fingerprint() from public;
revoke all on function public.smpt_expand_reset_tables(text[]) from public;
revoke all on function public.smpt_delete_table_set(text[]) from public;
revoke all on function public.smpt_capture_test_entity() from public;
revoke all on function public.smpt_create_data_backup(text) from public;
revoke all on function public.smpt_restore_data_backup(bigint,text) from public;
revoke all on function public.smpt_run_dummy_full() from public;
revoke all on function public.smpt_reset_dummy_run(bigint,text) from public;
revoke all on function public.smpt_reset_business_data(text[],text,boolean) from public;

grant execute on function public.smpt_create_data_backup(text) to authenticated;
grant execute on function public.smpt_restore_data_backup(bigint,text) to authenticated;
grant execute on function public.smpt_run_dummy_full() to authenticated;
grant execute on function public.smpt_reset_dummy_run(bigint,text) to authenticated;
grant execute on function public.smpt_reset_business_data(text[],text,boolean) to authenticated;

notify pgrst, 'reload schema';
