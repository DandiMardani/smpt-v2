-- SMPT V2 - Stage B2: simpler work-item flow UX
-- Business rule:
--   MANDIRI  = no dependency validation.
--   BERANTAI = user only sets flow_order; system creates linear dependencies automatically.
--   KHUSUS   = manual dependency graph for branch / parallel / join.
-- Existing applied migrations are NOT edited.

-- ============================================================
-- A. WORK ITEM FLOW METADATA
-- ============================================================

alter table public.work_items
  add column if not exists flow_mode text not null default 'MANDIRI'
    check (flow_mode in ('MANDIRI','BERANTAI','KHUSUS')),
  add column if not exists flow_order integer
    check (flow_order is null or flow_order > 0);

alter table public.work_item_dependencies
  add column if not exists source_mode text not null default 'MANUAL_SPECIAL'
    check (source_mode in ('AUTO_LINEAR','MANUAL_SPECIAL'));

-- Existing active dependency is preserved exactly as a special/manual route.
-- Mark participating items as KHUSUS so the UI truthfully reflects current behavior.
update public.work_items w
set flow_mode='KHUSUS', flow_order=null
where exists (
  select 1
  from public.work_item_dependencies d
  where d.status='AKTIF'
    and (d.predecessor_work_item_id=w.id or d.successor_work_item_id=w.id)
);

create unique index if not exists work_items_active_linear_order_uidx
  on public.work_items(product_id, flow_order)
  where product_id is not null
    and status='AKTIF'
    and flow_mode='BERANTAI'
    and flow_order is not null;

create index if not exists work_items_flow_idx
  on public.work_items(product_id, flow_mode, flow_order, id)
  where product_id is not null and status='AKTIF';

create index if not exists work_item_dependencies_source_idx
  on public.work_item_dependencies(product_id, source_mode, status, id);

-- ============================================================
-- B. AUTO-SYNC LINEAR CHAIN
-- ============================================================

create or replace function public.smpt_sync_auto_linear_dependencies(
  p_product_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_pair record;
  v_dependency_id bigint;
  v_created_or_kept integer:=0;
  v_deactivated integer:=0;
begin
  if not (
    public.has_permission('master_item.write')
    or upper(coalesce(public.current_user_role(),''))='ADMIN'
  ) then
    raise exception 'Tidak memiliki izin mengatur alur Item Pekerjaan.' using errcode='42501';
  end if;

  perform 1 from public.project_products where id=p_product_id;
  if not found then raise exception 'Produk/Tas tidak ditemukan.'; end if;

  -- Disable only AUTO dependencies that are no longer consecutive in the current chain.
  with ordered as (
    select
      id as predecessor_id,
      lead(id) over(order by flow_order,id) as successor_id
    from public.work_items
    where product_id=p_product_id
      and status='AKTIF'
      and flow_mode='BERANTAI'
      and flow_order is not null
  ), desired as (
    select predecessor_id,successor_id
    from ordered
    where successor_id is not null
  )
  update public.work_item_dependencies d
  set status='NONAKTIF',updated_by=auth.uid(),updated_at=now()
  where d.product_id=p_product_id
    and d.source_mode='AUTO_LINEAR'
    and d.status='AKTIF'
    and not exists (
      select 1 from desired x
      where x.predecessor_id=d.predecessor_work_item_id
        and x.successor_id=d.successor_work_item_id
    );
  get diagnostics v_deactivated=row_count;

  -- Create/reactivate desired consecutive edges. Successor validation mode owns the edge.
  for v_pair in
    with ordered as (
      select
        id as predecessor_id,
        lead(id) over(order by flow_order,id) as successor_id,
        lead(routing_validation_mode) over(order by flow_order,id) as successor_validation_mode,
        flow_order
      from public.work_items
      where product_id=p_product_id
        and status='AKTIF'
        and flow_mode='BERANTAI'
        and flow_order is not null
    )
    select predecessor_id,successor_id,successor_validation_mode,flow_order
    from ordered
    where successor_id is not null
    order by flow_order
  loop
    v_dependency_id:=public.upsert_work_item_dependency(
      p_product_id,
      v_pair.predecessor_id,
      v_pair.successor_id,
      'SEQUENTIAL',
      coalesce(v_pair.successor_validation_mode,'WARNING'),
      'AUTO: dibuat dari Tipe Alur BERANTAI dan Nomor Alur.'
    );

    update public.work_item_dependencies
    set source_mode='AUTO_LINEAR',updated_by=auth.uid(),updated_at=now()
    where id=v_dependency_id;

    v_created_or_kept:=v_created_or_kept+1;
  end loop;

  return jsonb_build_object(
    'product_id',p_product_id,
    'active_linear_edges',v_created_or_kept,
    'deactivated_old_auto_edges',v_deactivated
  );
end;
$$;

revoke all on function public.smpt_sync_auto_linear_dependencies(bigint) from public;
grant execute on function public.smpt_sync_auto_linear_dependencies(bigint) to authenticated;

-- ============================================================
-- C. SAVE SIMPLE FLOW SETTING
-- ============================================================

create or replace function public.set_work_item_flow(
  p_work_item_id bigint,
  p_flow_mode text,
  p_flow_order integer default null,
  p_validation_mode text default 'WARNING'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_mode text:=upper(btrim(coalesce(p_flow_mode,'MANDIRI')));
  v_validation text:=upper(btrim(coalesce(p_validation_mode,'WARNING')));
  v_product_id bigint;
  v_order integer;
begin
  if not (
    public.has_permission('master_item.write')
    or upper(coalesce(public.current_user_role(),''))='ADMIN'
  ) then
    raise exception 'Tidak memiliki izin mengubah alur Item Pekerjaan.' using errcode='42501';
  end if;

  if v_mode not in ('MANDIRI','BERANTAI','KHUSUS') then
    raise exception 'Tipe alur harus MANDIRI, BERANTAI, atau KHUSUS.';
  end if;
  if v_validation not in ('WARNING','HARD') then
    raise exception 'Mode validasi harus WARNING atau HARD.';
  end if;

  select product_id into v_product_id
  from public.work_items
  where id=p_work_item_id and status='AKTIF';

  if v_product_id is null then
    raise exception 'Item Pekerjaan aktif dengan Produk/Tas tidak ditemukan.';
  end if;

  if v_mode='BERANTAI' then
    if p_flow_order is null or p_flow_order<1 then
      raise exception 'Item BERANTAI wajib mempunyai Nomor Alur minimal 1.';
    end if;
    v_order:=p_flow_order;

    if exists(
      select 1
      from public.work_items w
      where w.product_id=v_product_id
        and w.id<>p_work_item_id
        and w.status='AKTIF'
        and w.flow_mode='BERANTAI'
        and w.flow_order=v_order
    ) then
      raise exception 'Nomor Alur % sudah dipakai Item Pekerjaan lain pada Produk/Tas ini.',v_order;
    end if;
  else
    v_order:=null;
  end if;

  update public.work_items
  set flow_mode=v_mode,
      flow_order=v_order,
      routing_validation_mode=v_validation,
      updated_at=now()
  where id=p_work_item_id;

  -- MANDIRI and BERANTAI must not keep manual/special edges attached to this item.
  -- Historical rows stay intact; only status is changed.
  if v_mode in ('MANDIRI','BERANTAI') then
    update public.work_item_dependencies
    set status='NONAKTIF',updated_by=auth.uid(),updated_at=now()
    where product_id=v_product_id
      and source_mode='MANUAL_SPECIAL'
      and status='AKTIF'
      and (
        predecessor_work_item_id=p_work_item_id
        or successor_work_item_id=p_work_item_id
      );
  end if;

  perform public.smpt_sync_auto_linear_dependencies(v_product_id);

  return jsonb_build_object(
    'work_item_id',p_work_item_id,
    'product_id',v_product_id,
    'flow_mode',v_mode,
    'flow_order',v_order,
    'validation_mode',v_validation
  );
end;
$$;

revoke all on function public.set_work_item_flow(bigint,text,integer,text) from public;
grant execute on function public.set_work_item_flow(bigint,text,integer,text) to authenticated;

-- ============================================================
-- D. SPECIAL ROUTING WRAPPER
-- ============================================================

create or replace function public.upsert_special_work_item_dependency(
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
  v_id bigint;
  v_pred_mode text;
  v_succ_mode text;
begin
  if not (
    public.has_permission('master_item.write')
    or upper(coalesce(public.current_user_role(),''))='ADMIN'
  ) then
    raise exception 'Tidak memiliki izin mengubah Routing Khusus.' using errcode='42501';
  end if;

  select flow_mode into v_pred_mode
  from public.work_items
  where id=p_predecessor_work_item_id and product_id=p_product_id and status='AKTIF';

  select flow_mode into v_succ_mode
  from public.work_items
  where id=p_successor_work_item_id and product_id=p_product_id and status='AKTIF';

  if v_pred_mode is null or v_succ_mode is null then
    raise exception 'Item predecessor/successor tidak ditemukan pada Produk/Tas ini.';
  end if;

  if v_pred_mode<>'KHUSUS' or v_succ_mode<>'KHUSUS' then
    raise exception 'Routing manual hanya untuk Item bertipe KHUSUS. Ubah kedua Item menjadi KHUSUS terlebih dahulu.';
  end if;

  v_id:=public.upsert_work_item_dependency(
    p_product_id,
    p_predecessor_work_item_id,
    p_successor_work_item_id,
    p_dependency_type,
    p_validation_mode,
    p_notes
  );

  update public.work_item_dependencies
  set source_mode='MANUAL_SPECIAL',updated_by=auth.uid(),updated_at=now()
  where id=v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_special_work_item_dependency(bigint,bigint,bigint,text,text,text) from public;
grant execute on function public.upsert_special_work_item_dependency(bigint,bigint,bigint,text,text,text) to authenticated;

-- ============================================================
-- E. READ HELPER FOR SIMPLE FLOW MONITORING
-- ============================================================

create or replace view public.v_work_item_flow_overview
with (security_invoker = true)
as
select
  w.id as work_item_id,
  w.project_id,
  w.product_id,
  w.name as work_item_name,
  w.qty_per_product,
  w.unit,
  w.display_order,
  w.flow_mode,
  w.flow_order,
  w.routing_validation_mode,
  w.status,
  p.qty_sah,
  p.equivalent_product,
  p.progress_percent
from public.work_items w
left join public.v_work_item_equivalent_progress p
  on p.work_item_id=w.id;

grant select on public.v_work_item_flow_overview to authenticated;
