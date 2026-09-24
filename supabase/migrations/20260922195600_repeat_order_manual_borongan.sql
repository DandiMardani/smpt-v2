-- ============================================================
-- SMPT V2 - Repeat Order + HARIAN manual result -> BORONGAN submission
-- New migration only. No previously pushed migration is modified.
--
-- Extends existing architecture:
-- - projects gets source trace for Repeat Order.
-- - work_items gets execution/submission profile.
-- - production_manual_results is the audited manual production-result ledger.
-- - existing progress and operator-payroll pipelines aggregate the new ledger.
-- - existing Setup & Data Test gains two feature runtime tests + exact cleanup.
-- ============================================================

-- --------------------------------------------------------------------------
-- 1) ACCESS + MASTER CONFIG
-- --------------------------------------------------------------------------
insert into public.permissions(code,description) values
('hasil_produksi.write','Input dan pembatalan hasil pekerjaan manual HARIAN untuk pengajuan BORONGAN.')
on conflict(code) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.code='hasil_produksi.write'
where upper(coalesce(nullif(to_jsonb(r)->>'code',''),nullif(to_jsonb(r)->>'name',''),nullif(to_jsonb(r)->>'role',''),''))='SUPERVISOR'
on conflict do nothing;

alter table public.projects
  add column if not exists repeat_source_project_id bigint,
  add column if not exists repeat_order_note text;

do $$
begin
  if not exists(
    select 1 from pg_catalog.pg_constraint
    where conrelid='public.projects'::regclass and conname='projects_repeat_source_project_fk'
  ) then
    alter table public.projects
      add constraint projects_repeat_source_project_fk
      foreign key(repeat_source_project_id) references public.projects(id)
      on update restrict on delete restrict;
  end if;
end $$;

create index if not exists projects_repeat_source_idx
  on public.projects(repeat_source_project_id)
  where repeat_source_project_id is not null;

alter table public.work_items
  add column if not exists executor_scope text not null default 'OPERATOR_BORONGAN'
    check(executor_scope in ('OPERATOR_BORONGAN','PEKERJA_HARIAN','KEDUANYA')),
  add column if not exists submission_category text not null default 'BORONGAN'
    check(submission_category in ('BORONGAN','TIDAK_ADA'));

create index if not exists work_items_manual_result_profile_idx
  on public.work_items(project_id,product_id,status,executor_scope,submission_category,id);

create or replace function public.set_work_item_payroll_profile(
  p_work_item_id bigint,
  p_executor_scope text,
  p_submission_category text
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_executor text:=upper(btrim(coalesce(p_executor_scope,'')));
  v_category text:=upper(btrim(coalesce(p_submission_category,'')));
begin
  if not public.has_permission('master_item.write') then
    raise exception 'Tidak memiliki izin mengatur profil Item Pekerjaan.' using errcode='42501';
  end if;
  if v_executor not in ('OPERATOR_BORONGAN','PEKERJA_HARIAN','KEDUANYA') then
    raise exception 'Pelaksana Item Pekerjaan tidak valid.';
  end if;
  if v_category not in ('BORONGAN','TIDAK_ADA') then
    raise exception 'Kategori pengajuan Item Pekerjaan tidak valid.';
  end if;

  update public.work_items
  set executor_scope=v_executor,
      submission_category=v_category,
      updated_by=auth.uid(),
      updated_at=now()
  where id=p_work_item_id;

  if not found then raise exception 'Item Pekerjaan tidak ditemukan.'; end if;
end;
$$;
revoke all on function public.set_work_item_payroll_profile(bigint,text,text) from public;
grant execute on function public.set_work_item_payroll_profile(bigint,text,text) to authenticated;

-- --------------------------------------------------------------------------
-- 2) REPEAT ORDER - ATOMIC MASTER/CONFIG CLONE ONLY
-- --------------------------------------------------------------------------
create or replace function public.smpt_create_repeat_order(
  p_source_project_id bigint,
  p_project_code text,
  p_name text,
  p_product_category text default null,
  p_customer_name text default null,
  p_contract_value numeric default 0,
  p_start_date date default null,
  p_end_date date default null,
  p_status text default 'Pending',
  p_repeat_note text default null,
  p_product_targets jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source public.projects%rowtype;
  v_new_project bigint;
  v_product_map jsonb:='{}'::jsonb;
  v_item_map jsonb:='{}'::jsonb;
  v_source_product_count integer:=0;
  v_only_new_product bigint;
  v_product_count integer:=0;
  v_item_count integer:=0;
  v_bom_count integer:=0;
  v_dependency_count integer:=0;
  v_new_product bigint;
  v_new_item bigint;
  v_target numeric;
  v_mapped_product bigint;
  r record;
begin
  if not (
    public.has_permission('master_proyek.write')
    and public.has_permission('master_produk_proyek.write')
    and public.has_permission('master_item.write')
    and public.has_permission('master_kebutuhan.write')
  ) then
    raise exception 'Repeat Order memerlukan izin tulis Proyek, Produk/Tas, Item Pekerjaan, dan Kebutuhan.' using errcode='42501';
  end if;

  select * into v_source from public.projects where id=p_source_project_id;
  if not found then raise exception 'Source project Repeat Order tidak ditemukan.'; end if;
  if btrim(coalesce(p_project_code,''))='' then raise exception 'ID Proyek baru wajib diisi.'; end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'Nama Proyek baru wajib diisi.'; end if;
  if coalesce(p_contract_value,0)<0 then raise exception 'Nilai kontrak tidak boleh negatif.'; end if;
  if coalesce(nullif(btrim(coalesce(p_status,'')),''),'Pending') not in ('Pending','Berjalan','Selesai') then
    raise exception 'Status proyek Repeat Order tidak valid.';
  end if;
  if p_start_date is not null and p_end_date is not null and p_end_date<p_start_date then
    raise exception 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
  end if;
  if coalesce(p_product_targets,'{}'::jsonb) is null or jsonb_typeof(coalesce(p_product_targets,'{}'::jsonb))<>'object' then
    raise exception 'Target Produk/Tas Repeat Order harus berupa object JSON.';
  end if;

  insert into public.projects(
    project_code,name,product_category,customer_name,contract_value,legacy_target_production,
    start_date,end_date,status,repeat_source_project_id,repeat_order_note,created_by,updated_by
  ) values(
    btrim(p_project_code),btrim(p_name),nullif(btrim(coalesce(p_product_category,'')),''),
    nullif(btrim(coalesce(p_customer_name,'')),''),coalesce(p_contract_value,0),0,
    p_start_date,p_end_date,coalesce(nullif(btrim(coalesce(p_status,'')),''),'Pending'),
    p_source_project_id,nullif(btrim(coalesce(p_repeat_note,'')),''),auth.uid(),auth.uid()
  ) returning id into v_new_project;

  select count(*) into v_source_product_count
  from public.project_products where project_id=p_source_project_id;

  for r in
    select * from public.project_products where project_id=p_source_project_id order by id
  loop
    v_target:=case
      when coalesce(p_product_targets,'{}'::jsonb) ? r.id::text
        then nullif(p_product_targets->>r.id::text,'')::numeric
      else r.target_production
    end;
    if coalesce(v_target,0)<=0 then
      raise exception 'Target baru Produk/Tas % harus lebih dari 0.',r.name;
    end if;

    insert into public.project_products(
      project_id,name,target_production,unit,status,notes,created_by,updated_by
    ) values(
      v_new_project,r.name,v_target,r.unit,r.status,r.notes,auth.uid(),auth.uid()
    ) returning id into v_new_product;

    v_product_map:=v_product_map||jsonb_build_object(r.id::text,v_new_product);
    v_product_count:=v_product_count+1;
    if v_source_product_count=1 then v_only_new_product:=v_new_product; end if;
  end loop;

  for r in
    select * from public.work_items where project_id=p_source_project_id order by id
  loop
    v_mapped_product:=case
      when r.product_id is not null then nullif(v_product_map->>r.product_id::text,'')::bigint
      when v_source_product_count=1 then v_only_new_product
      else null
    end;

    insert into public.work_items(
      project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,output_final,
      legacy_unassigned_product,display_order,routing_validation_mode,flow_mode,flow_order,
      executor_scope,submission_category,created_by,updated_by
    ) values(
      v_new_project,v_mapped_product,r.name,r.unit,r.qty_per_product,r.operator_price,r.proposed_price,r.status,r.output_final,
      case when v_mapped_product is null then true else false end,
      r.display_order,r.routing_validation_mode,r.flow_mode,r.flow_order,
      r.executor_scope,r.submission_category,auth.uid(),auth.uid()
    ) returning id into v_new_item;

    v_item_map:=v_item_map||jsonb_build_object(r.id::text,v_new_item);
    v_item_count:=v_item_count+1;
  end loop;

  for r in
    select * from public.bom_requirements where project_id=p_source_project_id order by id
  loop
    v_mapped_product:=case
      when r.product_id is not null then nullif(v_product_map->>r.product_id::text,'')::bigint
      when v_source_product_count=1 then v_only_new_product
      else null
    end;

    insert into public.bom_requirements(
      project_id,product_id,material_id,component_type,component_name,unit,qty_per_unit,unit_price,status,
      legacy_total_requirement,legacy_project_level,created_by,updated_by
    ) values(
      v_new_project,v_mapped_product,r.material_id,r.component_type,r.component_name,r.unit,r.qty_per_unit,r.unit_price,r.status,
      r.legacy_total_requirement,case when v_mapped_product is null then true else false end,auth.uid(),auth.uid()
    );
    v_bom_count:=v_bom_count+1;
  end loop;

  for r in
    select d.*
    from public.work_item_dependencies d
    join public.project_products pp on pp.id=d.product_id
    where pp.project_id=p_source_project_id
    order by d.id
  loop
    v_mapped_product:=nullif(v_product_map->>r.product_id::text,'')::bigint;
    if v_mapped_product is not null
       and (v_item_map ? r.predecessor_work_item_id::text)
       and (v_item_map ? r.successor_work_item_id::text) then
      insert into public.work_item_dependencies(
        product_id,predecessor_work_item_id,successor_work_item_id,dependency_type,validation_mode,
        enforce_from,status,notes,source_mode,created_by,updated_by
      ) values(
        v_mapped_product,
        (v_item_map->>r.predecessor_work_item_id::text)::bigint,
        (v_item_map->>r.successor_work_item_id::text)::bigint,
        r.dependency_type,r.validation_mode,r.enforce_from,r.status,r.notes,r.source_mode,auth.uid(),auth.uid()
      );
      v_dependency_count:=v_dependency_count+1;
    end if;
  end loop;

  return jsonb_build_object(
    'status','PASS',
    'source_project_id',p_source_project_id,
    'project_id',v_new_project,
    'project_code',btrim(p_project_code),
    'products_copied',v_product_count,
    'work_items_copied',v_item_count,
    'bom_copied',v_bom_count,
    'routing_copied',v_dependency_count,
    'transactions_copied',0
  );
end;
$$;
revoke all on function public.smpt_create_repeat_order(bigint,text,text,text,text,numeric,date,date,text,text,jsonb) from public;
grant execute on function public.smpt_create_repeat_order(bigint,text,text,text,text,numeric,date,date,text,text,jsonb) to authenticated;

-- --------------------------------------------------------------------------
-- 3) AUDITED MANUAL HARIAN RESULT LEDGER
-- --------------------------------------------------------------------------
create sequence if not exists public.smpt_manual_result_code_seq start with 1;

create table if not exists public.production_manual_results (
  id bigint generated always as identity primary key,
  result_code text not null unique default ('MHR-'||lpad(nextval('public.smpt_manual_result_code_seq')::text,7,'0')),
  result_date date not null default current_date,
  project_id bigint not null references public.projects(id) on update restrict on delete restrict,
  product_id bigint not null,
  work_item_id bigint not null references public.work_items(id) on update restrict on delete restrict,
  worker_id bigint not null references public.workers(id) on update restrict on delete restrict,
  project_code_snapshot text not null,
  project_name_snapshot text not null,
  product_code_snapshot text not null,
  product_name_snapshot text not null,
  work_item_code_snapshot text not null,
  work_item_name_snapshot text not null,
  worker_code_snapshot text not null,
  worker_name_snapshot text not null,
  worker_pay_system_snapshot text not null,
  qty_good numeric(18,4) not null check(qty_good>0),
  operator_price_snapshot numeric(18,2) not null default 0 check(operator_price_snapshot>=0),
  submission_price_snapshot numeric(18,2) not null default 0 check(submission_price_snapshot>=0),
  operator_value numeric(18,2) not null default 0 check(operator_value>=0),
  submission_value numeric(18,2) not null default 0 check(submission_value>=0),
  reason text not null check(btrim(reason)<>''),
  status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_by_email_snapshot text not null,
  created_at timestamptz not null default now(),
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_by_email_snapshot text,
  cancelled_at timestamptz,
  cancellation_reason text,
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict,
  check((status='AKTIF' and cancelled_at is null and cancellation_reason is null)
     or (status='DIBATALKAN' and cancelled_at is not null and btrim(coalesce(cancellation_reason,''))<>''))
);

create index if not exists production_manual_results_scope_idx
  on public.production_manual_results(project_id,product_id,work_item_id,status,result_date desc,id desc);
create index if not exists production_manual_results_worker_idx
  on public.production_manual_results(worker_id,status,result_date desc,id desc);

alter table public.production_manual_results enable row level security;
drop policy if exists production_manual_results_select on public.production_manual_results;
create policy production_manual_results_select on public.production_manual_results for select to authenticated
using(public.has_permission('hasil_produksi.view') or public.has_permission('payroll.view') or public.has_permission('payroll.operator.view'));
grant select on public.production_manual_results to authenticated;
grant usage,select on sequence public.smpt_manual_result_code_seq to authenticated;

create or replace function public.record_manual_production_result(
  p_result_date date,
  p_project_id bigint,
  p_product_id bigint,
  p_work_item_id bigint,
  p_worker_id bigint,
  p_qty numeric,
  p_reason text
) returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project public.projects%rowtype;
  v_product public.project_products%rowtype;
  v_item public.work_items%rowtype;
  v_worker public.workers%rowtype;
  v_id bigint;
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_submission numeric;
begin
  if not public.has_permission('hasil_produksi.write') then
    raise exception 'Tidak memiliki izin input Hasil Produksi manual.' using errcode='42501';
  end if;
  if coalesce(p_qty,0)<=0 then raise exception 'Qty hasil harus lebih dari 0.'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Alasan/catatan manipulasi wajib diisi.'; end if;
  if v_email='' then raise exception 'Email akun login tidak tersedia untuk audit trail.'; end if;
  if exists(
    select 1 from public.operator_payroll_runs r
    where r.status='FINAL' and coalesce(p_result_date,current_date) between r.period_start and r.period_end
  ) then
    raise exception 'Periode hasil ini sudah masuk Payroll Operator FINAL. Hasil manual baru tidak boleh disisipkan ke snapshot payroll lama.';
  end if;

  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Proyek tidak ditemukan.'; end if;
  if upper(coalesce(v_project.status,'')) in ('SELESAI','NONAKTIF','BATAL','DIBATALKAN') then
    raise exception 'Proyek sudah tidak aktif untuk input hasil.';
  end if;

  select * into v_product from public.project_products
  where id=p_product_id and project_id=p_project_id and status='AKTIF';
  if not found then raise exception 'Produk/Tas tidak sesuai Proyek atau NONAKTIF.'; end if;

  select * into v_item from public.work_items
  where id=p_work_item_id and project_id=p_project_id and product_id=p_product_id and status='AKTIF';
  if not found then raise exception 'Item Pekerjaan tidak sesuai Proyek/Produk atau NONAKTIF.'; end if;
  if v_item.executor_scope not in ('PEKERJA_HARIAN','KEDUANYA') then
    raise exception 'Item Pekerjaan ini tidak dikonfigurasi untuk Pekerja HARIAN.';
  end if;
  if v_item.submission_category<>'BORONGAN' then
    raise exception 'Item Pekerjaan ini tidak mempunyai kategori pengajuan BORONGAN.';
  end if;

  select * into v_worker from public.workers where id=p_worker_id and status='AKTIF';
  if not found then raise exception 'Pekerja tidak ditemukan atau NONAKTIF.'; end if;
  if upper(coalesce(v_worker.pay_system,''))<>'HARIAN' then
    raise exception 'Flow manipulasi ini hanya untuk pekerja dengan sistem bayar HARIAN.';
  end if;

  v_submission:=round((p_qty*v_item.proposed_price)::numeric,2);

  insert into public.production_manual_results(
    result_date,project_id,product_id,work_item_id,worker_id,
    project_code_snapshot,project_name_snapshot,product_code_snapshot,product_name_snapshot,
    work_item_code_snapshot,work_item_name_snapshot,worker_code_snapshot,worker_name_snapshot,worker_pay_system_snapshot,
    qty_good,operator_price_snapshot,submission_price_snapshot,operator_value,submission_value,reason,
    created_by,created_by_email_snapshot
  ) values(
    coalesce(p_result_date,current_date),p_project_id,p_product_id,p_work_item_id,p_worker_id,
    v_project.project_code,v_project.name,v_product.product_code,v_product.name,
    v_item.item_code,v_item.name,v_worker.worker_code,v_worker.name,'HARIAN',
    p_qty,v_item.operator_price,v_item.proposed_price,0,v_submission,btrim(p_reason),
    auth.uid(),v_email
  ) returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.record_manual_production_result(date,bigint,bigint,bigint,bigint,numeric,text) from public;
grant execute on function public.record_manual_production_result(date,bigint,bigint,bigint,bigint,numeric,text) to authenticated;

create or replace function public.cancel_manual_production_result(
  p_result_id bigint,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result public.production_manual_results%rowtype;
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
begin
  if not public.has_permission('hasil_produksi.write') then
    raise exception 'Tidak memiliki izin membatalkan Hasil Produksi manual.' using errcode='42501';
  end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Alasan pembatalan wajib diisi.'; end if;
  if v_email='' then raise exception 'Email akun login tidak tersedia untuk audit trail.'; end if;

  select * into v_result from public.production_manual_results where id=p_result_id for update;
  if not found then raise exception 'Hasil manual tidak ditemukan.'; end if;
  if v_result.status<>'AKTIF' then raise exception 'Hasil manual ini sudah dibatalkan.'; end if;
  if exists(
    select 1 from public.operator_payroll_runs r
    where r.status='FINAL' and v_result.result_date between r.period_start and r.period_end
  ) then
    raise exception 'Hasil manual tidak boleh dibatalkan setelah periode Payroll Operator sudah FINAL. Batalkan/rekonsiliasi payroll terlebih dahulu.';
  end if;

  update public.production_manual_results
  set status='DIBATALKAN',
      cancelled_by=auth.uid(),
      cancelled_by_email_snapshot=v_email,
      cancelled_at=now(),
      cancellation_reason=btrim(p_reason)
  where id=p_result_id;
end;
$$;
revoke all on function public.cancel_manual_production_result(bigint,text) from public;
grant execute on function public.cancel_manual_production_result(bigint,text) to authenticated;

-- --------------------------------------------------------------------------
-- 4) PROGRESS = CHECKER RESULT + ACTIVE MANUAL HARIAN RESULT
-- Avoid raw-row cross joins by aggregating each source independently.
-- --------------------------------------------------------------------------
create or replace view public.v_work_item_equivalent_progress
with (security_invoker = true)
as
with checker_agg as (
  select
    i.work_item_id,
    coalesce(sum(c.good_qty) filter(where c.status='AKTIF' and o.status<>'DIBATALKAN'),0)::numeric(18,4) as qty_sah,
    coalesce(sum(c.good_qty) filter(where c.status='AKTIF' and o.status<>'DIBATALKAN' and c.check_date=current_date),0)::numeric(18,4) as qty_sah_today
  from public.production_order_items i
  join public.production_orders o on o.id=i.order_id
  left join public.production_checks c on c.order_item_id=i.id
  where i.status<>'DIBATALKAN'
  group by i.work_item_id
), manual_agg as (
  select
    m.work_item_id,
    coalesce(sum(m.qty_good) filter(where m.status='AKTIF'),0)::numeric(18,4) as qty_sah,
    coalesce(sum(m.qty_good) filter(where m.status='AKTIF' and m.result_date=current_date),0)::numeric(18,4) as qty_sah_today
  from public.production_manual_results m
  group by m.work_item_id
), agg as (
  select
    w.project_id,
    w.product_id,
    w.id as work_item_id,
    w.name as work_item_name,
    w.unit,
    w.qty_per_product,
    w.display_order,
    w.routing_validation_mode,
    pp.target_production,
    (coalesce(c.qty_sah,0)+coalesce(m.qty_sah,0))::numeric(18,4) as qty_sah,
    (coalesce(c.qty_sah_today,0)+coalesce(m.qty_sah_today,0))::numeric(18,4) as qty_sah_today
  from public.work_items w
  join public.project_products pp on pp.id=w.product_id and pp.project_id=w.project_id
  left join checker_agg c on c.work_item_id=w.id
  left join manual_agg m on m.work_item_id=w.id
  where w.product_id is not null
)
select
  a.*,
  round((a.target_production*a.qty_per_product)::numeric,4) as target_raw_qty,
  round((a.qty_sah/nullif(a.qty_per_product,0))::numeric,4) as equivalent_product,
  round((a.qty_sah_today/nullif(a.qty_per_product,0))::numeric,4) as equivalent_today,
  round(greatest(a.target_production-(a.qty_sah/nullif(a.qty_per_product,0)),0)::numeric,4) as remaining_equivalent,
  round(greatest((a.qty_sah/nullif(a.qty_per_product,0))-a.target_production,0)::numeric,4) as over_equivalent,
  round(case when a.target_production>0
    then ((a.qty_sah/nullif(a.qty_per_product,0))/a.target_production)*100
    else 0 end::numeric,2) as progress_percent
from agg a;

-- --------------------------------------------------------------------------
-- 5) OPERATOR PAYROLL: HARIAN = operator value 0, submission remains separate.
-- Manual HARIAN results are included in the same existing payroll architecture.
-- --------------------------------------------------------------------------
create or replace function public.finalize_operator_payroll(p_start date,p_end date,p_notes text default null) returns bigint
language plpgsql security definer set search_path=''
as $$
declare
  v_run bigint;
  r record;
  v_op numeric:=0;
  v_sub numeric:=0;
begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin Payroll Operator.' using errcode='42501';
  end if;
  if p_start is null or p_end is null or p_end<p_start then raise exception 'Periode tidak valid.'; end if;

  insert into public.operator_payroll_runs(period_start,period_end,notes)
  values(p_start,p_end,p_notes) returning id into v_run;

  for r in
    with source_rows as (
      select
        o.operator_worker_id as worker_id,
        w.name as worker_name,
        i.work_item_id,
        i.work_item_name_snapshot,
        c.good_qty::numeric as qty,
        case when upper(coalesce(w.pay_system,''))='HARIAN' then 0::numeric else i.operator_price_snapshot end as operator_price_snapshot,
        i.submission_price_snapshot::numeric as submission_price_snapshot
      from public.production_checks c
      join public.production_order_items i on i.id=c.order_item_id
      join public.production_orders o on o.id=i.order_id
      join public.workers w on w.id=o.operator_worker_id
      where c.status='AKTIF' and o.status<>'DIBATALKAN' and i.status<>'DIBATALKAN'
        and c.check_date between p_start and p_end

      union all

      select
        m.worker_id,
        m.worker_name_snapshot,
        m.work_item_id,
        m.work_item_name_snapshot,
        m.qty_good::numeric as qty,
        0::numeric as operator_price_snapshot,
        m.submission_price_snapshot::numeric as submission_price_snapshot
      from public.production_manual_results m
      where m.status='AKTIF' and m.result_date between p_start and p_end
    )
    select
      worker_id,worker_name,work_item_id,work_item_name_snapshot,
      sum(qty)::numeric(18,4) as qty,
      operator_price_snapshot::numeric(18,2) as operator_price_snapshot,
      submission_price_snapshot::numeric(18,2) as submission_price_snapshot
    from source_rows
    group by worker_id,worker_name,work_item_id,work_item_name_snapshot,operator_price_snapshot,submission_price_snapshot
    order by worker_id,work_item_id,operator_price_snapshot,submission_price_snapshot
  loop
    insert into public.operator_payroll_items(
      run_id,worker_id,work_item_id,worker_name_snapshot,work_item_name_snapshot,qty_approved,
      operator_price_snapshot,submission_price_snapshot,operator_value,submission_value
    ) values(
      v_run,r.worker_id,r.work_item_id,r.worker_name,r.work_item_name_snapshot,r.qty,
      r.operator_price_snapshot,r.submission_price_snapshot,
      round((r.qty*r.operator_price_snapshot)::numeric,2),
      round((r.qty*r.submission_price_snapshot)::numeric,2)
    );
    v_op:=v_op+round((r.qty*r.operator_price_snapshot)::numeric,2);
    v_sub:=v_sub+round((r.qty*r.submission_price_snapshot)::numeric,2);
  end loop;

  update public.operator_payroll_runs
  set total_operator_value=v_op,total_submission_value=v_sub
  where id=v_run;
  return v_run;
end;
$$;
revoke all on function public.finalize_operator_payroll(date,date,text) from public;
grant execute on function public.finalize_operator_payroll(date,date,text) to authenticated;

-- Hard guard for new SPK: a HARIAN worker must never become the SPK borongan operator.
create or replace function public.create_production_order(
  p_order_date date,p_project_id bigint,p_product_id bigint,p_operator_worker_id bigint,
  p_checker_email text,p_supervisor_worker_id bigint default null,p_due_date date default null,p_notes text default null
) returns bigint
language plpgsql security definer set search_path=''
as $$
declare v_id bigint;v_checker_id uuid;
begin
  if not public.has_permission('spk.write') then raise exception 'Tidak memiliki izin membuat SPK.' using errcode='42501'; end if;

  perform 1 from public.projects where id=p_project_id and upper(coalesce(status,'')) not in ('SELESAI','NONAKTIF','BATAL','DIBATALKAN');
  if not found then raise exception 'Proyek tidak ditemukan atau sudah tidak aktif.'; end if;

  perform 1 from public.project_products where id=p_product_id and project_id=p_project_id and status='AKTIF';
  if not found then raise exception 'Produk/Tas tidak sesuai proyek atau NONAKTIF.'; end if;

  perform 1 from public.workers
  where id=p_operator_worker_id and status='AKTIF'
    and upper(coalesce(pay_system,''))='BORONGAN'
    and (upper(coalesce(position,'')) like '%OPERATOR%' or upper(coalesce(position,'')) like '%JAHIT%');
  if not found then raise exception 'Operator SPK harus pekerja BORONGAN aktif dengan posisi Operator/Jahit.'; end if;

  if p_supervisor_worker_id is not null then
    perform 1 from public.workers where id=p_supervisor_worker_id and status='AKTIF' and (upper(coalesce(position,'')) like '%SUPERVISOR%' or upper(coalesce(position,'')) like '%SPV%');
    if not found then raise exception 'Supervisor tidak ditemukan, NONAKTIF, atau bukan SPV.'; end if;
  end if;

  if btrim(coalesce(p_checker_email,''))='' then raise exception 'Checker wajib dipilih.'; end if;
  select u.id into v_checker_id from auth.users u where lower(u.email)=lower(btrim(p_checker_email)) limit 1;
  if v_checker_id is null then raise exception 'Akun Checker belum terdaftar di Supabase Auth.'; end if;
  if not public.smpt_user_has_permission(v_checker_id,'borongan.operate') then
    raise exception 'Akun Checker tidak aktif atau belum memiliki permission borongan.operate.' using errcode='42501';
  end if;

  insert into public.production_orders(order_date,project_id,product_id,operator_worker_id,checker_email,supervisor_worker_id,due_date,notes)
  values(coalesce(p_order_date,current_date),p_project_id,p_product_id,p_operator_worker_id,lower(btrim(p_checker_email)),p_supervisor_worker_id,p_due_date,nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_production_order(date,bigint,bigint,bigint,text,bigint,date,text) from public;
grant execute on function public.create_production_order(date,bigint,bigint,bigint,text,bigint,date,text) to authenticated;

-- SPK item assignment only accepts work configured for BORONGAN operator or both.
create or replace function public.add_production_order_item(
  p_order_id bigint,
  p_work_item_id bigint,
  p_assigned_qty numeric
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.production_orders%rowtype;
  v jsonb;
  v_capacity jsonb;
  v_id bigint;
  v_project bigint;
  v_product bigint;
  v_target_remaining numeric(18,4);
  v_hard_route_remaining numeric(18,4);
  v_route_remaining numeric(18,4);
  v_hard boolean;
begin
  if not public.has_permission('spk.write') then
    raise exception 'Tidak memiliki izin mengubah SPK.' using errcode='42501';
  end if;

  select * into v_order from public.production_orders where id=p_order_id for update;
  if not found or v_order.status<>'DRAFT' then raise exception 'SPK harus DRAFT.'; end if;
  if coalesce(p_assigned_qty,0)<=0 then raise exception 'Qty penugasan harus lebih besar dari nol.'; end if;

  v:=public.smpt_work_item_snapshot(p_work_item_id);
  if (v->>'status')<>'AKTIF' then raise exception 'Item pekerjaan NONAKTIF.'; end if;
  v_project:=(v->>'project_id')::bigint;
  v_product:=(v->>'product_id')::bigint;
  if v_project is not null and v_project<>v_order.project_id then raise exception 'Item pekerjaan tidak sesuai proyek SPK.'; end if;
  if v_product is not null and v_product<>v_order.product_id then raise exception 'Item pekerjaan tidak sesuai Produk/Tas SPK.'; end if;

  perform 1 from public.work_items
  where id=p_work_item_id and executor_scope in ('OPERATOR_BORONGAN','KEDUANYA');
  if not found then
    raise exception 'Item Pekerjaan ini dikonfigurasi khusus Pekerja HARIAN dan tidak boleh dimasukkan ke SPK Operator BORONGAN.';
  end if;

  v_capacity:=public.smpt_spk_item_capacity(p_order_id,p_work_item_id);
  v_target_remaining:=coalesce((v_capacity->>'target_remaining_raw')::numeric,0);
  v_hard_route_remaining:=nullif(v_capacity->>'hard_route_available_raw','')::numeric;
  v_route_remaining:=nullif(v_capacity->>'route_available_raw','')::numeric;
  v_hard:=coalesce((v_capacity->>'hard_enforced')::boolean,false);

  if p_assigned_qty>v_target_remaining+0.00005 then
    raise exception 'Qty SPK melebihi sisa target item. Maksimum saat ini % %.',
      v_target_remaining,coalesce(v->>'unit','PCS');
  end if;

  if v_hard and p_assigned_qty>coalesce(v_hard_route_remaining,0)+0.00005 then
    raise exception 'HARD ROUTING: WIP predecessor tidak cukup untuk Qty SPK. Maksimum yang boleh ditugaskan saat ini % % (setelah alokasi SPK aktif).',
      coalesce(v_hard_route_remaining,0),coalesce(v->>'unit','PCS');
  end if;

  insert into public.production_order_items(
    order_id,work_item_id,work_item_name_snapshot,unit_snapshot,qty_per_product_snapshot,
    operator_price_snapshot,submission_price_snapshot,assigned_qty,is_final_output_snapshot
  )
  values(
    p_order_id,p_work_item_id,v->>'name',v->>'unit',(v->>'qty_per_product')::numeric,
    (v->>'operator_price')::numeric,(v->>'submission_price')::numeric,p_assigned_qty,(v->>'is_final_output')::boolean
  )
  on conflict(order_id,work_item_id) do update set
    assigned_qty=excluded.assigned_qty,
    work_item_name_snapshot=excluded.work_item_name_snapshot,
    unit_snapshot=excluded.unit_snapshot,
    qty_per_product_snapshot=excluded.qty_per_product_snapshot,
    operator_price_snapshot=excluded.operator_price_snapshot,
    submission_price_snapshot=excluded.submission_price_snapshot,
    is_final_output_snapshot=excluded.is_final_output_snapshot,
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.add_production_order_item(bigint,bigint,numeric) from public;
grant execute on function public.add_production_order_item(bigint,bigint,numeric) to authenticated;

-- --------------------------------------------------------------------------
-- 6) SETUP & DATA TEST INTEGRATION
-- --------------------------------------------------------------------------
alter table public.system_test_runs drop constraint if exists system_test_runs_run_type_check;
alter table public.system_test_runs add constraint system_test_runs_run_type_check
  check(run_type in ('DIAGNOSTIC','DUMMY_FULL','REPEAT_ORDER','MANIPULASI_PAYROLL','BACKUP','RESTORE','RESET'));

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
  'production_orders','production_order_items','production_checks','production_manual_results','finished_goods','locations','vendors','embarkations',
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

-- Attach capture to newly added whitelisted tables as well.
do $$
declare r record;v_trigger text;
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

create or replace function public.smpt_run_repeat_order_test()
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
  v_source bigint;v_repeat bigint;v_product bigint;v_material bigint;v_work1 bigint;v_work2 bigint;v_dep bigint;
  v_operator bigint;v_repeat_product bigint;v_repeat_work bigint;v_spk bigint;
  v_rpc jsonb;v_count bigint;v_tx bigint;v_target numeric;v_profile text;v_category text;
  v_fail_message text;v_fail_state text;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Runtime Test Repeat Order.' using errcode='42501'; end if;
  if v_email='' then raise exception 'Email akun login tidak tersedia. Runtime test memerlukan akun Auth aktif.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));

  v_run_code:='RPT-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,created_by)
  values(v_run_code,'REPEAT_ORDER','RUNNING',jsonb_build_object('current_step','INIT'),auth.uid()) returning id into v_run_id;

  begin
    perform set_config('smpt.test_run_id',v_run_id::text,true);

    v_step:='SOURCE_MASTER';
    insert into public.projects(project_code,name,product_category,customer_name,start_date,end_date,status)
    values(v_run_code||'-SRC','REPEAT SOURCE '||v_run_code,'TEST','SYSTEM TEST',current_date,current_date+30,'Berjalan') returning id into v_source;
    insert into public.project_products(project_id,name,target_production,unit,status,notes)
    values(v_source,'REPEAT PRODUCT',10,'PCS','AKTIF',v_run_code) returning id into v_product;
    insert into public.materials(name,standard_unit,category,status)
    values('REPEAT MATERIAL '||v_run_code,'PCS','LAINNYA','AKTIF') returning id into v_material;
    insert into public.bom_requirements(project_id,product_id,material_id,component_type,component_name,unit,qty_per_unit,unit_price,status)
    values(v_source,v_product,v_material,'BAHAN','REPEAT MATERIAL '||v_run_code,'PCS',2,1000,'AKTIF');
    insert into public.work_items(project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,output_final,flow_mode,routing_validation_mode,executor_scope,submission_category)
    values(v_source,v_product,'REPEAT STEP 1','Pcs',1,500,800,'AKTIF',false,'KHUSUS','HARD','KEDUANYA','BORONGAN') returning id into v_work1;
    insert into public.work_items(project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,output_final,flow_mode,routing_validation_mode,executor_scope,submission_category)
    values(v_source,v_product,'REPEAT STEP 2','Pcs',1,600,900,'AKTIF',true,'KHUSUS','HARD','KEDUANYA','BORONGAN') returning id into v_work2;
    insert into public.work_item_dependencies(product_id,predecessor_work_item_id,successor_work_item_id,dependency_type,validation_mode,status,source_mode,notes)
    values(v_product,v_work1,v_work2,'SEQUENTIAL','HARD','AKTIF','MANUAL_SPECIAL',v_run_code) returning id into v_dep;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('project',v_source,'product',v_product,'work_items',2,'routing',v_dep),'expected','Source master/config lengkap.'));

    v_step:='REPEAT_CLONE';
    v_rpc:=public.smpt_create_repeat_order(
      v_source,v_run_code||'-NEW','REPEAT NEW '||v_run_code,'TEST','SYSTEM TEST',0,current_date,current_date+60,'Pending',v_run_code,
      jsonb_build_object(v_product::text,25)
    );
    v_repeat:=(v_rpc->>'project_id')::bigint;
    select id,target_production into v_repeat_product,v_target from public.project_products where project_id=v_repeat order by id limit 1;
    select id,executor_scope,submission_category into v_repeat_work,v_profile,v_category from public.work_items where project_id=v_repeat and name='REPEAT STEP 1';
    if v_repeat is null or v_target<>25 or v_profile<>'KEDUANYA' or v_category<>'BORONGAN' then
      raise exception 'Repeat clone master/config tidak sesuai target/profile.';
    end if;
    select count(*) into v_count from public.work_items where project_id=v_repeat;
    if v_count<>2 then raise exception 'Repeat clone Item Pekerjaan %, expected 2.',v_count; end if;
    select count(*) into v_count from public.bom_requirements where project_id=v_repeat;
    if v_count<>1 then raise exception 'Repeat clone BOM %, expected 1.',v_count; end if;
    select count(*) into v_count from public.work_item_dependencies d join public.project_products pp on pp.id=d.product_id where pp.project_id=v_repeat;
    if v_count<>1 then raise exception 'Repeat clone Routing %, expected 1.',v_count; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',v_rpc,'expected','Produk target=25, Item=2, BOM=1, Routing=1, profile payroll ikut tercopy.'));

    v_step:='NO_TRANSACTION_COPY';
    select
      (select count(*) from public.production_orders where project_id=v_repeat)
      +(select count(*) from public.material_requests where project_id=v_repeat)
      +(select count(*) from public.purchase_plans where project_id=v_repeat)
      +(select count(*) from public.finished_goods where project_id=v_repeat)
      +(select count(*) from public.production_manual_results where project_id=v_repeat)
    into v_tx;
    if v_tx<>0 then raise exception 'Transaksi ikut tercopy: % row.',v_tx; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',v_tx,'expected',0));

    v_step:='TRACEABILITY';
    perform 1 from public.projects where id=v_repeat and repeat_source_project_id=v_source and repeat_order_note=v_run_code;
    if not found then raise exception 'Trace source project Repeat Order tidak tersimpan.'; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('source_project_id',v_source,'repeat_project_id',v_repeat),'expected','repeat_source_project_id menunjuk source.'));

    v_step:='REPEAT_USABLE';
    insert into public.workers(name,department,position,pay_system,status,notes)
    values('REPEAT OPERATOR '||v_run_code,'PRODUKSI','OPERATOR JAHIT','BORONGAN','AKTIF',v_run_code) returning id into v_operator;
    v_spk:=public.create_production_order(current_date,v_repeat,v_repeat_product,v_operator,v_email,null,current_date+7,v_run_code);
    perform public.add_production_order_item(v_spk,v_repeat_work,1);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('spk_id',v_spk),'expected','Repeat project dapat dipakai membuat Draft SPK normal setelah clone.'));

    perform set_config('smpt.test_run_id','',true);
  exception when others then
    v_fail_message:=sqlerrm;v_fail_state:=sqlstate;
    perform set_config('smpt.test_run_id','',true);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','FAIL','actual',v_fail_message,'expected','Step selesai tanpa exception.','error_database',v_fail_message,'sqlstate',v_fail_state,'possible_cause','Periksa migration Repeat Order, permission, FK, RPC signature, dan data test.'));
  end;

  if v_fail_message is not null then
    v_result:=jsonb_build_object('run_code',v_run_code,'status','FAIL','failed_step',v_step,'steps',v_steps,'error',v_fail_message,'sqlstate',v_fail_state,'reference_test_run_id',v_run_id,'rolled_back_dummy_data',true);
    update public.system_test_runs set status='FAIL',result=v_result,finished_at=now() where id=v_run_id;
    return v_result;
  end if;

  v_result:=jsonb_build_object('run_code',v_run_code,'status','PASS','steps',v_steps,'reference_test_run_id',v_run_id,'source_project_id',v_source,'repeat_project_id',v_repeat,'transactions_copied',0,'resettable',true);
  update public.system_test_runs set status='PASS',result=v_result,finished_at=now() where id=v_run_id;
  return v_result;
end;
$$;
revoke all on function public.smpt_run_repeat_order_test() from public;
grant execute on function public.smpt_run_repeat_order_test() to authenticated;

create or replace function public.smpt_run_manual_borongan_test()
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
  v_project bigint;v_product bigint;v_work bigint;v_worker bigint;v_manual bigint;v_op_run bigint;v_payout bigint;
  v_period_end date;v_period_start date;v_attendance_date date;
  v_qty numeric;v_eq numeric;v_op_value numeric;v_sub_value numeric;v_daily_paid numeric;
  v_fail_message text;v_fail_state text;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Runtime Test Manipulasi Payroll.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));

  v_run_code:='MNP-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,created_by)
  values(v_run_code,'MANIPULASI_PAYROLL','RUNNING',jsonb_build_object('current_step','INIT'),auth.uid()) returning id into v_run_id;

  begin
    perform set_config('smpt.test_run_id',v_run_id::text,true);

    -- Deterministic isolated Sat-Fri period; unique per test run and outside normal operational dates.
    v_period_end:=date '1900-01-05'+(v_run_id::integer*7);
    v_period_start:=v_period_end-6;
    v_attendance_date:=v_period_start;

    v_step:='MASTER_HARIAN';
    insert into public.projects(project_code,name,product_category,customer_name,start_date,end_date,status)
    values(v_run_code,'MANIP TEST '||v_run_code,'TEST','SYSTEM TEST',v_period_start,v_period_end,'Berjalan') returning id into v_project;
    insert into public.project_products(project_id,name,target_production,unit,status,notes)
    values(v_project,'MANIP PRODUCT',20,'PCS','AKTIF',v_run_code) returning id into v_product;
    insert into public.work_items(project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,executor_scope,submission_category)
    values(v_project,v_product,'MANIP WORK','Pcs',2,500,1200,'AKTIF','PEKERJA_HARIAN','BORONGAN') returning id into v_work;
    insert into public.workers(name,department,position,pay_system,daily_wage,status,notes)
    values('MANIP HARIAN '||v_run_code,'PRODUKSI','HELPER','HARIAN',100000,'AKTIF',v_run_code) returning id into v_worker;
    insert into public.attendance_records(worker_id,attendance_date,attendance_status,day_class,overtime_minutes,verification_status,source,verified_by,verified_at,notes)
    values(v_worker,v_attendance_date,'HADIR','FULL_DAY',0,'TERVERIFIKASI','MANUAL',auth.uid(),now(),v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('worker_id',v_worker,'pay_system','HARIAN','daily_wage',100000),'expected','HARIAN + item PEKERJA_HARIAN/BORONGAN.'));

    v_step:='MANUAL_RESULT_PROGRESS';
    v_manual:=public.record_manual_production_result(v_attendance_date,v_project,v_product,v_work,v_worker,10,v_run_code||' alasan runtime test');
    select qty_sah,equivalent_product into v_qty,v_eq from public.v_work_item_equivalent_progress where work_item_id=v_work;
    if v_qty<>10 or v_eq<>5 then raise exception 'Progress hasil manual salah: qty %, equivalent %.',v_qty,v_eq; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('manual_result_id',v_manual,'qty_sah',v_qty,'equivalent_product',v_eq),'expected','Qty Sah 10; Equivalent 5.'));

    v_step:='OPERATOR_SUBMISSION_NO_DOUBLE_PAY';
    v_op_run:=public.finalize_operator_payroll(v_period_start,v_period_end,v_run_code);
    select operator_value,submission_value into v_op_value,v_sub_value
    from public.operator_payroll_items
    where run_id=v_op_run and worker_id=v_worker and work_item_id=v_work;
    if coalesce(v_op_value,-1)<>0 or coalesce(v_sub_value,-1)<>12000 then
      raise exception 'Payroll Operator salah: operator %, pengajuan %.',v_op_value,v_sub_value;
    end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('operator_value',v_op_value,'submission_value',v_sub_value),'expected','Operator=0; Pengajuan=10 x 1.200 = 12.000.'));

    v_step:='DAILY_PAYROLL_SEPARATE';
    v_payout:=public.finalize_payroll_payout('MINGGUAN',v_period_start,v_period_end,v_run_code);
    select total_paid into v_daily_paid from public.payroll_payout_details where payout_id=v_payout and worker_id=v_worker;
    if coalesce(v_daily_paid,-1)<>100000 then raise exception 'Payroll HARIAN salah: %.',v_daily_paid; end if;
    if v_op_value<>0 then raise exception 'Double-pay terdeteksi pada operator value.'; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('daily_payroll',v_daily_paid,'operator_value',v_op_value,'submission_value',v_sub_value),'expected','Payroll HARIAN=100.000 tetap terpisah; operator value=0; pengajuan=12.000.'));

    v_step:='AUDIT_TRAIL';
    perform 1 from public.production_manual_results m
    where m.id=v_manual and m.project_id=v_project and m.product_id=v_product and m.work_item_id=v_work and m.worker_id=v_worker
      and m.qty_good=10 and m.operator_price_snapshot=500 and m.submission_price_snapshot=1200
      and m.created_by=auth.uid() and btrim(m.created_by_email_snapshot)<>'' and btrim(m.reason)<>'';
    if not found then raise exception 'Audit trail hasil manual tidak lengkap.'; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('manual_result_id',v_manual),'expected','Actor/time/reason/scope/qty/price snapshot tersimpan.'));

    perform set_config('smpt.test_run_id','',true);
  exception when others then
    v_fail_message:=sqlerrm;v_fail_state:=sqlstate;
    perform set_config('smpt.test_run_id','',true);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','FAIL','actual',v_fail_message,'expected','Step selesai tanpa exception.','error_database',v_fail_message,'sqlstate',v_fail_state,'possible_cause','Periksa profile Item, manual result ledger, progress view, payroll operator, payout mingguan, atau permission.'));
  end;

  if v_fail_message is not null then
    v_result:=jsonb_build_object('run_code',v_run_code,'status','FAIL','failed_step',v_step,'steps',v_steps,'error',v_fail_message,'sqlstate',v_fail_state,'reference_test_run_id',v_run_id,'rolled_back_dummy_data',true);
    update public.system_test_runs set status='FAIL',result=v_result,finished_at=now() where id=v_run_id;
    return v_result;
  end if;

  v_result:=jsonb_build_object('run_code',v_run_code,'status','PASS','steps',v_steps,'reference_test_run_id',v_run_id,'manual_result_id',v_manual,'operator_payroll_run_id',v_op_run,'payroll_payout_id',v_payout,'double_pay',false,'resettable',true);
  update public.system_test_runs set status='PASS',result=v_result,finished_at=now() where id=v_run_id;
  return v_result;
end;
$$;
revoke all on function public.smpt_run_manual_borongan_test() from public;
grant execute on function public.smpt_run_manual_borongan_test() to authenticated;

-- Exact cleanup now accepts feature-test PASS runs too. It still deletes only captured row IDs.
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
  if upper(btrim(coalesce(p_confirmation,'')))<>'DELETE DUMMY' then raise exception 'Ketik DELETE DUMMY untuk menghapus run test.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));
  select * into v_run from public.system_test_runs
  where id=p_run_id and run_type in ('DUMMY_FULL','REPEAT_ORDER','MANIPULASI_PAYROLL') and status='PASS'
  for update;
  if not found then raise exception 'Run test PASS yang dapat dibersihkan tidak ditemukan.'; end if;
  if coalesce((v_run.result->>'reset_at'),'')<>'' then raise exception 'Run test ini sudah pernah di-reset.'; end if;
  if coalesce((v_run.result->>'maintenance_invalidated_at'),'')<>'' then raise exception 'Tracking Run Test ini sudah diinvalidasi oleh maintenance/reset lain. Jangan hapus berdasarkan ID lama.'; end if;

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
  values(v_reset_code,'RESET','PASS',jsonb_build_object('dummy_run_id',p_run_id,'dummy_run_code',v_run.run_code,'source_run_type',v_run.run_type,'deleted_rows',v_counts),now(),now(),auth.uid());
  return jsonb_build_object('status','PASS','run_code',v_reset_code,'dummy_run_code',v_run.run_code,'source_run_type',v_run.run_type,'deleted_rows',v_counts);
end;
$$;
revoke all on function public.smpt_reset_dummy_run(bigint,text) from public;
grant execute on function public.smpt_reset_dummy_run(bigint,text) to authenticated;

-- Keep maintenance semantics aligned with feature-test Run IDs and the new production ledger.
-- These replace existing functions; no parallel maintenance architecture is introduced.
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
  where run_type in ('DUMMY_FULL','REPEAT_ORDER','MANIPULASI_PAYROLL') and status='PASS' and coalesce(result->>'reset_at','')='' and coalesce(result->>'maintenance_invalidated_at','')='';

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
      v_seed:=v_seed||array['production_orders','production_manual_results','logistics_stock_events','logistics_stock_balances','embarkation_shipments'];
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
  where run_type in ('DUMMY_FULL','REPEAT_ORDER','MANIPULASI_PAYROLL') and status='PASS' and coalesce(result->>'reset_at','')='' and coalesce(result->>'maintenance_invalidated_at','')='';

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

-- New ledger is included in backup/restore through smpt_maintenance_tables(), and in
-- PRODUCTION_QC_LOGISTICS selective reset through the seed above.

notify pgrst, 'reload schema';
