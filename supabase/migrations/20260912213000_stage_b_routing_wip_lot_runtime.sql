-- SMPT V2 - Stage B runtime
-- Routing runtime + equivalent product + WIP validation + physical Roll/Lot operations.
-- SAFE RULES:
-- - Applied migrations are not edited.
-- - Existing stock ledger/balance remains canonical.
-- - Legacy historical production is preserved.
-- - HARD validation applies to new checker transactions only after routing is configured.

-- ============================================================
-- A. ROUTING RUNTIME / CHECKER VALIDATION
-- ============================================================

-- Checker needs bounded read access to routing data used by its assigned SPK.
drop policy if exists work_item_dependencies_select on public.work_item_dependencies;
create policy work_item_dependencies_select on public.work_item_dependencies
for select to authenticated using(
  public.has_permission('master_item.view')
  or public.has_permission('spk.view')
  or public.has_permission('produksi.view')
  or public.has_permission('hasil_produksi.view')
  or public.has_permission('borongan.view')
  or public.has_permission('laporan.view')
  or upper(coalesce(public.current_user_role(),''))='ADMIN'
);

drop policy if exists production_wip_consumptions_select on public.production_wip_consumptions;
create policy production_wip_consumptions_select on public.production_wip_consumptions
for select to authenticated using(
  public.has_permission('spk.view')
  or public.has_permission('produksi.view')
  or public.has_permission('hasil_produksi.view')
  or public.has_permission('borongan.view')
  or public.has_permission('laporan.view')
  or upper(coalesce(public.current_user_role(),''))='ADMIN'
);

-- Checker route preview is SECURITY DEFINER and assignment-scoped; work_items RLS is intentionally not widened.

alter table public.work_item_dependencies
  add column if not exists opening_consumed_equivalent numeric(18,4) not null default 0
    check (opening_consumed_equivalent>=0);

-- Branch-safe WIP: consumption is tracked per dependency edge.
-- Parallel successors may each consume the same predecessor output independently;
-- JOIN capacity still uses the minimum availability across its predecessor edges.
create or replace view public.v_work_item_dependency_capacity
with (security_invoker = true)
as
with consumed as (
  select dependency_id,
         coalesce(sum(equivalent_quantity) filter (where status='AKTIF'),0)::numeric(18,4) as consumed_equivalent
  from public.production_wip_consumptions
  group by dependency_id
)
select
  d.id as dependency_id,
  d.product_id,
  d.predecessor_work_item_id,
  d.successor_work_item_id,
  d.dependency_type,
  d.validation_mode,
  d.enforce_from,
  d.status,
  coalesce(p.equivalent_product,0) as predecessor_approved_equivalent,
  (d.opening_consumed_equivalent+coalesce(c.consumed_equivalent,0))::numeric(18,4) as predecessor_consumed_equivalent,
  round(greatest(coalesce(p.equivalent_product,0)-d.opening_consumed_equivalent-coalesce(c.consumed_equivalent,0),0)::numeric,4) as predecessor_available_equivalent
from public.work_item_dependencies d
left join public.v_work_item_equivalent_progress p
  on p.work_item_id=d.predecessor_work_item_id
left join consumed c on c.dependency_id=d.id;

create or replace view public.v_work_item_wip_available
with (security_invoker = true)
as
with edge_usage as (
  select predecessor_work_item_id,
         max(predecessor_consumed_equivalent)::numeric(18,4) as consumed_equivalent
  from public.v_work_item_dependency_capacity
  where status='AKTIF' and dependency_type<>'OPTIONAL'
  group by predecessor_work_item_id
)
select
  p.project_id,p.product_id,p.work_item_id,p.work_item_name,
  p.equivalent_product as approved_equivalent,
  coalesce(e.consumed_equivalent,0)::numeric(18,4) as consumed_equivalent,
  round((p.equivalent_product-coalesce(e.consumed_equivalent,0))::numeric,4) as raw_available_equivalent,
  round(greatest(p.equivalent_product-coalesce(e.consumed_equivalent,0),0)::numeric,4) as available_equivalent
from public.v_work_item_equivalent_progress p
left join edge_usage e on e.predecessor_work_item_id=p.work_item_id;

create or replace function public.upsert_work_item_dependency(
  p_product_id bigint,
  p_predecessor_work_item_id bigint,
  p_successor_work_item_id bigint,
  p_dependency_type text default 'SEQUENTIAL',
  p_validation_mode text default 'WARNING',
  p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_type text:=upper(btrim(coalesce(p_dependency_type,'SEQUENTIAL')));
  v_mode text:=upper(btrim(coalesce(p_validation_mode,'WARNING')));
  v_id bigint;
  v_old_status text;
  v_opening numeric(18,4):=0;
  v_pred_approved numeric(18,4):=0;
  v_project_id bigint;
begin
  if not (public.has_permission('master_item.write') or upper(coalesce(public.current_user_role(),''))='ADMIN') then
    raise exception 'Tidak memiliki izin mengubah dependency Item Pekerjaan.' using errcode='42501';
  end if;
  if v_type not in ('SEQUENTIAL','JOIN','OPTIONAL') then raise exception 'Dependency type tidak valid.'; end if;
  if v_mode not in ('WARNING','HARD') then raise exception 'Validation mode harus WARNING atau HARD.'; end if;
  select project_id into v_project_id from public.project_products where id=p_product_id;
  if v_project_id is null then raise exception 'Produk/Tas tidak ditemukan.'; end if;

  select id,status into v_id,v_old_status
  from public.work_item_dependencies
  where product_id=p_product_id
    and predecessor_work_item_id=p_predecessor_work_item_id
    and successor_work_item_id=p_successor_work_item_id;

  -- Historical successor output becomes opening consumption when an edge is first activated.
  if v_id is null or coalesce(v_old_status,'NONAKTIF')='NONAKTIF' then
    select coalesce(sum((c.good_qty+c.reject_qty)/nullif(i.qty_per_product_snapshot,0)),0)::numeric(18,4)
    into v_opening
    from public.production_order_items i
    join public.production_orders o on o.id=i.order_id and o.status<>'DIBATALKAN'
    join public.production_checks c on c.order_item_id=i.id and c.status='AKTIF'
    where o.product_id=p_product_id
      and i.work_item_id=p_successor_work_item_id;
    v_opening:=round(coalesce(v_opening,0)::numeric,4);
  end if;

  if v_id is null then
    insert into public.work_item_dependencies(
      product_id,predecessor_work_item_id,successor_work_item_id,dependency_type,validation_mode,
      enforce_from,status,notes,opening_consumed_equivalent,created_by,updated_by
    ) values(
      p_product_id,p_predecessor_work_item_id,p_successor_work_item_id,v_type,v_mode,
      now(),'AKTIF',nullif(btrim(coalesce(p_notes,'')),''),v_opening,auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    update public.work_item_dependencies
    set dependency_type=v_type,
        validation_mode=v_mode,
        status='AKTIF',
        notes=nullif(btrim(coalesce(p_notes,'')),''),
        enforce_from=case when v_old_status='NONAKTIF' then now() else enforce_from end,
        opening_consumed_equivalent=case when v_old_status='NONAKTIF' then v_opening else opening_consumed_equivalent end,
        updated_by=auth.uid(),updated_at=now()
    where id=v_id;
  end if;

  if (v_id is not null) and (v_old_status is null or v_old_status='NONAKTIF') and v_type<>'OPTIONAL' then
    select coalesce(equivalent_product,0)::numeric(18,4)
    into v_pred_approved
    from public.v_work_item_equivalent_progress
    where work_item_id=p_predecessor_work_item_id;
    v_pred_approved:=coalesce(v_pred_approved,0);
    if v_opening>v_pred_approved+0.00005 then
      insert into public.production_anomalies(
        anomaly_type,severity,project_id,product_id,work_item_id,dependency_id,
        available_equivalent,attempted_equivalent,excess_equivalent,source_kind,details,created_by
      ) values(
        'ROUTING_LEGACY_OPENING_DEFICIT','WARNING',v_project_id,p_product_id,p_successor_work_item_id,v_id,
        v_pred_approved,v_opening,round((v_opening-v_pred_approved)::numeric,4),'HISTORICAL_COMPAT',
        jsonb_build_object(
          'predecessor_work_item_id',p_predecessor_work_item_id,
          'successor_work_item_id',p_successor_work_item_id,
          'requested_validation_mode',v_mode,
          'opening_consumed_equivalent',v_opening
        ),auth.uid()
      );
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.upsert_work_item_dependency(bigint,bigint,bigint,text,text,text) from public;
grant execute on function public.upsert_work_item_dependency(bigint,bigint,bigint,text,text,text) to authenticated;

create or replace function public.smpt_get_equivalent_progress(
  p_project_id bigint default null,
  p_product_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if not (
    public.has_permission('hasil_produksi.view')
    or public.has_permission('master_item.view')
    or public.has_permission('spk.view')
    or public.has_permission('laporan.view')
    or upper(coalesce(public.current_user_role(),''))='ADMIN'
  ) then
    raise exception 'Tidak memiliki izin melihat progress produksi.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'project_id',x.project_id,'product_id',x.product_id,'work_item_id',x.work_item_id,
    'work_item_name',x.work_item_name,'unit',x.unit,'qty_per_product',x.qty_per_product,
    'display_order',x.display_order,'routing_validation_mode',x.routing_validation_mode,
    'target_production',x.target_production,'qty_sah',x.qty_sah,'qty_sah_today',x.qty_sah_today,
    'target_raw_qty',x.target_raw_qty,'equivalent_product',x.equivalent_product,
    'equivalent_today',x.equivalent_today,'remaining_equivalent',x.remaining_equivalent,
    'over_equivalent',x.over_equivalent,'progress_percent',x.progress_percent
  ) order by x.project_id,x.product_id,x.display_order,x.work_item_id),'[]'::jsonb)
  into v_result
  from public.v_work_item_equivalent_progress x
  where (p_project_id is null or x.project_id=p_project_id)
    and (p_product_id is null or x.product_id=p_product_id);
  return coalesce(v_result,'[]'::jsonb);
end;
$$;

revoke all on function public.smpt_get_equivalent_progress(bigint,bigint) from public;
grant execute on function public.smpt_get_equivalent_progress(bigint,bigint) to authenticated;

create or replace function public.smpt_preview_checker_route(
  p_order_item_id bigint,
  p_good_qty numeric,
  p_reject_qty numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_item public.production_order_items%rowtype;
  v_order public.production_orders%rowtype;
  v_processed_eq numeric(18,4);
  v_good_eq numeric(18,4);
  v_required integer:=0;
  v_capacity numeric(18,4);
  v_hard boolean:=false;
  v_warning boolean:=false;
  v_predecessors jsonb:='[]'::jsonb;
begin
  if not (
    public.has_permission('borongan.view')
    or public.has_permission('spk.view')
    or public.has_permission('produksi.view')
    or public.has_permission('hasil_produksi.view')
    or upper(coalesce(public.current_user_role(),''))='ADMIN'
  ) then
    raise exception 'Tidak memiliki izin melihat kapasitas routing.' using errcode='42501';
  end if;

  select * into v_item from public.production_order_items where id=p_order_item_id;
  if not found then raise exception 'Item SPK tidak ditemukan.'; end if;
  select * into v_order from public.production_orders where id=v_item.order_id;
  if not found then raise exception 'SPK tidak ditemukan.'; end if;
  if public.has_permission('borongan.view')
     and not public.has_permission('spk.view')
     and not public.has_permission('produksi.view')
     and not public.has_permission('hasil_produksi.view')
     and upper(coalesce(public.current_user_role(),''))<>'ADMIN'
     and lower(coalesce(v_order.checker_email,''))<>lower(coalesce(auth.jwt()->>'email','')) then
    raise exception 'SPK ini ditugaskan ke Checker lain.' using errcode='42501';
  end if;
  if coalesce(v_item.qty_per_product_snapshot,0)<=0 then raise exception 'Qty/Produk snapshot item tidak valid.'; end if;

  v_processed_eq:=round(((coalesce(p_good_qty,0)+coalesce(p_reject_qty,0))/v_item.qty_per_product_snapshot)::numeric,4);
  v_good_eq:=round((coalesce(p_good_qty,0)/v_item.qty_per_product_snapshot)::numeric,4);

  with deps as (
    select
      d.id,
      d.predecessor_work_item_id,
      d.dependency_type,
      d.validation_mode,
      d.enforce_from,
      coalesce(w.predecessor_approved_equivalent,0)::numeric(18,4) approved_equivalent,
      coalesce(w.predecessor_consumed_equivalent,0)::numeric(18,4) consumed_equivalent,
      coalesce(w.predecessor_available_equivalent,0)::numeric(18,4) available_equivalent
    from public.work_item_dependencies d
    left join public.v_work_item_dependency_capacity w
      on w.dependency_id=d.id
    where d.product_id=v_order.product_id
      and d.successor_work_item_id=v_item.work_item_id
      and d.status='AKTIF'
      and d.dependency_type<>'OPTIONAL'
  )
  select
    count(*),
    min(available_equivalent),
    bool_or(validation_mode='HARD' and now()>=enforce_from),
    bool_or(v_processed_eq>available_equivalent+0.00005),
    coalesce(jsonb_agg(jsonb_build_object(
      'dependency_id',id,
      'predecessor_work_item_id',predecessor_work_item_id,
      'dependency_type',dependency_type,
      'validation_mode',validation_mode,
      'enforce_from',enforce_from,
      'approved_equivalent',approved_equivalent,
      'consumed_equivalent',consumed_equivalent,
      'available_equivalent',available_equivalent,
      'attempted_processed_equivalent',v_processed_eq,
      'attempted_good_equivalent',v_good_eq,
      'excess_equivalent',greatest(v_processed_eq-available_equivalent,0)
    ) order by id),'[]'::jsonb)
  into v_required,v_capacity,v_hard,v_warning,v_predecessors
  from deps;

  return jsonb_build_object(
    'order_item_id',p_order_item_id,
    'product_id',v_order.product_id,
    'work_item_id',v_item.work_item_id,
    'qty_per_product',v_item.qty_per_product_snapshot,
    'processed_equivalent',v_processed_eq,
    'good_equivalent',v_good_eq,
    'has_dependencies',coalesce(v_required,0)>0,
    'required_predecessor_count',coalesce(v_required,0),
    'available_equivalent',case when coalesce(v_required,0)=0 then null else coalesce(v_capacity,0) end,
    'would_exceed',coalesce(v_warning,false),
    'hard_enforced',coalesce(v_hard,false),
    'predecessors',coalesce(v_predecessors,'[]'::jsonb)
  );
end;
$$;

create or replace function public.record_checker_result(
  p_order_item_id bigint,
  p_check_date date,
  p_good_qty numeric,
  p_reject_qty numeric,
  p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item public.production_order_items%rowtype;
  v_order public.production_orders%rowtype;
  v_used numeric;
  v_email text;
  v_id bigint;
  v_remaining int;
  v_processed_eq numeric(18,4);
  v_good_eq numeric(18,4);
  v_available numeric(18,4);
  v_mode text;
  v_hard boolean;
  r record;
begin
  if not public.has_permission('borongan.operate') then raise exception 'Akun ini bukan Checker yang berizin.' using errcode='42501'; end if;
  v_email:=lower(coalesce(auth.jwt()->>'email',''));

  select * into v_item from public.production_order_items where id=p_order_item_id for update;
  if not found or v_item.status<>'AKTIF' then raise exception 'Item SPK tidak aktif.'; end if;
  select * into v_order from public.production_orders where id=v_item.order_id for update;
  if v_order.status<>'AKTIF' then raise exception 'SPK belum aktif atau sudah ditutup.'; end if;
  if lower(v_order.checker_email)<>v_email then raise exception 'SPK ini ditugaskan ke Checker lain.' using errcode='42501'; end if;
  if coalesce(p_good_qty,0)<0 or coalesce(p_reject_qty,0)<0 or coalesce(p_good_qty,0)+coalesce(p_reject_qty,0)<=0 then raise exception 'Qty Checker tidak valid.'; end if;
  if coalesce(v_item.qty_per_product_snapshot,0)<=0 then raise exception 'Qty/Produk snapshot item tidak valid.'; end if;

  select coalesce(sum(good_qty+reject_qty),0) into v_used
  from public.production_checks
  where order_item_id=p_order_item_id and status='AKTIF';
  if v_used+p_good_qty+p_reject_qty>v_item.assigned_qty then
    raise exception 'Qty melebihi sisa penugasan (%).',greatest(v_item.assigned_qty-v_used,0);
  end if;

  v_processed_eq:=round(((coalesce(p_good_qty,0)+coalesce(p_reject_qty,0))/v_item.qty_per_product_snapshot)::numeric,4);
  v_good_eq:=round((coalesce(p_good_qty,0)/v_item.qty_per_product_snapshot)::numeric,4);

  -- Deterministic predecessor locks prevent two Checker submissions consuming the same WIP concurrently.
  for r in
    select d.*
    from public.work_item_dependencies d
    where d.product_id=v_order.product_id
      and d.successor_work_item_id=v_item.work_item_id
      and d.status='AKTIF'
      and d.dependency_type<>'OPTIONAL'
    order by d.predecessor_work_item_id,d.id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('SMPT_ROUTE_WIP:'||r.predecessor_work_item_id::text,0)
    );
  end loop;

  -- HARD gate before inserting the Checker result.
  for r in
    select d.*
    from public.work_item_dependencies d
    where d.product_id=v_order.product_id
      and d.successor_work_item_id=v_item.work_item_id
      and d.status='AKTIF'
      and d.dependency_type<>'OPTIONAL'
    order by d.id
  loop
    select coalesce(w.predecessor_available_equivalent,0)::numeric(18,4)
    into v_available
    from public.v_work_item_dependency_capacity w
    where w.dependency_id=r.id;
    v_available:=coalesce(v_available,0);
    v_mode:=upper(coalesce(r.validation_mode,'WARNING'));
    v_hard:=(v_mode='HARD' and now()>=r.enforce_from);

    if v_hard and v_processed_eq>v_available+0.00005 then
      raise exception 'HARD ROUTING: WIP predecessor tidak cukup. Tersedia % equivalent, diproses % equivalent.',
        round(v_available,4),round(v_processed_eq,4);
    end if;
  end loop;

  insert into public.production_checks(order_item_id,check_date,good_qty,reject_qty,notes,checker_user_id,checker_email)
  values(
    p_order_item_id,coalesce(p_check_date,current_date),p_good_qty,p_reject_qty,
    nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),v_email
  ) returning id into v_id;

  -- Consume upstream WIP for every required predecessor. Reject also consumes upstream WIP.
  for r in
    select d.*
    from public.work_item_dependencies d
    where d.product_id=v_order.product_id
      and d.successor_work_item_id=v_item.work_item_id
      and d.status='AKTIF'
      and d.dependency_type<>'OPTIONAL'
    order by d.id
  loop
    select coalesce(w.predecessor_available_equivalent,0)::numeric(18,4)
    into v_available
    from public.v_work_item_dependency_capacity w
    where w.dependency_id=r.id;
    v_available:=coalesce(v_available,0);

    insert into public.production_wip_consumptions(
      dependency_id,production_check_id,predecessor_work_item_id,successor_work_item_id,
      equivalent_quantity,status,notes,created_by
    ) values(
      r.id,v_id,r.predecessor_work_item_id,v_item.work_item_id,
      v_processed_eq,'AKTIF','Auto consume dari Checker '||v_id::text,auth.uid()
    );

    if v_processed_eq>v_available+0.00005 then
      insert into public.production_anomalies(
        anomaly_type,severity,project_id,product_id,work_item_id,dependency_id,production_check_id,
        available_equivalent,attempted_equivalent,excess_equivalent,source_kind,details,created_by
      ) values(
        'ROUTING_WIP_EXCEEDED',
        case when upper(coalesce(r.validation_mode,'WARNING'))='HARD' then 'HARD' else 'WARNING' end,
        v_order.project_id,v_order.product_id,v_item.work_item_id,r.id,v_id,
        v_available,v_processed_eq,round(greatest(v_processed_eq-v_available,0)::numeric,4),
        case when now()<r.enforce_from then 'HISTORICAL_COMPAT' else 'RUNTIME' end,
        jsonb_build_object(
          'good_equivalent',v_good_eq,
          'processed_equivalent',v_processed_eq,
          'qty_per_product',v_item.qty_per_product_snapshot,
          'predecessor_work_item_id',r.predecessor_work_item_id,
          'successor_work_item_id',v_item.work_item_id
        ),auth.uid()
      );
    end if;
  end loop;

  if v_used+p_good_qty+p_reject_qty=v_item.assigned_qty then
    update public.production_order_items set status='SELESAI' where id=p_order_item_id;
  end if;
  select count(*) into v_remaining
  from public.production_order_items
  where order_id=v_order.id and status='AKTIF';
  if v_remaining=0 then
    update public.production_orders
    set status='SELESAI',completed_at=now(),updated_by=auth.uid()
    where id=v_order.id;
  end if;
  return v_id;
end;
$$;

create or replace function public.cancel_checker_result(p_check_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.production_checks%rowtype;
  v_item public.production_order_items%rowtype;
  v_order_id bigint;
  v_cancel_good_eq numeric(18,4);
  v_approved numeric(18,4);
  v_consumed numeric(18,4);
  v_after numeric(18,4);
  v_has_hard boolean;
begin
  select * into v from public.production_checks where id=p_check_id for update;
  if not found or v.status<>'AKTIF' then raise exception 'Hasil Checker tidak aktif.'; end if;
  if auth.uid()<>v.checker_user_id and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Hanya Checker pembuat atau ADMIN yang dapat membatalkan.' using errcode='42501';
  end if;

  select * into v_item from public.production_order_items where id=v.order_item_id for update;
  if not found then raise exception 'Item SPK tidak ditemukan.'; end if;
  if coalesce(v_item.qty_per_product_snapshot,0)<=0 then raise exception 'Qty/Produk snapshot item tidak valid.'; end if;

  v_cancel_good_eq:=round((v.good_qty/v_item.qty_per_product_snapshot)::numeric,4);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('SMPT_ROUTE_WIP:'||v_item.work_item_id::text,0)
  );

  select coalesce(p.equivalent_product,0),
         coalesce(max(c.predecessor_consumed_equivalent) filter (where c.status='AKTIF' and c.dependency_type<>'OPTIONAL'),0)
  into v_approved,v_consumed
  from public.v_work_item_equivalent_progress p
  left join public.v_work_item_dependency_capacity c
    on c.predecessor_work_item_id=p.work_item_id
  where p.work_item_id=v_item.work_item_id
  group by p.equivalent_product;
  v_approved:=coalesce(v_approved,0);
  v_consumed:=coalesce(v_consumed,0);
  v_after:=round((v_approved-v_cancel_good_eq)::numeric,4);

  if v_consumed>v_after+0.00005 then
    select exists(
      select 1
      from public.v_work_item_dependency_capacity d
      where d.predecessor_work_item_id=v_item.work_item_id
        and d.status='AKTIF'
        and d.dependency_type<>'OPTIONAL'
        and d.validation_mode='HARD'
        and now()>=d.enforce_from
        and d.predecessor_consumed_equivalent>v_after+0.00005
    ) into v_has_hard;
    if v_has_hard then
      raise exception 'HARD ROUTING: hasil ini sudah menjadi WIP yang dikonsumsi proses berikutnya. Batalkan proses downstream terlebih dahulu.';
    end if;
  end if;

  update public.production_checks
  set status='DIBATALKAN',cancelled_at=now(),cancelled_by=auth.uid()
  where id=p_check_id;

  update public.production_wip_consumptions
  set status='DIBALIK',reversed_at=now(),notes=coalesce(notes,'')||' | Checker dibatalkan'
  where production_check_id=p_check_id and status='AKTIF';

  update public.production_anomalies
  set status='RESOLVED',resolved_at=now(),resolved_by=auth.uid(),
      details=details||jsonb_build_object('resolved_reason','CHECKER_CANCELLED')
  where production_check_id=p_check_id and status<>'RESOLVED';

  if v_consumed>v_after+0.00005 then
    insert into public.production_anomalies(
      anomaly_type,severity,project_id,product_id,work_item_id,production_check_id,
      available_equivalent,attempted_equivalent,excess_equivalent,source_kind,details,created_by
    ) values(
      'CANCEL_CREATES_WIP_DEFICIT','WARNING',
      (select o.project_id from public.production_orders o where o.id=v_item.order_id),
      (select o.product_id from public.production_orders o where o.id=v_item.order_id),
      v_item.work_item_id,p_check_id,
      v_after,v_consumed,round(greatest(v_consumed-v_after,0)::numeric,4),
      'RUNTIME',jsonb_build_object('approved_after_cancel',v_after,'consumed_downstream',v_consumed),auth.uid()
    );
  end if;

  update public.production_order_items set status='AKTIF' where id=v.order_item_id;
  select order_id into v_order_id from public.production_order_items where id=v.order_item_id;
  update public.production_orders
  set status='AKTIF',completed_at=null,updated_by=auth.uid()
  where id=v_order_id and status='SELESAI';
end;
$$;


create or replace function public.smpt_get_checker_route_status(p_order_item_ids bigint[])
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_result jsonb;
begin
  if p_order_item_ids is null or coalesce(array_length(p_order_item_ids,1),0)=0 then return '[]'::jsonb; end if;
  if coalesce(array_length(p_order_item_ids,1),0)>200 then raise exception 'Terlalu banyak item route preview.'; end if;
  if not (
    public.has_permission('borongan.view')
    or public.has_permission('spk.view')
    or public.has_permission('produksi.view')
    or public.has_permission('hasil_produksi.view')
    or upper(coalesce(public.current_user_role(),''))='ADMIN'
  ) then raise exception 'Tidak memiliki izin melihat routing.' using errcode='42501'; end if;

  select coalesce(jsonb_agg(x.payload order by x.order_item_id),'[]'::jsonb)
  into v_result
  from (
    select i.id as order_item_id,
      public.smpt_preview_checker_route(i.id,0,0) as payload
    from public.production_order_items i
    join public.production_orders o on o.id=i.order_id
    where i.id=any(p_order_item_ids)
      and (
        public.has_permission('spk.view')
        or public.has_permission('produksi.view')
        or public.has_permission('hasil_produksi.view')
        or upper(coalesce(public.current_user_role(),''))='ADMIN'
        or (public.has_permission('borongan.view') and lower(o.checker_email)=v_email)
      )
  ) x;
  return coalesce(v_result,'[]'::jsonb);
end;
$$;

revoke all on function public.smpt_preview_checker_route(bigint,numeric,numeric) from public;
grant execute on function public.smpt_preview_checker_route(bigint,numeric,numeric) to authenticated;
revoke all on function public.smpt_get_checker_route_status(bigint[]) from public;
grant execute on function public.smpt_get_checker_route_status(bigint[]) to authenticated;
revoke all on function public.record_checker_result(bigint,date,numeric,numeric,text) from public;
grant execute on function public.record_checker_result(bigint,date,numeric,numeric,text) to authenticated;
revoke all on function public.cancel_checker_result(bigint) from public;
grant execute on function public.cancel_checker_result(bigint) to authenticated;

-- ============================================================
-- B. PHYSICAL ROLL/LOT RUNTIME ON EXISTING CANONICAL STOCK LEDGER
-- ============================================================

alter table public.ready_production_usages
  add column if not exists material_lot_id bigint references public.material_lots(id) on update restrict on delete restrict,
  add column if not exists input_quantity numeric(18,4),
  add column if not exists input_unit text,
  add column if not exists conversion_factor numeric(20,10),
  add column if not exists status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')),
  add column if not exists cancellation_event_id bigint references public.stock_events(id) on update restrict on delete restrict,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

alter table public.cutting_material_usages
  add column if not exists material_lot_id bigint references public.material_lots(id) on update restrict on delete restrict,
  add column if not exists input_quantity numeric(18,4),
  add column if not exists input_unit text,
  add column if not exists conversion_factor numeric(20,10);

alter table public.material_lots
  add column if not exists current_project_id bigint references public.projects(id) on update restrict on delete restrict,
  add column if not exists current_product_id bigint,
  add column if not exists current_bom_requirement_id bigint references public.bom_requirements(id) on update restrict on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname='material_lots_current_product_fk'
      and conrelid='public.material_lots'::regclass
  ) then
    alter table public.material_lots
      add constraint material_lots_current_product_fk
      foreign key(current_project_id,current_product_id)
      references public.project_products(project_id,id)
      on update restrict on delete restrict;
  end if;
end;
$$;

create index if not exists material_lots_scope_location_idx
  on public.material_lots(current_project_id,current_product_id,current_location_id,status,id);

create or replace function public.create_material_lot(
  p_receipt_id bigint,
  p_roll_number text,
  p_original_quantity numeric,
  p_original_unit text,
  p_supplier_lot_no text default null,
  p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_receipt public.warehouse_receipts%rowtype;
  v_standard_unit text;
  v_mode text;
  v_factor numeric;
  v_normalized numeric(18,4);
  v_partitioned_receipt numeric(18,4);
  v_warehouse_balance numeric(18,4);
  v_lot_remaining_in_warehouse numeric(18,4);
  v_location smallint;
  v_id bigint;
begin
  if not (
    public.has_permission('barang_masuk_gudang.write')
    or public.has_permission('stok_gudang.write')
    or upper(coalesce(public.current_user_role(),''))='ADMIN'
  ) then
    raise exception 'Tidak memiliki izin membuat Roll/Lot bahan.' using errcode='42501';
  end if;
  if btrim(coalesce(p_roll_number,''))='' or p_original_quantity is null or p_original_quantity<=0 then
    raise exception 'Nomor Roll/Lot dan qty wajib valid.';
  end if;

  select * into v_receipt from public.warehouse_receipts where id=p_receipt_id for update;
  if not found or v_receipt.status<>'AKTIF' then raise exception 'Barang Masuk tidak ditemukan atau sudah dibatalkan.'; end if;
  select standard_unit,lot_tracking_mode into v_standard_unit,v_mode
  from public.materials where id=v_receipt.material_id and status='AKTIF';
  if v_standard_unit is null then raise exception 'Master Bahan tidak ditemukan/aktif.'; end if;
  if coalesce(v_mode,'NONE')='NONE' then raise exception 'Aktifkan mode LOT/ROLL pada Master Bahan terlebih dahulu.'; end if;

  v_factor:=public.smpt_resolve_conversion_factor(p_original_unit,v_standard_unit,null);
  v_normalized:=round((p_original_quantity*v_factor)::numeric,4);

  select coalesce(sum(normalized_quantity),0)::numeric(18,4)
  into v_partitioned_receipt
  from public.material_lots
  where receipt_id=p_receipt_id and status<>'CLOSED';
  if v_partitioned_receipt+v_normalized>v_receipt.quantity+0.00005 then
    raise exception 'Total Roll/Lot melebihi qty normalized Barang Masuk. Sisa receipt yang belum dipetakan: % %.',
      greatest(v_receipt.quantity-v_partitioned_receipt,0),v_standard_unit;
  end if;

  select id into v_location from public.stock_locations where code='GUDANG_BAHAN' and is_active=true;
  if v_location is null then raise exception 'Lokasi GUDANG_BAHAN tidak ditemukan.'; end if;

  select coalesce(sum(quantity),0)::numeric(18,4)
  into v_warehouse_balance
  from public.stock_balances
  where item_kind='MATERIAL' and material_id=v_receipt.material_id
    and location_id=v_location and project_id is null and product_id is null and bom_requirement_id is null;

  select coalesce(sum(remaining_normalized_quantity),0)::numeric(18,4)
  into v_lot_remaining_in_warehouse
  from public.material_lots
  where material_id=v_receipt.material_id
    and current_location_id=v_location
    and status in ('AVAILABLE','PARTIAL');

  if v_lot_remaining_in_warehouse+v_normalized>v_warehouse_balance+0.00005 then
    raise exception 'Qty Roll/Lot melebihi stok fisik Gudang yang masih tersedia. Stok % %, sudah dipetakan ke lot % %.',
      v_warehouse_balance,v_standard_unit,v_lot_remaining_in_warehouse,v_standard_unit;
  end if;

  insert into public.material_lots(
    material_id,receipt_id,roll_number,original_quantity,original_unit,
    conversion_factor,normalized_quantity,normalized_unit,remaining_normalized_quantity,
    current_location_id,status,supplier_lot_no,notes,created_by,updated_by
  ) values(
    v_receipt.material_id,p_receipt_id,btrim(p_roll_number),round(p_original_quantity::numeric,4),
    public.smpt_unit_key(p_original_unit),v_factor,v_normalized,v_standard_unit,v_normalized,
    v_location,'AVAILABLE',nullif(btrim(coalesce(p_supplier_lot_no,'')),''),
    nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_material_lot(bigint,text,numeric,text,text,text) from public;
grant execute on function public.create_material_lot(bigint,text,numeric,text,text,text) to authenticated;

-- Lot-aware variant. Canonical balance rules are identical to smpt_apply_stock_delta.
create or replace function public.smpt_apply_stock_delta_lot(
  p_event_id bigint,
  p_item_kind text,
  p_material_id bigint,
  p_component_id bigint,
  p_location_code text,
  p_project_id bigint,
  p_product_id bigint,
  p_bom_id bigint,
  p_delta numeric,
  p_movement_kind text,
  p_notes text,
  p_material_lot_id bigint default null,
  p_original_quantity_delta numeric default null,
  p_original_unit text default null,
  p_work_item_id bigint default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_loc smallint;
  v_unit text;
  v_balance_id bigint;
  v_current numeric(18,4);
  v_new numeric(18,4);
  v_kind text:=upper(btrim(p_item_kind));
begin
  if p_event_id is null or p_delta is null or p_delta=0 then raise exception 'Delta stok tidak valid.'; end if;
  select id into v_loc from public.stock_locations where code=upper(btrim(p_location_code)) and is_active=true;
  if v_loc is null then raise exception 'Lokasi stok tidak ditemukan: %',p_location_code; end if;

  if v_kind='MATERIAL' then
    select standard_unit into v_unit from public.materials where id=p_material_id;
    if v_unit is null then raise exception 'Material tidak ditemukan.'; end if;
    if p_material_lot_id is not null then
      perform 1 from public.material_lots where id=p_material_lot_id and material_id=p_material_id;
      if not found then raise exception 'Roll/Lot tidak sesuai material.'; end if;
    end if;
  elsif v_kind='CUTTING_COMPONENT' then
    select unit into v_unit from public.cutting_components where id=p_component_id;
    if v_unit is null then raise exception 'Komponen Cutting tidak ditemukan.'; end if;
    if p_material_lot_id is not null then raise exception 'Roll/Lot hanya berlaku untuk MATERIAL.'; end if;
  else
    raise exception 'Jenis item stok tidak valid.';
  end if;

  insert into public.stock_balances(item_kind,material_id,cutting_component_id,location_id,project_id,product_id,bom_requirement_id,quantity)
  values(v_kind,p_material_id,p_component_id,v_loc,p_project_id,p_product_id,p_bom_id,0)
  on conflict do nothing;

  select id,quantity into v_balance_id,v_current
  from public.stock_balances
  where item_kind=v_kind
    and material_id is not distinct from p_material_id
    and cutting_component_id is not distinct from p_component_id
    and location_id=v_loc
    and project_id is not distinct from p_project_id
    and product_id is not distinct from p_product_id
    and bom_requirement_id is not distinct from p_bom_id
  for update;
  if v_balance_id is null then raise exception 'Saldo stok gagal ditemukan.'; end if;

  v_new:=round((v_current+p_delta)::numeric,4);
  if v_new<0 then
    raise exception 'Stok tidak mencukupi. Tersedia % %, diminta % %.',v_current,v_unit,abs(p_delta),v_unit;
  end if;

  update public.stock_balances set quantity=v_new,updated_at=now() where id=v_balance_id;
  insert into public.stock_ledger_entries(
    event_id,item_kind,material_id,cutting_component_id,location_id,project_id,product_id,bom_requirement_id,
    movement_kind,quantity_delta,unit_snapshot,notes,material_lot_id,work_item_id,
    original_quantity_delta,original_unit_snapshot
  ) values(
    p_event_id,v_kind,p_material_id,p_component_id,v_loc,p_project_id,p_product_id,p_bom_id,
    upper(btrim(p_movement_kind)),round(p_delta::numeric,4),v_unit,nullif(btrim(coalesce(p_notes,'')),''),
    p_material_lot_id,p_work_item_id,
    case when p_original_quantity_delta is null then null else round(p_original_quantity_delta::numeric,4) end,
    case when p_original_unit is null then null else public.smpt_unit_key(p_original_unit) end
  );
end;
$$;

create or replace function public.issue_material_lot_whole(
  p_issue_date date,
  p_material_lot_id bigint,
  p_project_id bigint,
  p_product_id bigint,
  p_bom_requirement_id bigint,
  p_purpose text,
  p_recipient_worker_id bigint,
  p_recipient_name text,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_lot public.material_lots%rowtype;
  v_bom public.bom_requirements%rowtype;
  v_loc_code text;
  v_dest text;
  v_purpose text:=upper(btrim(coalesce(p_purpose,'')));
  v_name text;
  v_issue text;
  v_event bigint;
  v_issue_id bigint;
  v_original_remaining numeric(18,4);
begin
  if not public.has_permission('barang_keluar_gudang.write') then
    raise exception 'Tidak memiliki izin Barang Keluar Gudang.' using errcode='42501';
  end if;
  if p_issue_date is null then raise exception 'Tanggal wajib diisi.'; end if;
  if v_purpose not in ('CUTTING','PRODUKSI') then raise exception 'Roll bahan mentah hanya boleh keluar ke CUTTING atau PRODUKSI. Sablon menerima WIP hasil Cutting via Gudang Hasil.'; end if;

  select * into v_lot from public.material_lots where id=p_material_lot_id for update;
  if not found or v_lot.status not in ('AVAILABLE','PARTIAL') or v_lot.remaining_normalized_quantity<=0 then
    raise exception 'Roll/Lot tidak tersedia.';
  end if;
  select code into v_loc_code from public.stock_locations where id=v_lot.current_location_id;
  if v_loc_code<>'GUDANG_BAHAN' then raise exception 'Roll/Lot tidak berada di Gudang Bahan.'; end if;

  select * into v_bom from public.bom_requirements
  where id=p_bom_requirement_id
    and project_id=p_project_id
    and component_type='BAHAN'
    and status='AKTIF'
    and material_id=v_lot.material_id
    and (product_id is null or product_id is not distinct from p_product_id);
  if not found then raise exception 'BOM tidak sesuai Roll/Lot, Project, atau Produk/Tas.'; end if;

  if p_recipient_worker_id is not null then
    select name into v_name from public.workers where id=p_recipient_worker_id and status='AKTIF';
  else
    v_name:=btrim(coalesce(p_recipient_name,''));
  end if;
  if coalesce(v_name,'')='' then raise exception 'Nama pengambil wajib diisi.'; end if;

  v_dest:=case v_purpose when 'CUTTING' then 'CUTTING' else 'SIAP_PRODUKSI' end;
  v_issue:='BK-'||lpad(nextval('public.smpt_issue_code_seq')::text,6,'0');
  v_event:=public.smpt_create_stock_event('WAREHOUSE_ISSUE',p_issue_date,p_project_id,p_product_id,'ROLL_LOT',v_issue,null,p_notes);

  v_original_remaining:=round((v_lot.remaining_normalized_quantity/nullif(v_lot.conversion_factor,0))::numeric,4);

  perform public.smpt_apply_stock_delta_lot(
    v_event,'MATERIAL',v_lot.material_id,null,'GUDANG_BAHAN',null,null,null,
    -v_lot.remaining_normalized_quantity,'BARANG KELUAR GUDANG',p_notes,
    v_lot.id,-v_original_remaining,v_lot.original_unit,null
  );
  perform public.smpt_apply_stock_delta_lot(
    v_event,'MATERIAL',v_lot.material_id,null,v_dest,p_project_id,p_product_id,v_bom.id,
    v_lot.remaining_normalized_quantity,'TERIMA ROLL/LOT DARI GUDANG',p_notes,
    v_lot.id,v_original_remaining,v_lot.original_unit,null
  );

  insert into public.warehouse_issues(
    issue_code,issue_date,source,project_id,product_id,purpose,source_type,bom_requirement_id,material_id,
    item_name_snapshot,quantity,unit_snapshot,input_quantity,input_unit,conversion_factor,
    recipient_worker_id,recipient_name,notes,stock_event_id
  ) values(
    v_issue,p_issue_date,'LANGSUNG',p_project_id,p_product_id,v_purpose,'BAHAN BAKU',v_bom.id,v_lot.material_id,
    v_bom.component_name,v_lot.remaining_normalized_quantity,v_lot.normalized_unit,
    v_original_remaining,v_lot.original_unit,v_lot.conversion_factor,
    p_recipient_worker_id,v_name,nullif(btrim(coalesce(p_notes,'')),''),v_event
  ) returning id into v_issue_id;

  insert into public.warehouse_issue_lots(
    issue_id,material_lot_id,quantity_normalized,normalized_unit,
    source_original_quantity,source_original_unit,created_by
  ) values(
    v_issue_id,v_lot.id,v_lot.remaining_normalized_quantity,v_lot.normalized_unit,
    v_original_remaining,v_lot.original_unit,auth.uid()
  );

  update public.material_lots
  set current_location_id=(select id from public.stock_locations where code=v_dest),
      current_project_id=p_project_id,
      current_product_id=p_product_id,
      current_bom_requirement_id=v_bom.id,
      updated_by=auth.uid(),updated_at=now()
  where id=v_lot.id;

  return v_issue;
end;
$$;

create or replace function public.fulfill_material_request_with_lot(
  p_issue_date date,
  p_request_item_id bigint,
  p_material_lot_id bigint,
  p_recipient_worker_id bigint,
  p_recipient_name text,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item public.material_request_items%rowtype;
  v_request public.material_requests%rowtype;
  v_lot public.material_lots%rowtype;
  v_loc_code text;
  v_dest text;
  v_name text;
  v_factor numeric;
  v_request_qty numeric(18,4);
  v_request_remaining numeric(18,4);
  v_original_remaining numeric(18,4);
  v_issue text;
  v_event bigint;
  v_issue_id bigint;
  v_all_done boolean;
begin
  if not public.has_permission('barang_keluar_gudang.write')
     or not public.has_permission('permintaan_produksi.fulfill') then
    raise exception 'Tidak memiliki izin pemenuhan Gudang.' using errcode='42501';
  end if;
  if p_issue_date is null then raise exception 'Tanggal wajib diisi.'; end if;

  select * into v_item
  from public.material_request_items
  where id=p_request_item_id
  for update;
  if not found or v_item.status='DIBATALKAN' or v_item.source_type<>'BAHAN BAKU' then
    raise exception 'Detail permintaan bahan baku tidak ditemukan/aktif.';
  end if;

  select * into v_request
  from public.material_requests
  where id=v_item.request_id
  for update;
  if not found or v_request.status not in ('MENUNGGU GUDANG','SEBAGIAN') then
    raise exception 'Permintaan tidak dapat diproses.';
  end if;
  if v_request.purpose not in ('CUTTING','PRODUKSI') then
    raise exception 'Roll bahan mentah hanya boleh memenuhi permintaan CUTTING atau PRODUKSI. Sablon menerima WIP hasil Cutting via Gudang Hasil.';
  end if;

  select * into v_lot
  from public.material_lots
  where id=p_material_lot_id
  for update;
  if not found or v_lot.status not in ('AVAILABLE','PARTIAL') or v_lot.remaining_normalized_quantity<=0 then
    raise exception 'Roll/Lot tidak tersedia.';
  end if;
  select code into v_loc_code from public.stock_locations where id=v_lot.current_location_id;
  if v_loc_code<>'GUDANG_BAHAN' then raise exception 'Roll/Lot tidak berada di Gudang Bahan.'; end if;
  if v_lot.material_id is distinct from v_item.material_id then raise exception 'Material Roll/Lot tidak sesuai detail permintaan.'; end if;

  v_factor:=public.smpt_resolve_conversion_factor(v_item.unit_snapshot,v_lot.normalized_unit,null);
  v_request_qty:=round((v_lot.remaining_normalized_quantity/nullif(v_factor,0))::numeric,4);
  v_request_remaining:=round((v_item.requested_qty-v_item.fulfilled_qty)::numeric,4);
  if v_request_qty>v_request_remaining+0.00005 then
    raise exception 'Roll terlalu besar untuk sisa permintaan. Roll = % %, sisa permintaan = % %. Pilih roll lebih kecil.',
      v_request_qty,v_item.unit_snapshot,v_request_remaining,v_item.unit_snapshot;
  end if;
  if v_request_qty>v_request_remaining then v_request_qty:=v_request_remaining; end if;

  if p_recipient_worker_id is not null then
    select name into v_name from public.workers where id=p_recipient_worker_id and status='AKTIF';
  else
    v_name:=btrim(coalesce(p_recipient_name,''));
  end if;
  if coalesce(v_name,'')='' then raise exception 'Nama pengambil wajib diisi.'; end if;

  v_dest:=case v_request.purpose when 'CUTTING' then 'CUTTING' else 'SIAP_PRODUKSI' end;
  v_issue:='BK-'||lpad(nextval('public.smpt_issue_code_seq')::text,6,'0');
  v_event:=public.smpt_create_stock_event(
    'WAREHOUSE_ISSUE',p_issue_date,v_request.project_id,v_request.product_id,'PERMINTAAN',v_issue,null,p_notes
  );
  v_original_remaining:=round((v_lot.remaining_normalized_quantity/nullif(v_lot.conversion_factor,0))::numeric,4);

  perform public.smpt_apply_stock_delta_lot(
    v_event,'MATERIAL',v_lot.material_id,null,'GUDANG_BAHAN',null,null,null,
    -v_lot.remaining_normalized_quantity,'BARANG KELUAR GUDANG',p_notes,
    v_lot.id,-v_original_remaining,v_lot.original_unit,null
  );
  perform public.smpt_apply_stock_delta_lot(
    v_event,'MATERIAL',v_lot.material_id,null,v_dest,v_request.project_id,v_request.product_id,v_item.bom_requirement_id,
    v_lot.remaining_normalized_quantity,'TERIMA ROLL/LOT DARI GUDANG',p_notes,
    v_lot.id,v_original_remaining,v_lot.original_unit,null
  );

  insert into public.warehouse_issues(
    issue_code,issue_date,source,request_id,request_item_id,project_id,product_id,purpose,source_type,
    bom_requirement_id,material_id,item_name_snapshot,color_snapshot,quantity,unit_snapshot,
    input_quantity,input_unit,conversion_factor,recipient_worker_id,recipient_name,supervisor_worker_id,notes,stock_event_id
  ) values(
    v_issue,p_issue_date,'PERMINTAAN',v_request.id,v_item.id,v_request.project_id,v_request.product_id,
    v_request.purpose,'BAHAN BAKU',v_item.bom_requirement_id,v_lot.material_id,v_item.item_name_snapshot,
    v_item.color_snapshot,v_lot.remaining_normalized_quantity,v_lot.normalized_unit,
    v_request_qty,public.smpt_unit_key(v_item.unit_snapshot),v_factor,p_recipient_worker_id,v_name,
    v_request.supervisor_worker_id,nullif(btrim(coalesce(p_notes,'')),''),v_event
  ) returning id into v_issue_id;

  insert into public.warehouse_issue_lots(
    issue_id,material_lot_id,quantity_normalized,normalized_unit,
    source_original_quantity,source_original_unit,created_by
  ) values(
    v_issue_id,v_lot.id,v_lot.remaining_normalized_quantity,v_lot.normalized_unit,
    v_original_remaining,v_lot.original_unit,auth.uid()
  );

  update public.material_lots
  set current_location_id=(select id from public.stock_locations where code=v_dest),
      current_project_id=v_request.project_id,current_product_id=v_request.product_id,
      current_bom_requirement_id=v_item.bom_requirement_id,updated_by=auth.uid(),updated_at=now()
  where id=v_lot.id;

  update public.material_request_items
  set fulfilled_qty=round((fulfilled_qty+v_request_qty)::numeric,4),
      status=case when fulfilled_qty+v_request_qty>=requested_qty-0.00005 then 'DIPENUHI' else 'AKTIF' end,
      updated_at=now()
  where id=v_item.id;

  select not exists(
    select 1 from public.material_request_items
    where request_id=v_request.id and status<>'DIBATALKAN' and fulfilled_qty<requested_qty-0.00005
  ) into v_all_done;
  update public.material_requests
  set status=case when v_all_done then 'SELESAI' else 'SEBAGIAN' end,
      completed_at=case when v_all_done then now() else null end,
      updated_by=auth.uid(),updated_at=now()
  where id=v_request.id;

  return v_issue;
end;
$$;

revoke all on function public.fulfill_material_request_with_lot(date,bigint,bigint,bigint,text,text) from public;
grant execute on function public.fulfill_material_request_with_lot(date,bigint,bigint,bigint,text,text) to authenticated;

create or replace function public.consume_material_lot(
  p_usage_date date,
  p_material_lot_id bigint,
  p_quantity numeric,
  p_unit text,
  p_process text,
  p_work_item_id bigint default null,
  p_officer text default null,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_lot public.material_lots%rowtype;
  v_process text:=upper(btrim(coalesce(p_process,'')));
  v_location text;
  v_factor numeric;
  v_normalized numeric(18,4);
  v_event bigint;
  v_code text;
  v_usage_id bigint;
  v_remaining numeric(18,4);
  v_original_unit text;
  v_original_qty numeric(18,4);
  v_item public.work_items%rowtype;
begin
  if p_usage_date is null or p_quantity is null or p_quantity<=0 or btrim(coalesce(p_officer,''))='' then
    raise exception 'Tanggal, qty, dan petugas wajib valid.';
  end if;
  if v_process not in ('CUTTING','PRODUKSI') then raise exception 'Process Roll/Lot harus CUTTING atau PRODUKSI.'; end if;
  if v_process='CUTTING' and not public.has_permission('cutting.write') then
    raise exception 'Tidak memiliki izin Cutting.' using errcode='42501';
  end if;
  if v_process='PRODUKSI' and not public.has_permission('produksi.write') then
    raise exception 'Tidak memiliki izin Siap Produksi.' using errcode='42501';
  end if;

  select * into v_lot from public.material_lots where id=p_material_lot_id for update;
  if not found or v_lot.status not in ('AVAILABLE','PARTIAL') or v_lot.remaining_normalized_quantity<=0 then
    raise exception 'Roll/Lot tidak tersedia.';
  end if;
  select code into v_location from public.stock_locations where id=v_lot.current_location_id;
  if (v_process='CUTTING' and v_location<>'CUTTING') or (v_process='PRODUKSI' and v_location<>'SIAP_PRODUKSI') then
    raise exception 'Roll/Lot tidak berada pada lokasi proses %.',v_process;
  end if;
  if v_lot.current_project_id is null or v_lot.current_bom_requirement_id is null then
    raise exception 'Roll/Lot belum mempunyai scope Project/BOM aktif.';
  end if;

  if p_work_item_id is not null then
    select * into v_item from public.work_items
    where id=p_work_item_id
      and project_id=v_lot.current_project_id
      and product_id is not distinct from v_lot.current_product_id
      and status='AKTIF';
    if not found then raise exception 'Item Pekerjaan tidak sesuai Project/Produk Roll/Lot.'; end if;
  end if;

  v_original_unit:=coalesce(nullif(btrim(coalesce(p_unit,'')),''),v_lot.normalized_unit);
  v_factor:=public.smpt_resolve_conversion_factor(v_original_unit,v_lot.normalized_unit,null);
  v_normalized:=round((p_quantity*v_factor)::numeric,4);
  if v_normalized<=0 then raise exception 'Hasil konversi qty tidak valid.'; end if;
  if v_normalized>v_lot.remaining_normalized_quantity+0.00005 then
    raise exception 'Pemakaian melebihi sisa Roll/Lot. Tersedia % %.',v_lot.remaining_normalized_quantity,v_lot.normalized_unit;
  end if;

  v_original_qty:=round(p_quantity::numeric,4);
  if v_process='CUTTING' then
    v_code:='CPB-'||lpad(nextval('public.smpt_cut_usage_code_seq')::text,6,'0');
    v_event:=public.smpt_create_stock_event('CUTTING_USAGE',p_usage_date,v_lot.current_project_id,v_lot.current_product_id,'ROLL_LOT',v_code,null,p_notes);
    perform public.smpt_apply_stock_delta_lot(
      v_event,'MATERIAL',v_lot.material_id,null,'CUTTING',v_lot.current_project_id,v_lot.current_product_id,v_lot.current_bom_requirement_id,
      -v_normalized,'PEMAKAIAN CUTTING',p_notes,v_lot.id,-v_original_qty,v_original_unit,p_work_item_id
    );
    insert into public.cutting_material_usages(
      usage_code,usage_date,project_id,product_id,bom_requirement_id,material_id,quantity,unit_snapshot,officer,notes,stock_event_id,
      material_lot_id,input_quantity,input_unit,conversion_factor
    ) values(
      v_code,p_usage_date,v_lot.current_project_id,v_lot.current_product_id,v_lot.current_bom_requirement_id,v_lot.material_id,
      v_normalized,v_lot.normalized_unit,btrim(p_officer),nullif(btrim(coalesce(p_notes,'')),''),v_event,
      v_lot.id,v_original_qty,public.smpt_unit_key(v_original_unit),v_factor
    ) returning id into v_usage_id;
  else
    v_code:='RPU-'||lpad(nextval('public.smpt_ready_usage_code_seq')::text,7,'0');
    v_event:=public.smpt_create_stock_event('READY_PRODUCTION_USAGE',p_usage_date,v_lot.current_project_id,v_lot.current_product_id,'ROLL_LOT',v_code,null,p_notes);
    perform public.smpt_apply_stock_delta_lot(
      v_event,'MATERIAL',v_lot.material_id,null,'SIAP_PRODUKSI',v_lot.current_project_id,v_lot.current_product_id,v_lot.current_bom_requirement_id,
      -v_normalized,'PEMAKAIAN SIAP PRODUKSI',p_notes,v_lot.id,-v_original_qty,v_original_unit,p_work_item_id
    );
    insert into public.ready_production_usages(
      usage_code,usage_date,project_id,product_id,item_kind,bom_requirement_id,material_id,quantity,unit_snapshot,
      officer,notes,stock_event_id,work_item_id,process_code,material_lot_id,input_quantity,input_unit,conversion_factor
    ) values(
      v_code,p_usage_date,v_lot.current_project_id,v_lot.current_product_id,'MATERIAL',v_lot.current_bom_requirement_id,v_lot.material_id,
      v_normalized,v_lot.normalized_unit,btrim(p_officer),nullif(btrim(coalesce(p_notes,'')),''),v_event,p_work_item_id,'PRODUKSI',
      v_lot.id,v_original_qty,public.smpt_unit_key(v_original_unit),v_factor
    ) returning id into v_usage_id;
    insert into public.ready_production_usage_lots(usage_id,material_lot_id,quantity_normalized,normalized_unit,created_by)
    values(v_usage_id,v_lot.id,v_normalized,v_lot.normalized_unit,auth.uid());
  end if;

  v_remaining:=round((v_lot.remaining_normalized_quantity-v_normalized)::numeric,4);
  update public.material_lots
  set remaining_normalized_quantity=v_remaining,
      status=case when v_remaining<=0.00005 then 'DEPLETED' else 'PARTIAL' end,
      updated_by=auth.uid(),updated_at=now()
  where id=v_lot.id;

  return v_code;
end;
$$;


create or replace function public.cancel_cutting_material_usage(p_usage_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_u public.cutting_material_usages%rowtype;
  v_lot public.material_lots%rowtype;
  v_event bigint;
  v_restore_original numeric(18,4);
begin
  if not public.has_permission('cutting.write') then raise exception 'Tidak memiliki izin Cutting.' using errcode='42501'; end if;
  select * into v_u from public.cutting_material_usages where id=p_usage_id for update;
  if not found or v_u.status<>'AKTIF' then raise exception 'Pemakaian tidak ditemukan/aktif.'; end if;

  v_event:=public.smpt_create_stock_event(
    'CUTTING_USAGE_REVERSAL',current_date,v_u.project_id,v_u.product_id,'CUTTING_PEMAKAIAN',v_u.usage_code,v_u.stock_event_id,
    'Pembatalan '||v_u.usage_code
  );

  if v_u.material_lot_id is not null then
    select * into v_lot from public.material_lots where id=v_u.material_lot_id for update;
    if not found then raise exception 'Roll/Lot pemakaian tidak ditemukan.'; end if;
    v_restore_original:=coalesce(v_u.input_quantity,round((v_u.quantity/nullif(v_u.conversion_factor,0))::numeric,4));
    perform public.smpt_apply_stock_delta_lot(
      v_event,'MATERIAL',v_u.material_id,null,'CUTTING',v_u.project_id,v_u.product_id,v_u.bom_requirement_id,
      v_u.quantity,'BATAL PEMAKAIAN CUTTING','Reversal '||v_u.usage_code,
      v_u.material_lot_id,v_restore_original,coalesce(v_u.input_unit,v_u.unit_snapshot),null
    );
    update public.material_lots
    set remaining_normalized_quantity=least(normalized_quantity,remaining_normalized_quantity+v_u.quantity),
        status=case when remaining_normalized_quantity+v_u.quantity>=normalized_quantity-0.00005 then 'AVAILABLE' else 'PARTIAL' end,
        updated_by=auth.uid(),updated_at=now()
    where id=v_u.material_lot_id;
  else
    perform public.smpt_apply_stock_delta(
      v_event,'MATERIAL',v_u.material_id,null,'CUTTING',v_u.project_id,v_u.product_id,v_u.bom_requirement_id,
      v_u.quantity,'BATAL PEMAKAIAN CUTTING','Reversal '||v_u.usage_code
    );
  end if;

  update public.cutting_material_usages
  set status='DIBATALKAN',cancellation_event_id=v_event
  where id=v_u.id;
end;
$$;

revoke all on function public.cancel_cutting_material_usage(bigint) from public;
grant execute on function public.cancel_cutting_material_usage(bigint) to authenticated;

create or replace view public.v_material_lot_status
with (security_invoker = true)
as
select
  l.id,l.lot_code,l.material_id,m.name as material_name,l.receipt_id,r.receipt_code,l.roll_number,
  l.original_quantity,l.original_unit,l.conversion_factor,l.normalized_quantity,l.normalized_unit,
  l.remaining_normalized_quantity,
  round((l.normalized_quantity-l.remaining_normalized_quantity)::numeric,4) as used_normalized_quantity,
  l.current_location_id,sl.code as location_code,sl.name as location_name,
  l.status,l.created_at,l.updated_at,
  l.current_project_id,p.name as project_name,
  l.current_product_id,pp.name as product_name,
  l.current_bom_requirement_id,b.component_name as bom_component_name
from public.material_lots l
join public.materials m on m.id=l.material_id
left join public.warehouse_receipts r on r.id=l.receipt_id
join public.stock_locations sl on sl.id=l.current_location_id
left join public.projects p on p.id=l.current_project_id
left join public.project_products pp on pp.id=l.current_product_id
left join public.bom_requirements b on b.id=l.current_bom_requirement_id;

-- RLS remains on the Stage A tables; widen view visibility only through underlying policies.
drop policy if exists material_lots_select on public.material_lots;
create policy material_lots_select on public.material_lots
for select to authenticated using(
  public.has_permission('stok_gudang.view')
  or public.has_permission('barang_masuk_gudang.view')
  or public.has_permission('barang_keluar_gudang.view')
  or public.has_permission('log_bahan.view')
  or public.has_permission('cutting.view')
  or public.has_permission('produksi.view')
  or public.has_permission('laporan.view')
  or upper(coalesce(public.current_user_role(),''))='ADMIN'
);

revoke all on function public.smpt_apply_stock_delta_lot(bigint,text,bigint,bigint,text,bigint,bigint,bigint,numeric,text,text,bigint,numeric,text,bigint) from public;
revoke all on function public.issue_material_lot_whole(date,bigint,bigint,bigint,bigint,text,bigint,text,text) from public;
revoke all on function public.consume_material_lot(date,bigint,numeric,text,text,bigint,text,text) from public;
grant execute on function public.issue_material_lot_whole(date,bigint,bigint,bigint,bigint,text,bigint,text,text) to authenticated;
grant execute on function public.consume_material_lot(date,bigint,numeric,text,text,bigint,text,text) to authenticated;
grant select on public.v_material_lot_status to authenticated;


create or replace view public.v_material_actual_consumption
with (security_invoker = true)
as
select
  u.project_id,u.product_id,u.work_item_id,u.material_id,
  u.process_code as process,u.usage_date as consumption_date,
  u.quantity as normalized_quantity,u.unit_snapshot as normalized_unit,
  u.usage_code as source_code,'READY_PRODUCTION_USAGE'::text as source_type,
  u.created_by as user_id,u.created_at,
  u.material_lot_id,u.input_quantity as original_quantity,u.input_unit as original_unit
from public.ready_production_usages u
where u.item_kind='MATERIAL' and u.status='AKTIF'
union all
select
  c.project_id,c.product_id,null::bigint as work_item_id,c.material_id,
  'CUTTING'::text as process,c.usage_date as consumption_date,
  c.quantity as normalized_quantity,c.unit_snapshot as normalized_unit,
  c.usage_code as source_code,'CUTTING_USAGE'::text as source_type,
  c.created_by as user_id,c.created_at,
  c.material_lot_id,c.input_quantity as original_quantity,c.input_unit as original_unit
from public.cutting_material_usages c
where c.status='AKTIF';

create or replace function public.cancel_ready_production_lot_usage(p_usage_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_u public.ready_production_usages%rowtype;
  v_lot public.material_lots%rowtype;
  v_event bigint;
  v_restore_original numeric(18,4);
begin
  if not public.has_permission('produksi.write') then raise exception 'Tidak memiliki izin Siap Produksi.' using errcode='42501'; end if;
  select * into v_u from public.ready_production_usages where id=p_usage_id for update;
  if not found or v_u.status<>'AKTIF' or v_u.material_lot_id is null then raise exception 'Pemakaian Roll/Lot tidak ditemukan/aktif.'; end if;
  select * into v_lot from public.material_lots where id=v_u.material_lot_id for update;
  if not found then raise exception 'Roll/Lot tidak ditemukan.'; end if;

  v_restore_original:=coalesce(v_u.input_quantity,round((v_u.quantity/nullif(v_u.conversion_factor,0))::numeric,4));
  v_event:=public.smpt_create_stock_event(
    'READY_PRODUCTION_USAGE_REVERSAL',current_date,v_u.project_id,v_u.product_id,'ROLL_LOT',v_u.usage_code,v_u.stock_event_id,
    'Pembatalan '||v_u.usage_code
  );
  perform public.smpt_apply_stock_delta_lot(
    v_event,'MATERIAL',v_u.material_id,null,'SIAP_PRODUKSI',v_u.project_id,v_u.product_id,v_u.bom_requirement_id,
    v_u.quantity,'BATAL PEMAKAIAN SIAP PRODUKSI','Reversal '||v_u.usage_code,
    v_u.material_lot_id,v_restore_original,coalesce(v_u.input_unit,v_u.unit_snapshot),v_u.work_item_id
  );
  update public.material_lots
  set remaining_normalized_quantity=least(normalized_quantity,remaining_normalized_quantity+v_u.quantity),
      status=case when remaining_normalized_quantity+v_u.quantity>=normalized_quantity-0.00005 then 'AVAILABLE' else 'PARTIAL' end,
      updated_by=auth.uid(),updated_at=now()
  where id=v_u.material_lot_id;
  update public.ready_production_usages
  set status='DIBATALKAN',cancellation_event_id=v_event,cancelled_at=now(),cancelled_by=auth.uid()
  where id=p_usage_id;
end;
$$;

revoke all on function public.cancel_ready_production_lot_usage(bigint) from public;
grant execute on function public.cancel_ready_production_lot_usage(bigint) to authenticated;

-- ============================================================
-- C. LOT-TRACKED MATERIAL GUARDS
-- Generic aggregate stock-out / consumption is blocked once a material uses LOT/ROLL.
-- This keeps canonical balance and physical remaining per roll synchronized.
-- ============================================================

create or replace function public.smpt_guard_lot_tracked_ledger()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_mode text;
begin
  if new.item_kind='MATERIAL'
     and new.material_id is not null
     and new.material_lot_id is null
     and upper(coalesce(new.movement_kind,'')) in (
       'BARANG KELUAR GUDANG',
       'TERIMA DARI GUDANG',
       'PEMAKAIAN CUTTING',
       'PEMAKAIAN SIAP PRODUKSI'
     ) then
    select coalesce(lot_tracking_mode,'NONE')
      into v_mode
    from public.materials
    where id=new.material_id;
    if upper(coalesce(v_mode,'NONE'))<>'NONE' then
      raise exception 'Material ini memakai tracking LOT/ROLL. Gunakan transaksi per Roll/Lot supaya sisa fisik tetap sinkron.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists stock_ledger_lot_tracking_guard on public.stock_ledger_entries;
create trigger stock_ledger_lot_tracking_guard
before insert on public.stock_ledger_entries
for each row execute function public.smpt_guard_lot_tracked_ledger();

create or replace function public.set_material_lot_tracking_mode(
  p_material_id bigint,
  p_mode text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_mode text:=upper(btrim(coalesce(p_mode,'NONE')));
begin
  if not (public.has_permission('master_bahan.write') or upper(coalesce(public.current_user_role(),''))='ADMIN') then
    raise exception 'Tidak memiliki izin mengubah tracking bahan.' using errcode='42501';
  end if;
  if v_mode not in ('NONE','LOT','ROLL') then raise exception 'Mode tracking harus NONE, LOT, atau ROLL.'; end if;
  if v_mode='NONE' and exists(
    select 1 from public.material_lots
    where material_id=p_material_id and status<>'CLOSED'
  ) then
    raise exception 'Tracking LOT/ROLL tidak dapat dimatikan selama masih ada Roll/Lot aktif/historis yang belum CLOSED.';
  end if;
  update public.materials set lot_tracking_mode=v_mode,updated_at=now() where id=p_material_id;
  if not found then raise exception 'Material tidak ditemukan.'; end if;
end;
$$;

revoke all on function public.set_material_lot_tracking_mode(bigint,text) from public;
grant execute on function public.set_material_lot_tracking_mode(bigint,text) to authenticated;

-- ============================================================
-- D. VERIFICATION / PERFORMANCE
-- ============================================================

create index if not exists production_wip_consumptions_dep_status_idx
  on public.production_wip_consumptions(dependency_id,status,created_at desc,id desc);
create index if not exists material_lots_remaining_idx
  on public.material_lots(current_location_id,material_id,status,remaining_normalized_quantity desc,id)
  where status in ('AVAILABLE','PARTIAL') and remaining_normalized_quantity>0;
create index if not exists production_anomalies_check_idx
  on public.production_anomalies(production_check_id,status,id)
  where production_check_id is not null;
