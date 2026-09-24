-- SMPT V2 - Procurement Phase 1 foundation
-- Extend existing BOM, materials, and vendors. No duplicate inventory/vendor architecture.

-- ============================================================
-- 1) MATERIAL CALCULATION TYPE
-- ============================================================
alter table public.materials
  add column if not exists calculation_type text;

update public.materials
set calculation_type = case
  when upper(btrim(standard_unit)) in ('PCS','PC','BUAH','UNIT','SET','PASANG') then 'PCS'
  when lower(coalesce(category,'')) like '%kain%' or upper(btrim(standard_unit)) = 'LEMBAR' then 'SHEET'
  else 'LENGTH'
end
where calculation_type is null or btrim(calculation_type) = '';

alter table public.materials alter column calculation_type set default 'LENGTH';
alter table public.materials alter column calculation_type set not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='materials_calculation_type_check') then
    alter table public.materials add constraint materials_calculation_type_check
      check (calculation_type in ('SHEET','LENGTH','PCS','ROLL_LENGTH'));
  end if;
end $$;

-- ============================================================
-- 2) SUPPLIER = EXISTING VENDORS TABLE (EXTEND ONLY)
-- ============================================================
alter table public.vendors
  add column if not exists whatsapp text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists payment_terms text,
  add column if not exists default_currency text not null default 'IDR',
  add column if not exists lead_time_days integer,
  add column if not exists rating numeric(5,2),
  add column if not exists internal_notes text;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='vendors_lead_time_nonnegative') then
    alter table public.vendors add constraint vendors_lead_time_nonnegative check(lead_time_days is null or lead_time_days>=0);
  end if;
  if not exists(select 1 from pg_constraint where conname='vendors_rating_nonnegative') then
    alter table public.vendors add constraint vendors_rating_nonnegative check(rating is null or rating>=0);
  end if;
end $$;

-- ============================================================
-- 3) MATERIAL <-> SUPPLIER MANY TO MANY
-- ============================================================
create table if not exists public.material_suppliers (
  id bigint generated always as identity primary key,
  material_id bigint not null references public.materials(id) on update restrict on delete restrict,
  supplier_id bigint not null references public.vendors(id) on update restrict on delete restrict,
  supplier_material_code text,
  supplier_material_name text,
  supplier_unit text,
  conversion_factor numeric(20,10) not null default 1 check(conversion_factor>0),
  last_price numeric(18,2) check(last_price is null or last_price>=0),
  preferred boolean not null default false,
  moq numeric(18,4) check(moq is null or moq>=0),
  estimated_lead_time_days integer check(estimated_lead_time_days is null or estimated_lead_time_days>=0),
  default_purchase_unit text,
  notes text,
  status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(material_id,supplier_id)
);

create index if not exists material_suppliers_supplier_idx on public.material_suppliers(supplier_id,status,preferred desc);
create index if not exists material_suppliers_material_idx on public.material_suppliers(material_id,status,preferred desc);
create unique index if not exists material_suppliers_one_preferred_uq
  on public.material_suppliers(material_id) where preferred=true and status='AKTIF';

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='material_suppliers_set_updated_at') then
    create trigger material_suppliers_set_updated_at before update on public.material_suppliers
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.material_suppliers enable row level security;
drop policy if exists material_suppliers_select on public.material_suppliers;
create policy material_suppliers_select on public.material_suppliers for select to authenticated
  using(public.has_permission('master_vendor.view') or public.has_permission('master_bahan.view') or public.has_permission('master_kebutuhan.view'));
drop policy if exists material_suppliers_write on public.material_suppliers;
create policy material_suppliers_write on public.material_suppliers for all to authenticated
  using(public.has_permission('master_vendor.write') or public.has_permission('master_bahan.write'))
  with check(public.has_permission('master_vendor.write') or public.has_permission('master_bahan.write'));

grant select,insert,update,delete on public.material_suppliers to authenticated;
grant usage,select on sequence public.material_suppliers_id_seq to authenticated;

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
  if not (public.has_permission('master_vendor.write') or public.has_permission('master_bahan.write')) then
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

revoke all on function public.save_material_supplier(bigint,bigint,text,text,text,numeric,numeric,boolean,numeric,integer,text,text,text) from public;
grant execute on function public.save_material_supplier(bigint,bigint,text,text,text,numeric,numeric,boolean,numeric,integer,text,text,text) to authenticated;

-- ============================================================
-- 4) BOM SOURCE + CALCULATION AUDIT METADATA
-- ============================================================
alter table public.bom_requirements
  add column if not exists fulfillment_source text,
  add column if not exists calculation_method text,
  add column if not exists net_usage_per_product numeric(18,6),
  add column if not exists net_requirement numeric(18,4),
  add column if not exists allowance_percent numeric(9,4),
  add column if not exists allowance_qty numeric(18,4),
  add column if not exists waste_percent numeric(9,4),
  add column if not exists waste_qty numeric(18,4),
  add column if not exists final_requirement numeric(18,4),
  add column if not exists calculation_input_snapshot jsonb,
  add column if not exists calculated_at timestamptz,
  add column if not exists calculated_by uuid references auth.users(id) on delete set null;

update public.bom_requirements b
set fulfillment_source = case when b.component_type='BAHAN' then 'COMPANY_PURCHASE' else null end,
    calculation_method = 'MANUAL',
    net_usage_per_product = b.qty_per_unit,
    net_requirement = case when b.product_id is null then b.legacy_total_requirement else pp.target_production*b.qty_per_unit end,
    allowance_percent = 0,
    allowance_qty = 0,
    waste_percent = 0,
    waste_qty = 0,
    final_requirement = case when b.product_id is null then b.legacy_total_requirement else pp.target_production*b.qty_per_unit end
from public.project_products pp
where b.product_id=pp.id
  and (b.calculation_method is null or b.net_usage_per_product is null or b.final_requirement is null);

update public.bom_requirements
set fulfillment_source = case when component_type='BAHAN' then coalesce(fulfillment_source,'COMPANY_PURCHASE') else null end,
    calculation_method = coalesce(calculation_method,'MANUAL'),
    allowance_percent = coalesce(allowance_percent,0),
    allowance_qty = coalesce(allowance_qty,0),
    waste_percent = coalesce(waste_percent,0),
    waste_qty = coalesce(waste_qty,0)
where true;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='bom_fulfillment_source_check') then
    alter table public.bom_requirements add constraint bom_fulfillment_source_check check(
      fulfillment_source is null or fulfillment_source in ('COMPANY_PURCHASE','CUSTOMER_SUPPLIED','VENDOR_SUPPLIED','INTERNAL_STOCK','OTHER')
    );
  end if;
  if not exists(select 1 from pg_constraint where conname='bom_calculation_method_check') then
    alter table public.bom_requirements add constraint bom_calculation_method_check check(
      calculation_method is null or calculation_method in ('MANUAL','SAMPLE','CONSUMPTION','MARKER')
    );
  end if;
  if not exists(select 1 from pg_constraint where conname='bom_calc_nonnegative_check') then
    alter table public.bom_requirements add constraint bom_calc_nonnegative_check check(
      (net_usage_per_product is null or net_usage_per_product>=0) and
      (net_requirement is null or net_requirement>=0) and
      (allowance_percent is null or allowance_percent>=0) and
      (allowance_qty is null or allowance_qty>=0) and
      (waste_percent is null or waste_percent>=0) and
      (waste_qty is null or waste_qty>=0) and
      (final_requirement is null or final_requirement>=0)
    );
  end if;
end $$;

create index if not exists bom_fulfillment_source_idx on public.bom_requirements(fulfillment_source,status,project_id,product_id)
  where component_type='BAHAN';

-- ============================================================
-- 5) MATERIAL REFERENCE V2 - keeps old RPC untouched
-- ============================================================
create or replace function public.master_reference_materials_v2(
  p_include_inactive boolean default true
)
returns table (
  id bigint,
  material_code text,
  name text,
  standard_unit text,
  category text,
  status text,
  calculation_type text
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (
    public.has_permission('master_bahan.view')
    or public.has_permission('master_kebutuhan.view')
  ) then
    raise exception 'Tidak memiliki akses referensi bahan.' using errcode='42501';
  end if;

  return query
  select m.id,m.material_code,m.name,m.standard_unit,m.category,m.status,m.calculation_type
  from public.materials m
  where (p_include_inactive or m.status='AKTIF')
  order by lower(m.name),m.material_code;
end;
$$;

revoke all on function public.master_reference_materials_v2(boolean) from public;
grant execute on function public.master_reference_materials_v2(boolean) to authenticated;

-- ============================================================
-- 6) ATOMIC BOM SAVE V2
-- Client preview stays client-side; server re-derives allowance/waste/final.
-- ============================================================
create or replace function public.save_bom_requirement_v2(
  p_requirement_id bigint,
  p_project_id bigint,
  p_product_id bigint,
  p_material_id bigint,
  p_component_type text,
  p_component_name text,
  p_unit text,
  p_qty_per_unit numeric,
  p_unit_price numeric,
  p_status text,
  p_fulfillment_source text,
  p_calculation_method text,
  p_net_usage_per_product numeric,
  p_allowance_percent numeric,
  p_waste_percent numeric,
  p_final_requirement numeric,
  p_calculation_input_snapshot jsonb
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id bigint;
  v_type text:=upper(btrim(coalesce(p_component_type,'BAHAN')));
  v_status text:=upper(btrim(coalesce(p_status,'AKTIF')));
  v_source text:=upper(btrim(coalesce(p_fulfillment_source,'COMPANY_PURCHASE')));
  v_method text:=upper(btrim(coalesce(p_calculation_method,'MANUAL')));
  v_name text:=regexp_replace(btrim(coalesce(p_component_name,'')),'\s+',' ','g');
  v_unit text:=regexp_replace(btrim(coalesce(p_unit,'')),'\s+',' ','g');
  v_material_id bigint:=p_material_id;
  v_target numeric;
  v_calc_type text;
  v_qty_per_unit numeric:=coalesce(p_qty_per_unit,0);
  v_net_usage numeric;
  v_net_requirement numeric;
  v_allowance_percent numeric:=coalesce(p_allowance_percent,0);
  v_allowance_qty numeric;
  v_waste_percent numeric:=coalesce(p_waste_percent,0);
  v_waste_qty numeric;
  v_final numeric;
  v_existing public.bom_requirements%rowtype;
  v_preserve boolean:=false;
begin
  if auth.uid() is null then raise exception 'Sesi login tidak ditemukan.' using errcode='42501'; end if;
  if not public.has_permission('master_kebutuhan.write') then raise exception 'Tidak memiliki izin mengubah Master Kebutuhan.' using errcode='42501'; end if;
  if p_project_id is null or p_product_id is null then raise exception 'Proyek dan Produk/Tas wajib dipilih.'; end if;

  select pp.target_production into v_target from public.project_products pp
  where pp.id=p_product_id and pp.project_id=p_project_id;
  if v_target is null then raise exception 'Produk/Tas tidak ditemukan pada proyek yang dipilih.'; end if;

  if v_type not in ('BAHAN','JASA','BIAYA') then raise exception 'Jenis komponen tidak valid.'; end if;
  if v_status not in ('AKTIF','NONAKTIF') then raise exception 'Status kebutuhan tidak valid.'; end if;
  if v_method not in ('MANUAL','SAMPLE','CONSUMPTION','MARKER') then raise exception 'Metode kalkulasi tidak valid.'; end if;
  if v_allowance_percent<0 or v_waste_percent<0 then raise exception 'Allowance/Waste tidak boleh negatif.'; end if;
  if p_unit_price is null or p_unit_price<0 then raise exception 'Harga satuan tidak boleh negatif.'; end if;
  if p_qty_per_unit is null or p_qty_per_unit<0 then raise exception 'Kebutuhan per unit tidak boleh negatif.'; end if;

  if p_requirement_id is not null then
    select * into v_existing from public.bom_requirements where id=p_requirement_id;
    if not found then raise exception 'Data kebutuhan yang akan diedit tidak ditemukan.'; end if;
    if p_calculation_input_snapshot is null
       and coalesce(v_existing.calculation_method,'MANUAL')<>'MANUAL'
       and abs(coalesce(p_qty_per_unit,0)-coalesce(v_existing.qty_per_unit,0))<0.0000005 then
      v_preserve:=true;
    elsif p_calculation_input_snapshot is null and abs(coalesce(p_qty_per_unit,0)-coalesce(v_existing.qty_per_unit,0))>=0.0000005 then
      v_method:='MANUAL';
    end if;
  end if;

  if v_type='BAHAN' then
    if v_material_id is null then raise exception 'Komponen BAHAN wajib dipilih dari Master Bahan.'; end if;
    select m.name,m.standard_unit,m.calculation_type into v_name,v_unit,v_calc_type
    from public.materials m where m.id=v_material_id;
    if not found then raise exception 'Master Bahan tidak ditemukan.'; end if;
    if v_source not in ('COMPANY_PURCHASE','CUSTOMER_SUPPLIED','VENDOR_SUPPLIED','INTERNAL_STOCK','OTHER') then
      raise exception 'Sumber pemenuhan tidak valid.';
    end if;
  else
    v_material_id:=null;
    v_source:=null;
    v_method:='MANUAL';
    v_calc_type:=null;
    if v_name='' then raise exception 'Nama komponen wajib diisi.'; end if;
    if v_unit='' then raise exception 'Satuan wajib diisi.'; end if;
  end if;

  if v_preserve then
    v_method:=coalesce(v_existing.calculation_method,'MANUAL');
    v_net_usage:=v_existing.net_usage_per_product;
    v_net_requirement:=v_existing.net_requirement;
    v_allowance_percent:=coalesce(v_existing.allowance_percent,0);
    v_allowance_qty:=coalesce(v_existing.allowance_qty,0);
    v_waste_percent:=coalesce(v_existing.waste_percent,0);
    v_waste_qty:=coalesce(v_existing.waste_qty,0);
    v_final:=v_existing.final_requirement;
    v_qty_per_unit:=p_qty_per_unit;
  elsif v_type='BAHAN' and v_method<>'MANUAL' then
    if p_net_usage_per_product is null or p_net_usage_per_product<0 then raise exception 'Net usage kalkulator tidak valid.'; end if;
    v_net_usage:=p_net_usage_per_product;
    v_net_requirement:=round(v_target*v_net_usage,4);
    v_allowance_qty:=round(v_net_requirement*v_allowance_percent/100,4);
    v_waste_qty:=round(v_net_requirement*v_waste_percent/100,4);
    v_final:=v_net_requirement+v_allowance_qty+v_waste_qty;
    if v_calc_type='PCS' then v_final:=ceil(v_final); else v_final:=round(v_final,4); end if;
    if p_final_requirement is not null and abs(p_final_requirement-v_final)>0.02 then
      raise exception 'Preview kalkulator berubah. Hitung ulang sebelum menyimpan. Expected %, client %.',v_final,p_final_requirement;
    end if;
    v_qty_per_unit:=case when v_target>0 then round(v_final/v_target,6) else 0 end;
  else
    v_net_usage:=v_qty_per_unit;
    v_net_requirement:=round(v_target*v_qty_per_unit,4);
    v_allowance_percent:=0; v_allowance_qty:=0; v_waste_percent:=0; v_waste_qty:=0;
    v_final:=v_net_requirement;
  end if;

  if p_requirement_id is null then
    insert into public.bom_requirements(
      project_id,product_id,material_id,component_type,component_name,unit,qty_per_unit,unit_price,status,legacy_project_level,
      fulfillment_source,calculation_method,net_usage_per_product,net_requirement,allowance_percent,allowance_qty,waste_percent,waste_qty,final_requirement,
      calculation_input_snapshot,calculated_at,calculated_by,created_by,updated_by
    ) values(
      p_project_id,p_product_id,v_material_id,v_type,v_name,v_unit,v_qty_per_unit,p_unit_price,v_status,false,
      v_source,v_method,v_net_usage,v_net_requirement,v_allowance_percent,v_allowance_qty,v_waste_percent,v_waste_qty,v_final,
      case when v_method='MANUAL' then null else p_calculation_input_snapshot end,
      case when v_method='MANUAL' then null else now() end,
      case when v_method='MANUAL' then null else auth.uid() end,
      auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    update public.bom_requirements set
      project_id=p_project_id,product_id=p_product_id,material_id=v_material_id,component_type=v_type,component_name=v_name,unit=v_unit,
      qty_per_unit=v_qty_per_unit,unit_price=p_unit_price,status=v_status,legacy_project_level=false,fulfillment_source=v_source,
      calculation_method=v_method,net_usage_per_product=v_net_usage,net_requirement=v_net_requirement,allowance_percent=v_allowance_percent,
      allowance_qty=v_allowance_qty,waste_percent=v_waste_percent,waste_qty=v_waste_qty,final_requirement=v_final,
      calculation_input_snapshot=case when v_preserve then v_existing.calculation_input_snapshot when v_method='MANUAL' then null else p_calculation_input_snapshot end,
      calculated_at=case when v_preserve then v_existing.calculated_at when v_method='MANUAL' then null else now() end,
      calculated_by=case when v_preserve then v_existing.calculated_by when v_method='MANUAL' then null else auth.uid() end,
      updated_by=auth.uid()
    where id=p_requirement_id returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_bom_requirement_v2(bigint,bigint,bigint,bigint,text,text,text,numeric,numeric,text,text,text,numeric,numeric,numeric,numeric,jsonb) from public;
grant execute on function public.save_bom_requirement_v2(bigint,bigint,bigint,bigint,text,text,text,numeric,numeric,text,text,text,numeric,numeric,numeric,numeric,jsonb) to authenticated;
