-- ============================================================
-- SMPT V2 - SPV WIP REQUEST + GUDANG INBOX
-- New migration only. Do not edit previous migrations.
--
-- Goals:
-- 1) SPV can explicitly request Hasil Cutting OR Hasil Sablon for PRODUKSI.
-- 2) Gudang fulfills the exact WIP source selected by SPV.
-- 3) Existing legacy request rows remain valid.
-- ============================================================

-- Expand WIP source vocabulary without changing existing rows.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.material_request_items'::regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) ilike '%source_type%'
  loop
    execute pg_catalog.format(
      'alter table public.material_request_items drop constraint %I',
      r.conname
    );
  end loop;
end
$$;

alter table public.material_request_items
  add constraint material_request_items_source_type_check_v2
  check (source_type in ('BAHAN BAKU','HASIL CUTTING','HASIL SABLON')),
  add constraint material_request_items_source_reference_check_v2
  check (
    (source_type='BAHAN BAKU' and bom_requirement_id is not null and material_id is not null and cutting_component_id is null)
    or
    (source_type in ('HASIL CUTTING','HASIL SABLON') and cutting_component_id is not null and bom_requirement_id is null and material_id is null)
  );

do $$
declare r record;
begin
  for r in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.warehouse_issues'::regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) ilike '%source_type%'
  loop
    execute pg_catalog.format(
      'alter table public.warehouse_issues drop constraint %I',
      r.conname
    );
  end loop;
end
$$;

alter table public.warehouse_issues
  add constraint warehouse_issues_source_type_check_v2
  check (source_type in ('BAHAN BAKU','HASIL CUTTING','HASIL SABLON'));

create or replace function public.add_material_request_item(
  p_request_id bigint,
  p_source_type text,
  p_reference_id bigint,
  p_quantity numeric,
  p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_r public.material_requests%rowtype;
  v_b public.bom_requirements%rowtype;
  v_c public.cutting_components%rowtype;
  v_id bigint;
  v_code text;
  v_source text:=upper(btrim(coalesce(p_source_type,'')));
begin
  if not public.has_permission('permintaan_produksi.write') then
    raise exception 'Tidak memiliki izin Permintaan Barang.' using errcode='42501';
  end if;
  if p_quantity is null or p_quantity<=0 then
    raise exception 'Qty harus lebih dari 0.';
  end if;

  select * into v_r
  from public.material_requests
  where id=p_request_id
  for update;

  if not found or v_r.status<>'DRAFT' then
    raise exception 'Draft permintaan tidak ditemukan.';
  end if;

  v_code:='PRD-DTL-'||lpad(nextval('public.smpt_request_item_code_seq')::text,6,'0');

  if v_source='BAHAN BAKU' then
    select * into v_b
    from public.bom_requirements
    where id=p_reference_id
      and project_id=v_r.project_id
      and component_type='BAHAN'
      and status='AKTIF'
      and (product_id is null or product_id is not distinct from v_r.product_id);

    if not found then
      raise exception 'Bahan BOM tidak ditemukan.';
    end if;

    insert into public.material_request_items(
      detail_code,request_id,source_type,bom_requirement_id,material_id,
      item_name_snapshot,unit_snapshot,requested_qty,notes
    )
    values(
      v_code,v_r.id,'BAHAN BAKU',v_b.id,v_b.material_id,
      v_b.component_name,v_b.unit,round(p_quantity::numeric,4),
      nullif(btrim(coalesce(p_notes,'')),'')
    )
    returning id into v_id;

  elsif v_source in ('HASIL CUTTING','HASIL SABLON') then
    if v_r.purpose='CUTTING' then
      raise exception 'WIP tidak boleh diminta untuk tujuan CUTTING.';
    end if;
    if v_source='HASIL SABLON' and v_r.purpose<>'PRODUKSI' then
      raise exception 'Hasil Sablon hanya dapat diminta untuk tujuan PRODUKSI.';
    end if;

    select * into v_c
    from public.cutting_components
    where id=p_reference_id
      and project_id=v_r.project_id
      and status='AKTIF'
      and (product_id is null or product_id is not distinct from v_r.product_id);

    if not found then
      raise exception 'Komponen WIP tidak ditemukan.';
    end if;

    insert into public.material_request_items(
      detail_code,request_id,source_type,cutting_component_id,
      item_name_snapshot,color_snapshot,unit_snapshot,requested_qty,notes
    )
    values(
      v_code,v_r.id,v_source,v_c.id,
      v_c.name,v_c.color,v_c.unit,round(p_quantity::numeric,4),
      nullif(btrim(coalesce(p_notes,'')),'')
    )
    returning id into v_id;
  else
    raise exception 'Jenis sumber tidak valid.';
  end if;

  return v_id;
end;
$$;

create or replace function public.fulfill_material_request_item(
  p_request_item_id bigint,
  p_issue_date date,
  p_quantity numeric,
  p_recipient_worker_id bigint,
  p_recipient_name text,
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
  v_remaining numeric(18,4);
  v_name text;
  v_event bigint;
  v_issue text;
  v_src text;
  v_dest text;
  v_all_done boolean;
  v_state text:=upper(btrim(coalesce(p_wip_source_state,'')));
begin
  if not public.has_permission('barang_keluar_gudang.write')
     or not public.has_permission('permintaan_produksi.fulfill') then
    raise exception 'Tidak memiliki izin pemenuhan Gudang.' using errcode='42501';
  end if;

  if p_issue_date is null or p_quantity is null or p_quantity<=0 then
    raise exception 'Tanggal dan qty wajib valid.';
  end if;

  select * into v_i
  from public.material_request_items
  where id=p_request_item_id
  for update;
  if not found then
    raise exception 'Detail permintaan tidak ditemukan.';
  end if;

  select * into v_r
  from public.material_requests
  where id=v_i.request_id
  for update;
  if v_r.status not in ('MENUNGGU GUDANG','SEBAGIAN') then
    raise exception 'Permintaan tidak dapat diproses.';
  end if;

  v_qty:=round(p_quantity::numeric,4);
  v_remaining:=round((v_i.requested_qty-v_i.fulfilled_qty)::numeric,4);
  if v_qty>v_remaining then
    raise exception 'Qty melebihi sisa permintaan.';
  end if;

  if p_recipient_worker_id is not null then
    select name into v_name
    from public.workers
    where id=p_recipient_worker_id and status='AKTIF';
  else
    v_name:=btrim(coalesce(p_recipient_name,''));
  end if;
  if coalesce(v_name,'')='' then
    raise exception 'Nama pengambil wajib diisi.';
  end if;

  v_dest:=case v_r.purpose
    when 'CUTTING' then 'CUTTING'
    when 'SABLON' then 'SABLON'
    else 'SIAP_PRODUKSI'
  end;

  v_issue:='BK-'||lpad(nextval('public.smpt_issue_code_seq')::text,6,'0');
  v_event:=public.smpt_create_stock_event(
    'WAREHOUSE_ISSUE',p_issue_date,v_r.project_id,v_r.product_id,
    'PERMINTAAN',v_issue,null,p_notes
  );

  if v_i.source_type='BAHAN BAKU' then
    perform public.smpt_apply_stock_delta(
      v_event,'MATERIAL',v_i.material_id,null,'GUDANG_BAHAN',
      null,null,null,-v_qty,'BARANG KELUAR GUDANG',p_notes
    );
    perform public.smpt_apply_stock_delta(
      v_event,'MATERIAL',v_i.material_id,null,v_dest,
      v_r.project_id,v_r.product_id,v_i.bom_requirement_id,
      v_qty,'TERIMA DARI GUDANG',p_notes
    );
    v_src:='GUDANG_BAHAN';
  else
    if v_r.purpose='SABLON' then
      if v_i.source_type<>'HASIL CUTTING' then
        raise exception 'Hanya Hasil Cutting yang dapat dikirim ke SABLON.';
      end if;
      v_src:='GUDANG_HASIL_SABLON';
    elsif v_r.purpose='PRODUKSI' then
      if v_i.source_type='HASIL SABLON' or v_state='HASIL_SABLON' then
        v_src:='GUDANG_HASIL_SELESAI_SABLON';
      else
        v_src:='GUDANG_HASIL_BELUM';
      end if;
    else
      raise exception 'WIP tidak boleh dikirim ke CUTTING.';
    end if;

    perform public.smpt_apply_stock_delta(
      v_event,'CUTTING_COMPONENT',null,v_i.cutting_component_id,v_src,
      v_r.project_id,v_r.product_id,null,-v_qty,
      'BARANG KELUAR GUDANG',p_notes
    );
    perform public.smpt_apply_stock_delta(
      v_event,'CUTTING_COMPONENT',null,v_i.cutting_component_id,v_dest,
      v_r.project_id,v_r.product_id,null,v_qty,
      'TERIMA DARI GUDANG',p_notes
    );
  end if;

  insert into public.warehouse_issues(
    issue_code,issue_date,source,request_id,request_item_id,project_id,product_id,
    purpose,source_type,bom_requirement_id,cutting_component_id,material_id,
    item_name_snapshot,color_snapshot,quantity,unit_snapshot,
    recipient_worker_id,recipient_name,supervisor_worker_id,notes,stock_event_id
  )
  values(
    v_issue,p_issue_date,'PERMINTAAN',v_r.id,v_i.id,v_r.project_id,v_r.product_id,
    v_r.purpose,v_i.source_type,v_i.bom_requirement_id,v_i.cutting_component_id,v_i.material_id,
    v_i.item_name_snapshot,v_i.color_snapshot,v_qty,v_i.unit_snapshot,
    p_recipient_worker_id,v_name,v_r.supervisor_worker_id,
    nullif(btrim(coalesce(p_notes,'')),''),v_event
  );

  update public.material_request_items
  set fulfilled_qty=fulfilled_qty+v_qty,
      status=case when fulfilled_qty+v_qty>=requested_qty then 'DIPENUHI' else 'AKTIF' end,
      updated_at=now()
  where id=v_i.id;

  select not exists(
    select 1
    from public.material_request_items
    where request_id=v_r.id
      and status<>'DIBATALKAN'
      and fulfilled_qty<requested_qty
  ) into v_all_done;

  update public.material_requests
  set status=case when v_all_done then 'SELESAI' else 'SEBAGIAN' end,
      completed_at=case when v_all_done then now() else null end,
      updated_by=auth.uid(),
      updated_at=now()
  where id=v_r.id;

  return v_issue;
end;
$$;

revoke all on function public.add_material_request_item(bigint,text,bigint,numeric,text) from public;
grant execute on function public.add_material_request_item(bigint,text,bigint,numeric,text) to authenticated;

revoke all on function public.fulfill_material_request_item(bigint,date,numeric,bigint,text,text,text) from public;
grant execute on function public.fulfill_material_request_item(bigint,date,numeric,bigint,text,text,text) to authenticated;

-- A USER/SUPERVISOR who is explicitly allowed to create/view production
-- requests must be able to see the stock availability used by the request UI.
drop policy if exists stock_balances_request_select on public.stock_balances;
create policy stock_balances_request_select
on public.stock_balances
for select
to authenticated
using (public.has_permission('permintaan_produksi.view'));
