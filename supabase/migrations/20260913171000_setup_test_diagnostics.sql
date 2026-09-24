-- ============================================================
-- SMPT V2 - Setup & Data Test diagnostics foundation
-- Safe diagnostic only. No destructive reset or automatic dummy mutation here.
-- ============================================================

create sequence if not exists public.smpt_system_test_run_seq start with 1;

create table if not exists public.system_test_runs (
  id bigint generated always as identity primary key,
  run_code text not null unique,
  run_type text not null check(run_type in ('DIAGNOSTIC','DUMMY_FULL','BACKUP','RESTORE','RESET')),
  status text not null check(status in ('RUNNING','PASS','WARN','FAIL')),
  result jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists system_test_runs_type_date_idx on public.system_test_runs(run_type,started_at desc,id desc);

alter table public.system_test_runs enable row level security;
drop policy if exists system_test_runs_admin_select on public.system_test_runs;
create policy system_test_runs_admin_select on public.system_test_runs for select to authenticated
using(public.has_permission('setup_test.admin'));
grant select on public.system_test_runs to authenticated;

create or replace function public.smpt_run_system_diagnostic()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run_id bigint;
  v_run_code text;
  v_result jsonb;
  v_steps jsonb;
  v_status text:='PASS';
  v_negative_raw bigint;
  v_negative_logistics bigint;
  v_pending_requests bigint;
  v_pending_items bigint;
  v_procurement_plans bigint;
  v_open_po bigint;
  v_open_po_lines bigint;
  v_po_receipts bigint;
  v_fulfill_overloads bigint;
  v_projects bigint;
  v_materials bigint;
  v_bom bigint;
  v_suppliers bigint;
  v_cutting_results bigint;
  v_wip_gudang numeric;
begin
  if not public.has_permission('setup_test.admin') then
    raise exception 'Tidak memiliki izin Setup & Data Test.' using errcode='42501';
  end if;

  v_run_code:='TST-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,created_by)
  values(v_run_code,'DIAGNOSTIC','RUNNING',auth.uid()) returning id into v_run_id;

  select count(*) into v_negative_raw from public.stock_balances where quantity<0;
  select count(*) into v_negative_logistics from public.logistics_stock_balances where quantity<0;
  select count(*) into v_pending_requests from public.material_requests where status in ('MENUNGGU GUDANG','SEBAGIAN');
  select count(*) into v_pending_items from public.material_request_items i join public.material_requests r on r.id=i.request_id
    where r.status in ('MENUNGGU GUDANG','SEBAGIAN') and i.status<>'DIBATALKAN' and i.fulfilled_qty<i.requested_qty;
  select count(*) into v_procurement_plans from public.purchase_plans where status<>'CANCELLED';
  select count(*) into v_open_po from public.purchase_orders where status in ('ISSUED','PARTIAL');
  select count(*) into v_open_po_lines from public.purchase_order_lines pol join public.purchase_orders po on po.id=pol.purchase_order_id
    where po.status in ('ISSUED','PARTIAL') and pol.status in ('OPEN','PARTIAL');
  select count(*) into v_po_receipts from public.warehouse_receipts where receipt_source='PO' and status='AKTIF';
  select count(*) into v_projects from public.projects;
  select count(*) into v_materials from public.materials;
  select count(*) into v_bom from public.bom_requirements where component_type='BAHAN' and status='AKTIF';
  select count(*) into v_suppliers from public.vendors where status='AKTIF';
  select count(*) into v_cutting_results from public.cutting_daily_results where status='AKTIF';
  select coalesce(sum(sb.quantity),0) into v_wip_gudang
  from public.stock_balances sb join public.stock_locations sl on sl.id=sb.location_id
  where sb.item_kind='CUTTING_COMPONENT' and sl.physical_group='GUDANG_HASIL';

  select count(*) into v_fulfill_overloads
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fulfill_material_request_item';

  if v_negative_raw>0 or v_negative_logistics>0 or v_fulfill_overloads<>1 then v_status:='FAIL';
  elsif v_pending_requests>0 and v_pending_items=0 then v_status:='WARN';
  end if;

  v_steps:=jsonb_build_array(
    jsonb_build_object('step','MASTER','status',case when v_projects>0 and v_materials>0 then 'PASS' else 'WARN' end,'actual',jsonb_build_object('projects',v_projects,'materials',v_materials,'active_bom',v_bom,'suppliers',v_suppliers),'expected','Master boleh kosong di instalasi baru, tetapi data dasar harus tersedia sebelum E2E.'),
    jsonb_build_object('step','STOCK','status',case when v_negative_raw=0 and v_negative_logistics=0 then 'PASS' else 'FAIL' end,'actual',jsonb_build_object('negative_raw_stock',v_negative_raw,'negative_logistics_stock',v_negative_logistics),'expected','Semua negative stock = 0.','possible_cause',case when v_negative_raw>0 or v_negative_logistics>0 then 'Ledger/balance tidak sinkron atau ada flow lama yang melewati guarded stock RPC.' else null end),
    jsonb_build_object('step','CUTTING_GUDANG_HASIL','status','PASS','actual',jsonb_build_object('active_cutting_results',v_cutting_results,'wip_gudang_hasil',v_wip_gudang),'expected','Monitoring; angka dapat 0 bila belum ada transaksi.'),
    jsonb_build_object('step','SPV_REQUEST_GUDANG','status',case when v_pending_requests>0 and v_pending_items=0 then 'WARN' else 'PASS' end,'actual',jsonb_build_object('pending_requests',v_pending_requests,'outstanding_items',v_pending_items),'expected','Setiap request MENUNGGU/SEBAGIAN yang belum selesai harus memiliki item outstanding.','possible_cause',case when v_pending_requests>0 and v_pending_items=0 then 'Header request tertinggal pada status pending walau seluruh detail sudah terpenuhi/dibatalkan.' else null end),
    jsonb_build_object('step','PROCUREMENT','status','PASS','actual',jsonb_build_object('plans',v_procurement_plans,'open_po',v_open_po,'open_po_lines',v_open_po_lines,'po_receipts',v_po_receipts),'expected','Open PO line dapat diterima parsial sampai outstanding 0.'),
    jsonb_build_object('step','RPC_FULFILL_SIGNATURE','status',case when v_fulfill_overloads=1 then 'PASS' else 'FAIL' end,'actual',v_fulfill_overloads,'expected','Tepat satu overload fulfill_material_request_item aktif (signature 8 parameter).','possible_cause',case when v_fulfill_overloads<>1 then 'Migration fulfill lama/baru hidup bersamaan atau migration terbaru belum ter-push.' else null end)
  );

  v_result:=jsonb_build_object(
    'run_code',v_run_code,
    'status',v_status,
    'role',public.current_user_role(),
    'steps',v_steps,
    'summary',jsonb_build_object(
      'negative_raw_stock',v_negative_raw,
      'negative_logistics_stock',v_negative_logistics,
      'pending_requests',v_pending_requests,
      'open_po',v_open_po,
      'po_receipts',v_po_receipts,
      'fulfill_rpc_overloads',v_fulfill_overloads
    ),
    'checked_at',now()
  );

  update public.system_test_runs set status=v_status,result=v_result,finished_at=now() where id=v_run_id;
  return v_result;
exception when others then
  -- The EXCEPTION block rolls back statements executed inside the failed subtransaction,
  -- including the initial RUNNING row. Re-create the failed run here and RETURN it so
  -- the diagnostic error itself remains auditable instead of disappearing on RAISE.
  if v_run_code is null then raise; end if;
  v_result:=jsonb_build_object(
    'run_code',v_run_code,'status','FAIL','error',sqlerrm,'sqlstate',sqlstate,
    'possible_cause','Database/RLS/permission/schema check gagal. Lihat error + SQLSTATE pada run ini.',
    'checked_at',now()
  );
  insert into public.system_test_runs(run_code,run_type,status,result,started_at,finished_at,created_by)
  values(v_run_code,'DIAGNOSTIC','FAIL',v_result,now(),now(),auth.uid())
  on conflict(run_code) do update set status='FAIL',result=excluded.result,finished_at=excluded.finished_at;
  return v_result;
end;
$$;

revoke all on function public.smpt_run_system_diagnostic() from public;
grant execute on function public.smpt_run_system_diagnostic() to authenticated;

notify pgrst, 'reload schema';
