-- SMPT V2 FINAL - Batch 4: QC, Barang Jadi, SET, Embarkasi

insert into public.permissions(code,description) values
('qc.operate','Melakukan inspeksi Quality Control.'),
('master_barang_jadi.write','Tambah/ubah Master Barang Jadi.'),
('master_lokasi.write','Tambah/ubah Master Lokasi.'),
('master_vendor.write','Tambah/ubah Master Vendor.'),
('master_embarkasi.write','Tambah/ubah Master Embarkasi.'),
('master_set.write','Tambah/ubah Master Set.'),
('target_embarkasi.write','Kelola Target Embarkasi.')
on conflict(code) do update set description=excluded.description;

create sequence if not exists public.smpt_finished_good_code_seq start with 1;
create sequence if not exists public.smpt_location_code_seq start with 1;
create sequence if not exists public.smpt_vendor_code_seq start with 1;
create sequence if not exists public.smpt_embarkation_code_seq start with 1;
create sequence if not exists public.smpt_set_code_seq start with 1;
create sequence if not exists public.smpt_log_stock_event_seq start with 1;
create sequence if not exists public.smpt_qc_code_seq start with 1;
create sequence if not exists public.smpt_rework_code_seq start with 1;
create sequence if not exists public.smpt_transfer_code_seq start with 1;
create sequence if not exists public.smpt_external_code_seq start with 1;
create sequence if not exists public.smpt_pack_code_seq start with 1;
create sequence if not exists public.smpt_target_code_seq start with 1;
create sequence if not exists public.smpt_shipment_code_seq start with 1;
create sequence if not exists public.smpt_issue_problem_code_seq start with 1;

create table if not exists public.finished_goods (
  id bigint generated always as identity primary key,
  finished_good_code text not null unique default ('BJ-'||lpad(nextval('public.smpt_finished_good_code_seq')::text,6,'0')),
  project_id bigint not null references public.projects(id) on delete restrict,
  product_id bigint,
  name text not null,
  category text not null,
  unit text not null default 'PCS',
  source text not null default 'INTERNAL' check(source in ('INTERNAL','LUAR','INTERNAL + LUAR')),
  final_work_item_id bigint references public.work_items(id) on delete restrict,
  status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF')),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict,
  check(btrim(name)<>'' and btrim(unit)<>'')
);
create unique index if not exists finished_goods_project_name_uq on public.finished_goods(project_id,lower(name));
create unique index if not exists finished_goods_final_item_uq on public.finished_goods(final_work_item_id) where final_work_item_id is not null and status='AKTIF';

do $$ begin if not exists(select 1 from pg_trigger where tgname='finished_goods_set_updated_at') then create trigger finished_goods_set_updated_at before update on public.finished_goods for each row execute function public.set_updated_at(); end if; end $$;

create table if not exists public.locations (
  id bigint generated always as identity primary key,
  location_code text not null unique default ('LOK-'||lpad(nextval('public.smpt_location_code_seq')::text,5,'0')),
  name text not null unique,
  location_type text not null default 'GUDANG',
  address text, pic_name text, phone text,
  status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF')),
  notes text, created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.locations(location_code,name,location_type,status,notes)
values('PUSAT','PUSAT','GUDANG','AKTIF','Lokasi default hasil QC') on conflict(name) do nothing;
do $$ begin if not exists(select 1 from pg_trigger where tgname='locations_set_updated_at') then create trigger locations_set_updated_at before update on public.locations for each row execute function public.set_updated_at(); end if; end $$;

create table if not exists public.vendors (
  id bigint generated always as identity primary key,
  vendor_code text not null unique default ('VND-'||lpad(nextval('public.smpt_vendor_code_seq')::text,5,'0')),
  name text not null unique, pic_name text, phone text, email text, address text, tax_no text,
  bank_name text, bank_account_no text, bank_account_name text,
  status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF')), notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(), created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
do $$ begin if not exists(select 1 from pg_trigger where tgname='vendors_set_updated_at') then create trigger vendors_set_updated_at before update on public.vendors for each row execute function public.set_updated_at(); end if; end $$;

create table if not exists public.embarkations (
  id bigint generated always as identity primary key,
  embarkation_code text not null unique default ('EMB-'||lpad(nextval('public.smpt_embarkation_code_seq')::text,5,'0')),
  name text not null unique, short_code text, address text, pic_name text, phone text,
  status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF')), notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
do $$ begin if not exists(select 1 from pg_trigger where tgname='embarkations_set_updated_at') then create trigger embarkations_set_updated_at before update on public.embarkations for each row execute function public.set_updated_at(); end if; end $$;

create table if not exists public.product_sets (
  id bigint generated always as identity primary key,
  set_code text not null unique default ('SET-'||lpad(nextval('public.smpt_set_code_seq')::text,5,'0')),
  project_id bigint not null references public.projects(id) on delete restrict,
  name text not null, unit text not null default 'SET', status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF')), notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(project_id,name)
);
do $$ begin if not exists(select 1 from pg_trigger where tgname='product_sets_set_updated_at') then create trigger product_sets_set_updated_at before update on public.product_sets for each row execute function public.set_updated_at(); end if; end $$;

create table if not exists public.product_set_components (
  id bigint generated always as identity primary key,
  set_id bigint not null references public.product_sets(id) on delete restrict,
  finished_good_id bigint not null references public.finished_goods(id) on delete restrict,
  qty_per_set numeric(18,4) not null check(qty_per_set>0),
  created_at timestamptz not null default now(), unique(set_id,finished_good_id)
);

create table if not exists public.logistics_stock_events (
  id bigint generated always as identity primary key,
  event_code text not null unique default ('LSE-'||lpad(nextval('public.smpt_log_stock_event_seq')::text,8,'0')),
  event_date date not null default current_date, event_type text not null, reference_type text not null, reference_id bigint, reference_code text,
  notes text, reversal_of_event_id bigint references public.logistics_stock_events(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null default auth.uid(), created_at timestamptz not null default now()
);

create table if not exists public.logistics_stock_balances (
  id bigint generated always as identity primary key,
  item_kind text not null check(item_kind in ('FINISHED_GOOD','SET')),
  finished_good_id bigint references public.finished_goods(id) on delete restrict,
  set_id bigint references public.product_sets(id) on delete restrict,
  location_id bigint not null references public.locations(id) on delete restrict,
  quantity numeric(18,4) not null default 0 check(quantity>=0), updated_at timestamptz not null default now(),
  check((item_kind='FINISHED_GOOD' and finished_good_id is not null and set_id is null) or (item_kind='SET' and set_id is not null and finished_good_id is null))
);
create unique index if not exists logistics_stock_balance_uq on public.logistics_stock_balances(item_kind,coalesce(finished_good_id,0),coalesce(set_id,0),location_id);

create table if not exists public.logistics_stock_ledger (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.logistics_stock_events(id) on delete restrict,
  item_kind text not null check(item_kind in ('FINISHED_GOOD','SET')),
  finished_good_id bigint references public.finished_goods(id) on delete restrict,
  set_id bigint references public.product_sets(id) on delete restrict,
  location_id bigint not null references public.locations(id) on delete restrict,
  movement_kind text not null, quantity_delta numeric(18,4) not null check(quantity_delta<>0), unit_snapshot text not null,
  notes text, created_at timestamptz not null default now(),
  check((item_kind='FINISHED_GOOD' and finished_good_id is not null and set_id is null) or (item_kind='SET' and set_id is not null and finished_good_id is null))
);
create index if not exists logistics_stock_ledger_item_idx on public.logistics_stock_ledger(item_kind,finished_good_id,set_id,location_id,created_at desc,id desc);

create or replace function public.smpt_reject_logistics_history_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Histori logistik immutable. Gunakan reversal.'; end $$;
do $$ begin if not exists(select 1 from pg_trigger where tgname='logistics_events_immutable') then create trigger logistics_events_immutable before update or delete on public.logistics_stock_events for each row execute function public.smpt_reject_logistics_history_mutation(); end if; if not exists(select 1 from pg_trigger where tgname='logistics_ledger_immutable') then create trigger logistics_ledger_immutable before update or delete on public.logistics_stock_ledger for each row execute function public.smpt_reject_logistics_history_mutation(); end if; end $$;

create or replace function public.smpt_new_logistics_event(p_event_type text,p_reference_type text,p_reference_id bigint,p_reference_code text,p_event_date date,p_notes text,p_reversal_of bigint default null) returns bigint
language plpgsql security definer set search_path='' as $$ declare v bigint; begin insert into public.logistics_stock_events(event_type,reference_type,reference_id,reference_code,event_date,notes,reversal_of_event_id) values(p_event_type,p_reference_type,p_reference_id,p_reference_code,coalesce(p_event_date,current_date),p_notes,p_reversal_of) returning id into v; return v; end $$;
revoke all on function public.smpt_new_logistics_event(text,text,bigint,text,date,text,bigint) from public;

create or replace function public.smpt_apply_logistics_stock(p_event_id bigint,p_item_kind text,p_finished_good_id bigint,p_set_id bigint,p_location_id bigint,p_delta numeric,p_unit text,p_kind text,p_notes text default null) returns void
language plpgsql security definer set search_path='' as $$ declare v_id bigint;v_qty numeric; begin
  if coalesce(p_delta,0)=0 then raise exception 'Delta stok tidak boleh nol.'; end if;
  insert into public.logistics_stock_balances(item_kind,finished_good_id,set_id,location_id,quantity)
  values(p_item_kind,p_finished_good_id,p_set_id,p_location_id,0) on conflict do nothing;
  select id,quantity into v_id,v_qty from public.logistics_stock_balances where item_kind=p_item_kind and coalesce(finished_good_id,0)=coalesce(p_finished_good_id,0) and coalesce(set_id,0)=coalesce(p_set_id,0) and location_id=p_location_id for update;
  if v_qty+p_delta<0 then raise exception 'Stok tidak cukup. Tersedia %, diminta %.',v_qty,abs(p_delta); end if;
  update public.logistics_stock_balances set quantity=v_qty+p_delta,updated_at=now() where id=v_id;
  insert into public.logistics_stock_ledger(event_id,item_kind,finished_good_id,set_id,location_id,movement_kind,quantity_delta,unit_snapshot,notes) values(p_event_id,p_item_kind,p_finished_good_id,p_set_id,p_location_id,p_kind,p_delta,p_unit,p_notes);
end $$;
revoke all on function public.smpt_apply_logistics_stock(bigint,text,bigint,bigint,bigint,numeric,text,text,text) from public;

create table if not exists public.qc_inspections (
  id bigint generated always as identity primary key,
  qc_code text not null unique default ('QC-'||lpad(nextval('public.smpt_qc_code_seq')::text,7,'0')),
  production_check_id bigint not null references public.production_checks(id) on delete restrict,
  finished_good_id bigint not null references public.finished_goods(id) on delete restrict,
  inspection_date date not null default current_date,
  inspected_qty numeric(18,4) not null check(inspected_qty>0), good_qty numeric(18,4) not null check(good_qty>=0), reject_qty numeric(18,4) not null check(reject_qty>=0), rework_qty numeric(18,4) not null check(rework_qty>=0),
  notes text, status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')),
  stock_event_id bigint not null references public.logistics_stock_events(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null default auth.uid(), created_at timestamptz not null default now(), cancelled_at timestamptz,
  check(good_qty+reject_qty+rework_qty=inspected_qty)
);
create index if not exists qc_inspections_check_idx on public.qc_inspections(production_check_id,status,inspection_date desc);

create table if not exists public.qc_reworks (
  id bigint generated always as identity primary key,
  rework_code text not null unique default ('RWK-'||lpad(nextval('public.smpt_rework_code_seq')::text,6,'0')),
  qc_inspection_id bigint not null references public.qc_inspections(id) on delete restrict,
  quantity numeric(18,4) not null check(quantity>0), status text not null default 'OPEN' check(status in ('OPEN','SELESAI','DIBATALKAN')),
  result_good_qty numeric(18,4) not null default 0 check(result_good_qty>=0), result_reject_qty numeric(18,4) not null default 0 check(result_reject_qty>=0),
  notes text, stock_event_id bigint references public.logistics_stock_events(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now(),completed_at timestamptz
);

create table if not exists public.finished_goods_transfers (
  id bigint generated always as identity primary key,
  transfer_code text not null unique default ('TRF-'||lpad(nextval('public.smpt_transfer_code_seq')::text,6,'0')),
  transfer_date date not null default current_date, finished_good_id bigint not null references public.finished_goods(id) on delete restrict,
  source_location_id bigint not null references public.locations(id) on delete restrict, destination_location_id bigint not null references public.locations(id) on delete restrict,
  quantity numeric(18,4) not null check(quantity>0), notes text, status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')),
  stock_event_id bigint not null references public.logistics_stock_events(id) on delete restrict, created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now(),
  check(source_location_id<>destination_location_id)
);

create table if not exists public.external_finished_receipts (
  id bigint generated always as identity primary key,
  receipt_code text not null unique default ('EXT-'||lpad(nextval('public.smpt_external_code_seq')::text,6,'0')),
  receipt_date date not null default current_date, finished_good_id bigint not null references public.finished_goods(id) on delete restrict, vendor_id bigint references public.vendors(id) on delete restrict,
  location_id bigint not null references public.locations(id) on delete restrict, quantity numeric(18,4) not null check(quantity>0), document_no text, notes text,
  status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')), stock_event_id bigint not null references public.logistics_stock_events(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now()
);

create table if not exists public.packing_runs (
  id bigint generated always as identity primary key,
  packing_code text not null unique default ('PCK-'||lpad(nextval('public.smpt_pack_code_seq')::text,6,'0')),
  packing_date date not null default current_date,set_id bigint not null references public.product_sets(id) on delete restrict,location_id bigint not null references public.locations(id) on delete restrict,
  set_qty numeric(18,4) not null check(set_qty>0),notes text,status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')),
  stock_event_id bigint not null references public.logistics_stock_events(id) on delete restrict,created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now()
);

create table if not exists public.embarkation_targets (
  id bigint generated always as identity primary key,target_code text not null unique default ('TGT-'||lpad(nextval('public.smpt_target_code_seq')::text,6,'0')),
  embarkation_id bigint not null references public.embarkations(id) on delete restrict,item_kind text not null check(item_kind in ('FINISHED_GOOD','SET')),
  finished_good_id bigint references public.finished_goods(id) on delete restrict,set_id bigint references public.product_sets(id) on delete restrict,
  target_qty numeric(18,4) not null check(target_qty>=0),status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF')),notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check((item_kind='FINISHED_GOOD' and finished_good_id is not null and set_id is null) or (item_kind='SET' and set_id is not null and finished_good_id is null))
);
create unique index if not exists embarkation_target_uq on public.embarkation_targets(embarkation_id,item_kind,coalesce(finished_good_id,0),coalesce(set_id,0));

create table if not exists public.embarkation_shipments (
  id bigint generated always as identity primary key,shipment_code text not null unique default ('SHP-'||lpad(nextval('public.smpt_shipment_code_seq')::text,6,'0')),
  public_token uuid not null unique default gen_random_uuid(),target_id bigint not null references public.embarkation_targets(id) on delete restrict,shipment_date date not null default current_date,
  source_location_id bigint not null references public.locations(id) on delete restrict,quantity numeric(18,4) not null check(quantity>0),document_no text,driver_name text,vehicle_no text,notes text,
  status text not null default 'DISIAPKAN' check(status in ('DISIAPKAN','DIKIRIM','DITERIMA','DIBATALKAN')),
  sent_event_id bigint references public.logistics_stock_events(id) on delete restrict,return_event_id bigint references public.logistics_stock_events(id) on delete restrict,
  received_qty numeric(18,4) not null default 0 check(received_qty>=0),reject_qty numeric(18,4) not null default 0 check(reject_qty>=0),damaged_qty numeric(18,4) not null default 0 check(damaged_qty>=0),missing_qty numeric(18,4) not null default 0 check(missing_qty>=0),
  received_at timestamptz,created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

do $$ begin if not exists(select 1 from pg_trigger where tgname='embarkation_shipments_set_updated_at') then create trigger embarkation_shipments_set_updated_at before update on public.embarkation_shipments for each row execute function public.set_updated_at(); end if; end $$;

create table if not exists public.embarkation_issues (
  id bigint generated always as identity primary key,issue_code text not null unique default ('EMI-'||lpad(nextval('public.smpt_issue_problem_code_seq')::text,6,'0')),
  shipment_id bigint not null references public.embarkation_shipments(id) on delete restrict,issue_type text not null check(issue_type in ('REJECT','RUSAK','KURANG','LAINNYA')),
  quantity numeric(18,4) not null default 0 check(quantity>=0),description text not null,status text not null default 'OPEN' check(status in ('OPEN','SELESAI','DIBATALKAN')),
  resolution text,created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now(),resolved_at timestamptz
);

-- ADMIN master CRUD uses direct RLS. Operational stock writes use RPC below.
create or replace function public.record_quality_control(p_production_check_id bigint,p_inspection_date date,p_good_qty numeric,p_reject_qty numeric,p_rework_qty numeric,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$
declare c public.production_checks%rowtype;i public.production_order_items%rowtype;o public.production_orders%rowtype;v_fg bigint;v_prev numeric;v_total numeric;v_loc bigint;v_event bigint;v_qc bigint;v_unit text;
begin
  if not public.has_permission('qc.operate') then raise exception 'Tidak memiliki izin QC.' using errcode='42501'; end if;
  select * into c from public.production_checks where id=p_production_check_id and status='AKTIF' for update; if not found then raise exception 'Qty Sah Checker tidak ditemukan.'; end if;
  select * into i from public.production_order_items where id=c.order_item_id; select * into o from public.production_orders where id=i.order_id;
  if not i.is_final_output_snapshot then raise exception 'QC hanya menerima item Output Final.'; end if;
  v_total:=coalesce(p_good_qty,0)+coalesce(p_reject_qty,0)+coalesce(p_rework_qty,0); if v_total<=0 then raise exception 'Qty QC wajib lebih besar dari nol.'; end if;
  select coalesce(sum(inspected_qty),0) into v_prev from public.qc_inspections where production_check_id=p_production_check_id and status='AKTIF';
  if v_prev+v_total>c.good_qty then raise exception 'Qty QC melebihi Qty Sah Checker yang belum diperiksa (%).',greatest(c.good_qty-v_prev,0); end if;
  select id,unit into v_fg,v_unit from public.finished_goods where project_id=o.project_id and (product_id is null or product_id=o.product_id) and final_work_item_id=i.work_item_id and status='AKTIF' order by (product_id=o.product_id) desc limit 1;
  if v_fg is null then raise exception 'Master Barang Jadi belum dihubungkan ke Output Final ini.'; end if;
  select id into v_loc from public.locations where name='PUSAT' and status='AKTIF' limit 1; if v_loc is null then raise exception 'Lokasi PUSAT tidak tersedia.'; end if;
  v_event:=public.smpt_new_logistics_event('QC_GOOD','QC',null,null,p_inspection_date,p_notes,null);
  if coalesce(p_good_qty,0)>0 then perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',v_fg,null,v_loc,p_good_qty,v_unit,'QC BAIK',p_notes); end if;
  insert into public.qc_inspections(production_check_id,finished_good_id,inspection_date,inspected_qty,good_qty,reject_qty,rework_qty,notes,stock_event_id)
  values(p_production_check_id,v_fg,coalesce(p_inspection_date,current_date),v_total,p_good_qty,p_reject_qty,p_rework_qty,nullif(btrim(coalesce(p_notes,'')),''),v_event) returning id into v_qc;
  return v_qc;
end $$;
revoke all on function public.record_quality_control(bigint,date,numeric,numeric,numeric,text) from public; grant execute on function public.record_quality_control(bigint,date,numeric,numeric,numeric,text) to authenticated;

create or replace function public.cancel_quality_control(p_qc_id bigint) returns void
language plpgsql security definer set search_path='' as $$ declare q public.qc_inspections%rowtype;v_loc bigint;v_event bigint;v_unit text; begin
  if not public.has_permission('qc.operate') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin membatalkan QC.' using errcode='42501'; end if;
  select * into q from public.qc_inspections where id=p_qc_id for update; if not found or q.status<>'AKTIF' then raise exception 'QC tidak aktif.'; end if;
  if exists(select 1 from public.qc_reworks where qc_inspection_id=p_qc_id and status='OPEN') then raise exception 'Masih ada Rework OPEN.'; end if;
  select id into v_loc from public.locations where name='PUSAT' limit 1; select unit into v_unit from public.finished_goods where id=q.finished_good_id;
  v_event:=public.smpt_new_logistics_event('QC_CANCEL','QC',q.id,q.qc_code,current_date,'Reversal QC',q.stock_event_id);
  if q.good_qty>0 then perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',q.finished_good_id,null,v_loc,-q.good_qty,v_unit,'REVERSAL QC','Batalkan QC'); end if;
  update public.qc_inspections set status='DIBATALKAN',cancelled_at=now() where id=p_qc_id;
end $$;
revoke all on function public.cancel_quality_control(bigint) from public;grant execute on function public.cancel_quality_control(bigint) to authenticated;

create or replace function public.create_qc_rework(p_qc_id bigint,p_quantity numeric,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$ declare q public.qc_inspections%rowtype;v_used numeric;v_id bigint; begin
  if not public.has_permission('qc.rework') then raise exception 'Tidak memiliki izin Rework.' using errcode='42501'; end if;
  select * into q from public.qc_inspections where id=p_qc_id and status='AKTIF' for update; if not found then raise exception 'QC tidak aktif.'; end if;
  select coalesce(sum(quantity),0) into v_used from public.qc_reworks where qc_inspection_id=p_qc_id and status<>'DIBATALKAN';
  if coalesce(p_quantity,0)<=0 or v_used+p_quantity>q.rework_qty then raise exception 'Qty Rework tidak valid. Sisa %.',greatest(q.rework_qty-v_used,0); end if;
  insert into public.qc_reworks(qc_inspection_id,quantity,notes) values(p_qc_id,p_quantity,nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_id;return v_id;
end $$;
revoke all on function public.create_qc_rework(bigint,numeric,text) from public;grant execute on function public.create_qc_rework(bigint,numeric,text) to authenticated;

create or replace function public.complete_qc_rework(p_rework_id bigint,p_good_qty numeric,p_reject_qty numeric,p_notes text default null) returns void
language plpgsql security definer set search_path='' as $$ declare r public.qc_reworks%rowtype;q public.qc_inspections%rowtype;v_loc bigint;v_event bigint;v_unit text; begin
  if not public.has_permission('qc.rework') then raise exception 'Tidak memiliki izin Rework.' using errcode='42501'; end if;
  select * into r from public.qc_reworks where id=p_rework_id for update; if not found or r.status<>'OPEN' then raise exception 'Rework tidak OPEN.'; end if;
  if coalesce(p_good_qty,0)<0 or coalesce(p_reject_qty,0)<0 or p_good_qty+p_reject_qty<>r.quantity then raise exception 'Good + Reject harus sama dengan Qty Rework.'; end if;
  select * into q from public.qc_inspections where id=r.qc_inspection_id;select id into v_loc from public.locations where name='PUSAT' limit 1;select unit into v_unit from public.finished_goods where id=q.finished_good_id;
  if p_good_qty>0 then v_event:=public.smpt_new_logistics_event('REWORK_GOOD','REWORK',r.id,r.rework_code,current_date,p_notes,null);perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',q.finished_good_id,null,v_loc,p_good_qty,v_unit,'REWORK BAIK',p_notes); end if;
  update public.qc_reworks set status='SELESAI',result_good_qty=p_good_qty,result_reject_qty=p_reject_qty,notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),stock_event_id=v_event,completed_at=now() where id=p_rework_id;
end $$;
revoke all on function public.complete_qc_rework(bigint,numeric,numeric,text) from public;grant execute on function public.complete_qc_rework(bigint,numeric,numeric,text) to authenticated;

create or replace function public.transfer_finished_good(p_date date,p_finished_good_id bigint,p_source_location_id bigint,p_destination_location_id bigint,p_quantity numeric,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$ declare v_event bigint;v_id bigint;v_unit text; begin
  if not public.has_permission('transfer_barang_jadi.write') then raise exception 'Tidak memiliki izin transfer Barang Jadi.' using errcode='42501'; end if;
  if p_source_location_id=p_destination_location_id then raise exception 'Lokasi sumber dan tujuan harus berbeda.'; end if;if coalesce(p_quantity,0)<=0 then raise exception 'Qty harus lebih besar dari nol.';end if;
  select unit into v_unit from public.finished_goods where id=p_finished_good_id and status='AKTIF';if v_unit is null then raise exception 'Barang Jadi tidak ditemukan.';end if;
  v_event:=public.smpt_new_logistics_event('TRANSFER_FG','TRANSFER',null,null,p_date,p_notes,null);
  perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',p_finished_good_id,null,p_source_location_id,-p_quantity,v_unit,'TRANSFER KELUAR',p_notes);
  perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',p_finished_good_id,null,p_destination_location_id,p_quantity,v_unit,'TRANSFER MASUK',p_notes);
  insert into public.finished_goods_transfers(transfer_date,finished_good_id,source_location_id,destination_location_id,quantity,notes,stock_event_id) values(coalesce(p_date,current_date),p_finished_good_id,p_source_location_id,p_destination_location_id,p_quantity,p_notes,v_event) returning id into v_id;
    return v_id;
end $$;
revoke all on function public.transfer_finished_good(date,bigint,bigint,bigint,numeric,text) from public;grant execute on function public.transfer_finished_good(date,bigint,bigint,bigint,numeric,text) to authenticated;

create or replace function public.receive_external_finished_good(p_date date,p_finished_good_id bigint,p_vendor_id bigint,p_location_id bigint,p_quantity numeric,p_document_no text,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$ declare v_event bigint;v_id bigint;v_unit text; begin
  if not public.has_permission('barang_luar.receive') then raise exception 'Tidak memiliki izin Barang Luar.' using errcode='42501'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Qty harus lebih besar dari nol.';end if;select unit into v_unit from public.finished_goods where id=p_finished_good_id and status='AKTIF';if v_unit is null then raise exception 'Barang Jadi tidak ditemukan.';end if;
  v_event:=public.smpt_new_logistics_event('EXTERNAL_RECEIPT','BARANG_LUAR',null,null,p_date,p_notes,null);perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',p_finished_good_id,null,p_location_id,p_quantity,v_unit,'BARANG LUAR MASUK',p_notes);
  insert into public.external_finished_receipts(receipt_date,finished_good_id,vendor_id,location_id,quantity,document_no,notes,stock_event_id) values(coalesce(p_date,current_date),p_finished_good_id,p_vendor_id,p_location_id,p_quantity,p_document_no,p_notes,v_event) returning id into v_id;
    return v_id;
end $$;
revoke all on function public.receive_external_finished_good(date,bigint,bigint,bigint,numeric,text,text) from public;grant execute on function public.receive_external_finished_good(date,bigint,bigint,bigint,numeric,text,text) to authenticated;

create or replace function public.pack_product_set(p_date date,p_set_id bigint,p_location_id bigint,p_set_qty numeric,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$ declare v_event bigint;v_id bigint;r record; begin
  if not public.has_permission('packing_set.write') then raise exception 'Tidak memiliki izin Packing Set.' using errcode='42501'; end if;if coalesce(p_set_qty,0)<=0 then raise exception 'Qty SET harus lebih besar dari nol.';end if;
  if not exists(select 1 from public.product_set_components where set_id=p_set_id) then raise exception 'Master Set belum memiliki komponen.';end if;
  v_event:=public.smpt_new_logistics_event('PACK_SET','PACKING_SET',null,null,p_date,p_notes,null);
  for r in select c.finished_good_id,c.qty_per_set,f.unit from public.product_set_components c join public.finished_goods f on f.id=c.finished_good_id where c.set_id=p_set_id loop
    perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',r.finished_good_id,null,p_location_id,-(r.qty_per_set*p_set_qty),r.unit,'PACKING CONSUME',p_notes);
  end loop;
  perform public.smpt_apply_logistics_stock(v_event,'SET',null,p_set_id,p_location_id,p_set_qty,'SET','PACKING SET MASUK',p_notes);
  insert into public.packing_runs(packing_date,set_id,location_id,set_qty,notes,stock_event_id) values(coalesce(p_date,current_date),p_set_id,p_location_id,p_set_qty,p_notes,v_event) returning id into v_id;
    return v_id;
end $$;
revoke all on function public.pack_product_set(date,bigint,bigint,numeric,text) from public;grant execute on function public.pack_product_set(date,bigint,bigint,numeric,text) to authenticated;

create or replace function public.create_embarkation_shipment(p_target_id bigint,p_date date,p_source_location_id bigint,p_quantity numeric,p_document_no text,p_driver text,p_vehicle text,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$ declare v_id bigint; begin
  if not public.has_permission('pengiriman_embarkasi.operate') then raise exception 'Tidak memiliki izin membuat pengiriman.' using errcode='42501'; end if;if coalesce(p_quantity,0)<=0 then raise exception 'Qty pengiriman harus lebih besar dari nol.';end if;
  perform 1 from public.embarkation_targets where id=p_target_id and status='AKTIF';if not found then raise exception 'Target Embarkasi tidak aktif.';end if;
  insert into public.embarkation_shipments(target_id,shipment_date,source_location_id,quantity,document_no,driver_name,vehicle_no,notes) values(p_target_id,coalesce(p_date,current_date),p_source_location_id,p_quantity,p_document_no,p_driver,p_vehicle,p_notes) returning id into v_id;return v_id;
end $$;
revoke all on function public.create_embarkation_shipment(bigint,date,bigint,numeric,text,text,text,text) from public;grant execute on function public.create_embarkation_shipment(bigint,date,bigint,numeric,text,text,text,text) to authenticated;

create or replace function public.send_embarkation_shipment(p_shipment_id bigint) returns void
language plpgsql security definer set search_path='' as $$ declare s public.embarkation_shipments%rowtype;t public.embarkation_targets%rowtype;v_event bigint;v_unit text; begin
  if not public.has_permission('pengiriman_embarkasi.operate') then raise exception 'Tidak memiliki izin mengirim.' using errcode='42501';end if;select * into s from public.embarkation_shipments where id=p_shipment_id for update;if not found or s.status<>'DISIAPKAN' then raise exception 'Pengiriman harus DISIAPKAN.';end if;select * into t from public.embarkation_targets where id=s.target_id;
  v_event:=public.smpt_new_logistics_event('SHIPMENT_SEND','EMBARKASI',s.id,s.shipment_code,s.shipment_date,s.notes,null);
  if t.item_kind='FINISHED_GOOD' then select unit into v_unit from public.finished_goods where id=t.finished_good_id;perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',t.finished_good_id,null,s.source_location_id,-s.quantity,v_unit,'EMBARKASI KELUAR',s.notes);else perform public.smpt_apply_logistics_stock(v_event,'SET',null,t.set_id,s.source_location_id,-s.quantity,'SET','EMBARKASI KELUAR',s.notes);end if;
  update public.embarkation_shipments set status='DIKIRIM',sent_event_id=v_event where id=p_shipment_id;
end $$;
revoke all on function public.send_embarkation_shipment(bigint) from public;grant execute on function public.send_embarkation_shipment(bigint) to authenticated;

create or replace function public.receive_embarkation_shipment(p_shipment_id bigint,p_received numeric,p_reject numeric,p_damaged numeric,p_missing numeric,p_notes text default null) returns void
language plpgsql security definer set search_path='' as $$ declare s public.embarkation_shipments%rowtype; begin
  if not public.has_permission('pengiriman_embarkasi.operate') then raise exception 'Tidak memiliki izin konfirmasi penerimaan.' using errcode='42501';end if;select * into s from public.embarkation_shipments where id=p_shipment_id for update;if not found or s.status<>'DIKIRIM' then raise exception 'Pengiriman harus DIKIRIM.';end if;
  if least(coalesce(p_received,0),coalesce(p_reject,0),coalesce(p_damaged,0),coalesce(p_missing,0))<0 or p_received+p_missing<>s.quantity or p_reject+p_damaged>p_received then raise exception 'Qty penerimaan tidak valid. Diterima + Kurang harus sama dengan Qty Kirim, dan Reject + Rusak tidak boleh melebihi Diterima.';end if;
  update public.embarkation_shipments set status='DITERIMA',received_qty=p_received,reject_qty=p_reject,damaged_qty=p_damaged,missing_qty=p_missing,notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),received_at=now() where id=p_shipment_id;
end $$;
revoke all on function public.receive_embarkation_shipment(bigint,numeric,numeric,numeric,numeric,text) from public;grant execute on function public.receive_embarkation_shipment(bigint,numeric,numeric,numeric,numeric,text) to authenticated;

create or replace function public.cancel_embarkation_shipment(p_shipment_id bigint) returns void
language plpgsql security definer set search_path='' as $$ declare s public.embarkation_shipments%rowtype;t public.embarkation_targets%rowtype;v_event bigint;v_unit text;begin
  if not public.has_permission('pengiriman_embarkasi.operate') then raise exception 'Tidak memiliki izin membatalkan pengiriman.' using errcode='42501';end if;select * into s from public.embarkation_shipments where id=p_shipment_id for update;if not found or s.status not in ('DISIAPKAN','DIKIRIM') then raise exception 'Pengiriman tidak dapat dibatalkan.';end if;
  if s.status='DIKIRIM' then select * into t from public.embarkation_targets where id=s.target_id;v_event:=public.smpt_new_logistics_event('SHIPMENT_CANCEL','EMBARKASI',s.id,s.shipment_code,current_date,'Reversal pengiriman',s.sent_event_id);if t.item_kind='FINISHED_GOOD' then select unit into v_unit from public.finished_goods where id=t.finished_good_id;perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',t.finished_good_id,null,s.source_location_id,s.quantity,v_unit,'REVERSAL EMBARKASI','Batalkan pengiriman');else perform public.smpt_apply_logistics_stock(v_event,'SET',null,t.set_id,s.source_location_id,s.quantity,'SET','REVERSAL EMBARKASI','Batalkan pengiriman');end if;end if;
  update public.embarkation_shipments set status='DIBATALKAN',return_event_id=v_event where id=p_shipment_id;
end $$;
revoke all on function public.cancel_embarkation_shipment(bigint) from public;grant execute on function public.cancel_embarkation_shipment(bigint) to authenticated;

create or replace function public.get_public_shipment_tracking(p_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
select jsonb_build_object('shipment_code',s.shipment_code,'shipment_date',s.shipment_date,'status',s.status,'quantity',s.quantity,'received_qty',s.received_qty,'reject_qty',s.reject_qty,'damaged_qty',s.damaged_qty,'missing_qty',s.missing_qty,'document_no',s.document_no,'embarkation',e.name,'item_kind',t.item_kind,'created_at',s.created_at,'received_at',s.received_at)
from public.embarkation_shipments s join public.embarkation_targets t on t.id=s.target_id join public.embarkations e on e.id=t.embarkation_id where s.public_token=p_token limit 1 $$;
revoke all on function public.get_public_shipment_tracking(uuid) from public;grant execute on function public.get_public_shipment_tracking(uuid) to anon,authenticated;

-- Replace Batch 3 checker cancellation with QC guard now that QC exists.
create or replace function public.cancel_checker_result(p_check_id bigint) returns void
language plpgsql security definer set search_path='' as $$ declare v public.production_checks%rowtype;v_order_id bigint;begin
  select * into v from public.production_checks where id=p_check_id for update;if not found or v.status<>'AKTIF' then raise exception 'Hasil Checker tidak aktif.';end if;
  if auth.uid()<>v.checker_user_id and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Hanya Checker pembuat atau ADMIN yang dapat membatalkan.' using errcode='42501';end if;
  if exists(select 1 from public.qc_inspections where production_check_id=p_check_id and status='AKTIF') then raise exception 'Hasil Checker sudah masuk QC. Batalkan QC terlebih dahulu.';end if;
  update public.production_checks set status='DIBATALKAN',cancelled_at=now(),cancelled_by=auth.uid() where id=p_check_id;update public.production_order_items set status='AKTIF' where id=v.order_item_id;select order_id into v_order_id from public.production_order_items where id=v.order_item_id;update public.production_orders set status='AKTIF',completed_at=null,updated_by=auth.uid() where id=v_order_id and status='SELESAI';
end $$;

-- RLS
alter table public.finished_goods enable row level security;alter table public.locations enable row level security;alter table public.vendors enable row level security;alter table public.embarkations enable row level security;alter table public.product_sets enable row level security;alter table public.product_set_components enable row level security;alter table public.logistics_stock_events enable row level security;alter table public.logistics_stock_balances enable row level security;alter table public.logistics_stock_ledger enable row level security;alter table public.qc_inspections enable row level security;alter table public.qc_reworks enable row level security;alter table public.finished_goods_transfers enable row level security;alter table public.external_finished_receipts enable row level security;alter table public.packing_runs enable row level security;alter table public.embarkation_targets enable row level security;alter table public.embarkation_shipments enable row level security;alter table public.embarkation_issues enable row level security;

drop policy if exists finished_goods_select on public.finished_goods;create policy finished_goods_select on public.finished_goods for select to authenticated using(public.has_permission('master_barang_jadi.view') or public.has_permission('stok_barang_jadi.view') or public.has_permission('qc.view') or public.has_permission('packing_set.view') or public.has_permission('target_embarkasi.view'));
drop policy if exists finished_goods_admin_write on public.finished_goods;create policy finished_goods_admin_write on public.finished_goods for all to authenticated using(public.has_permission('master_barang_jadi.write')) with check(public.has_permission('master_barang_jadi.write'));
drop policy if exists locations_select on public.locations;create policy locations_select on public.locations for select to authenticated using(auth.uid() is not null);
drop policy if exists locations_admin_write on public.locations;create policy locations_admin_write on public.locations for all to authenticated using(public.has_permission('master_lokasi.write')) with check(public.has_permission('master_lokasi.write'));
drop policy if exists vendors_select on public.vendors;create policy vendors_select on public.vendors for select to authenticated using(public.has_permission('master_vendor.view') or public.has_permission('barang_luar.view') or public.has_permission('manufaktur.view'));
drop policy if exists vendors_admin_write on public.vendors;create policy vendors_admin_write on public.vendors for all to authenticated using(public.has_permission('master_vendor.write')) with check(public.has_permission('master_vendor.write'));
drop policy if exists embarkations_select on public.embarkations;create policy embarkations_select on public.embarkations for select to authenticated using(public.has_permission('master_embarkasi.view') or public.has_permission('target_embarkasi.view') or public.has_permission('pengiriman_embarkasi.view') or public.has_permission('reject_embarkasi.view'));
drop policy if exists embarkations_admin_write on public.embarkations;create policy embarkations_admin_write on public.embarkations for all to authenticated using(public.has_permission('master_embarkasi.write')) with check(public.has_permission('master_embarkasi.write'));
drop policy if exists sets_select on public.product_sets;create policy sets_select on public.product_sets for select to authenticated using(public.has_permission('master_set.view') or public.has_permission('packing_set.view') or public.has_permission('stok_set.view') or public.has_permission('target_embarkasi.view'));
drop policy if exists set_components_select on public.product_set_components;create policy set_components_select on public.product_set_components for select to authenticated using(public.has_permission('master_set.view') or public.has_permission('packing_set.view') or public.has_permission('stok_set.view'));
drop policy if exists sets_write on public.product_sets;create policy sets_write on public.product_sets for all to authenticated using(public.has_permission('master_set.write')) with check(public.has_permission('master_set.write'));
drop policy if exists set_components_write on public.product_set_components;create policy set_components_write on public.product_set_components for all to authenticated using(public.has_permission('master_set.write')) with check(public.has_permission('master_set.write'));
drop policy if exists logistics_balance_select on public.logistics_stock_balances;create policy logistics_balance_select on public.logistics_stock_balances for select to authenticated using(public.has_permission('stok_barang_jadi.view') or public.has_permission('stok_set.view') or public.has_permission('transfer_barang_jadi.view') or public.has_permission('packing_set.view') or public.has_permission('pengiriman_embarkasi.view'));
drop policy if exists logistics_ledger_select on public.logistics_stock_ledger;create policy logistics_ledger_select on public.logistics_stock_ledger for select to authenticated using(public.has_permission('stok_barang_jadi.view') or public.has_permission('stok_set.view') or public.has_permission('transfer_barang_jadi.view') or public.has_permission('packing_set.view') or public.has_permission('pengiriman_embarkasi.view'));
drop policy if exists logistics_event_select on public.logistics_stock_events;create policy logistics_event_select on public.logistics_stock_events for select to authenticated using(public.has_permission('stok_barang_jadi.view') or public.has_permission('stok_set.view') or public.has_permission('qc.view') or public.has_permission('pengiriman_embarkasi.view'));
drop policy if exists qc_select on public.qc_inspections;create policy qc_select on public.qc_inspections for select to authenticated using(public.has_permission('qc.view'));
drop policy if exists rework_select on public.qc_reworks;create policy rework_select on public.qc_reworks for select to authenticated using(public.has_permission('qc.view'));
drop policy if exists transfers_select on public.finished_goods_transfers;create policy transfers_select on public.finished_goods_transfers for select to authenticated using(public.has_permission('transfer_barang_jadi.view') or public.has_permission('stok_barang_jadi.view'));
drop policy if exists ext_receipts_select on public.external_finished_receipts;create policy ext_receipts_select on public.external_finished_receipts for select to authenticated using(public.has_permission('barang_luar.view') or public.has_permission('stok_barang_jadi.view'));
drop policy if exists packing_select on public.packing_runs;create policy packing_select on public.packing_runs for select to authenticated using(public.has_permission('packing_set.view') or public.has_permission('stok_set.view'));
drop policy if exists targets_select on public.embarkation_targets;create policy targets_select on public.embarkation_targets for select to authenticated using(public.has_permission('target_embarkasi.view') or public.has_permission('pengiriman_embarkasi.view') or public.has_permission('reject_embarkasi.view'));
drop policy if exists shipments_select on public.embarkation_shipments;create policy shipments_select on public.embarkation_shipments for select to authenticated using(public.has_permission('pengiriman_embarkasi.view') or public.has_permission('reject_embarkasi.view'));
drop policy if exists embarkation_issues_select on public.embarkation_issues;create policy embarkation_issues_select on public.embarkation_issues for select to authenticated using(public.has_permission('reject_embarkasi.view'));

drop policy if exists targets_admin_write on public.embarkation_targets;create policy targets_admin_write on public.embarkation_targets for all to authenticated using(public.has_permission('target_embarkasi.write')) with check(public.has_permission('target_embarkasi.write'));
drop policy if exists embarkation_issues_write on public.embarkation_issues;create policy embarkation_issues_write on public.embarkation_issues for insert to authenticated with check(public.has_permission('reject_embarkasi.write'));

grant select,insert,update on public.finished_goods,public.locations,public.vendors,public.embarkations,public.product_sets,public.product_set_components,public.embarkation_targets,public.embarkation_issues to authenticated;
grant select on public.logistics_stock_events,public.logistics_stock_balances,public.logistics_stock_ledger,public.qc_inspections,public.qc_reworks,public.finished_goods_transfers,public.external_finished_receipts,public.packing_runs,public.embarkation_shipments to authenticated;
grant usage,select on sequence public.smpt_finished_good_code_seq,public.smpt_location_code_seq,public.smpt_vendor_code_seq,public.smpt_embarkation_code_seq,public.smpt_set_code_seq,public.smpt_log_stock_event_seq,public.smpt_qc_code_seq,public.smpt_rework_code_seq,public.smpt_transfer_code_seq,public.smpt_external_code_seq,public.smpt_pack_code_seq,public.smpt_target_code_seq,public.smpt_shipment_code_seq,public.smpt_issue_problem_code_seq,public.finished_goods_id_seq,public.locations_id_seq,public.vendors_id_seq,public.embarkations_id_seq,public.product_sets_id_seq,public.product_set_components_id_seq,public.embarkation_targets_id_seq,public.embarkation_issues_id_seq to authenticated;
