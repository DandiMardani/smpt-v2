-- SMPT V2 BATCH 2 - Gudang, Permintaan, Cutting, Sablon, Siap Produksi
-- Source of truth: SMPT(4).zip final V1

insert into public.permissions(code, description)
values ('master_pekerja.write','Tambah dan ubah Master Pekerja.')
on conflict (code) do update set description = excluded.description;

create sequence if not exists public.smpt_worker_code_seq start with 1;
create sequence if not exists public.smpt_cut_component_code_seq start with 1;
create sequence if not exists public.smpt_receipt_code_seq start with 1;
create sequence if not exists public.smpt_request_code_seq start with 1;
create sequence if not exists public.smpt_request_item_code_seq start with 1;
create sequence if not exists public.smpt_issue_code_seq start with 1;
create sequence if not exists public.smpt_cut_usage_code_seq start with 1;
create sequence if not exists public.smpt_cut_result_code_seq start with 1;
create sequence if not exists public.smpt_ready_usage_code_seq start with 1;
create sequence if not exists public.smpt_stock_event_code_seq start with 1;

create table public.workers (
  id bigint generated always as identity primary key,
  worker_code text not null unique default ('PKR-'||lpad(nextval('public.smpt_worker_code_seq')::text,6,'0')),
  finger_id text,
  name text not null,
  identity_no text,
  department text,
  position text,
  pay_system text,
  daily_wage numeric(18,2) not null default 0 check (daily_wage>=0),
  monthly_salary numeric(18,2) not null default 0 check (monthly_salary>=0),
  phone text,
  address text,
  entry_date date,
  exit_date date,
  bank_name text,
  bank_account_no text,
  bank_account_name text,
  status text not null default 'AKTIF' check (status in ('AKTIF','NONAKTIF')),
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(name)<>''),
  check (entry_date is null or exit_date is null or exit_date>=entry_date)
);
create index workers_name_idx on public.workers(lower(name));
create index workers_active_department_idx on public.workers(status,department,position);
create trigger workers_set_updated_at before update on public.workers for each row execute function public.set_updated_at();

create table public.cutting_components (
  id bigint generated always as identity primary key,
  component_code text not null unique default ('CKM-'||lpad(nextval('public.smpt_cut_component_code_seq')::text,6,'0')),
  project_id bigint not null references public.projects(id) on update restrict on delete restrict,
  product_id bigint,
  name text not null,
  qty_per_product numeric(18,4) not null check (qty_per_product>0),
  unit text not null,
  color text not null default '',
  notes text,
  status text not null default 'AKTIF' check (status in ('AKTIF','NONAKTIF')),
  legacy_project_level boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict,
  check (btrim(name)<>''),
  check (btrim(unit)<>'')
);
create unique index cutting_components_scope_name_uq on public.cutting_components(project_id,coalesce(product_id,0),lower(btrim(name)),lower(btrim(color)));
create index cutting_components_scope_idx on public.cutting_components(project_id,product_id,status);
create trigger cutting_components_set_updated_at before update on public.cutting_components for each row execute function public.set_updated_at();

create table public.stock_locations (
  id smallint generated always as identity primary key,
  code text not null unique,
  name text not null,
  physical_group text not null,
  is_active boolean not null default true
);
insert into public.stock_locations(code,name,physical_group) values
('GUDANG_BAHAN','Gudang Bahan','GUDANG_BAHAN'),
('CUTTING','Area Cutting','CUTTING'),
('GUDANG_HASIL_BELUM','Gudang Hasil - Belum Ditentukan','GUDANG_HASIL'),
('GUDANG_HASIL_SABLON','Gudang Hasil - Untuk Sablon','GUDANG_HASIL'),
('GUDANG_HASIL_SELESAI_SABLON','Gudang Hasil - Hasil Sablon','GUDANG_HASIL'),
('SABLON','Area Sablon','SABLON'),
('SIAP_PRODUKSI','Area Siap Produksi','SIAP_PRODUKSI')
on conflict(code) do update set name=excluded.name, physical_group=excluded.physical_group, is_active=true;

create table public.stock_events (
  id bigint generated always as identity primary key,
  event_code text not null unique default ('STX-'||lpad(nextval('public.smpt_stock_event_code_seq')::text,9,'0')),
  event_type text not null,
  event_date date not null,
  project_id bigint references public.projects(id) on delete restrict,
  product_id bigint,
  reference_type text,
  reference_code text,
  reversal_of_event_id bigint references public.stock_events(id) on delete restrict,
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict
);
create index stock_events_date_idx on public.stock_events(event_date desc,id desc);
create index stock_events_reference_idx on public.stock_events(reference_type,reference_code);

create table public.stock_balances (
  id bigint generated always as identity primary key,
  item_kind text not null check (item_kind in ('MATERIAL','CUTTING_COMPONENT')),
  material_id bigint references public.materials(id) on delete restrict,
  cutting_component_id bigint references public.cutting_components(id) on delete restrict,
  location_id smallint not null references public.stock_locations(id) on delete restrict,
  project_id bigint references public.projects(id) on delete restrict,
  product_id bigint,
  bom_requirement_id bigint references public.bom_requirements(id) on delete restrict,
  quantity numeric(18,4) not null default 0 check (quantity>=0),
  updated_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict,
  check ((item_kind='MATERIAL' and material_id is not null and cutting_component_id is null)
      or (item_kind='CUTTING_COMPONENT' and cutting_component_id is not null and material_id is null and bom_requirement_id is null))
);
create unique index stock_balances_dimension_uq on public.stock_balances(item_kind,coalesce(material_id,0),coalesce(cutting_component_id,0),location_id,coalesce(project_id,0),coalesce(product_id,0),coalesce(bom_requirement_id,0));
create index stock_balances_location_idx on public.stock_balances(location_id,item_kind);
create index stock_balances_project_idx on public.stock_balances(project_id,product_id,location_id);

create table public.stock_ledger_entries (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.stock_events(id) on delete restrict,
  item_kind text not null check (item_kind in ('MATERIAL','CUTTING_COMPONENT')),
  material_id bigint references public.materials(id) on delete restrict,
  cutting_component_id bigint references public.cutting_components(id) on delete restrict,
  location_id smallint not null references public.stock_locations(id) on delete restrict,
  project_id bigint references public.projects(id) on delete restrict,
  product_id bigint,
  bom_requirement_id bigint references public.bom_requirements(id) on delete restrict,
  movement_kind text not null,
  quantity_delta numeric(18,4) not null check (quantity_delta<>0),
  unit_snapshot text not null,
  notes text,
  created_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict,
  check ((item_kind='MATERIAL' and material_id is not null and cutting_component_id is null)
      or (item_kind='CUTTING_COMPONENT' and cutting_component_id is not null and material_id is null and bom_requirement_id is null))
);
create index stock_ledger_event_idx on public.stock_ledger_entries(event_id);
create index stock_ledger_item_idx on public.stock_ledger_entries(location_id,item_kind,created_at desc);
create index stock_ledger_project_idx on public.stock_ledger_entries(project_id,product_id,created_at desc);

create or replace function public.smpt_reject_stock_history_mutation() returns trigger
language plpgsql set search_path='' as $$ begin raise exception 'Histori stock ledger immutable. Gunakan reversal/adjustment.'; end; $$;
create trigger stock_events_immutable before update or delete on public.stock_events for each row execute function public.smpt_reject_stock_history_mutation();
create trigger stock_ledger_immutable before update or delete on public.stock_ledger_entries for each row execute function public.smpt_reject_stock_history_mutation();

create table public.warehouse_receipts (
  id bigint generated always as identity primary key,
  receipt_code text not null unique,
  receipt_date date not null,
  material_id bigint not null references public.materials(id) on delete restrict,
  quantity numeric(18,4) not null check (quantity>0),
  unit_snapshot text not null,
  supplier text,
  document_no text,
  notes text,
  status text not null default 'AKTIF' check (status in ('AKTIF','DIBATALKAN')),
  base_event_id bigint not null references public.stock_events(id) on delete restrict,
  cancellation_event_id bigint references public.stock_events(id) on delete restrict,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index warehouse_receipts_date_idx on public.warehouse_receipts(receipt_date desc,id desc);
create trigger warehouse_receipts_set_updated_at before update on public.warehouse_receipts for each row execute function public.set_updated_at();

create table public.material_requests (
  id bigint generated always as identity primary key,
  request_code text not null unique,
  request_date date not null,
  project_id bigint not null references public.projects(id) on delete restrict,
  product_id bigint,
  supervisor_worker_id bigint not null references public.workers(id) on delete restrict,
  purpose text not null check (purpose in ('CUTTING','SABLON','PRODUKSI')),
  status text not null default 'DRAFT' check (status in ('DRAFT','MENUNGGU GUDANG','SEBAGIAN','SELESAI','DIBATALKAN')),
  notes text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict
);
create index material_requests_status_idx on public.material_requests(status,request_date desc,id desc);
create trigger material_requests_set_updated_at before update on public.material_requests for each row execute function public.set_updated_at();

create table public.material_request_items (
  id bigint generated always as identity primary key,
  detail_code text not null unique,
  request_id bigint not null references public.material_requests(id) on delete restrict,
  source_type text not null check (source_type in ('BAHAN BAKU','HASIL CUTTING')),
  bom_requirement_id bigint references public.bom_requirements(id) on delete restrict,
  cutting_component_id bigint references public.cutting_components(id) on delete restrict,
  material_id bigint references public.materials(id) on delete restrict,
  item_name_snapshot text not null,
  color_snapshot text not null default '',
  unit_snapshot text not null,
  requested_qty numeric(18,4) not null check (requested_qty>0),
  fulfilled_qty numeric(18,4) not null default 0 check (fulfilled_qty>=0 and fulfilled_qty<=requested_qty),
  status text not null default 'AKTIF' check (status in ('AKTIF','DIPENUHI','DIBATALKAN')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source_type='BAHAN BAKU' and bom_requirement_id is not null and material_id is not null and cutting_component_id is null)
      or (source_type='HASIL CUTTING' and cutting_component_id is not null and bom_requirement_id is null and material_id is null))
);
create index material_request_items_request_idx on public.material_request_items(request_id,status);
create trigger material_request_items_set_updated_at before update on public.material_request_items for each row execute function public.set_updated_at();

create table public.warehouse_issues (
  id bigint generated always as identity primary key,
  issue_code text not null unique,
  issue_date date not null,
  source text not null check (source in ('PERMINTAAN','LANGSUNG')),
  request_id bigint references public.material_requests(id) on delete restrict,
  request_item_id bigint references public.material_request_items(id) on delete restrict,
  project_id bigint not null references public.projects(id) on delete restrict,
  product_id bigint,
  purpose text not null check (purpose in ('CUTTING','SABLON','PRODUKSI')),
  source_type text not null check (source_type in ('BAHAN BAKU','HASIL CUTTING')),
  bom_requirement_id bigint references public.bom_requirements(id) on delete restrict,
  cutting_component_id bigint references public.cutting_components(id) on delete restrict,
  material_id bigint references public.materials(id) on delete restrict,
  item_name_snapshot text not null,
  color_snapshot text not null default '',
  quantity numeric(18,4) not null check (quantity>0),
  unit_snapshot text not null,
  recipient_worker_id bigint references public.workers(id) on delete restrict,
  recipient_name text not null,
  supervisor_worker_id bigint references public.workers(id) on delete restrict,
  notes text,
  stock_event_id bigint not null references public.stock_events(id) on delete restrict,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict
);
create index warehouse_issues_date_idx on public.warehouse_issues(issue_date desc,id desc);

create table public.cutting_material_usages (
  id bigint generated always as identity primary key,
  usage_code text not null unique,
  usage_date date not null,
  project_id bigint not null references public.projects(id) on delete restrict,
  product_id bigint,
  bom_requirement_id bigint not null references public.bom_requirements(id) on delete restrict,
  material_id bigint not null references public.materials(id) on delete restrict,
  quantity numeric(18,4) not null check(quantity>0),
  unit_snapshot text not null,
  officer text not null,
  notes text,
  status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')),
  stock_event_id bigint not null references public.stock_events(id) on delete restrict,
  cancellation_event_id bigint references public.stock_events(id) on delete restrict,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict
);
create index cutting_usage_date_idx on public.cutting_material_usages(project_id,usage_date desc,id desc);

create table public.cutting_daily_results (
  id bigint generated always as identity primary key,
  result_code text not null unique,
  result_date date not null,
  project_id bigint not null references public.projects(id) on delete restrict,
  product_id bigint,
  cutting_component_id bigint not null references public.cutting_components(id) on delete restrict,
  good_qty numeric(18,4) not null default 0 check(good_qty>=0),
  reject_qty numeric(18,4) not null default 0 check(reject_qty>=0),
  unit_snapshot text not null,
  officer text not null,
  notes text,
  status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')),
  stock_event_id bigint references public.stock_events(id) on delete restrict,
  cancellation_event_id bigint references public.stock_events(id) on delete restrict,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict,
  check(good_qty>0 or reject_qty>0)
);
create index cutting_result_date_idx on public.cutting_daily_results(project_id,product_id,result_date desc,id desc);

create table public.ready_production_usages (
  id bigint generated always as identity primary key,
  usage_code text not null unique,
  usage_date date not null,
  project_id bigint not null references public.projects(id) on delete restrict,
  product_id bigint,
  item_kind text not null check(item_kind in ('MATERIAL','CUTTING_COMPONENT')),
  bom_requirement_id bigint references public.bom_requirements(id) on delete restrict,
  material_id bigint references public.materials(id) on delete restrict,
  cutting_component_id bigint references public.cutting_components(id) on delete restrict,
  quantity numeric(18,4) not null check(quantity>0),
  unit_snapshot text not null,
  officer text not null,
  notes text,
  stock_event_id bigint not null references public.stock_events(id) on delete restrict,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict,
  check ((item_kind='MATERIAL' and material_id is not null and bom_requirement_id is not null and cutting_component_id is null)
      or (item_kind='CUTTING_COMPONENT' and cutting_component_id is not null and material_id is null and bom_requirement_id is null))
);
create index ready_usage_date_idx on public.ready_production_usages(project_id,product_id,usage_date desc,id desc);

-- Internal stock helpers.
create or replace function public.smpt_create_stock_event(p_type text,p_date date,p_project_id bigint,p_product_id bigint,p_reference_type text,p_reference_code text,p_reversal bigint,p_notes text)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_id bigint;
begin
  insert into public.stock_events(event_type,event_date,project_id,product_id,reference_type,reference_code,reversal_of_event_id,notes)
  values(upper(btrim(p_type)),p_date,p_project_id,p_product_id,nullif(btrim(coalesce(p_reference_type,'')),''),nullif(btrim(coalesce(p_reference_code,'')),''),p_reversal,nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.smpt_apply_stock_delta(p_event_id bigint,p_item_kind text,p_material_id bigint,p_component_id bigint,p_location_code text,p_project_id bigint,p_product_id bigint,p_bom_id bigint,p_delta numeric,p_movement_kind text,p_notes text)
returns void language plpgsql security definer set search_path='' as $$
declare v_loc smallint; v_unit text; v_balance_id bigint; v_current numeric(18,4); v_new numeric(18,4); v_kind text:=upper(btrim(p_item_kind));
begin
  if p_event_id is null or p_delta is null or p_delta=0 then raise exception 'Delta stok tidak valid.'; end if;
  select id into v_loc from public.stock_locations where code=upper(btrim(p_location_code)) and is_active=true;
  if v_loc is null then raise exception 'Lokasi stok tidak ditemukan: %',p_location_code; end if;
  if v_kind='MATERIAL' then
    select standard_unit into v_unit from public.materials where id=p_material_id;
    if v_unit is null then raise exception 'Material tidak ditemukan.'; end if;
  elsif v_kind='CUTTING_COMPONENT' then
    select unit into v_unit from public.cutting_components where id=p_component_id;
    if v_unit is null then raise exception 'Komponen Cutting tidak ditemukan.'; end if;
  else raise exception 'Jenis item stok tidak valid.'; end if;

  insert into public.stock_balances(item_kind,material_id,cutting_component_id,location_id,project_id,product_id,bom_requirement_id,quantity)
  values(v_kind,p_material_id,p_component_id,v_loc,p_project_id,p_product_id,p_bom_id,0) on conflict do nothing;

  select id,quantity into v_balance_id,v_current from public.stock_balances
  where item_kind=v_kind and material_id is not distinct from p_material_id and cutting_component_id is not distinct from p_component_id
    and location_id=v_loc and project_id is not distinct from p_project_id and product_id is not distinct from p_product_id
    and bom_requirement_id is not distinct from p_bom_id for update;
  if v_balance_id is null then raise exception 'Saldo stok gagal ditemukan.'; end if;
  v_new:=round((v_current+p_delta)::numeric,4);
  if v_new<0 then raise exception 'Stok tidak mencukupi. Tersedia % %, diminta % %.',v_current,v_unit,abs(p_delta),v_unit; end if;
  update public.stock_balances set quantity=v_new,updated_at=now() where id=v_balance_id;
  insert into public.stock_ledger_entries(event_id,item_kind,material_id,cutting_component_id,location_id,project_id,product_id,bom_requirement_id,movement_kind,quantity_delta,unit_snapshot,notes)
  values(p_event_id,v_kind,p_material_id,p_component_id,v_loc,p_project_id,p_product_id,p_bom_id,upper(btrim(p_movement_kind)),round(p_delta::numeric,4),v_unit,nullif(btrim(coalesce(p_notes,'')),''));
end; $$;

create or replace function public.create_warehouse_receipt(p_receipt_date date,p_material_id bigint,p_quantity numeric,p_supplier text default null,p_document_no text default null,p_notes text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v_code text; v_unit text; v_event bigint;
begin
  if not public.has_permission('barang_masuk_gudang.write') then raise exception 'Tidak memiliki izin Barang Masuk Gudang.' using errcode='42501'; end if;
  if p_receipt_date is null or p_quantity is null or p_quantity<=0 then raise exception 'Tanggal dan qty wajib valid.'; end if;
  select standard_unit into v_unit from public.materials where id=p_material_id and status='AKTIF'; if v_unit is null then raise exception 'Master Bahan tidak ditemukan/aktif.'; end if;
  v_code:='BMG-'||lpad(nextval('public.smpt_receipt_code_seq')::text,6,'0');
  v_event:=public.smpt_create_stock_event('WAREHOUSE_RECEIPT',p_receipt_date,null,null,'BARANG_MASUK_GUDANG',v_code,null,p_notes);
  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',p_material_id,null,'GUDANG_BAHAN',null,null,null,p_quantity,'BARANG MASUK GUDANG',p_notes);
  insert into public.warehouse_receipts(receipt_code,receipt_date,material_id,quantity,unit_snapshot,supplier,document_no,notes,base_event_id)
  values(v_code,p_receipt_date,p_material_id,round(p_quantity::numeric,4),v_unit,nullif(btrim(coalesce(p_supplier,'')),''),nullif(btrim(coalesce(p_document_no,'')),''),nullif(btrim(coalesce(p_notes,'')),''),v_event);
  return v_code;
end; $$;

create or replace function public.update_warehouse_receipt(p_receipt_id bigint,p_receipt_date date,p_quantity numeric,p_supplier text default null,p_document_no text default null,p_notes text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_r public.warehouse_receipts%rowtype; v_delta numeric(18,4); v_event bigint;
begin
  if not public.has_permission('barang_masuk_gudang.write') then raise exception 'Tidak memiliki izin Barang Masuk Gudang.' using errcode='42501'; end if;
  select * into v_r from public.warehouse_receipts where id=p_receipt_id for update; if not found then raise exception 'Barang Masuk tidak ditemukan.'; end if;
  if v_r.status<>'AKTIF' then raise exception 'Transaksi sudah dibatalkan.'; end if;
  if p_receipt_date is null or p_quantity is null or p_quantity<=0 then raise exception 'Tanggal dan qty wajib valid.'; end if;
  v_delta:=round((p_quantity-v_r.quantity)::numeric,4);
  if v_delta<>0 then
    v_event:=public.smpt_create_stock_event('WAREHOUSE_RECEIPT_ADJUSTMENT',p_receipt_date,null,null,'BARANG_MASUK_GUDANG',v_r.receipt_code,null,'Koreksi '||v_r.receipt_code);
    perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_r.material_id,null,'GUDANG_BAHAN',null,null,null,v_delta,'KOREKSI BARANG MASUK',p_notes);
  end if;
  update public.warehouse_receipts set receipt_date=p_receipt_date,quantity=round(p_quantity::numeric,4),supplier=nullif(btrim(coalesce(p_supplier,'')),''),document_no=nullif(btrim(coalesce(p_document_no,'')),''),notes=nullif(btrim(coalesce(p_notes,'')),''),updated_by=auth.uid(),updated_at=now() where id=p_receipt_id;
end; $$;

create or replace function public.cancel_warehouse_receipt(p_receipt_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_r public.warehouse_receipts%rowtype; v_event bigint;
begin
  if not public.has_permission('barang_masuk_gudang.write') then raise exception 'Tidak memiliki izin Barang Masuk Gudang.' using errcode='42501'; end if;
  select * into v_r from public.warehouse_receipts where id=p_receipt_id for update; if not found then raise exception 'Barang Masuk tidak ditemukan.'; end if;
  if v_r.status='DIBATALKAN' then raise exception 'Transaksi sudah dibatalkan.'; end if;
  v_event:=public.smpt_create_stock_event('WAREHOUSE_RECEIPT_REVERSAL',current_date,null,null,'BARANG_MASUK_GUDANG',v_r.receipt_code,v_r.base_event_id,'Pembatalan '||v_r.receipt_code);
  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_r.material_id,null,'GUDANG_BAHAN',null,null,null,-v_r.quantity,'BATAL BARANG MASUK','Reversal '||v_r.receipt_code);
  update public.warehouse_receipts set status='DIBATALKAN',cancellation_event_id=v_event,updated_by=auth.uid(),updated_at=now() where id=p_receipt_id;
end; $$;

create or replace function public.save_cutting_component(p_component_id bigint,p_project_id bigint,p_product_id bigint,p_name text,p_qty_per_product numeric,p_unit text,p_color text default '',p_notes text default null,p_status text default 'AKTIF')
returns bigint language plpgsql security definer set search_path='' as $$
declare v_id bigint; v_product_count int; v_status text:=upper(btrim(coalesce(p_status,'AKTIF')));
begin
  if not public.has_permission('cutting.write') then raise exception 'Tidak memiliki izin Cutting.' using errcode='42501'; end if;
  if p_project_id is null or btrim(coalesce(p_name,''))='' or btrim(coalesce(p_unit,''))='' or p_qty_per_product is null or p_qty_per_product<=0 then raise exception 'Data komponen Cutting belum lengkap.'; end if;
  select count(*) into v_product_count from public.project_products where project_id=p_project_id and status='AKTIF';
  if v_product_count>0 and p_product_id is null then raise exception 'Produk/Tas wajib dipilih untuk komponen Cutting baru.'; end if;
  if p_product_id is not null then perform 1 from public.project_products where id=p_product_id and project_id=p_project_id; if not found then raise exception 'Produk/Tas tidak sesuai proyek.'; end if; end if;
  if p_component_id is null then
    insert into public.cutting_components(project_id,product_id,name,qty_per_product,unit,color,notes,status)
    values(p_project_id,p_product_id,regexp_replace(btrim(p_name),'\s+',' ','g'),round(p_qty_per_product::numeric,4),btrim(p_unit),btrim(coalesce(p_color,'')),nullif(btrim(coalesce(p_notes,'')),''),v_status) returning id into v_id;
  else
    update public.cutting_components set name=regexp_replace(btrim(p_name),'\s+',' ','g'),qty_per_product=round(p_qty_per_product::numeric,4),unit=btrim(p_unit),color=btrim(coalesce(p_color,'')),notes=nullif(btrim(coalesce(p_notes,'')),''),status=v_status,updated_by=auth.uid(),updated_at=now()
    where id=p_component_id and project_id=p_project_id and product_id is not distinct from p_product_id returning id into v_id;
    if v_id is null then raise exception 'Komponen Cutting tidak ditemukan atau parent berbeda.'; end if;
  end if;
  return v_id;
end; $$;

create or replace function public.create_material_request_header(p_request_date date,p_project_id bigint,p_product_id bigint,p_supervisor_worker_id bigint,p_purpose text,p_notes text default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_id bigint; v_code text; v_purpose text:=upper(btrim(coalesce(p_purpose,''))); v_products int;
begin
  if not public.has_permission('permintaan_produksi.write') then raise exception 'Tidak memiliki izin Permintaan Barang.' using errcode='42501'; end if;
  if p_request_date is null or p_project_id is null or p_supervisor_worker_id is null then raise exception 'Tanggal, proyek, dan supervisor wajib diisi.'; end if;
  if v_purpose not in ('CUTTING','SABLON','PRODUKSI') then raise exception 'Tujuan tidak valid.'; end if;
  perform 1 from public.projects where id=p_project_id and upper(coalesce(status,'')) not in ('SELESAI','NONAKTIF','DIBATALKAN','BATAL'); if not found then raise exception 'Proyek tidak ditemukan/aktif.'; end if;
  select count(*) into v_products from public.project_products where project_id=p_project_id and status='AKTIF'; if v_products>0 and p_product_id is null then raise exception 'Produk/Tas wajib dipilih.'; end if;
  if p_product_id is not null then perform 1 from public.project_products where id=p_product_id and project_id=p_project_id and status='AKTIF'; if not found then raise exception 'Produk/Tas tidak sesuai proyek.'; end if; end if;
  perform 1 from public.workers where id=p_supervisor_worker_id and status='AKTIF' and (upper(coalesce(position,'')) like '%SUPERVISOR%' or upper(coalesce(position,'')) like '%SPV%') and (upper(coalesce(department,'')) like '%PRODUKSI%' or upper(coalesce(position,'')) like '%PRODUKSI%'); if not found then raise exception 'Supervisor Produksi tidak ditemukan/aktif.'; end if;
  v_code:='PRD-REQ-'||lpad(nextval('public.smpt_request_code_seq')::text,6,'0');
  insert into public.material_requests(request_code,request_date,project_id,product_id,supervisor_worker_id,purpose,notes)
  values(v_code,p_request_date,p_project_id,p_product_id,p_supervisor_worker_id,v_purpose,nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.add_material_request_item(p_request_id bigint,p_source_type text,p_reference_id bigint,p_quantity numeric,p_notes text default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_r public.material_requests%rowtype; v_b public.bom_requirements%rowtype; v_c public.cutting_components%rowtype; v_id bigint; v_code text; v_source text:=upper(btrim(coalesce(p_source_type,'')));
begin
  if not public.has_permission('permintaan_produksi.write') then raise exception 'Tidak memiliki izin Permintaan Barang.' using errcode='42501'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Qty harus lebih dari 0.'; end if;
  select * into v_r from public.material_requests where id=p_request_id for update; if not found or v_r.status<>'DRAFT' then raise exception 'Draft permintaan tidak ditemukan.'; end if;
  v_code:='PRD-DTL-'||lpad(nextval('public.smpt_request_item_code_seq')::text,6,'0');
  if v_source='BAHAN BAKU' then
    select * into v_b from public.bom_requirements where id=p_reference_id and project_id=v_r.project_id and component_type='BAHAN' and status='AKTIF' and (product_id is null or product_id is not distinct from v_r.product_id); if not found then raise exception 'Bahan BOM tidak ditemukan.'; end if;
    insert into public.material_request_items(detail_code,request_id,source_type,bom_requirement_id,material_id,item_name_snapshot,unit_snapshot,requested_qty,notes)
    values(v_code,v_r.id,'BAHAN BAKU',v_b.id,v_b.material_id,v_b.component_name,v_b.unit,round(p_quantity::numeric,4),nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_id;
  elsif v_source='HASIL CUTTING' then
    if v_r.purpose='CUTTING' then raise exception 'Hasil Cutting tidak boleh diminta untuk tujuan CUTTING.'; end if;
    select * into v_c from public.cutting_components where id=p_reference_id and project_id=v_r.project_id and status='AKTIF' and (product_id is null or product_id is not distinct from v_r.product_id); if not found then raise exception 'Komponen Cutting tidak ditemukan.'; end if;
    insert into public.material_request_items(detail_code,request_id,source_type,cutting_component_id,item_name_snapshot,color_snapshot,unit_snapshot,requested_qty,notes)
    values(v_code,v_r.id,'HASIL CUTTING',v_c.id,v_c.name,v_c.color,v_c.unit,round(p_quantity::numeric,4),nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_id;
  else raise exception 'Jenis sumber tidak valid.'; end if;
  return v_id;
end; $$;

create or replace function public.remove_material_request_item(p_item_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
  if not public.has_permission('permintaan_produksi.write') then raise exception 'Tidak memiliki izin Permintaan Barang.' using errcode='42501'; end if;
  select r.status into v_status from public.material_request_items i join public.material_requests r on r.id=i.request_id where i.id=p_item_id for update of r;
  if v_status is null or v_status<>'DRAFT' then raise exception 'Hanya detail DRAFT yang dapat dihapus.'; end if;
  delete from public.material_request_items where id=p_item_id;
end; $$;

create or replace function public.submit_material_request(p_request_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_count int;
begin
  if not public.has_permission('permintaan_produksi.write') then raise exception 'Tidak memiliki izin Permintaan Barang.' using errcode='42501'; end if;
  perform 1 from public.material_requests where id=p_request_id and status='DRAFT' for update; if not found then raise exception 'Hanya DRAFT yang dapat dikirim.'; end if;
  select count(*) into v_count from public.material_request_items where request_id=p_request_id and status='AKTIF'; if v_count=0 then raise exception 'Tambahkan minimal satu item.'; end if;
  update public.material_requests set status='MENUNGGU GUDANG',submitted_at=now(),updated_by=auth.uid(),updated_at=now() where id=p_request_id;
end; $$;

create or replace function public.cancel_material_request(p_request_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_fulfilled numeric;
begin
  if not public.has_permission('permintaan_produksi.write') then raise exception 'Tidak memiliki izin Permintaan Barang.' using errcode='42501'; end if;
  perform 1 from public.material_requests where id=p_request_id and status not in ('SELESAI','DIBATALKAN') for update; if not found then raise exception 'Permintaan tidak dapat dibatalkan.'; end if;
  select coalesce(sum(fulfilled_qty),0) into v_fulfilled from public.material_request_items where request_id=p_request_id; if v_fulfilled>0 then raise exception 'Permintaan yang sudah memiliki Barang Keluar tidak dapat dibatalkan.'; end if;
  update public.material_requests set status='DIBATALKAN',updated_by=auth.uid(),updated_at=now() where id=p_request_id;
  update public.material_request_items set status='DIBATALKAN',updated_at=now() where request_id=p_request_id;
end; $$;

create or replace function public.fulfill_material_request_item(p_request_item_id bigint,p_issue_date date,p_quantity numeric,p_recipient_worker_id bigint,p_recipient_name text,p_wip_source_state text default null,p_notes text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v_i public.material_request_items%rowtype; v_r public.material_requests%rowtype; v_qty numeric(18,4); v_remaining numeric(18,4); v_name text; v_event bigint; v_issue text; v_src text; v_dest text; v_all_done boolean; v_state text:=upper(btrim(coalesce(p_wip_source_state,'')));
begin
  if not public.has_permission('barang_keluar_gudang.write') or not public.has_permission('permintaan_produksi.fulfill') then raise exception 'Tidak memiliki izin pemenuhan Gudang.' using errcode='42501'; end if;
  if p_issue_date is null or p_quantity is null or p_quantity<=0 then raise exception 'Tanggal dan qty wajib valid.'; end if;
  select * into v_i from public.material_request_items where id=p_request_item_id for update; if not found then raise exception 'Detail permintaan tidak ditemukan.'; end if;
  select * into v_r from public.material_requests where id=v_i.request_id for update; if v_r.status not in ('MENUNGGU GUDANG','SEBAGIAN') then raise exception 'Permintaan tidak dapat diproses.'; end if;
  v_qty:=round(p_quantity::numeric,4); v_remaining:=round((v_i.requested_qty-v_i.fulfilled_qty)::numeric,4); if v_qty>v_remaining then raise exception 'Qty melebihi sisa permintaan.'; end if;
  if p_recipient_worker_id is not null then select name into v_name from public.workers where id=p_recipient_worker_id and status='AKTIF'; else v_name:=btrim(coalesce(p_recipient_name,'')); end if; if coalesce(v_name,'')='' then raise exception 'Nama pengambil wajib diisi.'; end if;
  v_dest:=case v_r.purpose when 'CUTTING' then 'CUTTING' when 'SABLON' then 'SABLON' else 'SIAP_PRODUKSI' end;
  v_issue:='BK-'||lpad(nextval('public.smpt_issue_code_seq')::text,6,'0');
  v_event:=public.smpt_create_stock_event('WAREHOUSE_ISSUE',p_issue_date,v_r.project_id,v_r.product_id,'PERMINTAAN',v_issue,null,p_notes);
  if v_i.source_type='BAHAN BAKU' then
    perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_i.material_id,null,'GUDANG_BAHAN',null,null,null,-v_qty,'BARANG KELUAR GUDANG',p_notes);
    perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_i.material_id,null,v_dest,v_r.project_id,v_r.product_id,v_i.bom_requirement_id,v_qty,'TERIMA DARI GUDANG',p_notes);
    v_src:='GUDANG_BAHAN';
  else
    if v_r.purpose='SABLON' then v_src:='GUDANG_HASIL_SABLON';
    elsif v_r.purpose='PRODUKSI' then if v_state='HASIL_SABLON' then v_src:='GUDANG_HASIL_SELESAI_SABLON'; else v_src:='GUDANG_HASIL_BELUM'; end if;
    else raise exception 'Hasil Cutting tidak boleh dikirim ke Cutting.'; end if;
    perform public.smpt_apply_stock_delta(v_event,'CUTTING_COMPONENT',null,v_i.cutting_component_id,v_src,v_r.project_id,v_r.product_id,null,-v_qty,'BARANG KELUAR GUDANG',p_notes);
    perform public.smpt_apply_stock_delta(v_event,'CUTTING_COMPONENT',null,v_i.cutting_component_id,v_dest,v_r.project_id,v_r.product_id,null,v_qty,'TERIMA DARI GUDANG',p_notes);
  end if;
  insert into public.warehouse_issues(issue_code,issue_date,source,request_id,request_item_id,project_id,product_id,purpose,source_type,bom_requirement_id,cutting_component_id,material_id,item_name_snapshot,color_snapshot,quantity,unit_snapshot,recipient_worker_id,recipient_name,supervisor_worker_id,notes,stock_event_id)
  values(v_issue,p_issue_date,'PERMINTAAN',v_r.id,v_i.id,v_r.project_id,v_r.product_id,v_r.purpose,v_i.source_type,v_i.bom_requirement_id,v_i.cutting_component_id,v_i.material_id,v_i.item_name_snapshot,v_i.color_snapshot,v_qty,v_i.unit_snapshot,p_recipient_worker_id,v_name,v_r.supervisor_worker_id,nullif(btrim(coalesce(p_notes,'')),''),v_event);
  update public.material_request_items set fulfilled_qty=fulfilled_qty+v_qty,status=case when fulfilled_qty+v_qty>=requested_qty then 'DIPENUHI' else 'AKTIF' end,updated_at=now() where id=v_i.id;
  select not exists(select 1 from public.material_request_items where request_id=v_r.id and status<>'DIBATALKAN' and fulfilled_qty<requested_qty) into v_all_done;
  update public.material_requests set status=case when v_all_done then 'SELESAI' else 'SEBAGIAN' end,completed_at=case when v_all_done then now() else null end,updated_by=auth.uid(),updated_at=now() where id=v_r.id;
  return v_issue;
end; $$;

create or replace function public.direct_warehouse_issue_material(p_issue_date date,p_project_id bigint,p_product_id bigint,p_bom_requirement_id bigint,p_purpose text,p_quantity numeric,p_recipient_worker_id bigint,p_recipient_name text,p_notes text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v_b public.bom_requirements%rowtype; v_name text; v_dest text; v_purpose text:=upper(btrim(coalesce(p_purpose,''))); v_event bigint; v_issue text;
begin
  if not public.has_permission('barang_keluar_gudang.write') then raise exception 'Tidak memiliki izin Barang Keluar Gudang.' using errcode='42501'; end if;
  if p_issue_date is null or p_quantity is null or p_quantity<=0 then raise exception 'Tanggal dan qty wajib valid.'; end if;
  if v_purpose not in ('CUTTING','SABLON','PRODUKSI') then raise exception 'Tujuan tidak valid.'; end if;
  select * into v_b from public.bom_requirements where id=p_bom_requirement_id and project_id=p_project_id and component_type='BAHAN' and status='AKTIF' and (product_id is null or product_id is not distinct from p_product_id); if not found then raise exception 'Bahan BOM tidak ditemukan.'; end if;
  if p_recipient_worker_id is not null then select name into v_name from public.workers where id=p_recipient_worker_id and status='AKTIF'; else v_name:=btrim(coalesce(p_recipient_name,'')); end if; if coalesce(v_name,'')='' then raise exception 'Nama pengambil wajib diisi.'; end if;
  v_dest:=case v_purpose when 'CUTTING' then 'CUTTING' when 'SABLON' then 'SABLON' else 'SIAP_PRODUKSI' end;
  v_issue:='BK-'||lpad(nextval('public.smpt_issue_code_seq')::text,6,'0');
  v_event:=public.smpt_create_stock_event('WAREHOUSE_ISSUE',p_issue_date,p_project_id,p_product_id,'LANGSUNG',v_issue,null,p_notes);
  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_b.material_id,null,'GUDANG_BAHAN',null,null,null,-p_quantity,'BARANG KELUAR GUDANG',p_notes);
  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_b.material_id,null,v_dest,p_project_id,p_product_id,v_b.id,p_quantity,'TERIMA DARI GUDANG',p_notes);
  insert into public.warehouse_issues(issue_code,issue_date,source,project_id,product_id,purpose,source_type,bom_requirement_id,material_id,item_name_snapshot,quantity,unit_snapshot,recipient_worker_id,recipient_name,notes,stock_event_id)
  values(v_issue,p_issue_date,'LANGSUNG',p_project_id,p_product_id,v_purpose,'BAHAN BAKU',v_b.id,v_b.material_id,v_b.component_name,round(p_quantity::numeric,4),v_b.unit,p_recipient_worker_id,v_name,nullif(btrim(coalesce(p_notes,'')),''),v_event);
  return v_issue;
end; $$;

create or replace function public.record_cutting_material_usage(p_usage_date date,p_project_id bigint,p_product_id bigint,p_bom_requirement_id bigint,p_quantity numeric,p_officer text,p_notes text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v_b public.bom_requirements%rowtype; v_event bigint; v_code text;
begin
  if not public.has_permission('cutting.write') then raise exception 'Tidak memiliki izin Cutting.' using errcode='42501'; end if;
  if p_usage_date is null or p_quantity is null or p_quantity<=0 or btrim(coalesce(p_officer,''))='' then raise exception 'Tanggal, qty, dan petugas wajib valid.'; end if;
  select * into v_b from public.bom_requirements where id=p_bom_requirement_id and project_id=p_project_id and component_type='BAHAN' and status='AKTIF' and (product_id is null or product_id is not distinct from p_product_id); if not found then raise exception 'Bahan BOM tidak ditemukan.'; end if;
  v_code:='CPB-'||lpad(nextval('public.smpt_cut_usage_code_seq')::text,6,'0');
  v_event:=public.smpt_create_stock_event('CUTTING_USAGE',p_usage_date,p_project_id,p_product_id,'CUTTING_PEMAKAIAN',v_code,null,p_notes);
  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_b.material_id,null,'CUTTING',p_project_id,p_product_id,v_b.id,-p_quantity,'PEMAKAIAN CUTTING',p_notes);
  insert into public.cutting_material_usages(usage_code,usage_date,project_id,product_id,bom_requirement_id,material_id,quantity,unit_snapshot,officer,notes,stock_event_id)
  values(v_code,p_usage_date,p_project_id,p_product_id,v_b.id,v_b.material_id,round(p_quantity::numeric,4),v_b.unit,btrim(p_officer),nullif(btrim(coalesce(p_notes,'')),''),v_event);
  return v_code;
end; $$;

create or replace function public.cancel_cutting_material_usage(p_usage_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_u public.cutting_material_usages%rowtype; v_event bigint;
begin
  if not public.has_permission('cutting.write') then raise exception 'Tidak memiliki izin Cutting.' using errcode='42501'; end if;
  select * into v_u from public.cutting_material_usages where id=p_usage_id for update; if not found or v_u.status<>'AKTIF' then raise exception 'Pemakaian tidak ditemukan/aktif.'; end if;
  v_event:=public.smpt_create_stock_event('CUTTING_USAGE_REVERSAL',current_date,v_u.project_id,v_u.product_id,'CUTTING_PEMAKAIAN',v_u.usage_code,v_u.stock_event_id,'Pembatalan '||v_u.usage_code);
  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_u.material_id,null,'CUTTING',v_u.project_id,v_u.product_id,v_u.bom_requirement_id,v_u.quantity,'BATAL PEMAKAIAN CUTTING','Reversal '||v_u.usage_code);
  update public.cutting_material_usages set status='DIBATALKAN',cancellation_event_id=v_event where id=v_u.id;
end; $$;

create or replace function public.record_cutting_result(p_result_date date,p_cutting_component_id bigint,p_good_qty numeric,p_reject_qty numeric,p_officer text,p_notes text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v_c public.cutting_components%rowtype; v_good numeric(18,4):=round(coalesce(p_good_qty,0)::numeric,4); v_reject numeric(18,4):=round(coalesce(p_reject_qty,0)::numeric,4); v_target numeric(18,4); v_done numeric(18,4); v_event bigint; v_code text;
begin
  if not public.has_permission('cutting.write') then raise exception 'Tidak memiliki izin Cutting.' using errcode='42501'; end if;
  if p_result_date is null or btrim(coalesce(p_officer,''))='' or v_good<0 or v_reject<0 or (v_good=0 and v_reject=0) then raise exception 'Data hasil Cutting tidak valid.'; end if;
  select * into v_c from public.cutting_components where id=p_cutting_component_id and status='AKTIF' for update; if not found then raise exception 'Komponen Cutting tidak ditemukan/aktif.'; end if;
  if v_c.product_id is null then raise exception 'Komponen Cutting harus terikat Produk/Tas sebelum dipakai transaksi V2.'; end if;
  select round((target_production*v_c.qty_per_product)::numeric,4) into v_target from public.project_products where id=v_c.product_id;
  select coalesce(sum(good_qty),0) into v_done from public.cutting_daily_results where cutting_component_id=v_c.id and status='AKTIF';
  if v_done+v_good>v_target then raise exception 'Hasil baik melebihi sisa target. Sisa % %.',round(v_target-v_done,4),v_c.unit; end if;
  v_code:='CH-'||lpad(nextval('public.smpt_cut_result_code_seq')::text,6,'0');
  if v_good>0 then
    v_event:=public.smpt_create_stock_event('CUTTING_RESULT',p_result_date,v_c.project_id,v_c.product_id,'CUTTING_HASIL',v_code,null,p_notes);
    perform public.smpt_apply_stock_delta(v_event,'CUTTING_COMPONENT',null,v_c.id,'GUDANG_HASIL_BELUM',v_c.project_id,v_c.product_id,null,v_good,'TERIMA OTOMATIS DARI CUTTING',p_notes);
  end if;
  insert into public.cutting_daily_results(result_code,result_date,project_id,product_id,cutting_component_id,good_qty,reject_qty,unit_snapshot,officer,notes,stock_event_id)
  values(v_code,p_result_date,v_c.project_id,v_c.product_id,v_c.id,v_good,v_reject,v_c.unit,btrim(p_officer),nullif(btrim(coalesce(p_notes,'')),''),v_event);
  return v_code;
end; $$;

create or replace function public.cancel_cutting_result(p_result_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_r public.cutting_daily_results%rowtype; v_event bigint;
begin
  if not public.has_permission('cutting.write') then raise exception 'Tidak memiliki izin Cutting.' using errcode='42501'; end if;
  select * into v_r from public.cutting_daily_results where id=p_result_id for update; if not found or v_r.status<>'AKTIF' then raise exception 'Hasil Cutting tidak ditemukan/aktif.'; end if;
  if v_r.good_qty>0 then
    v_event:=public.smpt_create_stock_event('CUTTING_RESULT_REVERSAL',current_date,v_r.project_id,v_r.product_id,'CUTTING_HASIL',v_r.result_code,v_r.stock_event_id,'Pembatalan '||v_r.result_code);
    perform public.smpt_apply_stock_delta(v_event,'CUTTING_COMPONENT',null,v_r.cutting_component_id,'GUDANG_HASIL_BELUM',v_r.project_id,v_r.product_id,null,-v_r.good_qty,'BATAL HASIL CUTTING','Reversal '||v_r.result_code);
  end if;
  update public.cutting_daily_results set status='DIBATALKAN',cancellation_event_id=v_event where id=v_r.id;
end; $$;

create or replace function public.move_wip_stock(p_transaction_date date,p_cutting_component_id bigint,p_product_id bigint,p_quantity numeric,p_action text,p_notes text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_c public.cutting_components%rowtype; v_action text:=upper(btrim(coalesce(p_action,''))); v_from text; v_to text; v_perm text; v_label text; v_event bigint;
begin
  if p_transaction_date is null or p_quantity is null or p_quantity<=0 then raise exception 'Tanggal dan qty wajib valid.'; end if;
  select * into v_c from public.cutting_components where id=p_cutting_component_id and status='AKTIF'; if not found then raise exception 'Komponen Cutting tidak ditemukan.'; end if;
  if v_c.product_id is null or p_product_id is null or p_product_id<>v_c.product_id then raise exception 'Produk/Tas WIP tidak sesuai komponen.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_WIP:'||v_c.id::text||':'||p_product_id::text,0));
  case v_action
    when 'TANDAI_SABLON' then v_perm:='stok_gudang.write';v_from:='GUDANG_HASIL_BELUM';v_to:='GUDANG_HASIL_SABLON';v_label:='TANDAI UNTUK SABLON';
    when 'BATAL_TANDA_SABLON' then v_perm:='stok_gudang.write';v_from:='GUDANG_HASIL_SABLON';v_to:='GUDANG_HASIL_BELUM';v_label:='BATAL TANDA SABLON';
    when 'KIRIM_SABLON' then v_perm:='stok_gudang.write';v_from:='GUDANG_HASIL_SABLON';v_to:='SABLON';v_label:='KELUAR KE SABLON';
    when 'KEMBALI_DARI_SABLON' then v_perm:='sablon.write';v_from:='SABLON';v_to:='GUDANG_HASIL_SELESAI_SABLON';v_label:='KEMBALI DARI SABLON';
    when 'CUTTING_KE_SIAP_PRODUKSI' then v_perm:='stok_gudang.write';v_from:='GUDANG_HASIL_BELUM';v_to:='SIAP_PRODUKSI';v_label:='GUDANG HASIL KE SIAP PRODUKSI';
    when 'SABLON_KE_SIAP_PRODUKSI' then v_perm:='stok_gudang.write';v_from:='GUDANG_HASIL_SELESAI_SABLON';v_to:='SIAP_PRODUKSI';v_label:='HASIL SABLON KE SIAP PRODUKSI';
    else raise exception 'Aksi WIP tidak valid.'; end case;
  if not public.has_permission(v_perm) then raise exception 'Tidak memiliki izin mutasi WIP.' using errcode='42501'; end if;
  v_event:=public.smpt_create_stock_event('WIP_TRANSFER',p_transaction_date,v_c.project_id,p_product_id,'CUTTING_COMPONENT',v_c.component_code,null,p_notes);
  perform public.smpt_apply_stock_delta(v_event,'CUTTING_COMPONENT',null,v_c.id,v_from,v_c.project_id,p_product_id,null,-p_quantity,v_label,p_notes);
  perform public.smpt_apply_stock_delta(v_event,'CUTTING_COMPONENT',null,v_c.id,v_to,v_c.project_id,p_product_id,null,p_quantity,v_label,p_notes);
end; $$;

create or replace function public.record_ready_production_usage(p_usage_date date,p_item_kind text,p_reference_id bigint,p_project_id bigint,p_product_id bigint,p_quantity numeric,p_officer text,p_notes text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v_kind text:=upper(btrim(p_item_kind)); v_b public.bom_requirements%rowtype; v_c public.cutting_components%rowtype; v_event bigint; v_code text;
begin
  if not public.has_permission('produksi.write') then raise exception 'Tidak memiliki izin Siap Produksi.' using errcode='42501'; end if;
  if p_usage_date is null or p_quantity is null or p_quantity<=0 or btrim(coalesce(p_officer,''))='' then raise exception 'Tanggal, qty, dan petugas wajib valid.'; end if;
  v_code:='RPU-'||lpad(nextval('public.smpt_ready_usage_code_seq')::text,7,'0');
  v_event:=public.smpt_create_stock_event('READY_PRODUCTION_USAGE',p_usage_date,p_project_id,p_product_id,'SIAP_PRODUKSI',v_code,null,p_notes);
  if v_kind='MATERIAL' then
    select * into v_b from public.bom_requirements where id=p_reference_id and project_id=p_project_id and component_type='BAHAN' and (product_id is null or product_id is not distinct from p_product_id); if not found then raise exception 'Bahan tidak ditemukan.'; end if;
    perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_b.material_id,null,'SIAP_PRODUKSI',p_project_id,p_product_id,v_b.id,-p_quantity,'PEMAKAIAN SIAP PRODUKSI',p_notes);
    insert into public.ready_production_usages(usage_code,usage_date,project_id,product_id,item_kind,bom_requirement_id,material_id,quantity,unit_snapshot,officer,notes,stock_event_id)
    values(v_code,p_usage_date,p_project_id,p_product_id,'MATERIAL',v_b.id,v_b.material_id,round(p_quantity::numeric,4),v_b.unit,btrim(p_officer),nullif(btrim(coalesce(p_notes,'')),''),v_event);
  elsif v_kind='CUTTING_COMPONENT' then
    select * into v_c from public.cutting_components where id=p_reference_id and project_id=p_project_id and product_id=p_product_id; if not found then raise exception 'WIP tidak ditemukan.'; end if;
    perform public.smpt_apply_stock_delta(v_event,'CUTTING_COMPONENT',null,v_c.id,'SIAP_PRODUKSI',p_project_id,p_product_id,null,-p_quantity,'PEMAKAIAN SIAP PRODUKSI',p_notes);
    insert into public.ready_production_usages(usage_code,usage_date,project_id,product_id,item_kind,cutting_component_id,quantity,unit_snapshot,officer,notes,stock_event_id)
    values(v_code,p_usage_date,p_project_id,p_product_id,'CUTTING_COMPONENT',v_c.id,round(p_quantity::numeric,4),v_c.unit,btrim(p_officer),nullif(btrim(coalesce(p_notes,'')),''),v_event);
  else raise exception 'Jenis item Siap Produksi tidak valid.'; end if;
  return v_code;
end; $$;

-- RLS/read access.
alter table public.workers enable row level security;
alter table public.cutting_components enable row level security;
alter table public.stock_locations enable row level security;
alter table public.stock_events enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_ledger_entries enable row level security;
alter table public.warehouse_receipts enable row level security;
alter table public.material_requests enable row level security;
alter table public.material_request_items enable row level security;
alter table public.warehouse_issues enable row level security;
alter table public.cutting_material_usages enable row level security;
alter table public.cutting_daily_results enable row level security;
alter table public.ready_production_usages enable row level security;

create policy workers_select on public.workers for select to authenticated using (public.has_permission('master_pekerja.view') or public.has_permission('barang_keluar_gudang.view') or public.has_permission('permintaan_produksi.view'));
create policy workers_insert on public.workers for insert to authenticated with check(public.has_permission('master_pekerja.write'));
create policy workers_update on public.workers for update to authenticated using(public.has_permission('master_pekerja.write')) with check(public.has_permission('master_pekerja.write'));
create policy cutting_components_select on public.cutting_components for select to authenticated using(public.has_permission('cutting.view') or public.has_permission('stok_gudang.view') or public.has_permission('sablon.view') or public.has_permission('permintaan_produksi.view') or public.has_permission('produksi.view'));
create policy stock_locations_select on public.stock_locations for select to authenticated using(auth.uid() is not null);
create policy stock_events_select on public.stock_events for select to authenticated using(public.has_permission('stok_gudang.view') or public.has_permission('log_bahan.view') or public.has_permission('barang_masuk_gudang.view') or public.has_permission('barang_keluar_gudang.view') or public.has_permission('cutting.view') or public.has_permission('sablon.view') or public.has_permission('produksi.view'));
create policy stock_balances_select on public.stock_balances for select to authenticated using(public.has_permission('stok_gudang.view') or public.has_permission('log_bahan.view') or public.has_permission('barang_keluar_gudang.view') or public.has_permission('cutting.view') or public.has_permission('sablon.view') or public.has_permission('produksi.view'));
create policy stock_ledger_select on public.stock_ledger_entries for select to authenticated using(public.has_permission('stok_gudang.view') or public.has_permission('log_bahan.view') or public.has_permission('barang_masuk_gudang.view') or public.has_permission('barang_keluar_gudang.view') or public.has_permission('cutting.view') or public.has_permission('sablon.view') or public.has_permission('produksi.view'));
create policy receipts_select on public.warehouse_receipts for select to authenticated using(public.has_permission('barang_masuk_gudang.view') or public.has_permission('stok_gudang.view'));
create policy requests_select on public.material_requests for select to authenticated using(public.has_permission('permintaan_produksi.view') or public.has_permission('barang_keluar_gudang.view'));
create policy request_items_select on public.material_request_items for select to authenticated using(public.has_permission('permintaan_produksi.view') or public.has_permission('barang_keluar_gudang.view'));
create policy issues_select on public.warehouse_issues for select to authenticated using(public.has_permission('barang_keluar_gudang.view') or public.has_permission('stok_gudang.view') or public.has_permission('log_bahan.view'));
create policy cutting_usage_select on public.cutting_material_usages for select to authenticated using(public.has_permission('cutting.view'));
create policy cutting_result_select on public.cutting_daily_results for select to authenticated using(public.has_permission('cutting.view') or public.has_permission('stok_gudang.view') or public.has_permission('sablon.view') or public.has_permission('produksi.view'));
create policy ready_usage_select on public.ready_production_usages for select to authenticated using(public.has_permission('produksi.view'));

create policy projects_ops_select on public.projects for select to authenticated using(public.has_permission('stok_gudang.view') or public.has_permission('barang_keluar_gudang.view') or public.has_permission('permintaan_produksi.view') or public.has_permission('cutting.view') or public.has_permission('sablon.view') or public.has_permission('produksi.view'));
create policy project_products_ops_select on public.project_products for select to authenticated using(public.has_permission('barang_keluar_gudang.view') or public.has_permission('permintaan_produksi.view') or public.has_permission('cutting.view') or public.has_permission('produksi.view') or public.has_permission('stok_gudang.view') or public.has_permission('sablon.view'));
create policy materials_ops_select on public.materials for select to authenticated using(public.has_permission('barang_masuk_gudang.view') or public.has_permission('barang_keluar_gudang.view') or public.has_permission('stok_gudang.view') or public.has_permission('log_bahan.view') or public.has_permission('cutting.view') or public.has_permission('produksi.view'));
create policy bom_ops_select on public.bom_requirements for select to authenticated using(public.has_permission('barang_keluar_gudang.view') or public.has_permission('permintaan_produksi.view') or public.has_permission('cutting.view') or public.has_permission('produksi.view'));

revoke all on public.stock_locations,public.stock_events,public.stock_balances,public.stock_ledger_entries,public.cutting_components,public.warehouse_receipts,public.material_requests,public.material_request_items,public.warehouse_issues,public.cutting_material_usages,public.cutting_daily_results,public.ready_production_usages from anon,authenticated;
grant select on public.stock_locations,public.stock_events,public.stock_balances,public.stock_ledger_entries,public.cutting_components,public.warehouse_receipts,public.material_requests,public.material_request_items,public.warehouse_issues,public.cutting_material_usages,public.cutting_daily_results,public.ready_production_usages to authenticated;
grant select,insert,update on public.workers to authenticated;
grant usage,select on sequence public.workers_id_seq,public.smpt_worker_code_seq to authenticated;

revoke all on function public.smpt_create_stock_event(text,date,bigint,bigint,text,text,bigint,text) from public,authenticated;
revoke all on function public.smpt_apply_stock_delta(bigint,text,bigint,bigint,text,bigint,bigint,bigint,numeric,text,text) from public,authenticated;

revoke all on function public.create_warehouse_receipt(date,bigint,numeric,text,text,text) from public;
revoke all on function public.update_warehouse_receipt(bigint,date,numeric,text,text,text) from public;
revoke all on function public.cancel_warehouse_receipt(bigint) from public;
revoke all on function public.save_cutting_component(bigint,bigint,bigint,text,numeric,text,text,text,text) from public;
revoke all on function public.create_material_request_header(date,bigint,bigint,bigint,text,text) from public;
revoke all on function public.add_material_request_item(bigint,text,bigint,numeric,text) from public;
revoke all on function public.remove_material_request_item(bigint) from public;
revoke all on function public.submit_material_request(bigint) from public;
revoke all on function public.cancel_material_request(bigint) from public;
revoke all on function public.fulfill_material_request_item(bigint,date,numeric,bigint,text,text,text) from public;
revoke all on function public.direct_warehouse_issue_material(date,bigint,bigint,bigint,text,numeric,bigint,text,text) from public;
revoke all on function public.record_cutting_material_usage(date,bigint,bigint,bigint,numeric,text,text) from public;
revoke all on function public.cancel_cutting_material_usage(bigint) from public;
revoke all on function public.record_cutting_result(date,bigint,numeric,numeric,text,text) from public;
revoke all on function public.cancel_cutting_result(bigint) from public;
revoke all on function public.move_wip_stock(date,bigint,bigint,numeric,text,text) from public;
revoke all on function public.record_ready_production_usage(date,text,bigint,bigint,bigint,numeric,text,text) from public;

grant execute on function public.create_warehouse_receipt(date,bigint,numeric,text,text,text) to authenticated;
grant execute on function public.update_warehouse_receipt(bigint,date,numeric,text,text,text) to authenticated;
grant execute on function public.cancel_warehouse_receipt(bigint) to authenticated;
grant execute on function public.save_cutting_component(bigint,bigint,bigint,text,numeric,text,text,text,text) to authenticated;
grant execute on function public.create_material_request_header(date,bigint,bigint,bigint,text,text) to authenticated;
grant execute on function public.add_material_request_item(bigint,text,bigint,numeric,text) to authenticated;
grant execute on function public.remove_material_request_item(bigint) to authenticated;
grant execute on function public.submit_material_request(bigint) to authenticated;
grant execute on function public.cancel_material_request(bigint) to authenticated;
grant execute on function public.fulfill_material_request_item(bigint,date,numeric,bigint,text,text,text) to authenticated;
grant execute on function public.direct_warehouse_issue_material(date,bigint,bigint,bigint,text,numeric,bigint,text,text) to authenticated;
grant execute on function public.record_cutting_material_usage(date,bigint,bigint,bigint,numeric,text,text) to authenticated;
grant execute on function public.cancel_cutting_material_usage(bigint) to authenticated;
grant execute on function public.record_cutting_result(date,bigint,numeric,numeric,text,text) to authenticated;
grant execute on function public.cancel_cutting_result(bigint) to authenticated;
grant execute on function public.move_wip_stock(date,bigint,bigint,numeric,text,text) to authenticated;
grant execute on function public.record_ready_production_usage(date,text,bigint,bigint,bigint,numeric,text,text) to authenticated;
