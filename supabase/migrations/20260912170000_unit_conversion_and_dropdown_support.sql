-- SMPT V2 - unit conversion hardening
-- Existing stock balances and stock ledger remain in materials.standard_unit.
-- Business documents keep the original transaction quantity/unit plus conversion snapshot.

create or replace function public.smpt_unit_key(p_unit text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare v text:=upper(regexp_replace(btrim(coalesce(p_unit,'')),'[ ._-]+','','g'));
begin
  return case
    when v in ('M','METER','METRE') then 'METER'
    when v in ('YD','YARD','YARDS') then 'YARD'
    when v in ('CM','CENTIMETER','CENTIMETRE') then 'CM'
    when v in ('MM','MILLIMETER','MILLIMETRE') then 'MM'
    when v in ('FT','FOOT','FEET') then 'FT'
    when v in ('IN','INCH','INCHES') then 'INCH'
    when v in ('KG','KILOGRAM','KILOGRAMS') then 'KG'
    when v in ('G','GR','GRAM','GRAMS') then 'GRAM'
    when v in ('MG','MILLIGRAM') then 'MG'
    when v in ('TON','TONNE','TONNES') then 'TON'
    when v in ('L','LTR','LITER','LITRE') then 'LITER'
    when v in ('ML','MILLILITER','MILLILITRE') then 'ML'
    when v in ('PCS','PC','PIECE','PIECES','BUAH') then 'PCS'
    when v in ('DOZEN','DOZ','LUSIN') then 'LUSIN'
    when v in ('ROLL','GULUNG') then 'ROLL'
    else upper(btrim(coalesce(p_unit,'')))
  end;
end; $$;

create or replace function public.smpt_common_unit_family(p_unit text)
returns text
language sql
immutable
set search_path=''
as $$
  select case public.smpt_unit_key(p_unit)
    when 'METER' then 'LENGTH' when 'YARD' then 'LENGTH' when 'CM' then 'LENGTH'
    when 'MM' then 'LENGTH' when 'FT' then 'LENGTH' when 'INCH' then 'LENGTH'
    when 'KG' then 'MASS' when 'GRAM' then 'MASS' when 'MG' then 'MASS' when 'TON' then 'MASS'
    when 'LITER' then 'VOLUME' when 'ML' then 'VOLUME'
    when 'PCS' then 'COUNT' when 'LUSIN' then 'COUNT'
    else null end
$$;

create or replace function public.smpt_common_unit_scale(p_unit text)
returns numeric
language sql
immutable
set search_path=''
as $$
  select case public.smpt_unit_key(p_unit)
    when 'METER' then 1::numeric
    when 'YARD' then 0.9144::numeric
    when 'CM' then 0.01::numeric
    when 'MM' then 0.001::numeric
    when 'FT' then 0.3048::numeric
    when 'INCH' then 0.0254::numeric
    when 'KG' then 1::numeric
    when 'GRAM' then 0.001::numeric
    when 'MG' then 0.000001::numeric
    when 'TON' then 1000::numeric
    when 'LITER' then 1::numeric
    when 'ML' then 0.001::numeric
    when 'PCS' then 1::numeric
    when 'LUSIN' then 12::numeric
    else null end
$$;

create or replace function public.smpt_resolve_conversion_factor(
  p_from_unit text,
  p_to_unit text,
  p_manual_factor numeric default null
)
returns numeric
language plpgsql
immutable
set search_path=''
as $$
declare
  v_from text:=public.smpt_unit_key(p_from_unit);
  v_to text:=public.smpt_unit_key(p_to_unit);
  v_from_family text;
  v_to_family text;
  v_from_scale numeric;
  v_to_scale numeric;
begin
  if coalesce(v_from,'')='' or coalesce(v_to,'')='' then
    raise exception 'Satuan transaksi dan satuan stok wajib tersedia.';
  end if;

  if v_from=v_to then return 1; end if;

  v_from_family:=public.smpt_common_unit_family(v_from);
  v_to_family:=public.smpt_common_unit_family(v_to);
  if v_from_family is not null and v_from_family=v_to_family then
    v_from_scale:=public.smpt_common_unit_scale(v_from);
    v_to_scale:=public.smpt_common_unit_scale(v_to);
    return v_from_scale/v_to_scale;
  end if;

  if p_manual_factor is not null and p_manual_factor>0 then
    return p_manual_factor;
  end if;

  raise exception 'Konversi % ke % belum dikenal. Isi Faktor Konversi (1 % = faktor x %).',
    p_from_unit,p_to_unit,p_from_unit,p_to_unit;
end; $$;

alter table public.warehouse_receipts add column if not exists input_quantity numeric(18,4);
alter table public.warehouse_receipts add column if not exists input_unit text;
alter table public.warehouse_receipts add column if not exists conversion_factor numeric(20,10);
update public.warehouse_receipts
set input_quantity=coalesce(input_quantity,quantity),
    input_unit=coalesce(nullif(input_unit,''),unit_snapshot),
    conversion_factor=coalesce(conversion_factor,1)
where input_quantity is null or input_unit is null or conversion_factor is null;
alter table public.warehouse_receipts alter column input_quantity set not null;
alter table public.warehouse_receipts alter column input_unit set not null;
alter table public.warehouse_receipts alter column conversion_factor set not null;
alter table public.warehouse_receipts add constraint warehouse_receipts_conversion_factor_positive check(conversion_factor>0) not valid;
alter table public.warehouse_receipts validate constraint warehouse_receipts_conversion_factor_positive;

alter table public.warehouse_issues add column if not exists input_quantity numeric(18,4);
alter table public.warehouse_issues add column if not exists input_unit text;
alter table public.warehouse_issues add column if not exists conversion_factor numeric(20,10);
update public.warehouse_issues
set input_quantity=coalesce(input_quantity,quantity),
    input_unit=coalesce(nullif(input_unit,''),unit_snapshot),
    conversion_factor=coalesce(conversion_factor,1)
where input_quantity is null or input_unit is null or conversion_factor is null;
alter table public.warehouse_issues alter column input_quantity set not null;
alter table public.warehouse_issues alter column input_unit set not null;
alter table public.warehouse_issues alter column conversion_factor set not null;
alter table public.warehouse_issues add constraint warehouse_issues_conversion_factor_positive check(conversion_factor>0) not valid;
alter table public.warehouse_issues validate constraint warehouse_issues_conversion_factor_positive;

-- Remove old signatures. Applied migration history is not rewritten; only function overloads are replaced here.
drop function if exists public.create_warehouse_receipt(date,bigint,numeric,text,text,text);
drop function if exists public.update_warehouse_receipt(bigint,date,numeric,text,text,text);
drop function if exists public.fulfill_material_request_item(bigint,date,numeric,bigint,text,text,text);
drop function if exists public.direct_warehouse_issue_material(date,bigint,bigint,bigint,text,numeric,bigint,text,text);

create or replace function public.create_warehouse_receipt(
  p_receipt_date date,
  p_material_id bigint,
  p_quantity numeric,
  p_input_unit text default null,
  p_conversion_factor numeric default null,
  p_supplier text default null,
  p_document_no text default null,
  p_notes text default null
)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_code text;
  v_standard_unit text;
  v_input_unit text;
  v_factor numeric;
  v_standard_qty numeric(18,4);
  v_event bigint;
begin
  if not public.has_permission('barang_masuk_gudang.write') then
    raise exception 'Tidak memiliki izin Barang Masuk Gudang.' using errcode='42501';
  end if;
  if p_receipt_date is null or p_quantity is null or p_quantity<=0 then
    raise exception 'Tanggal dan qty wajib valid.';
  end if;

  select standard_unit into v_standard_unit
  from public.materials where id=p_material_id and status='AKTIF';
  if v_standard_unit is null then raise exception 'Master Bahan tidak ditemukan/aktif.'; end if;

  v_input_unit:=coalesce(nullif(btrim(coalesce(p_input_unit,'')),''),v_standard_unit);
  v_factor:=public.smpt_resolve_conversion_factor(v_input_unit,v_standard_unit,p_conversion_factor);
  v_standard_qty:=round((p_quantity*v_factor)::numeric,4);
  if v_standard_qty<=0 then raise exception 'Hasil konversi qty tidak valid.'; end if;

  v_code:='BMG-'||lpad(nextval('public.smpt_receipt_code_seq')::text,6,'0');
  v_event:=public.smpt_create_stock_event('WAREHOUSE_RECEIPT',p_receipt_date,null,null,'BARANG_MASUK_GUDANG',v_code,null,p_notes);
  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',p_material_id,null,'GUDANG_BAHAN',null,null,null,v_standard_qty,'BARANG MASUK GUDANG',p_notes);

  insert into public.warehouse_receipts(
    receipt_code,receipt_date,material_id,quantity,unit_snapshot,
    input_quantity,input_unit,conversion_factor,supplier,document_no,notes,base_event_id
  ) values(
    v_code,p_receipt_date,p_material_id,v_standard_qty,v_standard_unit,
    round(p_quantity::numeric,4),public.smpt_unit_key(v_input_unit),v_factor,
    nullif(btrim(coalesce(p_supplier,'')),''),nullif(btrim(coalesce(p_document_no,'')),''),
    nullif(btrim(coalesce(p_notes,'')),''),v_event
  );
  return v_code;
end; $$;

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
  if not public.has_permission('barang_masuk_gudang.write') then
    raise exception 'Tidak memiliki izin Barang Masuk Gudang.' using errcode='42501';
  end if;
  select * into v_r from public.warehouse_receipts where id=p_receipt_id for update;
  if not found then raise exception 'Barang Masuk tidak ditemukan.'; end if;
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

  update public.warehouse_receipts set
    receipt_date=p_receipt_date,
    quantity=v_standard_qty,
    unit_snapshot=v_standard_unit,
    input_quantity=round(p_quantity::numeric,4),
    input_unit=public.smpt_unit_key(v_input_unit),
    conversion_factor=v_factor,
    supplier=nullif(btrim(coalesce(p_supplier,'')),''),
    document_no=nullif(btrim(coalesce(p_document_no,'')),''),
    notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_by=auth.uid(),updated_at=now()
  where id=p_receipt_id;
end; $$;

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
returns text language plpgsql security definer set search_path='' as $$
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
  else
    v_name:=btrim(coalesce(p_recipient_name,''));
  end if;
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
    if v_r.purpose='SABLON' then v_src:='GUDANG_HASIL_SABLON';
    elsif v_r.purpose='PRODUKSI' then
      if v_state='HASIL_SABLON' then v_src:='GUDANG_HASIL_SELESAI_SABLON'; else v_src:='GUDANG_HASIL_BELUM'; end if;
    else raise exception 'Hasil Cutting tidak boleh dikirim ke Cutting.';
    end if;
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

  update public.material_request_items
  set fulfilled_qty=fulfilled_qty+v_qty,
      status=case when fulfilled_qty+v_qty>=requested_qty then 'DIPENUHI' else 'AKTIF' end,
      updated_at=now()
  where id=v_i.id;

  select not exists(
    select 1 from public.material_request_items
    where request_id=v_r.id and status<>'DIBATALKAN' and fulfilled_qty<requested_qty
  ) into v_all_done;

  update public.material_requests
  set status=case when v_all_done then 'SELESAI' else 'SEBAGIAN' end,
      completed_at=case when v_all_done then now() else null end,
      updated_by=auth.uid(),updated_at=now()
  where id=v_r.id;

  return v_issue;
end; $$;

create or replace function public.direct_warehouse_issue_material(
  p_issue_date date,
  p_project_id bigint,
  p_product_id bigint,
  p_bom_requirement_id bigint,
  p_purpose text,
  p_quantity numeric,
  p_unit text,
  p_conversion_factor numeric,
  p_recipient_worker_id bigint,
  p_recipient_name text,
  p_notes text default null
)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_b public.bom_requirements%rowtype;
  v_name text;
  v_dest text;
  v_purpose text:=upper(btrim(coalesce(p_purpose,'')));
  v_event bigint;
  v_issue text;
  v_standard_unit text;
  v_input_unit text;
  v_factor numeric;
  v_stock_qty numeric(18,4);
begin
  if not public.has_permission('barang_keluar_gudang.write') then
    raise exception 'Tidak memiliki izin Barang Keluar Gudang.' using errcode='42501';
  end if;
  if p_issue_date is null or p_quantity is null or p_quantity<=0 then raise exception 'Tanggal dan qty wajib valid.'; end if;
  if v_purpose not in ('CUTTING','SABLON','PRODUKSI') then raise exception 'Tujuan tidak valid.'; end if;

  select * into v_b from public.bom_requirements
  where id=p_bom_requirement_id and project_id=p_project_id and component_type='BAHAN' and status='AKTIF'
    and (product_id is null or product_id is not distinct from p_product_id);
  if not found then raise exception 'Bahan BOM tidak ditemukan.'; end if;

  select standard_unit into v_standard_unit from public.materials where id=v_b.material_id and status='AKTIF';
  if v_standard_unit is null then raise exception 'Master Bahan tidak ditemukan/aktif.'; end if;
  v_input_unit:=coalesce(nullif(btrim(coalesce(p_unit,'')),''),v_b.unit,v_standard_unit);
  v_factor:=public.smpt_resolve_conversion_factor(v_input_unit,v_standard_unit,p_conversion_factor);
  v_stock_qty:=round((p_quantity*v_factor)::numeric,4);

  if p_recipient_worker_id is not null then
    select name into v_name from public.workers where id=p_recipient_worker_id and status='AKTIF';
  else
    v_name:=btrim(coalesce(p_recipient_name,''));
  end if;
  if coalesce(v_name,'')='' then raise exception 'Nama pengambil wajib diisi.'; end if;

  v_dest:=case v_purpose when 'CUTTING' then 'CUTTING' when 'SABLON' then 'SABLON' else 'SIAP_PRODUKSI' end;
  v_issue:='BK-'||lpad(nextval('public.smpt_issue_code_seq')::text,6,'0');
  v_event:=public.smpt_create_stock_event('WAREHOUSE_ISSUE',p_issue_date,p_project_id,p_product_id,'LANGSUNG',v_issue,null,p_notes);

  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_b.material_id,null,'GUDANG_BAHAN',null,null,null,-v_stock_qty,'BARANG KELUAR GUDANG',p_notes);
  perform public.smpt_apply_stock_delta(v_event,'MATERIAL',v_b.material_id,null,v_dest,p_project_id,p_product_id,v_b.id,v_stock_qty,'TERIMA DARI GUDANG',p_notes);

  insert into public.warehouse_issues(
    issue_code,issue_date,source,project_id,product_id,purpose,source_type,bom_requirement_id,material_id,
    item_name_snapshot,quantity,unit_snapshot,input_quantity,input_unit,conversion_factor,
    recipient_worker_id,recipient_name,notes,stock_event_id
  ) values(
    v_issue,p_issue_date,'LANGSUNG',p_project_id,p_product_id,v_purpose,'BAHAN BAKU',v_b.id,v_b.material_id,
    v_b.component_name,v_stock_qty,v_standard_unit,round(p_quantity::numeric,4),public.smpt_unit_key(v_input_unit),v_factor,
    p_recipient_worker_id,v_name,nullif(btrim(coalesce(p_notes,'')),''),v_event
  );
  return v_issue;
end; $$;

revoke all on function public.smpt_unit_key(text) from public;
revoke all on function public.smpt_common_unit_family(text) from public;
revoke all on function public.smpt_common_unit_scale(text) from public;
revoke all on function public.smpt_resolve_conversion_factor(text,text,numeric) from public;
revoke all on function public.create_warehouse_receipt(date,bigint,numeric,text,numeric,text,text,text) from public;
revoke all on function public.update_warehouse_receipt(bigint,date,numeric,text,numeric,text,text,text) from public;
revoke all on function public.fulfill_material_request_item(bigint,date,numeric,bigint,text,numeric,text,text) from public;
revoke all on function public.direct_warehouse_issue_material(date,bigint,bigint,bigint,text,numeric,text,numeric,bigint,text,text) from public;

grant execute on function public.smpt_unit_key(text) to authenticated;
grant execute on function public.smpt_common_unit_family(text) to authenticated;
grant execute on function public.smpt_common_unit_scale(text) to authenticated;
grant execute on function public.smpt_resolve_conversion_factor(text,text,numeric) to authenticated;
grant execute on function public.create_warehouse_receipt(date,bigint,numeric,text,numeric,text,text,text) to authenticated;
grant execute on function public.update_warehouse_receipt(bigint,date,numeric,text,numeric,text,text,text) to authenticated;
grant execute on function public.fulfill_material_request_item(bigint,date,numeric,bigint,text,numeric,text,text) to authenticated;
grant execute on function public.direct_warehouse_issue_material(date,bigint,bigint,bigint,text,numeric,text,numeric,bigint,text,text) to authenticated;
