-- SMPT V2 - Stage A foundation
-- Update requirements after V1 -> V2 baseline.
-- SAFE RULES:
-- 1) Does not rewrite any applied migration.
-- 2) Extends existing work_items / production / stock architecture.
-- 3) Does not enable HARD routing enforcement in record_checker_result yet.
-- 4) Existing historical production remains readable and is never rejected/deleted.

-- ============================================================
-- A. ROUTING METADATA ON EXISTING WORK ITEM MASTER
-- ============================================================

alter table public.work_items
  add column if not exists display_order integer not null default 0,
  add column if not exists routing_validation_mode text not null default 'WARNING'
    check (routing_validation_mode in ('WARNING','HARD'));

create index if not exists work_items_product_route_idx
  on public.work_items(product_id, display_order, id)
  where product_id is not null;

create table if not exists public.work_item_dependencies (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.project_products(id) on update restrict on delete restrict,
  predecessor_work_item_id bigint not null references public.work_items(id) on update restrict on delete restrict,
  successor_work_item_id bigint not null references public.work_items(id) on update restrict on delete restrict,
  dependency_type text not null default 'SEQUENTIAL'
    check (dependency_type in ('SEQUENTIAL','JOIN','OPTIONAL')),
  validation_mode text not null default 'WARNING'
    check (validation_mode in ('WARNING','HARD')),
  enforce_from timestamptz not null default now(),
  status text not null default 'AKTIF'
    check (status in ('AKTIF','NONAKTIF')),
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (predecessor_work_item_id <> successor_work_item_id),
  unique(product_id, predecessor_work_item_id, successor_work_item_id)
);

create index if not exists work_item_dependencies_successor_idx
  on public.work_item_dependencies(product_id, successor_work_item_id, status, id);
create index if not exists work_item_dependencies_predecessor_idx
  on public.work_item_dependencies(product_id, predecessor_work_item_id, status, id);

create or replace function public.smpt_validate_work_item_dependency()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_pred_project bigint;
  v_pred_product bigint;
  v_succ_project bigint;
  v_succ_product bigint;
  v_cycle boolean;
  v_current_id bigint := coalesce(new.id, -1);
begin
  if new.predecessor_work_item_id = new.successor_work_item_id then
    raise exception 'Item predecessor dan successor tidak boleh sama.';
  end if;

  select project_id, product_id
  into v_pred_project, v_pred_product
  from public.work_items
  where id = new.predecessor_work_item_id;

  select project_id, product_id
  into v_succ_project, v_succ_product
  from public.work_items
  where id = new.successor_work_item_id;

  if v_pred_project is null or v_succ_project is null then
    raise exception 'Item pekerjaan routing tidak ditemukan.';
  end if;

  if v_pred_product is null or v_succ_product is null then
    raise exception 'Routing hanya boleh dibuat untuk Item Pekerjaan yang sudah mempunyai Produk/Tas.';
  end if;

  if v_pred_project <> v_succ_project
     or v_pred_product <> v_succ_product
     or v_pred_product <> new.product_id then
    raise exception 'Predecessor dan successor wajib berada pada Project dan Produk/Tas yang sama.';
  end if;

  if new.status = 'AKTIF' then
    with recursive downstream(work_item_id) as (
      select new.successor_work_item_id
      union
      select d.successor_work_item_id
      from public.work_item_dependencies d
      join downstream x
        on x.work_item_id = d.predecessor_work_item_id
      where d.status = 'AKTIF'
        and d.id <> v_current_id
    )
    select exists(
      select 1
      from downstream
      where work_item_id = new.predecessor_work_item_id
    ) into v_cycle;

    if v_cycle then
      raise exception 'Routing membentuk cycle/putaran. Dependency tidak dapat disimpan.';
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists work_item_dependencies_validate on public.work_item_dependencies;
create trigger work_item_dependencies_validate
before insert or update on public.work_item_dependencies
for each row execute function public.smpt_validate_work_item_dependency();

-- ============================================================
-- B. EQUIVALENT PRODUCT + EXPLICIT WIP CONSUMPTION FOUNDATION
-- ============================================================

create table if not exists public.production_wip_consumptions (
  id bigint generated always as identity primary key,
  dependency_id bigint not null references public.work_item_dependencies(id) on update restrict on delete restrict,
  production_check_id bigint not null references public.production_checks(id) on update restrict on delete restrict,
  predecessor_work_item_id bigint not null references public.work_items(id) on update restrict on delete restrict,
  successor_work_item_id bigint not null references public.work_items(id) on update restrict on delete restrict,
  equivalent_quantity numeric(18,4) not null check (equivalent_quantity > 0),
  status text not null default 'AKTIF' check (status in ('AKTIF','DIBALIK')),
  reversal_of_id bigint references public.production_wip_consumptions(id) on update restrict on delete restrict,
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique(dependency_id, production_check_id)
);

create index if not exists production_wip_pred_idx
  on public.production_wip_consumptions(predecessor_work_item_id, status, created_at desc, id desc);
create index if not exists production_wip_succ_idx
  on public.production_wip_consumptions(successor_work_item_id, status, created_at desc, id desc);
create index if not exists production_wip_check_idx
  on public.production_wip_consumptions(production_check_id, status, id);

create sequence if not exists public.smpt_production_anomaly_code_seq start with 1;

create table if not exists public.production_anomalies (
  id bigint generated always as identity primary key,
  anomaly_code text not null unique default ('ANM-'||lpad(nextval('public.smpt_production_anomaly_code_seq')::text,7,'0')),
  anomaly_type text not null,
  severity text not null default 'WARNING' check (severity in ('WARNING','HARD')),
  project_id bigint references public.projects(id) on update restrict on delete restrict,
  product_id bigint references public.project_products(id) on update restrict on delete restrict,
  work_item_id bigint references public.work_items(id) on update restrict on delete restrict,
  dependency_id bigint references public.work_item_dependencies(id) on update restrict on delete restrict,
  production_check_id bigint references public.production_checks(id) on update restrict on delete restrict,
  available_equivalent numeric(18,4),
  attempted_equivalent numeric(18,4),
  excess_equivalent numeric(18,4),
  source_kind text not null default 'RUNTIME',
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);

create index if not exists production_anomalies_open_idx
  on public.production_anomalies(status, severity, detected_at desc, id desc);
create index if not exists production_anomalies_scope_idx
  on public.production_anomalies(project_id, product_id, work_item_id, detected_at desc, id desc);

create or replace view public.v_work_item_equivalent_progress
with (security_invoker = true)
as
with agg as (
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
    coalesce(sum(c.good_qty) filter (where c.status='AKTIF' and o.id is not null),0)::numeric(18,4) as qty_sah,
    coalesce(sum(c.good_qty) filter (where c.status='AKTIF' and o.id is not null and c.check_date=current_date),0)::numeric(18,4) as qty_sah_today
  from public.work_items w
  join public.project_products pp
    on pp.id=w.product_id and pp.project_id=w.project_id
  left join public.production_order_items i
    on i.work_item_id=w.id and i.status<>'DIBATALKAN'
  left join public.production_orders o
    on o.id=i.order_id and o.status<>'DIBATALKAN'
  left join public.production_checks c
    on c.order_item_id=i.id and c.status='AKTIF' and o.id is not null
  where w.product_id is not null
  group by
    w.project_id,w.product_id,w.id,w.name,w.unit,w.qty_per_product,
    w.display_order,w.routing_validation_mode,pp.target_production
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

create or replace view public.v_work_item_wip_available
with (security_invoker = true)
as
with consumed as (
  select predecessor_work_item_id,
         coalesce(sum(equivalent_quantity) filter (where status='AKTIF'),0)::numeric(18,4) as consumed_equivalent
  from public.production_wip_consumptions
  group by predecessor_work_item_id
)
select
  p.project_id,
  p.product_id,
  p.work_item_id,
  p.work_item_name,
  p.equivalent_product as approved_equivalent,
  coalesce(c.consumed_equivalent,0)::numeric(18,4) as consumed_equivalent,
  round((p.equivalent_product-coalesce(c.consumed_equivalent,0))::numeric,4) as raw_available_equivalent,
  round(greatest(p.equivalent_product-coalesce(c.consumed_equivalent,0),0)::numeric,4) as available_equivalent
from public.v_work_item_equivalent_progress p
left join consumed c on c.predecessor_work_item_id=p.work_item_id;

create or replace view public.v_work_item_dependency_capacity
with (security_invoker = true)
as
select
  d.id as dependency_id,
  d.product_id,
  d.predecessor_work_item_id,
  d.successor_work_item_id,
  d.dependency_type,
  d.validation_mode,
  d.enforce_from,
  d.status,
  w.approved_equivalent as predecessor_approved_equivalent,
  w.consumed_equivalent as predecessor_consumed_equivalent,
  w.available_equivalent as predecessor_available_equivalent
from public.work_item_dependencies d
left join public.v_work_item_wip_available w
  on w.work_item_id=d.predecessor_work_item_id
where d.status='AKTIF';

create or replace view public.v_routing_progress_anomalies
with (security_invoker = true)
as
select
  d.id as dependency_id,
  d.product_id,
  d.predecessor_work_item_id,
  d.successor_work_item_id,
  d.validation_mode,
  p.equivalent_product as predecessor_equivalent,
  s.equivalent_product as successor_equivalent,
  round(greatest(s.equivalent_product-p.equivalent_product,0)::numeric,4) as excess_equivalent
from public.work_item_dependencies d
join public.v_work_item_equivalent_progress p
  on p.work_item_id=d.predecessor_work_item_id
join public.v_work_item_equivalent_progress s
  on s.work_item_id=d.successor_work_item_id
where d.status='AKTIF'
  and d.dependency_type<>'OPTIONAL'
  and s.equivalent_product>p.equivalent_product;

create or replace function public.smpt_get_route_capacity(
  p_product_id bigint,
  p_successor_work_item_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_count integer;
  v_capacity numeric;
begin
  if not (
    public.has_permission('master_item.view')
    or public.has_permission('spk.view')
    or public.has_permission('produksi.view')
    or public.has_permission('hasil_produksi.view')
    or public.has_permission('borongan.view')
    or public.has_permission('laporan.view')
    or upper(coalesce(public.current_user_role(),''))='ADMIN'
  ) then
    raise exception 'Tidak memiliki izin melihat routing produksi.' using errcode='42501';
  end if;

  perform 1 from public.work_items
  where id=p_successor_work_item_id and product_id=p_product_id;
  if not found then raise exception 'Item pekerjaan tidak sesuai Produk/Tas.'; end if;

  select
    count(*) filter (where dependency_type<>'OPTIONAL'),
    min(predecessor_available_equivalent) filter (where dependency_type<>'OPTIONAL')
  into v_count,v_capacity
  from public.v_work_item_dependency_capacity
  where product_id=p_product_id
    and successor_work_item_id=p_successor_work_item_id
    and status='AKTIF';

  select jsonb_build_object(
    'product_id',p_product_id,
    'successor_work_item_id',p_successor_work_item_id,
    'has_dependencies',coalesce(v_count,0)>0,
    'required_predecessor_count',coalesce(v_count,0),
    'available_equivalent',case when coalesce(v_count,0)=0 then null else coalesce(v_capacity,0) end,
    'predecessors',coalesce(jsonb_agg(jsonb_build_object(
      'dependency_id',dependency_id,
      'predecessor_work_item_id',predecessor_work_item_id,
      'dependency_type',dependency_type,
      'validation_mode',validation_mode,
      'approved_equivalent',predecessor_approved_equivalent,
      'consumed_equivalent',predecessor_consumed_equivalent,
      'available_equivalent',predecessor_available_equivalent,
      'enforce_from',enforce_from
    ) order by dependency_id) filter (where dependency_id is not null),'[]'::jsonb)
  ) into v_result
  from public.v_work_item_dependency_capacity
  where product_id=p_product_id
    and successor_work_item_id=p_successor_work_item_id
    and status='AKTIF';

  if v_result is null then
    v_result:=jsonb_build_object(
      'product_id',p_product_id,
      'successor_work_item_id',p_successor_work_item_id,
      'has_dependencies',false,
      'required_predecessor_count',0,
      'available_equivalent',null,
      'predecessors','[]'::jsonb
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.set_work_item_routing_meta(
  p_work_item_id bigint,
  p_display_order integer,
  p_validation_mode text default 'WARNING'
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_mode text:=upper(btrim(coalesce(p_validation_mode,'WARNING')));
begin
  if not (public.has_permission('master_item.write') or upper(coalesce(public.current_user_role(),''))='ADMIN') then
    raise exception 'Tidak memiliki izin mengubah routing Item Pekerjaan.' using errcode='42501';
  end if;
  if v_mode not in ('WARNING','HARD') then raise exception 'Validation mode harus WARNING atau HARD.'; end if;
  update public.work_items
  set display_order=greatest(coalesce(p_display_order,0),0),
      routing_validation_mode=v_mode,
      updated_at=now()
  where id=p_work_item_id;
  if not found then raise exception 'Item pekerjaan tidak ditemukan.'; end if;
end;
$$;

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
begin
  if not (public.has_permission('master_item.write') or upper(coalesce(public.current_user_role(),''))='ADMIN') then
    raise exception 'Tidak memiliki izin mengubah dependency Item Pekerjaan.' using errcode='42501';
  end if;
  if v_type not in ('SEQUENTIAL','JOIN','OPTIONAL') then raise exception 'Dependency type tidak valid.'; end if;
  if v_mode not in ('WARNING','HARD') then raise exception 'Validation mode harus WARNING atau HARD.'; end if;

  insert into public.work_item_dependencies(
    product_id,predecessor_work_item_id,successor_work_item_id,
    dependency_type,validation_mode,status,notes,created_by,updated_by
  ) values(
    p_product_id,p_predecessor_work_item_id,p_successor_work_item_id,
    v_type,v_mode,'AKTIF',nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()
  )
  on conflict(product_id,predecessor_work_item_id,successor_work_item_id)
  do update set
    dependency_type=excluded.dependency_type,
    validation_mode=excluded.validation_mode,
    status='AKTIF',
    enforce_from=now(),
    notes=excluded.notes,
    updated_by=auth.uid(),
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.deactivate_work_item_dependency(p_dependency_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not (public.has_permission('master_item.write') or upper(coalesce(public.current_user_role(),''))='ADMIN') then
    raise exception 'Tidak memiliki izin mengubah dependency Item Pekerjaan.' using errcode='42501';
  end if;
  update public.work_item_dependencies
  set status='NONAKTIF',updated_by=auth.uid(),updated_at=now()
  where id=p_dependency_id and status='AKTIF';
  if not found then raise exception 'Dependency aktif tidak ditemukan.'; end if;
end;
$$;

-- ============================================================
-- C. PHYSICAL MATERIAL LOT / ROLL FOUNDATION
-- Canonical stock authority stays stock_events + stock_ledger_entries + stock_balances.
-- material_lots only partitions/traces physical containers; it is NOT a second inventory ledger.
-- ============================================================

alter table public.materials
  add column if not exists lot_tracking_mode text not null default 'NONE'
    check (lot_tracking_mode in ('NONE','LOT','ROLL'));

create sequence if not exists public.smpt_material_lot_code_seq start with 1;

create table if not exists public.material_lots (
  id bigint generated always as identity primary key,
  lot_code text not null unique default ('LOT-'||lpad(nextval('public.smpt_material_lot_code_seq')::text,8,'0')),
  material_id bigint not null references public.materials(id) on update restrict on delete restrict,
  receipt_id bigint references public.warehouse_receipts(id) on update restrict on delete restrict,
  roll_number text not null,
  original_quantity numeric(18,4) not null check (original_quantity>0),
  original_unit text not null,
  conversion_factor numeric(20,10) not null check (conversion_factor>0),
  normalized_quantity numeric(18,4) not null check (normalized_quantity>0),
  normalized_unit text not null,
  remaining_normalized_quantity numeric(18,4) not null check (remaining_normalized_quantity>=0),
  current_location_id smallint not null references public.stock_locations(id) on update restrict on delete restrict,
  status text not null default 'AVAILABLE'
    check (status in ('AVAILABLE','PARTIAL','DEPLETED','QUARANTINE','CLOSED')),
  supplier_lot_no text,
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (remaining_normalized_quantity<=normalized_quantity)
);

create unique index if not exists material_lots_roll_uq
  on public.material_lots(material_id,coalesce(receipt_id,0),lower(btrim(roll_number)));
create index if not exists material_lots_available_idx
  on public.material_lots(material_id,current_location_id,status,remaining_normalized_quantity desc,id);
create index if not exists material_lots_receipt_idx
  on public.material_lots(receipt_id,id);

alter table public.stock_events
  add column if not exists work_item_id bigint references public.work_items(id) on update restrict on delete restrict;

alter table public.stock_ledger_entries
  add column if not exists material_lot_id bigint references public.material_lots(id) on update restrict on delete restrict,
  add column if not exists work_item_id bigint references public.work_items(id) on update restrict on delete restrict,
  add column if not exists original_quantity_delta numeric(18,4),
  add column if not exists original_unit_snapshot text;

create index if not exists stock_ledger_material_lot_idx
  on public.stock_ledger_entries(material_lot_id,created_at desc,id desc)
  where material_lot_id is not null;
create index if not exists stock_ledger_work_item_idx
  on public.stock_ledger_entries(work_item_id,created_at desc,id desc)
  where work_item_id is not null;

alter table public.ready_production_usages
  add column if not exists work_item_id bigint references public.work_items(id) on update restrict on delete restrict,
  add column if not exists process_code text not null default 'PRODUKSI';

create index if not exists ready_usage_scope_work_item_idx
  on public.ready_production_usages(project_id,product_id,work_item_id,usage_date desc,id desc);

create table if not exists public.warehouse_issue_lots (
  id bigint generated always as identity primary key,
  issue_id bigint not null references public.warehouse_issues(id) on update restrict on delete restrict,
  material_lot_id bigint not null references public.material_lots(id) on update restrict on delete restrict,
  quantity_normalized numeric(18,4) not null check (quantity_normalized>0),
  normalized_unit text not null,
  source_original_quantity numeric(18,4),
  source_original_unit text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(issue_id,material_lot_id)
);

create index if not exists warehouse_issue_lots_lot_idx
  on public.warehouse_issue_lots(material_lot_id,created_at desc,id desc);

create table if not exists public.ready_production_usage_lots (
  id bigint generated always as identity primary key,
  usage_id bigint not null references public.ready_production_usages(id) on update restrict on delete restrict,
  material_lot_id bigint not null references public.material_lots(id) on update restrict on delete restrict,
  quantity_normalized numeric(18,4) not null check (quantity_normalized>0),
  normalized_unit text not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(usage_id,material_lot_id)
);

create index if not exists ready_usage_lots_lot_idx
  on public.ready_production_usage_lots(material_lot_id,created_at desc,id desc);

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
  update public.materials set lot_tracking_mode=v_mode,updated_at=now() where id=p_material_id;
  if not found then raise exception 'Material tidak ditemukan.'; end if;
end;
$$;

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
  v_partitioned numeric(18,4);
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

  select * into v_receipt
  from public.warehouse_receipts
  where id=p_receipt_id
  for update;
  if not found or v_receipt.status<>'AKTIF' then raise exception 'Barang Masuk tidak ditemukan atau sudah dibatalkan.'; end if;

  select standard_unit,lot_tracking_mode
  into v_standard_unit,v_mode
  from public.materials
  where id=v_receipt.material_id and status='AKTIF';
  if v_standard_unit is null then raise exception 'Master Bahan tidak ditemukan/aktif.'; end if;
  if coalesce(v_mode,'NONE')='NONE' then raise exception 'Aktifkan mode LOT/ROLL pada Master Bahan terlebih dahulu.'; end if;

  v_factor:=public.smpt_resolve_conversion_factor(p_original_unit,v_standard_unit,null);
  v_normalized:=round((p_original_quantity*v_factor)::numeric,4);

  select coalesce(sum(normalized_quantity),0)::numeric(18,4)
  into v_partitioned
  from public.material_lots
  where receipt_id=p_receipt_id and status<>'CLOSED';

  if v_partitioned+v_normalized>v_receipt.quantity then
    raise exception 'Total Roll/Lot melebihi qty normalized Barang Masuk. Sisa yang belum dipetakan: % %.',
      greatest(v_receipt.quantity-v_partitioned,0),v_standard_unit;
  end if;

  select id into v_location
  from public.stock_locations
  where code='GUDANG_BAHAN' and is_active=true;
  if v_location is null then raise exception 'Lokasi GUDANG_BAHAN tidak ditemukan.'; end if;

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

create or replace view public.v_material_lot_status
with (security_invoker = true)
as
select
  l.id,
  l.lot_code,
  l.material_id,
  m.name as material_name,
  l.receipt_id,
  r.receipt_code,
  l.roll_number,
  l.original_quantity,
  l.original_unit,
  l.conversion_factor,
  l.normalized_quantity,
  l.normalized_unit,
  l.remaining_normalized_quantity,
  round((l.normalized_quantity-l.remaining_normalized_quantity)::numeric,4) as used_normalized_quantity,
  l.current_location_id,
  sl.code as location_code,
  sl.name as location_name,
  l.status,
  l.created_at,
  l.updated_at
from public.material_lots l
join public.materials m on m.id=l.material_id
left join public.warehouse_receipts r on r.id=l.receipt_id
join public.stock_locations sl on sl.id=l.current_location_id;

create or replace view public.v_material_actual_consumption
with (security_invoker = true)
as
select
  u.project_id,
  u.product_id,
  u.work_item_id,
  u.material_id,
  u.process_code as process,
  u.usage_date as consumption_date,
  u.quantity as normalized_quantity,
  u.unit_snapshot as normalized_unit,
  u.usage_code as source_code,
  'READY_PRODUCTION_USAGE'::text as source_type,
  u.created_by as user_id,
  u.created_at
from public.ready_production_usages u
where u.item_kind='MATERIAL'
union all
select
  c.project_id,
  c.product_id,
  null::bigint as work_item_id,
  c.material_id,
  'CUTTING'::text as process,
  c.usage_date as consumption_date,
  c.quantity as normalized_quantity,
  c.unit_snapshot as normalized_unit,
  c.usage_code as source_code,
  'CUTTING_USAGE'::text as source_type,
  c.created_by as user_id,
  c.created_at
from public.cutting_material_usages c
where c.status='AKTIF';

-- ============================================================
-- D. PERFORMANCE INDEXES FOR NEXT STAGES
-- ============================================================

create index if not exists production_orders_scope_status_idx
  on public.production_orders(project_id,product_id,status,order_date desc,id desc);
create index if not exists production_order_items_work_status_idx
  on public.production_order_items(work_item_id,status,order_id,id);
create index if not exists production_checks_item_date_active_idx
  on public.production_checks(order_item_id,check_date desc,id desc)
  where status='AKTIF';
create index if not exists warehouse_issues_scope_date_idx
  on public.warehouse_issues(project_id,product_id,material_id,issue_date desc,id desc)
  where source_type='BAHAN BAKU';

-- ============================================================
-- E. RLS + AUDIT
-- ============================================================

alter table public.work_item_dependencies enable row level security;
alter table public.production_wip_consumptions enable row level security;
alter table public.production_anomalies enable row level security;
alter table public.material_lots enable row level security;
alter table public.warehouse_issue_lots enable row level security;
alter table public.ready_production_usage_lots enable row level security;

drop policy if exists work_item_dependencies_select on public.work_item_dependencies;
create policy work_item_dependencies_select on public.work_item_dependencies
for select to authenticated using(
  public.has_permission('master_item.view')
  or public.has_permission('spk.view')
  or public.has_permission('produksi.view')
  or public.has_permission('hasil_produksi.view')
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

drop policy if exists production_anomalies_select on public.production_anomalies;
create policy production_anomalies_select on public.production_anomalies
for select to authenticated using(
  public.has_permission('hasil_produksi.view')
  or public.has_permission('laporan.view')
  or public.has_permission('spk.view')
  or upper(coalesce(public.current_user_role(),''))='ADMIN'
);

drop policy if exists material_lots_select on public.material_lots;
create policy material_lots_select on public.material_lots
for select to authenticated using(
  public.has_permission('stok_gudang.view')
  or public.has_permission('barang_masuk_gudang.view')
  or public.has_permission('barang_keluar_gudang.view')
  or public.has_permission('log_bahan.view')
  or public.has_permission('produksi.view')
  or public.has_permission('laporan.view')
  or upper(coalesce(public.current_user_role(),''))='ADMIN'
);

drop policy if exists warehouse_issue_lots_select on public.warehouse_issue_lots;
create policy warehouse_issue_lots_select on public.warehouse_issue_lots
for select to authenticated using(
  public.has_permission('barang_keluar_gudang.view')
  or public.has_permission('stok_gudang.view')
  or public.has_permission('log_bahan.view')
  or public.has_permission('laporan.view')
  or upper(coalesce(public.current_user_role(),''))='ADMIN'
);

drop policy if exists ready_production_usage_lots_select on public.ready_production_usage_lots;
create policy ready_production_usage_lots_select on public.ready_production_usage_lots
for select to authenticated using(
  public.has_permission('produksi.view')
  or public.has_permission('hasil_produksi.view')
  or public.has_permission('laporan.view')
  or upper(coalesce(public.current_user_role(),''))='ADMIN'
);

grant select on public.work_item_dependencies,public.production_wip_consumptions,public.production_anomalies,
  public.material_lots,public.warehouse_issue_lots,public.ready_production_usage_lots to authenticated;
grant select on public.v_work_item_equivalent_progress,public.v_work_item_wip_available,
  public.v_work_item_dependency_capacity,public.v_routing_progress_anomalies,
  public.v_material_lot_status,public.v_material_actual_consumption to authenticated;

grant execute on function public.smpt_get_route_capacity(bigint,bigint) to authenticated;
grant execute on function public.set_work_item_routing_meta(bigint,integer,text) to authenticated;
grant execute on function public.upsert_work_item_dependency(bigint,bigint,bigint,text,text,text) to authenticated;
grant execute on function public.deactivate_work_item_dependency(bigint) to authenticated;
grant execute on function public.set_material_lot_tracking_mode(bigint,text) to authenticated;
grant execute on function public.create_material_lot(bigint,text,numeric,text,text,text) to authenticated;
grant usage,select on sequence public.smpt_material_lot_code_seq,public.smpt_production_anomaly_code_seq to authenticated;

-- Reuse Batch 6 audit_event architecture; no second audit system.
drop trigger if exists audit_work_item_dependencies on public.work_item_dependencies;
create trigger audit_work_item_dependencies
after insert or update or delete on public.work_item_dependencies
for each row execute function public.smpt_audit_row_change();

drop trigger if exists audit_production_anomalies on public.production_anomalies;
create trigger audit_production_anomalies
after insert or update or delete on public.production_anomalies
for each row execute function public.smpt_audit_row_change();

drop trigger if exists audit_material_lots on public.material_lots;
create trigger audit_material_lots
after insert or update or delete on public.material_lots
for each row execute function public.smpt_audit_row_change();

-- Deliberately NOT replacing record_checker_result here.
-- Stage B will integrate WARNING/HARD validation atomically with production_wip_consumptions.
