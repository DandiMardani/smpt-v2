-- ============================================================
-- SMPT V2 - Procurement Core + Gudang Inbox / Fulfill Hardening
-- New migration only. Existing migrations are intentionally untouched.
-- ============================================================

-- ============================================================
-- 1) GRANULAR PROCUREMENT / SUPPLIER PERMISSIONS
-- ============================================================
insert into public.permissions(code, description) values
  ('procurement.view', 'Melihat purchase planning dan purchase order.'),
  ('procurement.create', 'Membuat purchase planning dan draft purchase order.'),
  ('procurement.edit_draft', 'Mengubah purchase planning dan draft purchase order.'),
  ('procurement.issue', 'Menerbitkan purchase order.'),
  ('procurement.cancel', 'Membatalkan purchase order yang belum diterima.'),
  ('procurement.receive', 'Menerima barang berdasarkan purchase order.'),
  ('procurement.export', 'Export data procurement.'),
  ('supplier.view', 'Melihat supplier dan relasi material supplier.'),
  ('supplier.manage', 'Mengelola supplier dan relasi material supplier.')
on conflict (code) do update set description=excluded.description;

with grants(role_code, permission_code) as (
  values
    ('MANAGER','procurement.view'),
    ('MANAGER','procurement.export'),
    ('MANAGER','supplier.view'),
    ('SUPERVISOR','procurement.view'),
    ('GUDANG','procurement.view'),
    ('GUDANG','procurement.receive'),
    ('GUDANG','supplier.view')
)
insert into public.role_permissions(role_id, permission_id)
select r.id,p.id
from grants g
join public.roles r on r.code=g.role_code
join public.permissions p on p.code=g.permission_code
on conflict do nothing;

-- ADMIN is wildcard in has_permission(), but keep the catalog preset complete too.
insert into public.role_permissions(role_id, permission_id)
select r.id,p.id
from public.roles r
cross join public.permissions p
where r.code='ADMIN'
on conflict do nothing;

-- Additional Supplier policies. Existing master_vendor policies remain compatible.
drop policy if exists material_suppliers_procurement_select on public.material_suppliers;
create policy material_suppliers_procurement_select on public.material_suppliers
for select to authenticated
using(public.has_permission('supplier.view') or public.has_permission('procurement.view'));

drop policy if exists material_suppliers_supplier_manage on public.material_suppliers;
create policy material_suppliers_supplier_manage on public.material_suppliers
for all to authenticated
using(public.has_permission('supplier.manage'))
with check(public.has_permission('supplier.manage'));

-- Granular supplier permissions reuse Master Vendor/Material instead of creating a
-- second supplier master. Existing master_* policies remain valid in parallel.
drop policy if exists vendors_supplier_select on public.vendors;
create policy vendors_supplier_select on public.vendors for select to authenticated
using(public.has_permission('supplier.view') or public.has_permission('procurement.view') or public.has_permission('procurement.receive') or public.has_permission('procurement.export'));

drop policy if exists vendors_supplier_manage on public.vendors;
create policy vendors_supplier_manage on public.vendors for all to authenticated
using(public.has_permission('supplier.manage'))
with check(public.has_permission('supplier.manage'));

drop policy if exists materials_supplier_select on public.materials;
create policy materials_supplier_select on public.materials for select to authenticated
using(public.has_permission('supplier.view') or public.has_permission('procurement.view') or public.has_permission('procurement.receive') or public.has_permission('procurement.export'));

drop policy if exists projects_procurement_select on public.projects;
create policy projects_procurement_select on public.projects for select to authenticated
using(public.has_permission('procurement.view') or public.has_permission('procurement.create'));

drop policy if exists project_products_procurement_select on public.project_products;
create policy project_products_procurement_select on public.project_products for select to authenticated
using(public.has_permission('procurement.view') or public.has_permission('procurement.create'));

create or replace function public.save_material_supplier(
  p_material_id bigint,
  p_supplier_id bigint,
  p_supplier_material_code text,
  p_supplier_material_name text,
  p_supplier_unit text,
  p_conversion_factor numeric,
  p_last_price numeric,
  p_preferred boolean,
  p_moq numeric,
  p_estimated_lead_time_days integer,
  p_default_purchase_unit text,
  p_notes text,
  p_status text
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare v_id bigint; v_status text:=upper(btrim(coalesce(p_status,'AKTIF')));
begin
  if auth.uid() is null then raise exception 'Sesi login tidak ditemukan.' using errcode='42501'; end if;
  if not (public.has_permission('master_vendor.write') or public.has_permission('master_bahan.write') or public.has_permission('supplier.manage')) then
    raise exception 'Tidak memiliki izin mengubah relasi Supplier.' using errcode='42501';
  end if;
  if v_status not in ('AKTIF','NONAKTIF') then raise exception 'Status relasi tidak valid.'; end if;
  if coalesce(p_conversion_factor,0)<=0 then raise exception 'Conversion factor harus lebih dari 0.'; end if;
  perform pg_advisory_xact_lock(p_material_id);
  perform 1 from public.materials where id=p_material_id; if not found then raise exception 'Material tidak ditemukan.'; end if;
  perform 1 from public.vendors where id=p_supplier_id; if not found then raise exception 'Supplier/Vendor tidak ditemukan.'; end if;

  if coalesce(p_preferred,false) and v_status='AKTIF' then
    update public.material_suppliers set preferred=false,updated_by=auth.uid()
    where material_id=p_material_id and supplier_id<>p_supplier_id and preferred=true;
  end if;

  insert into public.material_suppliers(
    material_id,supplier_id,supplier_material_code,supplier_material_name,supplier_unit,conversion_factor,last_price,preferred,moq,
    estimated_lead_time_days,default_purchase_unit,notes,status,created_by,updated_by
  ) values(
    p_material_id,p_supplier_id,nullif(btrim(coalesce(p_supplier_material_code,'')),''),nullif(btrim(coalesce(p_supplier_material_name,'')),''),
    nullif(btrim(coalesce(p_supplier_unit,'')),''),p_conversion_factor,p_last_price,coalesce(p_preferred,false),p_moq,p_estimated_lead_time_days,
    nullif(btrim(coalesce(p_default_purchase_unit,'')),''),nullif(btrim(coalesce(p_notes,'')),''),v_status,auth.uid(),auth.uid()
  )
  on conflict(material_id,supplier_id) do update set
    supplier_material_code=excluded.supplier_material_code,supplier_material_name=excluded.supplier_material_name,supplier_unit=excluded.supplier_unit,
    conversion_factor=excluded.conversion_factor,last_price=excluded.last_price,preferred=excluded.preferred,moq=excluded.moq,
    estimated_lead_time_days=excluded.estimated_lead_time_days,default_purchase_unit=excluded.default_purchase_unit,notes=excluded.notes,status=excluded.status,
    updated_by=auth.uid()
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================
-- 2) PURCHASE PLANNING
-- ============================================================
create sequence if not exists public.smpt_purchase_plan_code_seq start with 1;
create sequence if not exists public.smpt_purchase_order_code_seq start with 1;

create table if not exists public.purchase_plans (
  id bigint generated always as identity primary key,
  plan_code text not null unique default ('PPLAN-'||lpad(nextval('public.smpt_purchase_plan_code_seq')::text,7,'0')),
  plan_date date not null default current_date,
  project_id bigint not null references public.projects(id) on update restrict on delete restrict,
  product_id bigint,
  status text not null default 'DRAFT' check(status in ('DRAFT','CONVERTED','CANCELLED')),
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict
);
create index if not exists purchase_plans_scope_status_idx on public.purchase_plans(project_id,product_id,status,plan_date desc,id desc);

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='purchase_plans_set_updated_at') then
    create trigger purchase_plans_set_updated_at before update on public.purchase_plans
      for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.purchase_plan_lines (
  id bigint generated always as identity primary key,
  purchase_plan_id bigint not null references public.purchase_plans(id) on update restrict on delete restrict,
  material_id bigint not null references public.materials(id) on update restrict on delete restrict,
  final_requirement numeric(18,4) not null check(final_requirement>=0),
  usable_stock numeric(18,4) not null default 0 check(usable_stock>=0),
  confirmed_incoming numeric(18,4) not null default 0 check(confirmed_incoming>=0),
  open_po_quantity numeric(18,4) not null default 0 check(open_po_quantity>=0),
  net_procurement_need numeric(18,4) not null default 0 check(net_procurement_need>=0),
  planned_quantity numeric(18,4) not null default 0 check(planned_quantity>=0),
  unit_snapshot text not null,
  supplier_id bigint references public.vendors(id) on update restrict on delete restrict,
  unit_price numeric(18,2) check(unit_price is null or unit_price>=0),
  source_requirement_count integer not null default 0 check(source_requirement_count>=0),
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(purchase_plan_id,material_id)
);
create index if not exists purchase_plan_lines_plan_idx on public.purchase_plan_lines(purchase_plan_id,id);
create index if not exists purchase_plan_lines_supplier_idx on public.purchase_plan_lines(supplier_id,purchase_plan_id) where supplier_id is not null;

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='purchase_plan_lines_set_updated_at') then
    create trigger purchase_plan_lines_set_updated_at before update on public.purchase_plan_lines
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ============================================================
-- 3) PURCHASE ORDER CORE
-- ============================================================
create table if not exists public.purchase_orders (
  id bigint generated always as identity primary key,
  po_number text not null unique,
  purchase_plan_id bigint references public.purchase_plans(id) on update restrict on delete restrict,
  supplier_id bigint not null references public.vendors(id) on update restrict on delete restrict,
  order_date date not null default current_date,
  expected_date date,
  currency text not null default 'IDR',
  status text not null default 'DRAFT' check(status in ('DRAFT','ISSUED','PARTIAL','RECEIVED','CANCELLED')),
  notes text,
  issued_at timestamptz,
  issued_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(expected_date is null or expected_date>=order_date)
);
create index if not exists purchase_orders_status_date_idx on public.purchase_orders(status,order_date desc,id desc);
create index if not exists purchase_orders_supplier_status_idx on public.purchase_orders(supplier_id,status,order_date desc,id desc);
create index if not exists purchase_orders_plan_idx on public.purchase_orders(purchase_plan_id,status,id) where purchase_plan_id is not null;

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='purchase_orders_set_updated_at') then
    create trigger purchase_orders_set_updated_at before update on public.purchase_orders
      for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.purchase_order_lines (
  id bigint generated always as identity primary key,
  purchase_order_id bigint not null references public.purchase_orders(id) on update restrict on delete restrict,
  purchase_plan_line_id bigint references public.purchase_plan_lines(id) on update restrict on delete restrict,
  material_id bigint not null references public.materials(id) on update restrict on delete restrict,
  ordered_quantity numeric(18,4) not null check(ordered_quantity>0),
  purchase_unit text not null,
  conversion_factor numeric(20,10) not null default 1 check(conversion_factor>0),
  ordered_stock_quantity numeric(18,4) not null check(ordered_stock_quantity>0),
  stock_unit text not null,
  received_stock_quantity numeric(18,4) not null default 0 check(received_stock_quantity>=0),
  unit_price numeric(18,2) not null default 0 check(unit_price>=0),
  supplier_material_code text,
  status text not null default 'OPEN' check(status in ('OPEN','PARTIAL','RECEIVED','CANCELLED')),
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(received_stock_quantity<=ordered_stock_quantity+0.00005)
);
create unique index if not exists purchase_order_lines_po_material_uq on public.purchase_order_lines(purchase_order_id,material_id) where status<>'CANCELLED';
create index if not exists purchase_order_lines_material_status_idx on public.purchase_order_lines(material_id,status,purchase_order_id);
create index if not exists purchase_order_lines_plan_line_idx on public.purchase_order_lines(purchase_plan_line_id,status) where purchase_plan_line_id is not null;

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='purchase_order_lines_set_updated_at') then
    create trigger purchase_order_lines_set_updated_at before update on public.purchase_order_lines
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- Link existing Barang Masuk to PO without replacing the existing receipt architecture.
alter table public.warehouse_receipts
  add column if not exists receipt_source text not null default 'NON_PO',
  add column if not exists supplier_id bigint references public.vendors(id) on update restrict on delete restrict,
  add column if not exists purchase_order_id bigint references public.purchase_orders(id) on update restrict on delete restrict,
  add column if not exists purchase_order_line_id bigint references public.purchase_order_lines(id) on update restrict on delete restrict,
  add column if not exists idempotency_key text;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='warehouse_receipts_receipt_source_check') then
    alter table public.warehouse_receipts add constraint warehouse_receipts_receipt_source_check
      check(receipt_source in ('NON_PO','PO'));
  end if;
end $$;
create index if not exists warehouse_receipts_po_line_idx on public.warehouse_receipts(purchase_order_line_id,receipt_date desc,id desc) where purchase_order_line_id is not null;
create unique index if not exists warehouse_receipts_idempotency_uq on public.warehouse_receipts(idempotency_key) where idempotency_key is not null;
create index if not exists warehouse_receipts_supplier_idx on public.warehouse_receipts(supplier_id,receipt_date desc,id desc) where supplier_id is not null;

-- ============================================================
-- 4) RLS - READ VIA PERMISSION, MUTATION THROUGH GUARDED RPC
-- ============================================================
alter table public.purchase_plans enable row level security;
alter table public.purchase_plan_lines enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;

drop policy if exists purchase_plans_select on public.purchase_plans;
create policy purchase_plans_select on public.purchase_plans for select to authenticated
using(public.has_permission('procurement.view') or public.has_permission('procurement.export'));
drop policy if exists purchase_plan_lines_select on public.purchase_plan_lines;
create policy purchase_plan_lines_select on public.purchase_plan_lines for select to authenticated
using(public.has_permission('procurement.view') or public.has_permission('procurement.export'));
drop policy if exists purchase_orders_select on public.purchase_orders;
create policy purchase_orders_select on public.purchase_orders for select to authenticated
using(public.has_permission('procurement.view') or public.has_permission('procurement.receive') or public.has_permission('procurement.export'));
drop policy if exists purchase_order_lines_select on public.purchase_order_lines;
create policy purchase_order_lines_select on public.purchase_order_lines for select to authenticated
using(public.has_permission('procurement.view') or public.has_permission('procurement.receive') or public.has_permission('procurement.export'));

grant select on public.purchase_plans,public.purchase_plan_lines,public.purchase_orders,public.purchase_order_lines to authenticated;
grant usage,select on sequence public.purchase_plans_id_seq,public.purchase_plan_lines_id_seq,public.purchase_orders_id_seq,public.purchase_order_lines_id_seq to authenticated;

-- ============================================================
-- 5) PURCHASE PLANNING RPC
-- Formula: Final Requirement - Usable Stock - Confirmed Incoming - Open PO
-- ============================================================
create or replace function public.smpt_create_purchase_plan(
  p_project_id bigint,
  p_product_id bigint default null,
  p_plan_date date default current_date,
  p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan_id bigint;
  v_existing bigint;
begin
  if not public.has_permission('procurement.create') then
    raise exception 'Tidak memiliki izin membuat Purchase Planning.' using errcode='42501';
  end if;
  if p_project_id is null then raise exception 'Proyek wajib dipilih.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('purchase-plan:'||p_project_id::text||':'||coalesce(p_product_id::text,'ALL'),0));

  perform 1 from public.projects where id=p_project_id;
  if not found then raise exception 'Proyek tidak ditemukan.'; end if;
  if p_product_id is not null then
    perform 1 from public.project_products where id=p_product_id and project_id=p_project_id;
    if not found then raise exception 'Produk/Tas tidak sesuai Proyek.'; end if;
  end if;

  select id into v_existing
  from public.purchase_plans
  where project_id=p_project_id and product_id is not distinct from p_product_id and status='DRAFT'
  order by id desc limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into public.purchase_plans(plan_date,project_id,product_id,notes,created_by,updated_by)
  values(coalesce(p_plan_date,current_date),p_project_id,p_product_id,nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),auth.uid())
  returning id into v_plan_id;

  with req as (
    select
      b.material_id,
      max(m.standard_unit)::text as unit_snapshot,
      count(*)::integer as requirement_count,
      round(sum(coalesce(
        b.final_requirement,
        b.legacy_total_requirement,
        case when pp.id is not null then pp.target_production*b.qty_per_unit else 0 end,
        0
      ))::numeric,4) as final_requirement
    from public.bom_requirements b
    join public.materials m on m.id=b.material_id and m.status='AKTIF'
    left join public.project_products pp on pp.id=b.product_id
    where b.project_id=p_project_id
      and b.component_type='BAHAN'
      and b.status='AKTIF'
      and b.material_id is not null
      and coalesce(b.fulfillment_source,'COMPANY_PURCHASE')='COMPANY_PURCHASE'
      and (p_product_id is null or b.product_id=p_product_id)
    group by b.material_id
  ), stock as (
    select sb.material_id,round(sum(sb.quantity)::numeric,4) qty
    from public.stock_balances sb
    join public.stock_locations sl on sl.id=sb.location_id and sl.code='GUDANG_BAHAN'
    where sb.item_kind='MATERIAL' and sb.quantity>0
    group by sb.material_id
  ), open_po as (
    select pol.material_id,
      round(sum(greatest(pol.ordered_stock_quantity-pol.received_stock_quantity,0))::numeric,4) qty
    from public.purchase_order_lines pol
    join public.purchase_orders po on po.id=pol.purchase_order_id
    join public.purchase_plans pl on pl.id=po.purchase_plan_id
    where po.status in ('ISSUED','PARTIAL') and pol.status in ('OPEN','PARTIAL')
      and pl.project_id=p_project_id
      and (p_product_id is null or pl.product_id is not distinct from p_product_id)
    group by pol.material_id
  )
  insert into public.purchase_plan_lines(
    purchase_plan_id,material_id,final_requirement,usable_stock,confirmed_incoming,open_po_quantity,
    net_procurement_need,planned_quantity,unit_snapshot,supplier_id,unit_price,source_requirement_count,created_by,updated_by
  )
  select
    v_plan_id,r.material_id,r.final_requirement,coalesce(s.qty,0),0,coalesce(o.qty,0),
    greatest(round((r.final_requirement-coalesce(s.qty,0)-coalesce(o.qty,0))::numeric,4),0),
    greatest(round((r.final_requirement-coalesce(s.qty,0)-coalesce(o.qty,0))::numeric,4),0),
    r.unit_snapshot,
    ms.supplier_id,
    ms.last_price,
    r.requirement_count,auth.uid(),auth.uid()
  from req r
  left join stock s on s.material_id=r.material_id
  left join open_po o on o.material_id=r.material_id
  left join lateral (
    select x.supplier_id,x.last_price
    from public.material_suppliers x
    where x.material_id=r.material_id and x.status='AKTIF'
    order by x.preferred desc,x.id
    limit 1
  ) ms on true;

  if not exists(select 1 from public.purchase_plan_lines where purchase_plan_id=v_plan_id) then
    delete from public.purchase_plans where id=v_plan_id;
    raise exception 'Tidak ada kebutuhan COMPANY_PURCHASE aktif pada scope ini.';
  end if;

  return v_plan_id;
end;
$$;

create or replace function public.smpt_update_purchase_plan_line(
  p_line_id bigint,
  p_confirmed_incoming numeric,
  p_planned_quantity numeric,
  p_supplier_id bigint,
  p_unit_price numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_line public.purchase_plan_lines%rowtype;
  v_net numeric(18,4);
begin
  if not public.has_permission('procurement.edit_draft') then
    raise exception 'Tidak memiliki izin mengubah Purchase Planning.' using errcode='42501';
  end if;
  select l.* into v_line
  from public.purchase_plan_lines l
  join public.purchase_plans p on p.id=l.purchase_plan_id
  where l.id=p_line_id and p.status='DRAFT'
  for update of l;
  if not found then raise exception 'Baris Purchase Planning DRAFT tidak ditemukan.'; end if;
  if coalesce(p_confirmed_incoming,0)<0 or coalesce(p_planned_quantity,0)<0 or coalesce(p_unit_price,0)<0 then
    raise exception 'Qty/harga tidak boleh negatif.';
  end if;
  if p_supplier_id is not null then
    perform 1 from public.vendors where id=p_supplier_id and status='AKTIF';
    if not found then raise exception 'Supplier tidak ditemukan/aktif.'; end if;
  end if;
  v_net:=greatest(round((v_line.final_requirement-v_line.usable_stock-coalesce(p_confirmed_incoming,0)-v_line.open_po_quantity)::numeric,4),0);
  update public.purchase_plan_lines set
    confirmed_incoming=round(coalesce(p_confirmed_incoming,0)::numeric,4),
    net_procurement_need=v_net,
    planned_quantity=round(coalesce(p_planned_quantity,v_net)::numeric,4),
    supplier_id=p_supplier_id,
    unit_price=p_unit_price,
    notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_by=auth.uid(),updated_at=now()
  where id=p_line_id;
end;
$$;

-- ============================================================
-- 6) PURCHASE ORDER RPC
-- ============================================================
create or replace function public.smpt_create_draft_purchase_order(
  p_purchase_plan_id bigint,
  p_supplier_id bigint,
  p_order_date date default current_date,
  p_expected_date date default null,
  p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_po_id bigint;
  v_po_number text;
  v_currency text;
  v_line_count integer;
  v_existing_po bigint;
begin
  if not public.has_permission('procurement.create') then
    raise exception 'Tidak memiliki izin membuat Draft PO.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('draft-po:'||p_purchase_plan_id::text||':'||p_supplier_id::text,0));
  perform 1 from public.purchase_plans where id=p_purchase_plan_id and status='DRAFT' for update;
  if not found then raise exception 'Purchase Planning DRAFT tidak ditemukan.'; end if;
  select coalesce(nullif(default_currency,''),'IDR') into v_currency from public.vendors where id=p_supplier_id and status='AKTIF';
  if v_currency is null then raise exception 'Supplier tidak ditemukan/aktif.'; end if;
  if p_expected_date is not null and p_expected_date<coalesce(p_order_date,current_date) then raise exception 'Expected date tidak boleh sebelum tanggal PO.'; end if;

  select id into v_existing_po
  from public.purchase_orders
  where purchase_plan_id=p_purchase_plan_id and supplier_id=p_supplier_id and status='DRAFT'
  order by id desc limit 1;
  if v_existing_po is not null then return v_existing_po; end if;

  if exists(
    select 1 from public.purchase_order_lines pol
    join public.purchase_orders po on po.id=pol.purchase_order_id
    join public.purchase_plan_lines ppl on ppl.id=pol.purchase_plan_line_id
    where ppl.purchase_plan_id=p_purchase_plan_id and ppl.supplier_id=p_supplier_id
      and po.status<>'CANCELLED' and pol.status<>'CANCELLED'
  ) then
    raise exception 'Sebagian baris plan Supplier ini sudah memiliki PO aktif. Batalkan PO lama atau gunakan baris plan yang belum dikonversi.';
  end if;

  v_po_number:='PO-'||to_char(coalesce(p_order_date,current_date),'YYYYMMDD')||'-'||lpad(nextval('public.smpt_purchase_order_code_seq')::text,6,'0');
  insert into public.purchase_orders(po_number,purchase_plan_id,supplier_id,order_date,expected_date,currency,notes,created_by,updated_by)
  values(v_po_number,p_purchase_plan_id,p_supplier_id,coalesce(p_order_date,current_date),p_expected_date,v_currency,nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),auth.uid())
  returning id into v_po_id;

  insert into public.purchase_order_lines(
    purchase_order_id,purchase_plan_line_id,material_id,ordered_quantity,purchase_unit,conversion_factor,
    ordered_stock_quantity,stock_unit,unit_price,supplier_material_code,notes,created_by,updated_by
  )
  select
    v_po_id,l.id,l.material_id,round((l.planned_quantity/u.factor)::numeric,4),
    u.purchase_unit,u.factor,l.planned_quantity,
    l.unit_snapshot,coalesce(l.unit_price,ms.last_price,0),ms.supplier_material_code,l.notes,auth.uid(),auth.uid()
  from public.purchase_plan_lines l
  left join public.material_suppliers ms on ms.material_id=l.material_id and ms.supplier_id=p_supplier_id and ms.status='AKTIF'
  cross join lateral (
    select
      coalesce(nullif(ms.default_purchase_unit,''),nullif(ms.supplier_unit,''),l.unit_snapshot) as purchase_unit,
      public.smpt_resolve_conversion_factor(
        coalesce(nullif(ms.default_purchase_unit,''),nullif(ms.supplier_unit,''),l.unit_snapshot),
        l.unit_snapshot,
        case
          when ms.supplier_unit is not null
           and public.smpt_unit_key(coalesce(nullif(ms.default_purchase_unit,''),nullif(ms.supplier_unit,''),l.unit_snapshot))=public.smpt_unit_key(ms.supplier_unit)
          then ms.conversion_factor
          else null
        end
      ) as factor
  ) u
  where l.purchase_plan_id=p_purchase_plan_id and l.supplier_id=p_supplier_id and l.planned_quantity>0;

  get diagnostics v_line_count=row_count;
  if v_line_count=0 then
    delete from public.purchase_orders where id=v_po_id;
    raise exception 'Tidak ada baris plan dengan Supplier dan planned qty yang valid.';
  end if;
  return v_po_id;
end;
$$;

create or replace function public.smpt_update_draft_purchase_order_line(
  p_line_id bigint,
  p_ordered_quantity numeric,
  p_purchase_unit text,
  p_conversion_factor numeric,
  p_unit_price numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_line public.purchase_order_lines%rowtype;
  v_standard_unit text;
  v_factor numeric;
begin
  if not public.has_permission('procurement.edit_draft') then
    raise exception 'Tidak memiliki izin mengubah Draft PO.' using errcode='42501';
  end if;
  select pol.* into v_line
  from public.purchase_order_lines pol
  join public.purchase_orders po on po.id=pol.purchase_order_id
  where pol.id=p_line_id and po.status='DRAFT'
  for update of pol;
  if not found then raise exception 'Baris Draft PO tidak ditemukan.'; end if;
  if coalesce(p_ordered_quantity,0)<=0 or coalesce(p_unit_price,0)<0 then raise exception 'Qty/harga PO tidak valid.'; end if;
  select standard_unit into v_standard_unit from public.materials where id=v_line.material_id;
  if v_standard_unit is null then raise exception 'Material tidak ditemukan.'; end if;
  v_factor:=public.smpt_resolve_conversion_factor(p_purchase_unit,v_standard_unit,p_conversion_factor);
  update public.purchase_order_lines set
    ordered_quantity=round(p_ordered_quantity::numeric,4),
    purchase_unit=public.smpt_unit_key(p_purchase_unit),
    conversion_factor=v_factor,
    ordered_stock_quantity=round((p_ordered_quantity*v_factor)::numeric,4),
    stock_unit=v_standard_unit,
    unit_price=round(coalesce(p_unit_price,0)::numeric,2),
    notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_by=auth.uid(),updated_at=now()
  where id=p_line_id;
end;
$$;

create or replace function public.smpt_issue_purchase_order(p_purchase_order_id bigint)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare v_number text; v_status text;
begin
  if not public.has_permission('procurement.issue') then
    raise exception 'Tidak memiliki izin menerbitkan PO.' using errcode='42501';
  end if;
  select po_number,status into v_number,v_status from public.purchase_orders where id=p_purchase_order_id for update;
  if not found then raise exception 'PO tidak ditemukan.'; end if;
  if v_status in ('ISSUED','PARTIAL','RECEIVED') then return v_number; end if;
  if v_status<>'DRAFT' then raise exception 'PO tidak dapat diterbitkan pada status %.',v_status; end if;
  if not exists(select 1 from public.purchase_order_lines where purchase_order_id=p_purchase_order_id and status='OPEN') then
    raise exception 'PO tidak memiliki item.';
  end if;
  update public.purchase_orders set status='ISSUED',issued_at=now(),issued_by=auth.uid(),updated_by=auth.uid(),updated_at=now()
  where id=p_purchase_order_id;
  update public.purchase_plans p set status='CONVERTED',updated_by=auth.uid(),updated_at=now()
  where id=(select purchase_plan_id from public.purchase_orders where id=p_purchase_order_id)
    and not exists(
      select 1 from public.purchase_plan_lines ppl
      where ppl.purchase_plan_id=p.id and ppl.planned_quantity>0
        and not exists(
          select 1 from public.purchase_order_lines pol
          join public.purchase_orders po on po.id=pol.purchase_order_id
          where pol.purchase_plan_line_id=ppl.id and po.status<>'CANCELLED' and pol.status<>'CANCELLED'
        )
    );
  return v_number;
end;
$$;

create or replace function public.smpt_cancel_purchase_order(p_purchase_order_id bigint,p_reason text default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_plan_id bigint;
begin
  if not public.has_permission('procurement.cancel') then
    raise exception 'Tidak memiliki izin membatalkan PO.' using errcode='42501';
  end if;
  select purchase_plan_id into v_plan_id from public.purchase_orders
  where id=p_purchase_order_id and status in ('DRAFT','ISSUED') for update;
  if not found then raise exception 'PO tidak dapat dibatalkan pada status ini.'; end if;
  if exists(select 1 from public.purchase_order_lines where purchase_order_id=p_purchase_order_id and received_stock_quantity>0) then
    raise exception 'PO yang sudah memiliki penerimaan tidak boleh dibatalkan. Gunakan proses retur/koreksi receiving.';
  end if;
  update public.purchase_orders set status='CANCELLED',cancelled_at=now(),cancelled_by=auth.uid(),updated_by=auth.uid(),
    notes=case when nullif(btrim(coalesce(p_reason,'')),'') is null then notes else concat_ws(E'\n',notes,'CANCEL: '||btrim(p_reason)) end,
    updated_at=now()
  where id=p_purchase_order_id;
  update public.purchase_order_lines set status='CANCELLED',updated_by=auth.uid(),updated_at=now() where purchase_order_id=p_purchase_order_id;
  if v_plan_id is not null then update public.purchase_plans set status='DRAFT',updated_by=auth.uid(),updated_at=now() where id=v_plan_id and status='CONVERTED'; end if;
end;
$$;

-- ============================================================
-- 7) PO RECEIVING -> EXISTING RECEIPT + LEDGER + OPTIONAL ROLL/LOT
-- ============================================================
create or replace function public.smpt_receive_purchase_order_line(
  p_purchase_order_line_id bigint,
  p_receipt_date date,
  p_quantity numeric,
  p_input_unit text default null,
  p_conversion_factor numeric default null,
  p_document_no text default null,
  p_roll_number text default null,
  p_supplier_lot_no text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_line public.purchase_order_lines%rowtype;
  v_po public.purchase_orders%rowtype;
  v_supplier_name text;
  v_standard_unit text;
  v_tracking_mode text;
  v_input_unit text;
  v_factor numeric;
  v_stock_qty numeric(18,4);
  v_remaining numeric(18,4);
  v_code text;
  v_event bigint;
  v_receipt_id bigint;
  v_lot_id bigint;
  v_po_done boolean;
  v_existing_receipt public.warehouse_receipts%rowtype;
  v_key text:=nullif(btrim(coalesce(p_idempotency_key,'')),'');
begin
  if not public.has_permission('procurement.receive') or not public.has_permission('barang_masuk_gudang.write') then
    raise exception 'Tidak memiliki izin menerima PO di Gudang.' using errcode='42501';
  end if;
  if p_receipt_date is null or coalesce(p_quantity,0)<=0 then raise exception 'Tanggal dan qty penerimaan wajib valid.'; end if;
  if v_key is null then raise exception 'Transaction key penerimaan PO wajib ada. Refresh halaman lalu coba lagi.'; end if;

  -- Same rendered form always sends the same key. This closes double-click / retry duplicates
  -- before any stock event is created. A fresh render gets a fresh key.
  perform pg_advisory_xact_lock(hashtextextended('po-receipt:'||v_key,0));
  select * into v_existing_receipt from public.warehouse_receipts where idempotency_key=v_key;
  if found then
    if v_existing_receipt.purchase_order_line_id<>p_purchase_order_line_id then
      raise exception 'Transaction key penerimaan sudah dipakai untuk baris PO lain.';
    end if;
    if v_existing_receipt.status<>'AKTIF' then
      raise exception 'Transaction key mengarah ke receipt yang sudah direversal. Refresh halaman lalu terima ulang.';
    end if;
    select id into v_lot_id from public.material_lots where receipt_id=v_existing_receipt.id order by id limit 1;
    return jsonb_build_object(
      'receipt_id',v_existing_receipt.id,'receipt_code',v_existing_receipt.receipt_code,'lot_id',v_lot_id,
      'stock_quantity',v_existing_receipt.quantity,'stock_unit',v_existing_receipt.unit_snapshot,'idempotent_replay',true
    );
  end if;

  select * into v_line from public.purchase_order_lines where id=p_purchase_order_line_id for update;
  if not found or v_line.status not in ('OPEN','PARTIAL') then raise exception 'Baris PO tidak terbuka untuk penerimaan.'; end if;
  select * into v_po from public.purchase_orders where id=v_line.purchase_order_id for update;
  if not found or v_po.status not in ('ISSUED','PARTIAL') then raise exception 'PO belum diterbitkan atau sudah selesai.'; end if;
  select name into v_supplier_name from public.vendors where id=v_po.supplier_id;
  select standard_unit,coalesce(lot_tracking_mode,'NONE') into v_standard_unit,v_tracking_mode from public.materials where id=v_line.material_id and status='AKTIF';
  if v_standard_unit is null then raise exception 'Material tidak ditemukan/aktif.'; end if;

  v_input_unit:=coalesce(nullif(btrim(coalesce(p_input_unit,'')),''),v_line.purchase_unit,v_standard_unit);
  v_factor:=public.smpt_resolve_conversion_factor(
    v_input_unit,v_standard_unit,
    coalesce(p_conversion_factor,case when public.smpt_unit_key(v_input_unit)=public.smpt_unit_key(v_line.purchase_unit) then v_line.conversion_factor else null end)
  );
  v_stock_qty:=round((p_quantity*v_factor)::numeric,4);
  v_remaining:=round((v_line.ordered_stock_quantity-v_line.received_stock_quantity)::numeric,4);
  if v_stock_qty>v_remaining+0.00005 then
    raise exception 'Qty penerimaan melebihi outstanding PO. Outstanding: % %.',v_remaining,v_standard_unit;
  end if;
  if v_tracking_mode in ('ROLL','LOT') and btrim(coalesce(p_roll_number,''))='' then
    raise exception 'Material memakai tracking %. Nomor Roll/Lot wajib diisi per penerimaan fisik.',v_tracking_mode;
  end if;
  if v_tracking_mode='ROLL' and public.smpt_unit_key(v_input_unit)='ROLL' then
    raise exception 'Untuk material ROLL, isi panjang aktual per roll (mis. METER/YARD), bukan qty ROLL fixed.';
  end if;

  v_code:='BMG-'||lpad(nextval('public.smpt_receipt_code_seq')::text,6,'0');
  v_event:=public.smpt_create_stock_event('WAREHOUSE_RECEIPT',p_receipt_date,null,null,'PO_RECEIPT',v_code,null,p_notes);
  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_line.material_id,null,'GUDANG_BAHAN',null,null,null,v_stock_qty,'BARANG MASUK PO',p_notes);

  insert into public.warehouse_receipts(
    receipt_code,receipt_date,material_id,quantity,unit_snapshot,input_quantity,input_unit,conversion_factor,
    supplier,document_no,notes,base_event_id,receipt_source,supplier_id,purchase_order_id,purchase_order_line_id,idempotency_key,created_by,updated_by
  ) values(
    v_code,p_receipt_date,v_line.material_id,v_stock_qty,v_standard_unit,round(p_quantity::numeric,4),public.smpt_unit_key(v_input_unit),v_factor,
    v_supplier_name,nullif(btrim(coalesce(p_document_no,'')),''),nullif(btrim(coalesce(p_notes,'')),''),v_event,'PO',v_po.supplier_id,v_po.id,v_line.id,v_key,auth.uid(),auth.uid()
  ) returning id into v_receipt_id;

  if v_tracking_mode='ROLL' then
    -- Preserve the actual measured length of this physical roll.
    v_lot_id:=public.create_material_lot(v_receipt_id,btrim(p_roll_number),p_quantity,v_input_unit,p_supplier_lot_no,p_notes);
  elsif v_tracking_mode='LOT' then
    -- LOT may use supplier-specific units that are not part of shared conversion.
    -- Store the canonical normalized quantity so lot partitioning cannot diverge.
    v_lot_id:=public.create_material_lot(v_receipt_id,btrim(p_roll_number),v_stock_qty,v_standard_unit,p_supplier_lot_no,p_notes);
  end if;

  update public.purchase_order_lines set
    received_stock_quantity=round((received_stock_quantity+v_stock_qty)::numeric,4),
    status=case when received_stock_quantity+v_stock_qty>=ordered_stock_quantity-0.00005 then 'RECEIVED' else 'PARTIAL' end,
    updated_by=auth.uid(),updated_at=now()
  where id=v_line.id;

  select not exists(
    select 1 from public.purchase_order_lines
    where purchase_order_id=v_po.id and status not in ('RECEIVED','CANCELLED')
  ) into v_po_done;
  update public.purchase_orders set
    status=case when v_po_done then 'RECEIVED' else 'PARTIAL' end,
    updated_by=auth.uid(),updated_at=now()
  where id=v_po.id;

  return jsonb_build_object('receipt_id',v_receipt_id,'receipt_code',v_code,'lot_id',v_lot_id,'stock_quantity',v_stock_qty,'stock_unit',v_standard_unit,'idempotent_replay',false);
end;
$$;

-- Generic receipt correction stays valid for NON_PO only. PO receipts have
-- dedicated reversal logic so PO outstanding and inventory can never diverge.
create or replace function public.update_warehouse_receipt(
  p_receipt_id bigint,
  p_receipt_date date,
  p_quantity numeric,
  p_input_unit text default null,
  p_conversion_factor numeric default null,
  p_supplier text default null,
  p_document_no text default null,
  p_notes text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_r public.warehouse_receipts%rowtype;
  v_standard_unit text;
  v_input_unit text;
  v_factor numeric;
  v_standard_qty numeric(18,4);
  v_delta numeric(18,4);
  v_event bigint;
begin
  if not public.has_permission('barang_masuk_gudang.write') then raise exception 'Tidak memiliki izin Barang Masuk Gudang.' using errcode='42501'; end if;
  select * into v_r from public.warehouse_receipts where id=p_receipt_id for update;
  if not found then raise exception 'Barang Masuk tidak ditemukan.'; end if;
  if v_r.receipt_source='PO' then raise exception 'Penerimaan PO tidak boleh dikoreksi lewat Barang Masuk umum. Gunakan reversal PO lalu terima ulang.'; end if;
  if v_r.status<>'AKTIF' then raise exception 'Transaksi sudah dibatalkan.'; end if;
  if p_receipt_date is null or p_quantity is null or p_quantity<=0 then raise exception 'Tanggal dan qty wajib valid.'; end if;
  select standard_unit into v_standard_unit from public.materials where id=v_r.material_id;
  v_input_unit:=coalesce(nullif(btrim(coalesce(p_input_unit,'')),''),v_standard_unit);
  v_factor:=public.smpt_resolve_conversion_factor(v_input_unit,v_standard_unit,p_conversion_factor);
  v_standard_qty:=round((p_quantity*v_factor)::numeric,4);
  v_delta:=round((v_standard_qty-v_r.quantity)::numeric,4);
  if v_delta<>0 then
    v_event:=public.smpt_create_stock_event('WAREHOUSE_RECEIPT_ADJUSTMENT',p_receipt_date,null,null,'BARANG_MASUK_GUDANG',v_r.receipt_code,null,'Koreksi '||v_r.receipt_code);
    perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_r.material_id,null,'GUDANG_BAHAN',null,null,null,v_delta,'KOREKSI BARANG MASUK',p_notes);
  end if;
  update public.warehouse_receipts set receipt_date=p_receipt_date,quantity=v_standard_qty,unit_snapshot=v_standard_unit,
    input_quantity=round(p_quantity::numeric,4),input_unit=public.smpt_unit_key(v_input_unit),conversion_factor=v_factor,
    supplier=nullif(btrim(coalesce(p_supplier,'')),''),document_no=nullif(btrim(coalesce(p_document_no,'')),''),notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_by=auth.uid(),updated_at=now() where id=p_receipt_id;
end;
$$;

create or replace function public.cancel_warehouse_receipt(p_receipt_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_r public.warehouse_receipts%rowtype; v_event bigint;
begin
  if not public.has_permission('barang_masuk_gudang.write') then raise exception 'Tidak memiliki izin Barang Masuk Gudang.' using errcode='42501'; end if;
  select * into v_r from public.warehouse_receipts where id=p_receipt_id for update;
  if not found then raise exception 'Barang Masuk tidak ditemukan.'; end if;
  if v_r.receipt_source='PO' then raise exception 'Penerimaan PO harus dibatalkan lewat reversal PO.'; end if;
  if v_r.status='DIBATALKAN' then raise exception 'Transaksi sudah dibatalkan.'; end if;
  v_event:=public.smpt_create_stock_event('WAREHOUSE_RECEIPT_REVERSAL',current_date,null,null,'BARANG_MASUK_GUDANG',v_r.receipt_code,v_r.base_event_id,'Pembatalan '||v_r.receipt_code);
  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_r.material_id,null,'GUDANG_BAHAN',null,null,null,-v_r.quantity,'BATAL BARANG MASUK','Reversal '||v_r.receipt_code);
  update public.warehouse_receipts set status='DIBATALKAN',cancellation_event_id=v_event,updated_by=auth.uid(),updated_at=now() where id=p_receipt_id;
end;
$$;

create or replace function public.smpt_cancel_po_receipt(p_receipt_id bigint,p_reason text default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_r public.warehouse_receipts%rowtype;
  v_line public.purchase_order_lines%rowtype;
  v_event bigint;
  v_gudang smallint;
  v_new_received numeric(18,4);
  v_any_received boolean;
  v_all_received boolean;
begin
  if not public.has_permission('procurement.receive') or not public.has_permission('barang_masuk_gudang.write') then
    raise exception 'Tidak memiliki izin reversal penerimaan PO.' using errcode='42501';
  end if;
  select * into v_r from public.warehouse_receipts where id=p_receipt_id for update;
  if not found or v_r.receipt_source<>'PO' or v_r.purchase_order_line_id is null then raise exception 'Penerimaan PO tidak ditemukan.'; end if;
  if v_r.status='DIBATALKAN' then raise exception 'Penerimaan sudah dibatalkan.'; end if;
  select * into v_line from public.purchase_order_lines where id=v_r.purchase_order_line_id for update;
  if not found then raise exception 'Baris PO penerimaan tidak ditemukan.'; end if;
  select id into v_gudang from public.stock_locations where code='GUDANG_BAHAN' and is_active=true;

  if exists(
    select 1 from public.material_lots l
    where l.receipt_id=v_r.id
      and (l.current_location_id<>v_gudang or l.remaining_normalized_quantity<>l.normalized_quantity or l.status not in ('AVAILABLE','PARTIAL'))
  ) then
    raise exception 'Roll/Lot dari receipt ini sudah bergerak/terpakai. Reversal PO diblokir agar histori stok tetap konsisten.';
  end if;

  v_event:=public.smpt_create_stock_event('WAREHOUSE_RECEIPT_REVERSAL',current_date,null,null,'PO_RECEIPT',v_r.receipt_code,v_r.base_event_id,coalesce(nullif(btrim(coalesce(p_reason,'')),''),'Reversal PO receipt'));
  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_r.material_id,null,'GUDANG_BAHAN',null,null,null,-v_r.quantity,'BATAL BARANG MASUK PO',coalesce(nullif(btrim(coalesce(p_reason,'')),''),'Reversal '||v_r.receipt_code));

  update public.material_lots set remaining_normalized_quantity=0,status='CLOSED',updated_by=auth.uid(),updated_at=now()
  where receipt_id=v_r.id;
  update public.warehouse_receipts set status='DIBATALKAN',cancellation_event_id=v_event,updated_by=auth.uid(),updated_at=now()
  where id=v_r.id;

  v_new_received:=greatest(round((v_line.received_stock_quantity-v_r.quantity)::numeric,4),0);
  update public.purchase_order_lines set
    received_stock_quantity=v_new_received,
    status=case when v_new_received<=0.00005 then 'OPEN' when v_new_received>=ordered_stock_quantity-0.00005 then 'RECEIVED' else 'PARTIAL' end,
    updated_by=auth.uid(),updated_at=now()
  where id=v_line.id;

  select exists(select 1 from public.purchase_order_lines where purchase_order_id=v_line.purchase_order_id and received_stock_quantity>0 and status<>'CANCELLED'),
         not exists(select 1 from public.purchase_order_lines where purchase_order_id=v_line.purchase_order_id and status not in ('RECEIVED','CANCELLED'))
  into v_any_received,v_all_received;
  update public.purchase_orders set
    status=case when v_all_received then 'RECEIVED' when v_any_received then 'PARTIAL' else 'ISSUED' end,
    updated_by=auth.uid(),updated_at=now()
  where id=v_line.purchase_order_id and status<>'CANCELLED';
end;
$$;

revoke all on function public.smpt_cancel_po_receipt(bigint,text) from public;
grant execute on function public.smpt_cancel_po_receipt(bigint,text) to authenticated;

-- ============================================================
-- 8) READ VIEWS FOR FAST UI / EXPORT
-- ============================================================
create or replace view public.v_procurement_plan_lines
with (security_invoker=true)
as
select
  ppl.id,ppl.purchase_plan_id,pp.plan_code,pp.plan_date,pp.project_id,pp.product_id,pp.status as plan_status,
  ppl.material_id,m.material_code,m.name as material_name,ppl.unit_snapshot,ppl.final_requirement,ppl.usable_stock,
  ppl.confirmed_incoming,ppl.open_po_quantity,ppl.net_procurement_need,ppl.planned_quantity,ppl.supplier_id,
  v.name as supplier_name,ppl.unit_price,ppl.source_requirement_count,ppl.notes,ppl.updated_at
from public.purchase_plan_lines ppl
join public.purchase_plans pp on pp.id=ppl.purchase_plan_id
join public.materials m on m.id=ppl.material_id
left join public.vendors v on v.id=ppl.supplier_id;

create or replace view public.v_purchase_orders
with (security_invoker=true)
as
select
  po.id,po.po_number,po.purchase_plan_id,po.supplier_id,v.name as supplier_name,po.order_date,po.expected_date,
  po.currency,po.status,po.notes,po.issued_at,po.created_at,po.updated_at,
  coalesce(sum(pol.ordered_quantity*pol.unit_price),0)::numeric(18,2) as total_amount,
  coalesce(sum(pol.ordered_stock_quantity),0)::numeric(18,4) as ordered_stock_quantity,
  coalesce(sum(pol.received_stock_quantity),0)::numeric(18,4) as received_stock_quantity
from public.purchase_orders po
join public.vendors v on v.id=po.supplier_id
left join public.purchase_order_lines pol on pol.purchase_order_id=po.id and pol.status<>'CANCELLED'
group by po.id,v.name;

create or replace view public.v_purchase_order_open_lines
with (security_invoker=true)
as
select
  pol.id as purchase_order_line_id,po.id as purchase_order_id,po.po_number,po.order_date,po.expected_date,
  po.supplier_id,v.name as supplier_name,pol.material_id,m.material_code,m.name as material_name,
  pol.ordered_quantity,pol.purchase_unit,pol.conversion_factor,pol.ordered_stock_quantity,pol.stock_unit,
  pol.received_stock_quantity,
  greatest(pol.ordered_stock_quantity-pol.received_stock_quantity,0)::numeric(18,4) as outstanding_stock_quantity,
  pol.unit_price,pol.status,m.lot_tracking_mode
from public.purchase_order_lines pol
join public.purchase_orders po on po.id=pol.purchase_order_id
join public.vendors v on v.id=po.supplier_id
join public.materials m on m.id=pol.material_id
where po.status in ('ISSUED','PARTIAL') and pol.status in ('OPEN','PARTIAL');

grant select on public.v_procurement_plan_lines,public.v_purchase_orders,public.v_purchase_order_open_lines to authenticated;

-- ============================================================
-- 9) FIX THE 7-vs-8 PARAMETER FULFILL OVERLOAD
-- Keep the 8-parameter unit-aware signature used by the application and merge
-- the newest HASIL SABLON rules into it. Remove the stale 7-param overload.
-- ============================================================
drop function if exists public.fulfill_material_request_item(bigint,date,numeric,bigint,text,text,text);

create or replace function public.fulfill_material_request_item(
  p_request_item_id bigint,
  p_issue_date date,
  p_quantity numeric,
  p_recipient_worker_id bigint,
  p_recipient_name text,
  p_conversion_factor numeric default null,
  p_wip_source_state text default null,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_i public.material_request_items%rowtype;
  v_r public.material_requests%rowtype;
  v_qty numeric(18,4);
  v_stock_qty numeric(18,4);
  v_remaining numeric(18,4);
  v_name text;
  v_event bigint;
  v_issue text;
  v_src text;
  v_dest text;
  v_all_done boolean;
  v_state text:=upper(btrim(coalesce(p_wip_source_state,'')));
  v_standard_unit text;
  v_factor numeric:=1;
begin
  if not public.has_permission('barang_keluar_gudang.write') or not public.has_permission('permintaan_produksi.fulfill') then
    raise exception 'Tidak memiliki izin pemenuhan Gudang.' using errcode='42501';
  end if;
  if p_issue_date is null or p_quantity is null or p_quantity<=0 then raise exception 'Tanggal dan qty wajib valid.'; end if;

  select * into v_i from public.material_request_items where id=p_request_item_id for update;
  if not found then raise exception 'Detail permintaan tidak ditemukan.'; end if;
  select * into v_r from public.material_requests where id=v_i.request_id for update;
  if v_r.status not in ('MENUNGGU GUDANG','SEBAGIAN') then raise exception 'Permintaan tidak dapat diproses.'; end if;

  v_qty:=round(p_quantity::numeric,4);
  v_remaining:=round((v_i.requested_qty-v_i.fulfilled_qty)::numeric,4);
  if v_qty>v_remaining then raise exception 'Qty melebihi sisa permintaan.'; end if;

  if p_recipient_worker_id is not null then
    select name into v_name from public.workers where id=p_recipient_worker_id and status='AKTIF';
  else v_name:=btrim(coalesce(p_recipient_name,'')); end if;
  if coalesce(v_name,'')='' then raise exception 'Nama pengambil wajib diisi.'; end if;

  v_dest:=case v_r.purpose when 'CUTTING' then 'CUTTING' when 'SABLON' then 'SABLON' else 'SIAP_PRODUKSI' end;
  v_issue:='BK-'||lpad(nextval('public.smpt_issue_code_seq')::text,6,'0');
  v_event:=public.smpt_create_stock_event('WAREHOUSE_ISSUE',p_issue_date,v_r.project_id,v_r.product_id,'PERMINTAAN',v_issue,null,p_notes);

  if v_i.source_type='BAHAN BAKU' then
    select standard_unit into v_standard_unit from public.materials where id=v_i.material_id;
    if v_standard_unit is null then raise exception 'Master Bahan tidak ditemukan.'; end if;
    v_factor:=public.smpt_resolve_conversion_factor(v_i.unit_snapshot,v_standard_unit,p_conversion_factor);
    v_stock_qty:=round((v_qty*v_factor)::numeric,4);
    perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_i.material_id,null,'GUDANG_BAHAN',null,null,null,-v_stock_qty,'BARANG KELUAR GUDANG',p_notes);
    perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_i.material_id,null,v_dest,v_r.project_id,v_r.product_id,v_i.bom_requirement_id,v_stock_qty,'TERIMA DARI GUDANG',p_notes);
    v_src:='GUDANG_BAHAN';
  else
    v_stock_qty:=v_qty;
    v_standard_unit:=v_i.unit_snapshot;
    if v_r.purpose='SABLON' then
      if v_i.source_type<>'HASIL CUTTING' then raise exception 'Hanya Hasil Cutting yang dapat dikirim ke SABLON.'; end if;
      v_src:='GUDANG_HASIL_SABLON';
    elsif v_r.purpose='PRODUKSI' then
      if v_i.source_type='HASIL SABLON' or v_state='HASIL_SABLON' then v_src:='GUDANG_HASIL_SELESAI_SABLON';
      else v_src:='GUDANG_HASIL_BELUM'; end if;
    else raise exception 'WIP tidak boleh dikirim ke CUTTING.'; end if;
    perform public.smpt_apply_stock_delta(v_event,'CUTTING_COMPONENT',null,v_i.cutting_component_id,v_src,v_r.project_id,v_r.product_id,null,-v_stock_qty,'BARANG KELUAR GUDANG',p_notes);
    perform public.smpt_apply_stock_delta(v_event,'CUTTING_COMPONENT',null,v_i.cutting_component_id,v_dest,v_r.project_id,v_r.product_id,null,v_stock_qty,'TERIMA DARI GUDANG',p_notes);
  end if;

  insert into public.warehouse_issues(
    issue_code,issue_date,source,request_id,request_item_id,project_id,product_id,purpose,source_type,
    bom_requirement_id,cutting_component_id,material_id,item_name_snapshot,color_snapshot,quantity,unit_snapshot,
    input_quantity,input_unit,conversion_factor,recipient_worker_id,recipient_name,supervisor_worker_id,notes,stock_event_id
  ) values(
    v_issue,p_issue_date,'PERMINTAAN',v_r.id,v_i.id,v_r.project_id,v_r.product_id,v_r.purpose,v_i.source_type,
    v_i.bom_requirement_id,v_i.cutting_component_id,v_i.material_id,v_i.item_name_snapshot,v_i.color_snapshot,v_stock_qty,v_standard_unit,
    v_qty,public.smpt_unit_key(v_i.unit_snapshot),v_factor,p_recipient_worker_id,v_name,v_r.supervisor_worker_id,
    nullif(btrim(coalesce(p_notes,'')),''),v_event
  );

  update public.material_request_items set
    fulfilled_qty=fulfilled_qty+v_qty,
    status=case when fulfilled_qty+v_qty>=requested_qty then 'DIPENUHI' else 'AKTIF' end,
    updated_at=now()
  where id=v_i.id;

  select not exists(
    select 1 from public.material_request_items
    where request_id=v_r.id and status<>'DIBATALKAN' and fulfilled_qty<requested_qty
  ) into v_all_done;
  update public.material_requests set
    status=case when v_all_done then 'SELESAI' else 'SEBAGIAN' end,
    completed_at=case when v_all_done then now() else null end,
    updated_by=auth.uid(),updated_at=now()
  where id=v_r.id;
  return v_issue;
end;
$$;

revoke all on function public.fulfill_material_request_item(bigint,date,numeric,bigint,text,numeric,text,text) from public;
grant execute on function public.fulfill_material_request_item(bigint,date,numeric,bigint,text,numeric,text,text) to authenticated;

-- ============================================================
-- 10) FAST, AUTHORIZED GUDANG INBOX RPC
-- Avoids loading every request item and every positive stock balance in Next.js.
-- ============================================================
create or replace function public.smpt_gudang_pending_inbox()
returns table(
  request_id bigint,request_code text,request_date date,project_id bigint,project_name text,product_id bigint,product_name text,purpose text,request_status text,
  item_id bigint,source_type text,bom_requirement_id bigint,cutting_component_id bigint,material_id bigint,item_name_snapshot text,color_snapshot text,unit_snapshot text,
  requested_qty numeric,fulfilled_qty numeric,item_status text,available_material numeric,available_cutting numeric,available_sablon numeric
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.has_permission('barang_keluar_gudang.view') then
    raise exception 'Tidak memiliki izin melihat inbox Gudang.' using errcode='42501';
  end if;
  return query
  with balances as (
    select sb.item_kind,sb.material_id,sb.cutting_component_id,sl.code,sb.project_id,sb.product_id,
      sum(sb.quantity)::numeric(18,4) qty
    from public.stock_balances sb
    join public.stock_locations sl on sl.id=sb.location_id
    where sb.quantity>0 and sl.code in ('GUDANG_BAHAN','GUDANG_HASIL_BELUM','GUDANG_HASIL_SABLON','GUDANG_HASIL_SELESAI_SABLON')
    group by sb.item_kind,sb.material_id,sb.cutting_component_id,sl.code,sb.project_id,sb.product_id
  )
  select
    r.id,r.request_code,r.request_date,r.project_id,p.name,r.product_id,pp.name,r.purpose,r.status,
    i.id,i.source_type,i.bom_requirement_id,i.cutting_component_id,i.material_id,i.item_name_snapshot,i.color_snapshot,i.unit_snapshot,
    i.requested_qty,i.fulfilled_qty,i.status,
    coalesce((select sum(b.qty) from balances b where b.item_kind='MATERIAL' and b.material_id=i.material_id and b.code='GUDANG_BAHAN'),0)::numeric,
    coalesce((select sum(b.qty) from balances b where b.item_kind='CUTTING_COMPONENT' and b.cutting_component_id=i.cutting_component_id and b.project_id=r.project_id and b.product_id is not distinct from r.product_id and b.code=case when r.purpose='SABLON' then 'GUDANG_HASIL_SABLON' else 'GUDANG_HASIL_BELUM' end),0)::numeric,
    coalesce((select sum(b.qty) from balances b where b.item_kind='CUTTING_COMPONENT' and b.cutting_component_id=i.cutting_component_id and b.project_id=r.project_id and b.product_id is not distinct from r.product_id and b.code='GUDANG_HASIL_SELESAI_SABLON'),0)::numeric
  from public.material_requests r
  join public.material_request_items i on i.request_id=r.id
  join public.projects p on p.id=r.project_id
  left join public.project_products pp on pp.id=r.product_id
  where r.status in ('MENUNGGU GUDANG','SEBAGIAN')
    and i.status<>'DIBATALKAN'
    and i.fulfilled_qty<i.requested_qty
  order by r.request_date,r.id,i.id;
end;
$$;

create or replace function public.smpt_gudang_pending_count()
returns bigint
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_count bigint;
begin
  if not public.has_permission('barang_keluar_gudang.view') then return 0; end if;
  select count(*) into v_count from public.material_requests r
  where r.status in ('MENUNGGU GUDANG','SEBAGIAN')
    and exists(select 1 from public.material_request_items i where i.request_id=r.id and i.status<>'DIBATALKAN' and i.fulfilled_qty<i.requested_qty);
  return coalesce(v_count,0);
end;
$$;

revoke all on function public.smpt_gudang_pending_inbox() from public;
revoke all on function public.smpt_gudang_pending_count() from public;
grant execute on function public.smpt_gudang_pending_inbox() to authenticated;
grant execute on function public.smpt_gudang_pending_count() to authenticated;

-- Execute grants for procurement RPCs.
revoke all on function public.smpt_create_purchase_plan(bigint,bigint,date,text) from public;
revoke all on function public.smpt_update_purchase_plan_line(bigint,numeric,numeric,bigint,numeric,text) from public;
revoke all on function public.smpt_create_draft_purchase_order(bigint,bigint,date,date,text) from public;
revoke all on function public.smpt_update_draft_purchase_order_line(bigint,numeric,text,numeric,numeric,text) from public;
revoke all on function public.smpt_issue_purchase_order(bigint) from public;
revoke all on function public.smpt_cancel_purchase_order(bigint,text) from public;
revoke all on function public.smpt_receive_purchase_order_line(bigint,date,numeric,text,numeric,text,text,text,text,text) from public;

grant execute on function public.smpt_create_purchase_plan(bigint,bigint,date,text) to authenticated;
grant execute on function public.smpt_update_purchase_plan_line(bigint,numeric,numeric,bigint,numeric,text) to authenticated;
grant execute on function public.smpt_create_draft_purchase_order(bigint,bigint,date,date,text) to authenticated;
grant execute on function public.smpt_update_draft_purchase_order_line(bigint,numeric,text,numeric,numeric,text) to authenticated;
grant execute on function public.smpt_issue_purchase_order(bigint) to authenticated;
grant execute on function public.smpt_cancel_purchase_order(bigint,text) to authenticated;
grant execute on function public.smpt_receive_purchase_order_line(bigint,date,numeric,text,numeric,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
