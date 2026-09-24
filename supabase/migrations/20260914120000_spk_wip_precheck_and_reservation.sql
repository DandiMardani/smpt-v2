-- SMPT V2 - SPK WIP precheck + reservation-aware publish guard
-- Goal:
-- 1) SPV sees WIP predecessor capacity before assigning qty.
-- 2) HARD routing is blocked already at SPK item save/publish, not only at Checker.
-- 3) Active SPKs reserve remaining WIP capacity so two SPKs cannot overbook the same successor route.
-- 4) Checker HARD validation remains the final runtime safeguard.
-- Historical migrations are not edited.

create index if not exists production_orders_product_status_idx
  on public.production_orders(product_id,status,id);

create or replace function public.smpt_spk_item_capacity(
  p_order_id bigint,
  p_work_item_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_order public.production_orders%rowtype;
  v_snapshot jsonb;
  v_qpp numeric(18,4);
  v_unit text;
  v_target_raw numeric(18,4):=0;
  v_other_committed_raw numeric(18,4):=0;
  v_target_remaining_raw numeric(18,4):=0;
  v_required_count integer:=0;
  v_hard_count integer:=0;
  v_all_capacity_eq numeric(18,4);
  v_hard_capacity_eq numeric(18,4);
  v_reserved_eq numeric(18,4):=0;
  v_available_after_reservation_eq numeric(18,4);
  v_hard_available_after_reservation_eq numeric(18,4);
  v_route_available_raw numeric(18,4);
  v_hard_route_available_raw numeric(18,4);
  v_max_assignable_raw numeric(18,4);
  v_mode text:='NONE';
begin
  if not (
    public.has_permission('spk.view')
    or public.has_permission('spk.write')
    or upper(coalesce(public.current_user_role(),''))='ADMIN'
  ) then
    raise exception 'Tidak memiliki izin melihat kapasitas SPK.' using errcode='42501';
  end if;

  select * into v_order
  from public.production_orders
  where id=p_order_id;
  if not found then raise exception 'SPK tidak ditemukan.'; end if;

  v_snapshot:=public.smpt_work_item_snapshot(p_work_item_id);
  if (v_snapshot->>'status')<>'AKTIF' then raise exception 'Item pekerjaan NONAKTIF.'; end if;
  if nullif(v_snapshot->>'product_id','')::bigint is distinct from v_order.product_id then
    raise exception 'Item pekerjaan tidak sesuai Produk/Tas SPK.';
  end if;
  if nullif(v_snapshot->>'project_id','')::bigint is not null
     and nullif(v_snapshot->>'project_id','')::bigint<>v_order.project_id then
    raise exception 'Item pekerjaan tidak sesuai proyek SPK.';
  end if;

  v_qpp:=coalesce(nullif(v_snapshot->>'qty_per_product','')::numeric,0);
  v_unit:=coalesce(nullif(v_snapshot->>'unit',''),'PCS');
  if v_qpp<=0 then raise exception 'Qty/Produk item tidak valid.'; end if;

  select round((pp.target_production*v_qpp)::numeric,4)
  into v_target_raw
  from public.project_products pp
  where pp.id=v_order.product_id;
  if v_target_raw is null then raise exception 'Target produksi Produk/Tas tidak ditemukan.'; end if;

  select coalesce(sum(i.assigned_qty),0)::numeric(18,4)
  into v_other_committed_raw
  from public.production_order_items i
  join public.production_orders o on o.id=i.order_id
  where i.work_item_id=p_work_item_id
    and o.product_id=v_order.product_id
    and o.id<>p_order_id
    and o.status in ('AKTIF','SELESAI')
    and i.status<>'DIBATALKAN';

  v_target_remaining_raw:=round(greatest(v_target_raw-v_other_committed_raw,0)::numeric,4);

  select
    count(*)::integer,
    (count(*) filter (
      where upper(coalesce(d.validation_mode,'WARNING'))='HARD'
        and now()>=d.enforce_from
    ))::integer,
    min(coalesce(c.predecessor_available_equivalent,0))::numeric(18,4),
    (min(coalesce(c.predecessor_available_equivalent,0)) filter (
      where upper(coalesce(d.validation_mode,'WARNING'))='HARD'
        and now()>=d.enforce_from
    ))::numeric(18,4)
  into v_required_count,v_hard_count,v_all_capacity_eq,v_hard_capacity_eq
  from public.work_item_dependencies d
  left join public.v_work_item_dependency_capacity c on c.dependency_id=d.id
  where d.product_id=v_order.product_id
    and d.successor_work_item_id=p_work_item_id
    and d.status='AKTIF'
    and d.dependency_type<>'OPTIONAL';

  -- Remaining qty on other ACTIVE SPKs is a reservation. This prevents two SPKs
  -- from both promising the same WIP predecessor before Checker consumes it.
  select coalesce(sum(
    greatest(i.assigned_qty-coalesce(ch.processed_qty,0),0)
    / nullif(i.qty_per_product_snapshot,0)
  ),0)::numeric(18,4)
  into v_reserved_eq
  from public.production_order_items i
  join public.production_orders o on o.id=i.order_id
  left join lateral (
    select coalesce(sum(c.good_qty+c.reject_qty) filter (where c.status='AKTIF'),0)::numeric(18,4) processed_qty
    from public.production_checks c
    where c.order_item_id=i.id
  ) ch on true
  where i.work_item_id=p_work_item_id
    and o.product_id=v_order.product_id
    and o.id<>p_order_id
    and o.status='AKTIF'
    and i.status<>'DIBATALKAN';

  if v_required_count>0 then
    v_available_after_reservation_eq:=round(greatest(coalesce(v_all_capacity_eq,0)-v_reserved_eq,0)::numeric,4);
    v_route_available_raw:=round((v_available_after_reservation_eq*v_qpp)::numeric,4);
    v_mode:=case when v_hard_count>0 then 'HARD' else 'WARNING' end;
  else
    v_available_after_reservation_eq:=null;
    v_route_available_raw:=null;
    v_mode:='NONE';
  end if;

  if v_hard_count>0 then
    v_hard_available_after_reservation_eq:=round(greatest(coalesce(v_hard_capacity_eq,0)-v_reserved_eq,0)::numeric,4);
    v_hard_route_available_raw:=round((v_hard_available_after_reservation_eq*v_qpp)::numeric,4);
    v_max_assignable_raw:=least(v_target_remaining_raw,v_hard_route_available_raw);
  else
    v_hard_available_after_reservation_eq:=null;
    v_hard_route_available_raw:=null;
    v_max_assignable_raw:=v_target_remaining_raw;
  end if;

  return jsonb_build_object(
    'order_id',p_order_id,
    'work_item_id',p_work_item_id,
    'unit',v_unit,
    'qty_per_product',v_qpp,
    'routing_mode',v_mode,
    'has_dependencies',v_required_count>0,
    'required_predecessor_count',v_required_count,
    'hard_predecessor_count',v_hard_count,
    'physical_available_equivalent',case when v_required_count=0 then null else coalesce(v_all_capacity_eq,0) end,
    'reserved_equivalent',case when v_required_count=0 then 0 else v_reserved_eq end,
    'available_after_reservation_equivalent',v_available_after_reservation_eq,
    'hard_available_after_reservation_equivalent',v_hard_available_after_reservation_eq,
    'route_available_raw',v_route_available_raw,
    'hard_route_available_raw',v_hard_route_available_raw,
    'target_raw',v_target_raw,
    'other_committed_raw',v_other_committed_raw,
    'target_remaining_raw',v_target_remaining_raw,
    'max_assignable_raw',round(greatest(v_max_assignable_raw,0)::numeric,4),
    'hard_enforced',v_hard_count>0
  );
end;
$$;

revoke all on function public.smpt_spk_item_capacity(bigint,bigint) from public;
grant execute on function public.smpt_spk_item_capacity(bigint,bigint) to authenticated;

create or replace function public.smpt_get_spk_item_capacities(p_order_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_order public.production_orders%rowtype;
  v_result jsonb:='[]'::jsonb;
begin
  if not (
    public.has_permission('spk.view')
    or public.has_permission('spk.write')
    or upper(coalesce(public.current_user_role(),''))='ADMIN'
  ) then
    raise exception 'Tidak memiliki izin melihat kapasitas SPK.' using errcode='42501';
  end if;

  select * into v_order from public.production_orders where id=p_order_id;
  if not found then raise exception 'SPK tidak ditemukan.'; end if;

  select coalesce(jsonb_agg(public.smpt_spk_item_capacity(p_order_id,w.id) order by w.display_order,w.id),'[]'::jsonb)
  into v_result
  from public.work_items w
  where w.product_id=v_order.product_id
    and w.status='AKTIF';

  return coalesce(v_result,'[]'::jsonb);
end;
$$;

revoke all on function public.smpt_get_spk_item_capacities(bigint) from public;
grant execute on function public.smpt_get_spk_item_capacities(bigint) to authenticated;

-- Re-define add item with early WIP precheck. WARNING is allowed, HARD is blocked.
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

-- Re-define publish with reservation-aware HARD gate and concurrency lock.
create or replace function public.publish_production_order(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.production_orders%rowtype;
  r record;
  v_capacity jsonb;
  v_target_remaining numeric(18,4);
  v_hard_route_remaining numeric(18,4);
  v_route_remaining numeric(18,4);
  v_route_available_eq numeric(18,4);
  v_attempted_eq numeric(18,4);
  v_hard boolean;
begin
  if not public.has_permission('spk.write') then
    raise exception 'Tidak memiliki izin menerbitkan SPK.' using errcode='42501';
  end if;

  select * into v_order from public.production_orders where id=p_order_id for update;
  if not found or v_order.status<>'DRAFT' then raise exception 'SPK harus DRAFT.'; end if;
  if not exists(select 1 from public.production_order_items where order_id=p_order_id) then
    raise exception 'SPK belum memiliki item pekerjaan.';
  end if;

  -- Serialize publish per Product/Tas + Item so concurrent SPKs cannot reserve the same WIP.
  for r in
    select *
    from public.production_order_items
    where order_id=p_order_id and status<>'DIBATALKAN'
    order by work_item_id,id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('SMPT_SPK_WIP:'||v_order.product_id::text||':'||r.work_item_id::text,0)
    );
  end loop;

  for r in
    select *
    from public.production_order_items
    where order_id=p_order_id and status<>'DIBATALKAN'
    order by work_item_id,id
  loop
    v_capacity:=public.smpt_spk_item_capacity(p_order_id,r.work_item_id);
    v_target_remaining:=coalesce((v_capacity->>'target_remaining_raw')::numeric,0);
    v_hard_route_remaining:=nullif(v_capacity->>'hard_route_available_raw','')::numeric;
    v_route_remaining:=nullif(v_capacity->>'route_available_raw','')::numeric;
    v_route_available_eq:=nullif(v_capacity->>'available_after_reservation_equivalent','')::numeric;
    v_hard:=coalesce((v_capacity->>'hard_enforced')::boolean,false);
    v_attempted_eq:=round((r.assigned_qty/nullif(r.qty_per_product_snapshot,0))::numeric,4);

    if r.assigned_qty>v_target_remaining+0.00005 then
      raise exception 'Qty item % melebihi sisa kebutuhan Produk/Tas. Maksimum saat ini % %.',
        r.work_item_name_snapshot,v_target_remaining,r.unit_snapshot;
    end if;

    if v_hard and r.assigned_qty>coalesce(v_hard_route_remaining,0)+0.00005 then
      raise exception 'HARD ROUTING: WIP predecessor untuk item % tidak cukup. Maksimum Qty SPK saat ini % % setelah reservasi SPK aktif.',
        r.work_item_name_snapshot,coalesce(v_hard_route_remaining,0),r.unit_snapshot;
    end if;

    -- WARNING remains publishable, but leave a visible anomaly for monitoring.
    if coalesce((v_capacity->>'has_dependencies')::boolean,false)
       and not v_hard
       and v_route_remaining is not null
       and r.assigned_qty>v_route_remaining+0.00005 then
      insert into public.production_anomalies(
        anomaly_type,severity,project_id,product_id,work_item_id,
        available_equivalent,attempted_equivalent,excess_equivalent,
        source_kind,details,created_by
      ) values(
        'SPK_WIP_OVERBOOK_WARNING','WARNING',v_order.project_id,v_order.product_id,r.work_item_id,
        coalesce(v_route_available_eq,0),v_attempted_eq,greatest(v_attempted_eq-coalesce(v_route_available_eq,0),0),
        'SPK_PUBLISH',
        jsonb_build_object(
          'order_id',p_order_id,
          'spk_code',v_order.spk_code,
          'assigned_qty',r.assigned_qty,
          'unit',r.unit_snapshot,
          'route_available_raw',v_route_remaining,
          'reserved_equivalent',v_capacity->'reserved_equivalent'
        ),
        auth.uid()
      );
    end if;
  end loop;

  update public.production_orders
  set status='AKTIF',published_at=now(),updated_by=auth.uid()
  where id=p_order_id;
end;
$$;

revoke all on function public.publish_production_order(bigint) from public;
grant execute on function public.publish_production_order(bigint) to authenticated;

notify pgrst, 'reload schema';
