


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_material_request_item"("p_request_id" bigint, "p_source_type" "text", "p_reference_id" bigint, "p_quantity" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."add_material_request_item"("p_request_id" bigint, "p_source_type" "text", "p_reference_id" bigint, "p_quantity" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_production_order_item"("p_order_id" bigint, "p_work_item_id" bigint, "p_assigned_qty" numeric) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  v_existing_item_id bigint;
begin
  if not public.has_permission('spk.write') then
    raise exception 'Tidak memiliki izin mengubah SPK.' using errcode='42501';
  end if;

  select * into v_order from public.production_orders where id=p_order_id for update;
  if not found or v_order.status not in ('DRAFT', 'AKTIF') then
    raise exception 'SPK harus berstatus DRAFT atau AKTIF.';
  end if;

  if coalesce(p_assigned_qty,0)<=0 then
    raise exception 'Qty penugasan harus lebih besar dari nol.';
  end if;

  -- KUNCI: Cek jika item ini sudah pernah diinput/diperiksa oleh Checker pada SPK ini
  select id into v_existing_item_id
  from public.production_order_items
  where order_id = p_order_id and work_item_id = p_work_item_id;

  if v_existing_item_id is not null then
    if exists (
      select 1 from public.production_checks pc
      where pc.order_item_id = v_existing_item_id
        and pc.status = 'AKTIF'
        and (pc.good_qty + pc.reject_qty) > 0
    ) then
      raise exception 'Item pekerjaan ini sudah diperiksa/dihitung oleh Checker dan tidak dapat diubah lagi.';
    end if;
  end if;

  v:=public.smpt_work_item_snapshot(p_work_item_id);
  if (v->>'status')<>'AKTIF' then raise exception 'Item pekerjaan NONAKTIF.'; end if;
  v_project:=(v->>'project_id')::bigint;
  v_product:=(v->>'product_id')::bigint;
  if v_project is not null and v_project<>v_order.project_id then raise exception 'Item pekerjaan tidak sesuai proyek SPK.'; end if;
  if v_product is not null and v_product<>v_order.product_id then raise exception 'Item pekerjaan tidak sesuai Produk SPK.'; end if;

  perform 1 from public.work_items
  where id=p_work_item_id and executor_scope in ('OPERATOR_BORONGAN','KEDUANYA');
  if not found then
    raise exception 'Item Pekerjaan ini dikonfigurasi khusus Pekerja HARIAN dan tidak boleh dimasukkan ke SPK Operator BORONGAN.';
  end if;

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

  -- Update timestamp SPK agar Checker mengetahui ada pembaharuan dari SPV
  update public.production_orders
  set updated_at = now()
  where id = p_order_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."add_production_order_item"("p_order_id" bigint, "p_work_item_id" bigint, "p_assigned_qty" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_checker_result"("p_check_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."cancel_checker_result"("p_check_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_cutting_material_usage"("p_usage_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."cancel_cutting_material_usage"("p_usage_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_cutting_result"("p_result_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."cancel_cutting_result"("p_result_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_embarkation_shipment"("p_shipment_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare s public.embarkation_shipments%rowtype;t public.embarkation_targets%rowtype;v_event bigint;v_unit text;begin
  if not public.has_permission('pengiriman_embarkasi.operate') then raise exception 'Tidak memiliki izin membatalkan pengiriman.' using errcode='42501';end if;select * into s from public.embarkation_shipments where id=p_shipment_id for update;if not found or s.status not in ('DISIAPKAN','DIKIRIM') then raise exception 'Pengiriman tidak dapat dibatalkan.';end if;
  if s.status='DIKIRIM' then select * into t from public.embarkation_targets where id=s.target_id;v_event:=public.smpt_new_logistics_event('SHIPMENT_CANCEL','EMBARKASI',s.id,s.shipment_code,current_date,'Reversal pengiriman',s.sent_event_id);if t.item_kind='FINISHED_GOOD' then select unit into v_unit from public.finished_goods where id=t.finished_good_id;perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',t.finished_good_id,null,s.source_location_id,s.quantity,v_unit,'REVERSAL EMBARKASI','Batalkan pengiriman');else perform public.smpt_apply_logistics_stock(v_event,'SET',null,t.set_id,s.source_location_id,s.quantity,'SET','REVERSAL EMBARKASI','Batalkan pengiriman');end if;end if;
  update public.embarkation_shipments set status='DIBATALKAN',return_event_id=v_event where id=p_shipment_id;
end $$;


ALTER FUNCTION "public"."cancel_embarkation_shipment"("p_shipment_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_external_finished_receipt"("p_receipt_id" bigint, "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_r public.external_finished_receipts%rowtype;
  v_unit text;
  v_event bigint;
begin
  if not public.has_permission('barang_luar.receive') 
     and upper(coalesce(public.current_user_role(), '')) <> 'ADMIN' then
    raise exception 'Tidak memiliki izin membatalkan penerimaan barang luar.' using errcode = '42501';
  end if;

  select * into v_r from public.external_finished_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'Penerimaan barang luar tidak ditemukan.';
  end if;

  if v_r.status = 'DIBATALKAN' then
    raise exception 'Penerimaan ini sudah dibatalkan sebelumnya.';
  end if;

  select unit into v_unit from public.finished_goods where id = v_r.finished_good_id;

  -- Reversal stok di inventaris
  v_event := public.smpt_new_logistics_event(
    'CANCEL_EXTERNAL_RECEIPT',
    'BARANG_LUAR',
    v_r.id,
    v_r.receipt_code,
    current_date,
    coalesce(p_reason, 'Pembatalan Penerimaan Barang Luar'),
    null
  );

  perform public.smpt_apply_logistics_stock(
    v_event,
    'FINISHED_GOOD',
    v_r.finished_good_id,
    null,
    v_r.location_id,
    -v_r.quantity,
    coalesce(v_unit, 'PCS'),
    'PEMBATALAN BARANG LUAR',
    p_reason
  );

  update public.external_finished_receipts
  set status = 'DIBATALKAN',
      notes = case 
        when notes is null or btrim(notes) = '' then 'Batal: ' || coalesce(p_reason, 'Manual')
        else notes || ' | Batal: ' || coalesce(p_reason, 'Manual')
      end
  where id = p_receipt_id;
end;
$$;


ALTER FUNCTION "public"."cancel_external_finished_receipt"("p_receipt_id" bigint, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_manual_production_result"("p_result_id" bigint, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_result public.production_manual_results%rowtype;
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
begin
  if not public.has_permission('hasil_produksi.write') then
    raise exception 'Tidak memiliki izin membatalkan Hasil Produksi manual.' using errcode='42501';
  end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Alasan pembatalan wajib diisi.'; end if;
  if v_email='' then raise exception 'Email akun login tidak tersedia untuk audit trail.'; end if;

  select * into v_result from public.production_manual_results where id=p_result_id for update;
  if not found then raise exception 'Hasil manual tidak ditemukan.'; end if;
  if v_result.status<>'AKTIF' then raise exception 'Hasil manual ini sudah dibatalkan.'; end if;
  if exists(
    select 1 from public.operator_payroll_runs r
    where r.status='FINAL' and v_result.result_date between r.period_start and r.period_end
  ) then
    raise exception 'Hasil manual tidak boleh dibatalkan setelah periode Payroll Operator sudah FINAL. Batalkan/rekonsiliasi payroll terlebih dahulu.';
  end if;

  update public.production_manual_results
  set status='DIBATALKAN',
      cancelled_by=auth.uid(),
      cancelled_by_email_snapshot=v_email,
      cancelled_at=now(),
      cancellation_reason=btrim(p_reason)
  where id=p_result_id;
end;
$$;


ALTER FUNCTION "public"."cancel_manual_production_result"("p_result_id" bigint, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_manufacturing_transaction"("p_id" bigint, "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_m public.manufacturing_transactions%rowtype;
  v_loc bigint;
  v_unit text;
  v_event bigint;
begin
  select * into v_m from public.manufacturing_transactions where id = p_id for update;
  if not found then
    raise exception 'Transaksi manufaktur tidak ditemukan.';
  end if;

  if v_m.status = 'DIBATALKAN' then
    raise exception 'Transaksi sudah dibatalkan sebelumnya.';
  end if;

  -- Jika alur BARANG_LUAR dengan stok masuk, reverse stoknya
  if v_m.flow_type = 'BARANG_LUAR' and v_m.finished_good_id is not null and v_m.quantity > 0 then
    select id into v_loc from public.locations where name = 'PUSAT' limit 1;
    select unit into v_unit from public.finished_goods where id = v_m.finished_good_id;
    
    v_event := public.smpt_new_logistics_event(
      'CANCEL_MANUFACTURING_BARANG_LUAR',
      'MANUFAKTUR',
      v_m.id,
      v_m.manufacturing_code,
      current_date,
      coalesce(p_reason, 'Pembatalan Manufaktur Barang Luar'),
      null
    );

    perform public.smpt_apply_logistics_stock(
      v_event,
      'FINISHED_GOOD',
      v_m.finished_good_id,
      null,
      v_loc,
      -v_m.quantity,
      coalesce(v_unit, 'PCS'),
      'PEMBATALAN MANUFAKTUR MASUK',
      p_reason
    );
  end if;

  update public.manufacturing_transactions
  set status = 'DIBATALKAN',
      description = case 
        when description is null or btrim(description) = '' then 'Batal: ' || coalesce(p_reason, 'Manual')
        else description || ' | Batal: ' || coalesce(p_reason, 'Manual')
      end
  where id = p_id;
end;
$$;


ALTER FUNCTION "public"."cancel_manufacturing_transaction"("p_id" bigint, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_material_request"("p_request_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_fulfilled numeric;
begin
  if not public.has_permission('permintaan_produksi.write') then raise exception 'Tidak memiliki izin Permintaan Barang.' using errcode='42501'; end if;
  perform 1 from public.material_requests where id=p_request_id and status not in ('SELESAI','DIBATALKAN') for update; if not found then raise exception 'Permintaan tidak dapat dibatalkan.'; end if;
  select coalesce(sum(fulfilled_qty),0) into v_fulfilled from public.material_request_items where request_id=p_request_id; if v_fulfilled>0 then raise exception 'Permintaan yang sudah memiliki Barang Keluar tidak dapat dibatalkan.'; end if;
  update public.material_requests set status='DIBATALKAN',updated_by=auth.uid(),updated_at=now() where id=p_request_id;
  update public.material_request_items set status='DIBATALKAN',updated_at=now() where request_id=p_request_id;
end; $$;


ALTER FUNCTION "public"."cancel_material_request"("p_request_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_production_order"("p_order_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.has_permission('spk.write') then raise exception 'Tidak memiliki izin membatalkan SPK.' using errcode='42501'; end if;
  perform 1 from public.production_orders where id=p_order_id and status in ('DRAFT','AKTIF') for update;
  if not found then raise exception 'SPK tidak dapat dibatalkan.'; end if;
  if exists(select 1 from public.production_order_items i join public.production_checks c on c.order_item_id=i.id where i.order_id=p_order_id and c.status='AKTIF') then
    raise exception 'SPK sudah memiliki Qty Sah Checker. Batalkan hasil Checker terlebih dahulu.';
  end if;
  update public.production_orders set status='DIBATALKAN',cancelled_at=now(),updated_by=auth.uid() where id=p_order_id;
  update public.production_order_items set status='DIBATALKAN' where order_id=p_order_id;
end $$;


ALTER FUNCTION "public"."cancel_production_order"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_quality_control"("p_qc_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare q public.qc_inspections%rowtype;v_loc bigint;v_event bigint;v_unit text; begin
  if not public.has_permission('qc.operate') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin membatalkan QC.' using errcode='42501'; end if;
  select * into q from public.qc_inspections where id=p_qc_id for update; if not found or q.status<>'AKTIF' then raise exception 'QC tidak aktif.'; end if;
  if exists(select 1 from public.qc_reworks where qc_inspection_id=p_qc_id and status='OPEN') then raise exception 'Masih ada Rework OPEN.'; end if;
  select id into v_loc from public.locations where name='PUSAT' limit 1; select unit into v_unit from public.finished_goods where id=q.finished_good_id;
  v_event:=public.smpt_new_logistics_event('QC_CANCEL','QC',q.id,q.qc_code,current_date,'Reversal QC',q.stock_event_id);
  if q.good_qty>0 then perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',q.finished_good_id,null,v_loc,-q.good_qty,v_unit,'REVERSAL QC','Batalkan QC'); end if;
  update public.qc_inspections set status='DIBATALKAN',cancelled_at=now() where id=p_qc_id;
end $$;


ALTER FUNCTION "public"."cancel_quality_control"("p_qc_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_ready_production_lot_usage"("p_usage_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."cancel_ready_production_lot_usage"("p_usage_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_warehouse_receipt"("p_receipt_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."cancel_warehouse_receipt"("p_receipt_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."commit_secure_attendance_import"("p_source_file" "text", "p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r jsonb;
  v_idx bigint;
  v_batch_id bigint;
  v_import_code text;
  v_total int:=0;
  v_matched int:=0;
  v_problem_count int:=0;
  v_duplicate int:=0;
  v_verified int:=0;
  v_manual int:=0;
  v_unregistered int:=0;
  v_raw_new int:=0;
  v_final_new int:=0;
  v_final_update int:=0;
  v_finger text;
  v_norm text;
  v_date date;
  v_in time;
  v_out time;
  v_schedule text[];
  v_schedule_in time;
  v_schedule_out time;
  v_worker_id bigint;
  v_match_count int;
  v_problem text;
  v_hash text;
  v_raw_id bigint;
  a public.attendance_records%rowtype;
begin
  if not public.has_permission('absensi.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin import Absensi.' using errcode='42501';
  end if;
  if btrim(coalesce(p_source_file,''))='' or length(p_source_file)>255 then raise exception 'Nama file sumber tidak valid.'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Data import tidak valid.'; end if;
  if jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>5000 then raise exception 'Jumlah baris import harus 1-5000.'; end if;

  insert into public.attendance_import_batches(source_file)
  values(btrim(p_source_file)) returning id,import_code into v_batch_id,v_import_code;

  for r,v_idx in select value,ordinality from jsonb_array_elements(p_rows) with ordinality loop
    v_total:=v_total+1;
    v_finger:=btrim(coalesce(r->>'idFinger',''));
    v_norm:=public.smpt_normalize_finger_id(v_finger);
    v_date:=public.smpt_secure_date(r->>'tanggal');
    v_in:=public.smpt_secure_time(r->>'jamMasuk');
    v_out:=public.smpt_secure_time(r->>'jamKeluar');
    v_schedule_in:=null;v_schedule_out:=null;
    v_schedule:=regexp_match(coalesce(r->>'jamKerja',''),'([0-9]{1,2}:[0-9]{2})\s*[-–—]\s*([0-9]{1,2}:[0-9]{2})');
    if v_schedule is not null then
      v_schedule_in:=public.smpt_secure_time(v_schedule[1]);
      v_schedule_out:=public.smpt_secure_time(v_schedule[2]);
    end if;

    v_worker_id:=null;v_match_count:=0;
    select count(*),min(id) into v_match_count,v_worker_id
    from public.workers
    where status='AKTIF' and public.smpt_normalize_finger_id(finger_id)=v_norm and v_norm<>'';
    if v_match_count>0 then v_matched:=v_matched+1; end if;

    if v_date is null then
      v_problem:='TANGGAL_TIDAK_VALID';
    elsif v_match_count=0 then
      v_problem:='ID_BELUM_TERDAFTAR';v_unregistered:=v_unregistered+1;
    elsif v_match_count>1 then
      v_problem:='ID_FINGER_GANDA';
    elsif v_in is null and v_out is null then
      v_problem:='TANPA_SCAN';
    elsif v_in is null or v_out is null then
      v_problem:='SCAN_TIDAK_LENGKAP';
    else
      v_problem:='NORMAL';
    end if;

    v_hash:=md5(concat_ws('|',v_norm,coalesce(v_date::text,''),coalesce(v_in::text,''),coalesce(v_out::text,'')));
    if exists(select 1 from public.attendance_import_rows where row_hash=v_hash) then
      v_duplicate:=v_duplicate+1;
      continue;
    end if;

    if v_date is null then
      v_problem_count:=v_problem_count+1;
      continue;
    end if;

    insert into public.attendance_import_rows(
      batch_id,source_row_no,sheet_name,sheet_row,finger_id,worker_id,employee_code,employee_name_raw,
      position_raw,department_raw,day_name,attendance_date,schedule_text,activity,actual_in,actual_out,
      late_text,early_leave_text,effective_text,overtime_text,notes,problem,row_hash
    ) values(
      v_batch_id,coalesce(nullif(r->>'rowNo','')::int,v_idx::int),nullif(r->>'sheetName',''),nullif(r->>'sheetRow','')::int,
      v_finger,case when v_match_count=1 then v_worker_id else null end,nullif(r->>'kodeKaryawan',''),nullif(r->>'namaRaw',''),
      nullif(r->>'jabatanRaw',''),nullif(r->>'departemenRaw',''),nullif(r->>'hari',''),v_date,nullif(r->>'jamKerja',''),
      nullif(r->>'kegiatan',''),v_in,v_out,nullif(r->>'terlambat',''),nullif(r->>'cepatPulang',''),nullif(r->>'jamEfektif',''),
      nullif(r->>'lembur',''),nullif(r->>'notes',''),v_problem,v_hash
    ) returning id into v_raw_id;
    v_raw_new:=v_raw_new+1;

    if v_problem not in ('NORMAL') then v_problem_count:=v_problem_count+1; end if;
    if v_match_count<>1 then continue; end if;

    select * into a from public.attendance_records
      where worker_id=v_worker_id and attendance_date=v_date for update;

    if not found then
      insert into public.attendance_records(
        worker_id,attendance_date,schedule_in,schedule_out,actual_in,actual_out,attendance_status,
        verification_status,source,source_file,source_import_row_id,notes
      ) values(
        v_worker_id,v_date,v_schedule_in,v_schedule_out,v_in,v_out,'HADIR',
        case when v_problem='NORMAL' then 'DRAFT' else 'PERLU_PERBAIKAN' end,
        'FINGERPRINT_IMPORT',btrim(p_source_file),v_raw_id,
        nullif(concat_ws(' · ',nullif(r->>'kegiatan',''),nullif(r->>'notes','')),'')
      );
      v_final_new:=v_final_new+1;
    elsif a.verification_status='TERVERIFIKASI' then
      v_verified:=v_verified+1;
      update public.attendance_import_rows set problem='SUDAH_TERVERIFIKASI' where id=v_raw_id;
    elsif a.source='MANUAL' then
      v_manual:=v_manual+1;
      update public.attendance_import_rows set problem='MANUAL_DILINDUNGI' where id=v_raw_id;
    else
      update public.attendance_records set
        schedule_in=coalesce(v_schedule_in,schedule_in),
        schedule_out=coalesce(v_schedule_out,schedule_out),
        actual_in=v_in,
        actual_out=v_out,
        verification_status=case when v_problem='NORMAL' then 'DRAFT' else 'PERLU_PERBAIKAN' end,
        source='FINGERPRINT_IMPORT',source_file=btrim(p_source_file),source_import_row_id=v_raw_id,
        notes=nullif(concat_ws(' · ',nullif(r->>'kegiatan',''),nullif(r->>'notes','')),''),
        updated_at=now()
      where id=a.id;
      v_final_update:=v_final_update+1;
    end if;
  end loop;

  update public.attendance_import_batches set
    row_count=v_total,matched_count=v_matched,problem_count=v_problem_count,
    duplicate_count=v_duplicate,verified_protected_count=v_verified
  where id=v_batch_id;

  return jsonb_build_object(
    'importCode',v_import_code,
    'rawBaru',v_raw_new,
    'finalBaru',v_final_new,
    'finalUpdate',v_final_update,
    'duplikatDilewati',v_duplicate,
    'belumTerdaftar',v_unregistered,
    'terverifikasiDilindungi',v_verified,
    'manualDilindungi',v_manual,
    'perluReview',v_problem_count
  );
end $$;


ALTER FUNCTION "public"."commit_secure_attendance_import"("p_source_file" "text", "p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_qc_rework"("p_rework_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare r public.qc_reworks%rowtype;q public.qc_inspections%rowtype;v_loc bigint;v_event bigint;v_unit text; begin
  if not public.has_permission('qc.rework') then raise exception 'Tidak memiliki izin Rework.' using errcode='42501'; end if;
  select * into r from public.qc_reworks where id=p_rework_id for update; if not found or r.status<>'OPEN' then raise exception 'Rework tidak OPEN.'; end if;
  if coalesce(p_good_qty,0)<0 or coalesce(p_reject_qty,0)<0 or p_good_qty+p_reject_qty<>r.quantity then raise exception 'Good + Reject harus sama dengan Qty Rework.'; end if;
  select * into q from public.qc_inspections where id=r.qc_inspection_id;select id into v_loc from public.locations where name='PUSAT' limit 1;select unit into v_unit from public.finished_goods where id=q.finished_good_id;
  if p_good_qty>0 then v_event:=public.smpt_new_logistics_event('REWORK_GOOD','REWORK',r.id,r.rework_code,current_date,p_notes,null);perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',q.finished_good_id,null,v_loc,p_good_qty,v_unit,'REWORK BAIK',p_notes); end if;
  update public.qc_reworks set status='SELESAI',result_good_qty=p_good_qty,result_reject_qty=p_reject_qty,notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),stock_event_id=v_event,completed_at=now() where id=p_rework_id;
end $$;


ALTER FUNCTION "public"."complete_qc_rework"("p_rework_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_transfer_receipt"("p_transfer_id" bigint, "p_received_qty" numeric, "p_reject_qty" numeric DEFAULT 0, "p_damaged_qty" numeric DEFAULT 0, "p_notes" "text" DEFAULT NULL::"text", "p_photo_url" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_t public.finished_goods_transfers%rowtype;
begin
  select * into v_t from public.finished_goods_transfers where id = p_transfer_id for update;
  if not found then
    raise exception 'Data transfer tidak ditemukan.';
  end if;

  update public.finished_goods_transfers
  set delivery_status = 'DITERIMA',
      received_qty = coalesce(p_received_qty, quantity),
      reject_qty = coalesce(p_reject_qty, 0),
      damaged_qty = coalesce(p_damaged_qty, 0),
      received_at = now(),
      received_by = auth.uid(),
      received_notes = p_notes,
      surat_jalan_photo_url = coalesce(p_photo_url, surat_jalan_photo_url)
  where id = p_transfer_id;

  return json_build_object('success', true, 'id', p_transfer_id);
end;
$$;


ALTER FUNCTION "public"."confirm_transfer_receipt"("p_transfer_id" bigint, "p_received_qty" numeric, "p_reject_qty" numeric, "p_damaged_qty" numeric, "p_notes" "text", "p_photo_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_material_lot"("p_usage_date" "date", "p_material_lot_id" bigint, "p_quantity" numeric, "p_unit" "text", "p_process" "text", "p_work_item_id" bigint DEFAULT NULL::bigint, "p_officer" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."consume_material_lot"("p_usage_date" "date", "p_material_lot_id" bigint, "p_quantity" numeric, "p_unit" "text", "p_process" "text", "p_work_item_id" bigint, "p_officer" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_embarkation_shipment"("p_target_id" bigint, "p_date" "date", "p_source_location_id" bigint, "p_quantity" numeric, "p_document_no" "text", "p_driver" "text", "p_vehicle" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare v_id bigint; begin
  if not public.has_permission('pengiriman_embarkasi.operate') then raise exception 'Tidak memiliki izin membuat pengiriman.' using errcode='42501'; end if;if coalesce(p_quantity,0)<=0 then raise exception 'Qty pengiriman harus lebih besar dari nol.';end if;
  perform 1 from public.embarkation_targets where id=p_target_id and status='AKTIF';if not found then raise exception 'Target Embarkasi tidak aktif.';end if;
  insert into public.embarkation_shipments(target_id,shipment_date,source_location_id,quantity,document_no,driver_name,vehicle_no,notes) values(p_target_id,coalesce(p_date,current_date),p_source_location_id,p_quantity,p_document_no,p_driver,p_vehicle,p_notes) returning id into v_id;return v_id;
end $$;


ALTER FUNCTION "public"."create_embarkation_shipment"("p_target_id" bigint, "p_date" "date", "p_source_location_id" bigint, "p_quantity" numeric, "p_document_no" "text", "p_driver" "text", "p_vehicle" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_material_lot"("p_receipt_id" bigint, "p_roll_number" "text", "p_original_quantity" numeric, "p_original_unit" "text", "p_supplier_lot_no" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."create_material_lot"("p_receipt_id" bigint, "p_roll_number" "text", "p_original_quantity" numeric, "p_original_unit" "text", "p_supplier_lot_no" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_material_request_header"("p_request_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_supervisor_worker_id" bigint, "p_purpose" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."create_material_request_header"("p_request_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_supervisor_worker_id" bigint, "p_purpose" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_production_order"("p_order_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_operator_worker_id" bigint, "p_checker_email" "text", "p_supervisor_worker_id" bigint DEFAULT NULL::bigint, "p_due_date" "date" DEFAULT NULL::"date", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_id bigint;v_checker_id uuid;
begin
  if not public.has_permission('spk.write') then raise exception 'Tidak memiliki izin membuat SPK.' using errcode='42501'; end if;

  perform 1 from public.projects where id=p_project_id and upper(coalesce(status,'')) not in ('SELESAI','NONAKTIF','BATAL','DIBATALKAN');
  if not found then raise exception 'Proyek tidak ditemukan atau sudah tidak aktif.'; end if;

  perform 1 from public.project_products where id=p_product_id and project_id=p_project_id and status='AKTIF';
  if not found then raise exception 'Produk/Tas tidak sesuai proyek atau NONAKTIF.'; end if;

  perform 1 from public.workers
  where id=p_operator_worker_id and status='AKTIF'
    and upper(coalesce(pay_system,''))='BORONGAN'
    and (upper(coalesce(position,'')) like '%OPERATOR%' or upper(coalesce(position,'')) like '%JAHIT%');
  if not found then raise exception 'Operator SPK harus pekerja BORONGAN aktif dengan posisi Operator/Jahit.'; end if;

  if p_supervisor_worker_id is not null then
    perform 1 from public.workers where id=p_supervisor_worker_id and status='AKTIF' and (upper(coalesce(position,'')) like '%SUPERVISOR%' or upper(coalesce(position,'')) like '%SPV%');
    if not found then raise exception 'Supervisor tidak ditemukan, NONAKTIF, atau bukan SPV.'; end if;
  end if;

  if btrim(coalesce(p_checker_email,''))='' then raise exception 'Checker wajib dipilih.'; end if;
  select u.id into v_checker_id from auth.users u where lower(u.email)=lower(btrim(p_checker_email)) limit 1;
  if v_checker_id is null then raise exception 'Akun Checker belum terdaftar di Supabase Auth.'; end if;
  if not public.smpt_user_has_permission(v_checker_id,'borongan.operate') then
    raise exception 'Akun Checker tidak aktif atau belum memiliki permission borongan.operate.' using errcode='42501';
  end if;

  insert into public.production_orders(order_date,project_id,product_id,operator_worker_id,checker_email,supervisor_worker_id,due_date,notes)
  values(coalesce(p_order_date,current_date),p_project_id,p_product_id,p_operator_worker_id,lower(btrim(p_checker_email)),p_supervisor_worker_id,p_due_date,nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_id;
  return v_id;
end;
$$;


ALTER FUNCTION "public"."create_production_order"("p_order_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_operator_worker_id" bigint, "p_checker_email" "text", "p_supervisor_worker_id" bigint, "p_due_date" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_qc_rework"("p_qc_id" bigint, "p_quantity" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare q public.qc_inspections%rowtype;v_used numeric;v_id bigint; begin
  if not public.has_permission('qc.rework') then raise exception 'Tidak memiliki izin Rework.' using errcode='42501'; end if;
  select * into q from public.qc_inspections where id=p_qc_id and status='AKTIF' for update; if not found then raise exception 'QC tidak aktif.'; end if;
  select coalesce(sum(quantity),0) into v_used from public.qc_reworks where qc_inspection_id=p_qc_id and status<>'DIBATALKAN';
  if coalesce(p_quantity,0)<=0 or v_used+p_quantity>q.rework_qty then raise exception 'Qty Rework tidak valid. Sisa %.',greatest(q.rework_qty-v_used,0); end if;
  insert into public.qc_reworks(qc_inspection_id,quantity,notes) values(p_qc_id,p_quantity,nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_id;return v_id;
end $$;


ALTER FUNCTION "public"."create_qc_rework"("p_qc_id" bigint, "p_quantity" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_warehouse_receipt"("p_receipt_date" "date", "p_material_id" bigint, "p_quantity" numeric, "p_input_unit" "text" DEFAULT NULL::"text", "p_conversion_factor" numeric DEFAULT NULL::numeric, "p_supplier" "text" DEFAULT NULL::"text", "p_document_no" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."create_warehouse_receipt"("p_receipt_date" "date", "p_material_id" bigint, "p_quantity" numeric, "p_input_unit" "text", "p_conversion_factor" numeric, "p_supplier" "text", "p_document_no" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_permissions"() RETURNS TABLE("permission_code" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select p.code::text
  from public.permissions p
  where public.has_permission(p.code::text)
  union
  -- Sertakan pekerjaan_saya.view jika terhubung ke pekerja
  select 'pekerjaan_saya.view'::text
  where exists (
    select 1 from public.user_worker_links uw
    where uw.user_id = auth.uid() and uw.active = true
  )
  order by 1;
$$;


ALTER FUNCTION "public"."current_user_permissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select r.code::text
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid()
    and p.is_active = true
    and r.is_active = true
  limit 1;
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_work_item_dependency"("p_dependency_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."deactivate_work_item_dependency"("p_dependency_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_master_worker"("p_worker_id" bigint) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_has_refs boolean := false;
  v_worker_name text;
begin
  if not public.has_permission('master_pekerja.write') 
     and upper(coalesce(public.current_user_role(), '')) <> 'ADMIN' then
    raise exception 'Tidak memiliki izin menghapus pekerja.' using errcode = '42501';
  end if;

  select name into v_worker_name from public.workers where id = p_worker_id;
  if not found then
    raise exception 'Pekerja tidak ditemukan.';
  end if;

  -- Cek apakah memiliki data historis (SPK, absensi, payroll, kasbon)
  if exists (select 1 from public.production_orders where operator_worker_id = p_worker_id limit 1)
     or exists (select 1 from public.attendance_records where worker_id = p_worker_id limit 1)
     or exists (select 1 from public.cash_advances where worker_id = p_worker_id limit 1)
     or exists (select 1 from public.operator_payroll_items where worker_name_snapshot = v_worker_name limit 1) then
    v_has_refs := true;
  end if;

  -- Nonaktifkan link login user
  update public.user_worker_links set active = false where worker_id = p_worker_id;

  if v_has_refs then
    -- Soft-delete jika ada transaksi terkait untuk menjaga integritas data historis
    update public.workers set status = 'NONAKTIF', exit_date = current_date where id = p_worker_id;
    return 'NONAKTIF';
  else
    -- Hard-delete jika pekerja belum memiliki transaksi historis
    delete from public.user_worker_links where worker_id = p_worker_id;
    delete from public.workers where id = p_worker_id;
    return 'TERHAPUS';
  end if;
end;
$$;


ALTER FUNCTION "public"."delete_master_worker"("p_worker_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."direct_warehouse_issue_material"("p_issue_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_purpose" "text", "p_quantity" numeric, "p_unit" "text", "p_conversion_factor" numeric, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."direct_warehouse_issue_material"("p_issue_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_purpose" "text", "p_quantity" numeric, "p_unit" "text", "p_conversion_factor" numeric, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."edit_external_finished_receipt"("p_receipt_id" bigint, "p_document_no" "text", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.has_permission('barang_luar.receive') 
     and upper(coalesce(public.current_user_role(), '')) <> 'ADMIN' then
    raise exception 'Tidak memiliki izin mengubah penerimaan barang luar.' using errcode = '42501';
  end if;

  update public.external_finished_receipts
  set document_no = p_document_no,
      notes = p_notes
  where id = p_receipt_id and status = 'AKTIF';

  if not found then
    raise exception 'Data penerimaan tidak ditemukan atau sudah dibatalkan.';
  end if;
end;
$$;


ALTER FUNCTION "public"."edit_external_finished_receipt"("p_receipt_id" bigint, "p_document_no" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."edit_manufacturing_transaction"("p_id" bigint, "p_document_no" "text", "p_description" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.manufacturing_transactions
  set document_no = p_document_no,
      description = p_description
  where id = p_id and status = 'AKTIF';

  if not found then
    raise exception 'Transaksi tidak ditemukan atau sudah dibatalkan.';
  end if;
end;
$$;


ALTER FUNCTION "public"."edit_manufacturing_transaction"("p_id" bigint, "p_document_no" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_attendance_month"("p_month_start" "date", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_start date:=date_trunc('month',p_month_start)::date;v_end date:=(date_trunc('month',p_month_start)+interval '1 month - 1 day')::date;v_id bigint;a record;v_calc jsonb;v_config jsonb:=public.smpt_payroll_config_snapshot();
begin
  if not public.has_permission('absensi.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin finalisasi Absensi.' using errcode='42501'; end if;
  if p_month_start is null or p_month_start<>v_start then raise exception 'Gunakan tanggal pertama bulan untuk finalisasi Absensi.'; end if;
  if exists(select 1 from public.attendance_month_closures where month_start=v_start and status='FINAL') then raise exception 'Absensi bulan ini sudah FINAL.'; end if;
  if exists(select 1 from public.attendance_records where attendance_date between v_start and v_end and verification_status<>'TERVERIFIKASI') then raise exception 'Masih ada Absensi yang belum TERVERIFIKASI.'; end if;
  for a in select ar.id,w.daily_wage,w.monthly_salary,w.pay_system,w.name from public.attendance_records ar join public.workers w on w.id=ar.worker_id where ar.attendance_date between v_start and v_end and w.status='AKTIF' and upper(coalesce(w.pay_system,'')) in ('HARIAN','BULANAN') loop
    v_calc:=public.smpt_payroll_row_calc(a.id,a.daily_wage,a.monthly_salary,a.pay_system,v_config);
    if coalesce((v_calc->>'ready')::boolean,false)=false then raise exception 'Review Payroll belum lengkap: % · %',a.name,coalesce(v_calc->>'message',''); end if;
  end loop;
  insert into public.attendance_month_closures(month_start,status,notes) values(v_start,'FINAL',p_notes) returning id into v_id;return v_id;
end $$;


ALTER FUNCTION "public"."finalize_attendance_month"("p_month_start" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_general_payroll"("p_type" "text", "p_start" "date", "p_end" "date", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_type text := upper(btrim(coalesce(p_type, '')));
  v_run bigint;
  r record;
  v_full numeric;
  v_half numeric;
  v_ot int;
  v_count_4h int;
  v_sunday_count int;
  v_base numeric;
  v_meal numeric;
  v_ot_amt numeric;
  v_bonus numeric;
  v_holiday numeric;
  v_gross numeric;
  v_total_gross numeric := 0;
  v_total_deduction numeric := 0;
  v_total_net numeric := 0;
  v_div numeric;
  v_bonus4 numeric;
  v_sunday_meal_setting numeric;
  v_holiday_bonus_setting numeric;
  v_kasbon_perusahaan numeric := 0;
  v_kasbon_warung numeric := 0;
  v_total_item_deduction numeric := 0;
  v_net numeric := 0;
BEGIN
  -- 1. Guard Permission Fail-Closed
  IF auth.uid() IS NOT NULL AND NOT public.has_permission('payroll.write') AND upper(coalesce(public.current_user_role(),''))<>'ADMIN' THEN
    RAISE EXCEPTION 'Tidak memiliki izin Payroll.' USING errcode='42501';
  END IF;

  IF v_type NOT IN ('MINGGUAN', 'BULANAN') THEN
    RAISE EXCEPTION 'Jenis Payroll harus MINGGUAN atau BULANAN.';
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'Periode Payroll tidak valid (% s/d %).', p_start, p_end;
  END IF;

  -- 2. Operasi UPSERT pada payroll_runs
  INSERT INTO public.payroll_runs(
    payroll_type, period_start, period_end, status, notes, finalized_at,
    total_gross, total_deduction, total_net
  ) VALUES (
    v_type, p_start, p_end, 'FINAL', p_notes, now(),
    0, 0, 0
  )
  ON CONFLICT (payroll_type, period_start, period_end) WHERE status <> 'DIBATALKAN'
  DO UPDATE SET
    total_gross = excluded.total_gross,
    total_deduction = excluded.total_deduction,
    total_net = excluded.total_net,
    notes = coalesce(excluded.notes, public.payroll_runs.notes),
    status = 'FINAL',
    finalized_at = now()
  RETURNING id INTO v_run;

  -- 3. Bersihkan rincian lama agar re-kalkulasi bersih dan idempoten
  DELETE FROM public.payroll_run_details WHERE payroll_run_id = v_run;
  DELETE FROM public.payroll_run_items WHERE payroll_run_id = v_run;

  -- 4. Ambil parameter pengaturan dinamis
  SELECT coalesce(value_numeric, 50000) INTO v_sunday_meal_setting FROM public.payroll_settings WHERE key='BULANAN_SUNDAY_MEAL';
  SELECT coalesce(value_numeric, 20000) INTO v_holiday_bonus_setting FROM public.payroll_settings WHERE key='HARIAN_HOLIDAY_BONUS_FULL';

  IF v_type = 'MINGGUAN' THEN
    SELECT coalesce(value_numeric, 8) INTO v_div FROM public.payroll_settings WHERE key='OT_DIVISOR_HARIAN';
    SELECT coalesce(value_numeric, 5000) INTO v_bonus4 FROM public.payroll_settings WHERE key='OT_BONUS_HARIAN_4H';
  ELSE
    SELECT coalesce(value_numeric, 190) INTO v_div FROM public.payroll_settings WHERE key='OT_DIVISOR_BULANAN';
    SELECT coalesce(value_numeric, 17500) INTO v_bonus4 FROM public.payroll_settings WHERE key='OT_BONUS_BULANAN_4H';
  END IF;

  -- 5. Loop Kalkulasi Tiap Pekerja Aktif
  FOR r IN
    SELECT * FROM public.workers w
    WHERE w.status = 'AKTIF'
      AND upper(coalesce(w.pay_system, '')) = CASE WHEN v_type = 'MINGGUAN' THEN 'HARIAN' ELSE 'BULANAN' END
    ORDER BY w.name
  LOOP
    IF v_type = 'MINGGUAN' THEN
      SELECT
        coalesce(sum(CASE WHEN a.day_class = 'FULL_DAY' AND a.attendance_status = 'HADIR' THEN 1 ELSE 0 END), 0),
        coalesce(sum(CASE WHEN a.day_class = 'HALF_DAY' AND a.attendance_status = 'HADIR' THEN 1 ELSE 0 END), 0),
        coalesce(sum(
          CASE
            WHEN extract(dow FROM a.attendance_date) = 0 AND (a.actual_out IS NULL OR a.actual_out <= time '17:00:00') AND a.overtime_minutes = 480 THEN 0
            WHEN extract(dow FROM a.attendance_date) = 0 AND a.overtime_minutes >= 480 THEN (a.overtime_minutes - 480)
            ELSE (coalesce(a.overtime_minutes, 0) + (coalesce(a.manual_overtime_hours, 0) * 60)::int)
          END
        ), 0),
        coalesce(sum(
          CASE
            -- Hari biasa (Senin-Sabtu): lembur >= 4 jam (240 menit) atau pulang >= 21:00
            WHEN extract(dow FROM a.attendance_date) <> 0 AND (
              (coalesce(a.overtime_minutes, 0) + (coalesce(a.manual_overtime_hours, 0) * 60)) >= 240
              OR (a.actual_out IS NOT NULL AND a.actual_out >= time '21:00:00')
            ) THEN 1
            -- Hari Minggu: lembur lewat 17:00 minimal 4 jam (pulang >= 21:00 atau lembur >= 240 mnt)
            WHEN extract(dow FROM a.attendance_date) = 0 AND (
              ((coalesce(a.overtime_minutes, 0) + (coalesce(a.manual_overtime_hours, 0) * 60)) >= 240 AND (coalesce(a.overtime_minutes, 0) + (coalesce(a.manual_overtime_hours, 0) * 60)) < 480) OR
              ((coalesce(a.overtime_minutes, 0) + (coalesce(a.manual_overtime_hours, 0) * 60)) >= 720) OR
              (a.actual_out IS NOT NULL AND a.actual_out >= time '21:00:00')
            ) THEN 1
            ELSE 0
          END
        ), 0),
        coalesce(sum(
          CASE
            -- Hadir Hari Minggu: Minggu masuk kerja (HADIR atau ada jam kerja/lembur terdata)
            WHEN extract(dow FROM a.attendance_date) = 0 AND (
              a.attendance_status = 'HADIR'
              OR coalesce(a.overtime_minutes, 0) > 0
              OR coalesce(a.manual_overtime_hours, 0) > 0
            ) THEN 1
            ELSE 0
          END
        ), 0)
      INTO v_full, v_half, v_ot, v_count_4h, v_sunday_count
      FROM public.attendance_records a
      WHERE a.worker_id = r.id
        AND a.attendance_date BETWEEN p_start AND p_end
        AND a.verification_status <> 'DITOLAK';

      v_base := round((v_full * coalesce(r.daily_wage, 0) + v_half * coalesce(r.daily_wage, 0) * 0.5)::numeric, 2);
      v_meal := 0;
      v_ot_amt := round(((v_ot / 60.0) * coalesce(r.daily_wage, 0) / greatest(coalesce(v_div, 8), 0.0001))::numeric, 2);
      v_bonus := v_count_4h * coalesce(v_bonus4, 5000);
      v_holiday := v_sunday_count * coalesce(v_holiday_bonus_setting, 20000);
    ELSE
      SELECT
        coalesce(sum(CASE WHEN a.day_class = 'FULL_DAY' AND a.attendance_status = 'HADIR' THEN 1 ELSE 0 END), 0),
        coalesce(sum(CASE WHEN a.day_class = 'HALF_DAY' AND a.attendance_status = 'HADIR' THEN 1 ELSE 0 END), 0),
        coalesce(sum(coalesce(a.overtime_minutes, 0) + (coalesce(a.manual_overtime_hours, 0) * 60)::int), 0),
        coalesce(sum(
          CASE
            WHEN extract(dow FROM a.attendance_date) <> 0 AND (
              (coalesce(a.overtime_minutes, 0) + (coalesce(a.manual_overtime_hours, 0) * 60)) >= 240
              OR (a.actual_out IS NOT NULL AND a.actual_out >= time '21:00:00')
            ) THEN 1
            WHEN extract(dow FROM a.attendance_date) = 0 AND (
              (coalesce(a.overtime_minutes, 0) + (coalesce(a.manual_overtime_hours, 0) * 60)) >= 720
              OR (a.actual_out IS NOT NULL AND a.actual_out >= time '21:00:00')
            ) THEN 1
            ELSE 0
          END
        ), 0),
        coalesce(sum(
          CASE
            WHEN extract(dow FROM a.attendance_date) = 0 AND (
              a.attendance_status = 'HADIR'
              OR coalesce(a.overtime_minutes, 0) > 0
              OR coalesce(a.manual_overtime_hours, 0) > 0
            ) THEN 1
            ELSE 0
          END
        ), 0)
      INTO v_full, v_half, v_ot, v_count_4h, v_sunday_count
      FROM public.attendance_records a
      WHERE a.worker_id = r.id
        AND a.attendance_date BETWEEN p_start AND p_end
        AND a.verification_status <> 'DITOLAK';

      v_base := coalesce(r.monthly_salary, 0);
      v_meal := v_sunday_count * coalesce(v_sunday_meal_setting, 50000);
      v_ot_amt := round(((v_ot / 60.0) * coalesce(r.monthly_salary, 0) / greatest(coalesce(v_div, 190), 0.0001))::numeric, 2);
      v_bonus := v_count_4h * coalesce(v_bonus4, 17500);
      v_holiday := 0;
    END IF;

    -- Formula Total Bruto Bersih & Akurat (Menghitung Lembur, Bonus 4H, dan Hadir Minggu)
    v_gross := round((v_base + v_meal + v_ot_amt + v_bonus + v_holiday)::numeric, 2);

    -- Potongan Kasbon Kantor & Warung Luar
    SELECT coalesce(sum(least(CASE WHEN installment_amount > 0 THEN installment_amount ELSE (amount - paid_amount) END, amount - paid_amount)), 0)
    INTO v_kasbon_perusahaan
    FROM public.cash_advances
    WHERE worker_id = r.id AND status = 'AKTIF' AND category = 'KASBON_PERUSAHAAN';

    SELECT coalesce(sum(amount - paid_amount), 0)
    INTO v_kasbon_warung
    FROM public.cash_advances
    WHERE worker_id = r.id AND status = 'AKTIF' AND category = 'KASBON_WARUNG';

    v_total_item_deduction := v_kasbon_perusahaan + v_kasbon_warung;
    v_net := greatest(0, v_gross - v_total_item_deduction);

    -- Simpan ke payroll_run_items
    INSERT INTO public.payroll_run_items(
      payroll_run_id, worker_id, worker_name_snapshot, pay_system_snapshot,
      daily_wage_snapshot, monthly_salary_snapshot, full_days, half_days, overtime_minutes,
      base_amount, meal_amount, overtime_amount, overtime_bonus, holiday_bonus, holiday_manual_amount,
      kasbon_perusahaan_amount, kasbon_warung_amount, deduction_amount, net_amount
    ) VALUES (
      v_run, r.id, r.name, coalesce(r.pay_system, CASE WHEN v_type = 'MINGGUAN' THEN 'HARIAN' ELSE 'BULANAN' END),
      coalesce(r.daily_wage, 0), coalesce(r.monthly_salary, 0), v_full, v_half, v_ot,
      v_base, v_meal, v_ot_amt, v_bonus, v_holiday, 0,
      v_kasbon_perusahaan, v_kasbon_warung, v_total_item_deduction, v_net
    );

    v_total_gross := v_total_gross + v_gross;
    v_total_deduction := v_total_deduction + v_total_item_deduction;
    v_total_net := v_total_net + v_net;
  END LOOP;

  -- 6. Tautkan Absensi Terhitung ke payroll_run_details (Kunci status isFinalized untuk dashboard pekerja)
  INSERT INTO public.payroll_run_details(
    payroll_run_id, attendance_id, worker_id, attendance_date,
    attendance_status, day_class, overtime_approved_minutes, source_hash
  )
  SELECT
    v_run, a.id, a.worker_id, a.attendance_date,
    coalesce(a.attendance_status, 'HADIR'), coalesce(a.day_class, 'FULL_DAY'),
    coalesce(a.overtime_minutes, 0) + (coalesce(a.manual_overtime_hours, 0) * 60)::int,
    v_run || '-' || a.id || '-' || a.attendance_date
  FROM public.attendance_records a
  JOIN public.workers w ON w.id = a.worker_id
  WHERE upper(coalesce(w.pay_system, '')) = CASE WHEN v_type = 'MINGGUAN' THEN 'HARIAN' ELSE 'BULANAN' END
    AND a.attendance_date BETWEEN p_start AND p_end
    AND a.verification_status <> 'DITOLAK'
  ON CONFLICT (payroll_run_id, attendance_id) DO NOTHING;

  -- 7. Update Total Akumulatif pada tabel utama payroll_runs
  UPDATE public.payroll_runs SET
    total_gross = v_total_gross,
    total_deduction = v_total_deduction,
    total_net = v_total_net
  WHERE id = v_run;

  RETURN v_run;
END;
$$;


ALTER FUNCTION "public"."finalize_general_payroll"("p_type" "text", "p_start" "date", "p_end" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_operator_payroll"("p_start" "date", "p_end" "date", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_run bigint;
  r record;
  v_op numeric:=0;
  v_sub numeric:=0;
begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin Payroll Operator.' using errcode='42501';
  end if;
  if p_start is null or p_end is null or p_end<p_start then raise exception 'Periode tidak valid.'; end if;

  insert into public.operator_payroll_runs(period_start,period_end,notes)
  values(p_start,p_end,p_notes) returning id into v_run;

  for r in
    with source_rows as (
      select
        o.operator_worker_id as worker_id,
        w.name as worker_name,
        i.work_item_id,
        i.work_item_name_snapshot,
        c.good_qty::numeric as qty,
        case when upper(coalesce(w.pay_system,''))='HARIAN' then 0::numeric else i.operator_price_snapshot end as operator_price_snapshot,
        i.submission_price_snapshot::numeric as submission_price_snapshot
      from public.production_checks c
      join public.production_order_items i on i.id=c.order_item_id
      join public.production_orders o on o.id=i.order_id
      join public.workers w on w.id=o.operator_worker_id
      where c.status='AKTIF' and o.status<>'DIBATALKAN' and i.status<>'DIBATALKAN'
        and c.check_date between p_start and p_end

      union all

      select
        m.worker_id,
        m.worker_name_snapshot,
        m.work_item_id,
        m.work_item_name_snapshot,
        m.qty_good::numeric as qty,
        0::numeric as operator_price_snapshot,
        m.submission_price_snapshot::numeric as submission_price_snapshot
      from public.production_manual_results m
      where m.status='AKTIF' and m.result_date between p_start and p_end
    )
    select
      worker_id,worker_name,work_item_id,work_item_name_snapshot,
      sum(qty)::numeric(18,4) as qty,
      operator_price_snapshot::numeric(18,2) as operator_price_snapshot,
      submission_price_snapshot::numeric(18,2) as submission_price_snapshot
    from source_rows
    group by worker_id,worker_name,work_item_id,work_item_name_snapshot,operator_price_snapshot,submission_price_snapshot
    order by worker_id,work_item_id,operator_price_snapshot,submission_price_snapshot
  loop
    insert into public.operator_payroll_items(
      run_id,worker_id,work_item_id,worker_name_snapshot,work_item_name_snapshot,qty_approved,
      operator_price_snapshot,submission_price_snapshot,operator_value,submission_value
    ) values(
      v_run,r.worker_id,r.work_item_id,r.worker_name,r.work_item_name_snapshot,r.qty,
      r.operator_price_snapshot,r.submission_price_snapshot,
      round((r.qty*r.operator_price_snapshot)::numeric,2),
      round((r.qty*r.submission_price_snapshot)::numeric,2)
    );
    v_op:=v_op+round((r.qty*r.operator_price_snapshot)::numeric,2);
    v_sub:=v_sub+round((r.qty*r.submission_price_snapshot)::numeric,2);
  end loop;

  update public.operator_payroll_runs
  set total_operator_value=v_op,total_submission_value=v_sub
  where id=v_run;
  return v_run;
end;
$$;


ALTER FUNCTION "public"."finalize_operator_payroll"("p_start" "date", "p_end" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_payroll_payout"("p_type" "text", "p_start" "date", "p_end" "date", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_type text:=upper(btrim(coalesce(p_type,'')));v_payout bigint;v_config jsonb:=public.smpt_payroll_config_snapshot();w record;a record;d record;src record;v_calc jsonb;v_full numeric;v_half numeric;v_wage numeric;v_meal numeric;v_ot int;v_ot_amt numeric;v_bonus numeric;v_holiday numeric;v_adj numeric;v_gross numeric;v_total_gross numeric:=0;v_total_adj numeric:=0;v_hash text;v_friday_att bigint;v_friday_prov numeric;v_actual numeric;v_month_start date;v_month_end date;v_month_run bigint;
begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin Payroll.' using errcode='42501'; end if;
  if v_type not in ('MINGGUAN','BULANAN') or p_start is null or p_end is null or p_end<p_start then raise exception 'Periode payout tidak valid.'; end if;
  if exists(select 1 from public.payroll_payouts where payout_type=v_type and period_start=p_start and period_end=p_end and status='FINAL') then raise exception 'Payout periode ini sudah FINAL.'; end if;
  if v_type='MINGGUAN' then
    if p_end-p_start<>6 or extract(isodow from p_end)<>5 then raise exception 'Payout MINGGUAN harus Sabtu-Jumat (7 hari, berakhir Jumat).'; end if;
  else
    v_month_start:=date_trunc('month',p_start)::date;v_month_end:=(date_trunc('month',p_start)+interval '1 month - 1 day')::date;
    if p_start<>v_month_start or p_end<>v_month_end then raise exception 'Payout BULANAN harus satu bulan kalender penuh.'; end if;
    select id into v_month_run from public.payroll_runs where payroll_type='BULANAN' and period_start=p_start and period_end=p_end and status='FINAL' order by id desc limit 1;
    if v_month_run is null then raise exception 'Payroll BULANAN harus FINAL sebelum payout bulanan.'; end if;
  end if;
  insert into public.payroll_payouts(payout_type,period_start,period_end,month_key,status,payment_status,config_snapshot,snapshot_hash,notes) values(v_type,p_start,p_end,to_char(p_end,'YYYY-MM'),'FINAL','BELUM_DIBAYAR',v_config,'PENDING',p_notes) returning id into v_payout;
  if v_type='MINGGUAN' then
    for w in select * from public.workers where status='AKTIF' and upper(coalesce(pay_system,'')) in ('HARIAN','BULANAN') order by id loop
      v_full:=0;v_half:=0;v_wage:=0;v_meal:=0;v_ot:=0;v_ot_amt:=0;v_bonus:=0;v_holiday:=0;v_adj:=0;v_friday_att:=null;v_friday_prov:=0;
      for a in select ar.* from public.attendance_records ar where ar.worker_id=w.id and ar.attendance_date between p_start and p_end order by ar.attendance_date,ar.id loop
        if a.attendance_date=p_end then
          if a.attendance_status='HADIR' and a.actual_in is not null then
            v_friday_att:=a.id;if upper(w.pay_system)='HARIAN' then v_friday_prov:=coalesce(w.daily_wage,0);v_wage:=v_wage+v_friday_prov;v_full:=v_full+1;else v_friday_prov:=public.smpt_payroll_cfg_num(v_config,'MEAL_FULL',50000);v_meal:=v_meal+v_friday_prov;v_full:=v_full+1;end if;
          end if;
        else
          v_calc:=public.smpt_payroll_row_calc(a.id,w.daily_wage,w.monthly_salary,w.pay_system,v_config);if coalesce((v_calc->>'ready')::boolean,false)=false then raise exception 'Payout belum siap: % · % · %',w.name,a.attendance_date,coalesce(v_calc->>'message','');end if;
          if a.attendance_status='HADIR' and v_calc->>'day_class'='FULL_DAY' then v_full:=v_full+1;elsif a.attendance_status='HADIR' and v_calc->>'day_class'='HALF_DAY' then v_half:=v_half+1;end if;
          if upper(w.pay_system)='HARIAN' then v_wage:=v_wage+coalesce((v_calc->>'base_amount')::numeric,0);v_ot:=v_ot+coalesce((v_calc->>'overtime_approved_minutes')::int,0);v_ot_amt:=v_ot_amt+coalesce((v_calc->>'overtime_amount')::numeric,0);v_bonus:=v_bonus+coalesce((v_calc->>'overtime_bonus')::numeric,0);v_holiday:=v_holiday+coalesce((v_calc->>'holiday_bonus')::numeric,0);else v_meal:=v_meal+coalesce((v_calc->>'meal_amount')::numeric,0);end if;
        end if;
      end loop;
      for src in select pd.*,p.config_snapshot from public.payroll_payout_details pd join public.payroll_payouts p on p.id=pd.payout_id left join public.payroll_payout_adjustments pa on pa.source_payout_detail_id=pd.id where pd.worker_id=w.id and pd.friday_attendance_id is not null and p.payout_type='MINGGUAN' and p.status='FINAL' and p.period_end<p_start and pa.id is null order by p.period_end loop
        begin
          v_actual:=public.smpt_payroll_weekly_component(src.friday_attendance_id,src.daily_wage_snapshot,src.monthly_salary_snapshot,src.pay_system_snapshot,src.config_snapshot);v_adj:=v_adj+(v_actual-src.friday_provisional_amount);
          insert into public.payroll_payout_adjustments(source_payout_detail_id,target_payout_id,worker_id,source_friday,provisional_amount,actual_amount,adjustment_amount) values(src.id,v_payout,w.id,src.friday_date,src.friday_provisional_amount,v_actual,v_actual-src.friday_provisional_amount);
        exception when others then raise exception 'Penyesuaian Jumat belum siap untuk %: %',w.name,sqlerrm; end;
      end loop;
      v_gross:=round(v_wage+v_meal+v_ot_amt+v_bonus+v_holiday+v_adj,2);
      insert into public.payroll_payout_details(payout_id,worker_id,worker_name_snapshot,department_snapshot,identity_no_snapshot,pay_system_snapshot,daily_wage_snapshot,monthly_salary_snapshot,full_days,half_days,wage_salary_amount,meal_amount,overtime_minutes,overtime_amount,overtime_bonus,holiday_bonus,adjustment_amount,deduction_amount,total_paid,friday_date,friday_attendance_id,friday_provisional_amount,source_hash)
      values(v_payout,w.id,w.name,w.department,w.identity_no,upper(w.pay_system),w.daily_wage,w.monthly_salary,v_full,v_half,round(v_wage,2),round(v_meal,2),v_ot,round(v_ot_amt,2),round(v_bonus,2),round(v_holiday,2),round(v_adj,2),0,v_gross,p_end,v_friday_att,round(v_friday_prov,2),md5(concat_ws('|',v_payout,w.id,v_full,v_half,v_wage,v_meal,v_ot,v_ot_amt,v_bonus,v_holiday,v_adj,v_friday_att,v_friday_prov)));
      v_total_gross:=v_total_gross+round(v_wage+v_meal+v_ot_amt+v_bonus+v_holiday,2);v_total_adj:=v_total_adj+round(v_adj,2);
    end loop;
  else
    for d in select pri.*,w.department,w.identity_no from public.payroll_run_items pri join public.workers w on w.id=pri.worker_id where pri.payroll_run_id=v_month_run and upper(pri.pay_system_snapshot)='BULANAN' order by pri.worker_id loop
      v_gross:=round(d.base_amount+d.overtime_amount+d.overtime_bonus+d.holiday_bonus+d.holiday_manual_amount,2);
      insert into public.payroll_payout_details(payout_id,worker_id,worker_name_snapshot,department_snapshot,identity_no_snapshot,pay_system_snapshot,daily_wage_snapshot,monthly_salary_snapshot,full_days,half_days,wage_salary_amount,meal_amount,overtime_minutes,overtime_amount,overtime_bonus,holiday_bonus,adjustment_amount,deduction_amount,total_paid,source_hash)
      values(v_payout,d.worker_id,d.worker_name_snapshot,d.department,d.identity_no,d.pay_system_snapshot,d.daily_wage_snapshot,d.monthly_salary_snapshot,d.full_days,d.half_days,d.base_amount,0,d.overtime_minutes,d.overtime_amount,d.overtime_bonus,d.holiday_bonus+d.holiday_manual_amount,0,0,v_gross,md5(concat_ws('|',v_payout,d.worker_id,v_gross)));
      v_total_gross:=v_total_gross+v_gross;
    end loop;
  end if;
  select md5(coalesce(string_agg(source_hash,',' order by worker_id),'')) into v_hash from public.payroll_payout_details where payout_id=v_payout;
  update public.payroll_payouts set total_gross=v_total_gross,total_adjustment=v_total_adj,total_net=v_total_gross+v_total_adj,snapshot_hash=v_hash where id=v_payout;
  insert into public.salary_submissions(payout_id,total_workers,total_gross,total_deduction,total_net,snapshot_hash) select v_payout,count(*),v_total_gross,0,v_total_gross+v_total_adj,v_hash from public.payroll_payout_details where payout_id=v_payout;
  return v_payout;
end $$;


ALTER FUNCTION "public"."finalize_payroll_payout"("p_type" "text", "p_start" "date", "p_end" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fulfill_material_request_item"("p_request_item_id" bigint, "p_issue_date" "date", "p_quantity" numeric, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_conversion_factor" numeric DEFAULT NULL::numeric, "p_wip_source_state" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."fulfill_material_request_item"("p_request_item_id" bigint, "p_issue_date" "date", "p_quantity" numeric, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_conversion_factor" numeric, "p_wip_source_state" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fulfill_material_request_with_lot"("p_issue_date" "date", "p_request_item_id" bigint, "p_material_lot_id" bigint, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."fulfill_material_request_with_lot"("p_issue_date" "date", "p_request_item_id" bigint, "p_material_lot_id" bigint, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_shipment_tracking"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
select jsonb_build_object('shipment_code',s.shipment_code,'shipment_date',s.shipment_date,'status',s.status,'quantity',s.quantity,'received_qty',s.received_qty,'reject_qty',s.reject_qty,'damaged_qty',s.damaged_qty,'missing_qty',s.missing_qty,'document_no',s.document_no,'embarkation',e.name,'item_kind',t.item_kind,'created_at',s.created_at,'received_at',s.received_at)
from public.embarkation_shipments s join public.embarkation_targets t on t.id=s.target_id join public.embarkations e on e.id=t.embarkation_id where s.public_token=p_token limit 1 $$;


ALTER FUNCTION "public"."get_public_shipment_tracking"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_worker_financial_summary"("p_worker_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_target_id bigint;
  w record;
  v_total_warung numeric := 0;
  v_total_perusahaan numeric := 0;
  v_cicilan_perusahaan numeric := 0;
  v_cur_month_start date := date_trunc('month', current_date)::date;
  v_cur_month_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_full_days numeric := 0;
  v_half_days numeric := 0;
  v_ot_min int := 0;
  v_est_wage numeric := 0;
  v_warung_items jsonb;
  v_loan_items jsonb;
begin
  if p_worker_id is not null then
    v_target_id := p_worker_id;
  else
    v_target_id := public.smpt_current_worker_id();
  end if;

  if v_target_id is null then
    return jsonb_build_object('error', 'Pekerja tidak teridentifikasi');
  end if;

  select * into w from public.workers where id = v_target_id;
  if not found then
    return jsonb_build_object('error', 'Data pekerja tidak ditemukan');
  end if;

  -- 1. Hitung total hutang warung aktif
  select coalesce(sum(amount - paid_amount), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'advance_code', advance_code,
           'date', advance_date,
           'warung_name', coalesce(warung_name, 'Warung Luar'),
           'amount', amount,
           'remaining', amount - paid_amount,
           'notes', notes
         ) order by advance_date desc), '[]'::jsonb)
  into v_total_warung, v_warung_items
  from public.cash_advances
  where worker_id = v_target_id and status = 'AKTIF' and category = 'KASBON_WARUNG';

  -- 2. Hitung total sisa kasbon perusahaan & cicilan aktif bulan ini
  select coalesce(sum(amount - paid_amount), 0),
         coalesce(sum(least(case when installment_amount > 0 then installment_amount else (amount - paid_amount) end, amount - paid_amount)), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'advance_code', advance_code,
           'date', advance_date,
           'amount', amount,
           'remaining', amount - paid_amount,
           'installment_count', installment_count,
           'installment_amount', installment_amount,
           'installments_paid', installments_paid,
           'notes', notes
         ) order by advance_date desc), '[]'::jsonb)
  into v_total_perusahaan, v_cicilan_perusahaan, v_loan_items
  from public.cash_advances
  where worker_id = v_target_id and status = 'AKTIF' and category = 'KASBON_PERUSAHAAN';

  -- 3. Estimasi upah terkumpul bulan berjalan
  select coalesce(sum(case when day_class='FULL_DAY' and attendance_status='HADIR' then 1 else 0 end),0),
         coalesce(sum(case when day_class='HALF_DAY' and attendance_status='HADIR' then 1 else 0 end),0),
         coalesce(sum(overtime_minutes),0)
  into v_full_days, v_half_days, v_ot_min
  from public.attendance_records
  where worker_id = v_target_id and attendance_date between v_cur_month_start and current_date;

  if upper(coalesce(w.pay_system, '')) = 'BULANAN' then
    v_est_wage := coalesce(w.monthly_salary, 0);
  else
    v_est_wage := round((v_full_days * coalesce(w.daily_wage, 0) + v_half_days * coalesce(w.daily_wage, 0) * 0.5)::numeric, 2);
  end if;

  return jsonb_build_object(
    'worker_id', w.id,
    'worker_code', w.worker_code,
    'worker_name', w.name,
    'pay_system', w.pay_system,
    'total_debt_all', (v_total_warung + v_total_perusahaan),
    'total_warung_debt', v_total_warung,
    'total_company_loan_remaining', v_total_perusahaan,
    'monthly_company_installment', v_cicilan_perusahaan,
    'current_month_worked_days', v_full_days + (v_half_days * 0.5),
    'estimated_gross_wage', v_est_wage,
    'estimated_net_wage', greatest(0, v_est_wage - v_total_warung - v_cicilan_perusahaan),
    'warung_items', v_warung_items,
    'company_loan_items', v_loan_items
  );
end $$;


ALTER FUNCTION "public"."get_worker_financial_summary"("p_worker_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_auto_link_worker_on_user_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
                                                                              DECLARE
                                                                                v_code TEXT;
                                                                                  v_worker_id BIGINT;
                                                                                  BEGIN
                                                                                    -- Ambil worker_code dari metadata atau awalan email
                                                                                      v_code := COALESCE(
                                                                                          NEW.raw_user_meta_data->>'worker_code',
                                                                                              split_part(NEW.email, '@', 1)
                                                                                                );

                                                                                                  IF v_code IS NOT NULL THEN
                                                                                                      SELECT id INTO v_worker_id 
                                                                                                          FROM public.workers 
                                                                                                              WHERE upper(worker_code) = upper(v_code)
                                                                                                                  LIMIT 1;

                                                                                                                      IF v_worker_id IS NOT NULL THEN
                                                                                                                            -- Isi user_id di tabel workers
                                                                                                                                  UPDATE public.workers 
                                                                                                                                        SET user_id = NEW.id 
                                                                                                                                              WHERE id = v_worker_id;

                                                                                                                                                    -- Isi worker_id di tabel profiles jika kolomnya ada
                                                                                                                                                          IF EXISTS (
                                                                                                                                                                  SELECT 1 FROM information_schema.columns 
                                                                                                                                                                          WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'worker_id'
                                                                                                                                                                                ) THEN
                                                                                                                                                                                        EXECUTE 'UPDATE public.profiles SET worker_id = $1 WHERE id = $2' 
                                                                                                                                                                                                USING v_worker_id, NEW.id;
                                                                                                                                                                                                      END IF;
                                                                                                                                                                                                          END IF;
                                                                                                                                                                                                            END IF;

                                                                                                                                                                                                              RETURN NEW;
                                                                                                                                                                                                              END;
                                                                                                                                                                                                              $_$;


ALTER FUNCTION "public"."handle_auto_link_worker_on_user_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_auto_link_worker_on_worker_inserted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
                                                                                                                                                                                                              DECLARE
                                                                                                                                                                                                                v_user_id UUID;
                                                                                                                                                                                                                BEGIN
                                                                                                                                                                                                                  SELECT id INTO v_user_id
                                                                                                                                                                                                                    FROM auth.users
                                                                                                                                                                                                                      WHERE upper(raw_user_meta_data->>'worker_code') = upper(NEW.worker_code)
                                                                                                                                                                                                                           OR lower(email) = lower(NEW.worker_code || '@smpt.id')
                                                                                                                                                                                                                             LIMIT 1;

                                                                                                                                                                                                                               IF v_user_id IS NOT NULL THEN
                                                                                                                                                                                                                                   NEW.user_id := v_user_id;

                                                                                                                                                                                                                                       IF EXISTS (
                                                                                                                                                                                                                                             SELECT 1 FROM information_schema.columns 
                                                                                                                                                                                                                                                   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'worker_id'
                                                                                                                                                                                                                                                       ) THEN
                                                                                                                                                                                                                                                             EXECUTE 'UPDATE public.profiles SET worker_id = $1 WHERE id = $2' 
                                                                                                                                                                                                                                                                   USING NEW.id, v_user_id;
                                                                                                                                                                                                                                                                       END IF;
                                                                                                                                                                                                                                                                         END IF;

                                                                                                                                                                                                                                                                           RETURN NEW;
                                                                                                                                                                                                                                                                           END;
                                                                                                                                                                                                                                                                           $_$;


ALTER FUNCTION "public"."handle_auto_link_worker_on_worker_inserted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_role_id bigint;
begin
  select id into v_user_role_id
  from public.roles
  where code = 'USER' and is_active = true
  limit 1;

  if v_user_role_id is null then
    raise exception 'Default role USER tidak ditemukan atau tidak aktif.';
  end if;

  insert into public.profiles(id, role_id, display_name, email, is_active)
  values(
    new.id,
    v_user_role_id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1),
      'User'
    ),
    new.email,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("p_permission" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_requested text;
  v_role_code text;
  v_override_effect text;
begin
  v_user_id := auth.uid();
  v_requested := lower(trim(coalesce(p_permission, '')));

  if v_user_id is null or v_requested = '' then
    return false;
  end if;

  select upper(r.code)
  into v_role_code
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = v_user_id
    and p.is_active = true
    and r.is_active = true
  limit 1;

  if v_role_code is null then
    return false;
  end if;

  -- 1. ADMIN selalu memiliki akses penuh ke seluruh modul
  if v_role_code = 'ADMIN' then
    return true;
  end if;

  -- 2. OTOMATIS: Semua akun yang terhubung ke Pekerja aktif berhak melihat Gaji & Pekerjaan Saya
  if (v_requested = 'pekerjaan_saya.view' or v_requested = 'pekerjaan_saya.*' or v_requested like 'pekerjaan_saya.%') then
    if exists (
      select 1 from public.user_worker_links uw
      where uw.user_id = v_user_id and uw.active = true
    ) then
      return true;
    end if;
  end if;

  -- 3. Cek Custom Override (ALLOW / DENY) dari tabel user_permission_overrides
  select o.effect
  into v_override_effect
  from public.user_permission_overrides o
  where o.user_id = v_user_id
    and o.is_active = true
    and (
      lower(o.permission_pattern) = v_requested
      or o.permission_pattern = '*'
      or (
        right(lower(o.permission_pattern), 2) = '.*'
        and left(v_requested, char_length(o.permission_pattern) - 1) =
            left(lower(o.permission_pattern), char_length(o.permission_pattern) - 1)
      )
    )
  order by
    case
      when lower(o.permission_pattern) = v_requested then 3
      when o.permission_pattern = '*' then 1
      else 2
    end desc,
    char_length(o.permission_pattern) desc,
    o.id asc
  limit 1;

  if found then
    return upper(coalesce(v_override_effect, '')) = 'ALLOW';
  end if;

  -- 4. Cek Permission bawaan Preset Role
  return exists (
    select 1
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where upper(r.code) = v_role_code
      and r.is_active = true
      and (
        lower(p.code) = v_requested
        or (
          right(lower(p.code), 2) = '.*'
          and left(v_requested, char_length(p.code) - 1) = left(lower(p.code), char_length(p.code) - 1)
        )
      )
  );
end;
$$;


ALTER FUNCTION "public"."has_permission"("p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inspect_auth_user"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  select to_jsonb(u) from auth.users u where lower(u.email) = lower(p_email);
$$;


ALTER FUNCTION "public"."inspect_auth_user"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_material_lot_whole"("p_issue_date" "date", "p_material_lot_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_purpose" "text", "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."issue_material_lot_whole"("p_issue_date" "date", "p_material_lot_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_purpose" "text", "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_worker_account"("p_email" "text", "p_worker_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_user uuid;
begin
  if upper(coalesce(public.current_user_role(),''))<>'ADMIN' and not public.has_permission('access_control.write') then
    raise exception 'Hanya ADMIN yang dapat menghubungkan akun pekerja.' using errcode='42501';
  end if;
  select id into v_user from auth.users where lower(email)=lower(btrim(p_email)) limit 1;
  if v_user is null then raise exception 'Akun dengan email tersebut belum ada di Supabase Auth.'; end if;
  perform 1 from public.workers where id=p_worker_id and status='AKTIF';
  if not found then raise exception 'Pekerja tidak ditemukan atau NONAKTIF.'; end if;
  insert into public.user_worker_links(user_id,worker_id,active,created_by)
  values(v_user,p_worker_id,true,auth.uid())
  on conflict(user_id) do update set worker_id=excluded.worker_id,active=true,updated_at=now();
end $$;


ALTER FUNCTION "public"."link_worker_account"("p_email" "text", "p_worker_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_payroll_payout_paid"("p_payout_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare p public.payroll_payouts%rowtype;d record;v_payment bigint;
begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin Payroll.' using errcode='42501'; end if;
  select * into p from public.payroll_payouts where id=p_payout_id for update;if not found or p.status<>'FINAL' then raise exception 'Payout FINAL tidak ditemukan.';end if;if p.payment_status='SUDAH_DIBAYAR' then return;end if;
  for d in select * from public.payroll_payout_deductions where payout_id=p.id and cash_advance_payment_id is null order by id loop
    v_payment:=public.pay_cash_advance(d.cash_advance_id,current_date,d.amount,case when p.payout_type='MINGGUAN' then 'PAYROLL_HARIAN' else 'PAYROLL_BULANAN' end,p.payout_code,'Potongan payout '||p.payout_code);update public.payroll_payout_deductions set cash_advance_payment_id=v_payment where id=d.id;
  end loop;
  update public.payroll_payouts set payment_status='SUDAH_DIBAYAR',paid_by=auth.uid(),paid_at=now() where id=p.id;update public.salary_submissions set status='DIBAYAR',paid_by=auth.uid(),paid_at=now() where payout_id=p.id;
end $$;


ALTER FUNCTION "public"."mark_payroll_payout_paid"("p_payout_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."master_reference_materials"("p_include_inactive" boolean DEFAULT true) RETURNS TABLE("id" bigint, "material_code" "text", "name" "text", "standard_unit" "text", "category" "text", "status" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not (
    public.has_permission('master_bahan.view')
    or public.has_permission('master_kebutuhan.view')
  ) then
    raise exception 'Tidak memiliki akses referensi bahan.' using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.material_code,
    m.name,
    m.standard_unit,
    m.category,
    m.status
  from public.materials m
  where (p_include_inactive or m.status = 'AKTIF')
  order by lower(m.name), m.material_code;
end;
$$;


ALTER FUNCTION "public"."master_reference_materials"("p_include_inactive" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."master_reference_materials_v2"("p_include_inactive" boolean DEFAULT true) RETURNS TABLE("id" bigint, "material_code" "text", "name" "text", "standard_unit" "text", "category" "text", "status" "text", "calculation_type" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."master_reference_materials_v2"("p_include_inactive" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."master_reference_products"("p_project_id" bigint DEFAULT NULL::bigint, "p_include_inactive" boolean DEFAULT true) RETURNS TABLE("id" bigint, "product_code" "text", "project_id" bigint, "name" "text", "target_production" numeric, "unit" "text", "status" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not (
    public.has_permission('master_produk_proyek.view')
    or public.has_permission('master_item.view')
    or public.has_permission('master_kebutuhan.view')
  ) then
    raise exception 'Tidak memiliki akses referensi Produk/Tas.' using errcode = '42501';
  end if;

  return query
  select
    pp.id,
    pp.product_code,
    pp.project_id,
    pp.name,
    pp.target_production,
    pp.unit,
    pp.status
  from public.project_products pp
  where (p_project_id is null or pp.project_id = p_project_id)
    and (p_include_inactive or pp.status = 'AKTIF')
  order by pp.project_id, lower(pp.name), pp.product_code;
end;
$$;


ALTER FUNCTION "public"."master_reference_products"("p_project_id" bigint, "p_include_inactive" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."master_reference_projects"() RETURNS TABLE("id" bigint, "project_code" "text", "name" "text", "product_category" "text", "customer_name" "text", "status" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not (
    public.has_permission('master_proyek.view')
    or public.has_permission('master_produk_proyek.view')
    or public.has_permission('master_item.view')
    or public.has_permission('master_kebutuhan.view')
  ) then
    raise exception 'Tidak memiliki akses referensi proyek.' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.project_code,
    p.name,
    p.product_category,
    p.customer_name,
    p.status
  from public.projects p
  order by lower(p.name), p.project_code;
end;
$$;


ALTER FUNCTION "public"."master_reference_projects"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_wip_stock"("p_transaction_date" "date", "p_cutting_component_id" bigint, "p_product_id" bigint, "p_quantity" numeric, "p_action" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."move_wip_stock"("p_transaction_date" "date", "p_cutting_component_id" bigint, "p_product_id" bigint, "p_quantity" numeric, "p_action" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pack_product_set"("p_date" "date", "p_set_id" bigint, "p_location_id" bigint, "p_set_qty" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare v_event bigint;v_id bigint;r record; begin
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


ALTER FUNCTION "public"."pack_product_set"("p_date" "date", "p_set_id" bigint, "p_location_id" bigint, "p_set_qty" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_cash_advance"("p_advance_id" bigint, "p_date" "date", "p_amount" numeric, "p_source" "text" DEFAULT 'MANUAL'::"text", "p_reference" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  a public.cash_advances%rowtype;
  v_id bigint;
  v_new_paid numeric;
  v_new_status text;
  v_inc_inst int := 0;
begin
  if not public.has_permission('kasbon.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin Kasbon.' using errcode='42501';
  end if;

  select * into a from public.cash_advances where id = p_advance_id for update;
  if not found or a.status <> 'AKTIF' then
    raise exception 'Kasbon tidak aktif atau tidak ditemukan.';
  end if;

  if coalesce(p_amount, 0) <= 0 or (a.paid_amount + p_amount) > a.amount then
    raise exception 'Nominal pembayaran melebihi sisa Kasbon (%).', (a.amount - a.paid_amount);
  end if;

  v_new_paid := a.paid_amount + p_amount;
  v_new_status := case when v_new_paid >= a.amount then 'LUNAS' else 'AKTIF' end;
  v_inc_inst := case when a.installment_count > 1 then 1 else 0 end;

  insert into public.cash_advance_payments(
    advance_id, payment_date, amount, source, reference, notes, created_by
  ) values (
    p_advance_id, coalesce(p_date, current_date), p_amount, coalesce(p_source, 'MANUAL'), p_reference, p_notes, auth.uid()
  ) returning id into v_id;

  update public.cash_advances set
    paid_amount = v_new_paid,
    installments_paid = least(a.installment_count, a.installments_paid + v_inc_inst),
    status = v_new_status
  where id = p_advance_id;

  return v_id;
end $$;


ALTER FUNCTION "public"."pay_cash_advance"("p_advance_id" bigint, "p_date" "date", "p_amount" numeric, "p_source" "text", "p_reference" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_project_product_parent_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_project_product_parent_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_work_item_parent_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_work_item_parent_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preview_secure_attendance_import"("p_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r jsonb;
  v_idx bigint;
  v_total int:=0;
  v_matched int:=0;
  v_problem_count int:=0;
  v_duplicate int:=0;
  v_verified int:=0;
  v_items jsonb:='[]'::jsonb;
  v_finger text;
  v_norm text;
  v_date date;
  v_in time;
  v_out time;
  v_worker_id bigint;
  v_worker_name text;
  v_match_count int;
  v_problem text;
  v_hash text;
  v_existing_status text;
  v_seen_hashes text[]:=array[]::text[];
begin
  if not public.has_permission('absensi.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin import Absensi.' using errcode='42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Data import tidak valid.'; end if;
  if jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>5000 then raise exception 'Jumlah baris import harus 1-5000.'; end if;

  for r,v_idx in select value,ordinality from jsonb_array_elements(p_rows) with ordinality loop
    v_total:=v_total+1;
    v_finger:=btrim(coalesce(r->>'idFinger',''));
    v_norm:=public.smpt_normalize_finger_id(v_finger);
    v_date:=public.smpt_secure_date(r->>'tanggal');
    v_in:=public.smpt_secure_time(r->>'jamMasuk');
    v_out:=public.smpt_secure_time(r->>'jamKeluar');
    v_worker_id:=null;v_worker_name:=null;v_match_count:=0;v_existing_status:=null;

    select count(*),min(id),min(name)
      into v_match_count,v_worker_id,v_worker_name
    from public.workers
    where status='AKTIF' and public.smpt_normalize_finger_id(finger_id)=v_norm and v_norm<>'';

    if v_match_count>0 then v_matched:=v_matched+1; end if;
    v_hash:=md5(concat_ws('|',v_norm,coalesce(v_date::text,''),coalesce(v_in::text,''),coalesce(v_out::text,'')));

    if v_date is null then
      v_problem:='TANGGAL_TIDAK_VALID';
    elsif v_match_count=0 then
      v_problem:='ID_BELUM_TERDAFTAR';
    elsif v_match_count>1 then
      v_problem:='ID_FINGER_GANDA';
    elsif v_hash=any(v_seen_hashes) or exists(select 1 from public.attendance_import_rows where row_hash=v_hash) then
      v_problem:='DUPLIKAT';v_duplicate:=v_duplicate+1;
    else
      select verification_status into v_existing_status
      from public.attendance_records
      where worker_id=v_worker_id and attendance_date=v_date;
      if v_existing_status='TERVERIFIKASI' then
        v_problem:='SUDAH_TERVERIFIKASI';v_verified:=v_verified+1;
      elsif v_in is null and v_out is null then
        v_problem:='TANPA_SCAN';
      elsif v_in is null or v_out is null then
        v_problem:='SCAN_TIDAK_LENGKAP';
      else
        v_problem:='NORMAL';
      end if;
    end if;

    if v_problem not in ('NORMAL','DUPLIKAT','SUDAH_TERVERIFIKASI') then
      v_problem_count:=v_problem_count+1;
    end if;
    v_seen_hashes:=array_append(v_seen_hashes,v_hash);

    v_items:=v_items||jsonb_build_array(
      r||jsonb_build_object(
        'rowNo',coalesce(nullif(r->>'rowNo','')::int,v_idx::int),
        'workerId',v_worker_id,
        'workerName',v_worker_name,
        'problem',v_problem
      )
    );
  end loop;

  return jsonb_build_object(
    'total',v_total,
    'matched',v_matched,
    'problem',v_problem_count,
    'duplicate',v_duplicate,
    'verifiedProtected',v_verified,
    'rows',v_items
  );
end $$;


ALTER FUNCTION "public"."preview_secure_attendance_import"("p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_bundle_package_packing"("p_date" "date", "p_package_id" bigint, "p_location_id" bigint, "p_bundle_qty" numeric, "p_notes" "text", "p_components" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
                                      DECLARE
                                        v_log_id BIGINT;
                                          v_code VARCHAR(50);
                                            v_item JSONB;
                                              v_fg_id BIGINT;
                                                v_qty_per NUMERIC;
                                                  v_total_needed NUMERIC;
                                                    v_seq INT;
                                                    BEGIN
                                                      IF p_bundle_qty <= 0 THEN
                                                          RAISE EXCEPTION 'Jumlah bundle harus lebih dari 0.';
                                                            END IF;

                                                              -- Generate Kode: BDL-YYYYMMDD-XXXX
                                                                SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq
                                                                  FROM bundle_packing_logs
                                                                    WHERE bundling_date = p_date;

                                                                      v_code := 'BDL-' || TO_CHAR(p_date, 'YYYYMMDD') || '-' || LPAD(v_seq::TEXT, 4, '0');

                                                                        -- Catat Log Transaksi
                                                                          INSERT INTO bundle_packing_logs (
                                                                              bundling_code, package_id, location_id, bundling_date, bundle_qty, notes
                                                                                ) VALUES (
                                                                                    v_code, p_package_id, p_location_id, p_date, p_bundle_qty, p_notes
                                                                                      ) RETURNING id INTO v_log_id;

                                                                                        -- Potong Stok Satuan (finished_goods) di Gudang Pusat
                                                                                          FOR v_item IN SELECT * FROM jsonb_array_elements(p_components)
                                                                                            LOOP
                                                                                                v_fg_id := (v_item->>'finished_good_id')::BIGINT;
                                                                                                    v_qty_per := (v_item->>'qty_per_bundle')::NUMERIC;
                                                                                                        v_total_needed := v_qty_per * p_bundle_qty;

                                                                                                            INSERT INTO bundle_packing_log_items (
                                                                                                                  log_id, finished_good_id, qty_per_bundle, total_qty
                                                                                                                      ) VALUES (
                                                                                                                            v_log_id, v_fg_id, v_qty_per, v_total_needed
                                                                                                                                );

                                                                                                                                    UPDATE logistics_stock_balances
                                                                                                                                        SET quantity = quantity - v_total_needed,
                                                                                                                                                updated_at = NOW()
                                                                                                                                                    WHERE location_id = p_location_id
                                                                                                                                                          AND finished_good_id = v_fg_id
                                                                                                                                                                AND item_kind = 'FINISHED_GOOD';

                                                                                                                                                                    IF NOT FOUND THEN
                                                                                                                                                                          INSERT INTO logistics_stock_balances (
                                                                                                                                                                                  location_id, finished_good_id, item_kind, quantity, updated_at
                                                                                                                                                                                        ) VALUES (
                                                                                                                                                                                                p_location_id, v_fg_id, 'FINISHED_GOOD', -v_total_needed, NOW()
                                                                                                                                                                                                      );
                                                                                                                                                                                                          END IF;
                                                                                                                                                                                                            END LOOP;

                                                                                                                                                                                                              -- Tambah Stok Paket Jadi di bundle_package_balances
                                                                                                                                                                                                                INSERT INTO bundle_package_balances (
                                                                                                                                                                                                                    package_id, location_id, quantity, updated_at
                                                                                                                                                                                                                      ) VALUES (
                                                                                                                                                                                                                          p_package_id, p_location_id, p_bundle_qty, NOW()
                                                                                                                                                                                                                            )
                                                                                                                                                                                                                              ON CONFLICT (package_id, location_id)
                                                                                                                                                                                                                                DO UPDATE SET
                                                                                                                                                                                                                                    quantity = bundle_package_balances.quantity + EXCLUDED.quantity,
                                                                                                                                                                                                                                        updated_at = NOW();

                                                                                                                                                                                                                                          RETURN v_log_id;
                                                                                                                                                                                                                                          END;
                                                                                                                                                                                                                                          $$;


ALTER FUNCTION "public"."process_bundle_package_packing"("p_date" "date", "p_package_id" bigint, "p_location_id" bigint, "p_bundle_qty" numeric, "p_notes" "text", "p_components" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_bundling_isian"("p_date" "date", "p_bundle_fg_id" bigint, "p_location_id" bigint, "p_bundle_qty" numeric, "p_notes" "text", "p_components" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_bundling_code text;
  v_bundling_id bigint;
  v_comp jsonb;
  v_fg_id bigint;
  v_qty_per numeric;
  v_total_needed numeric;
  v_current_stock numeric;
  v_comp_name text;
  v_bundle_name text;
  v_balance_id bigint;
begin
  if p_bundle_qty <= 0 then
    raise exception 'Jumlah bundle harus lebih besar dari 0.';
  end if;

  select name into v_bundle_name from public.finished_goods where id = p_bundle_fg_id;
  if v_bundle_name is null then
    raise exception 'Barang jadi bundle tidak ditemukan (ID: %).', p_bundle_fg_id;
  end if;

  -- Generate bundling code BND-YYYYMMDD-XXXX
  select 'BND-' || to_char(coalesce(p_date, current_date), 'YYYYMMDD') || '-' || lpad((coalesce(count(*), 0) + 1)::text, 4, '0')
  into v_bundling_code
  from public.finished_goods_bundling
  where bundling_date = coalesce(p_date, current_date);

  -- 1. Validate all components stock first
  for v_comp in select * from jsonb_array_elements(p_components) loop
    v_fg_id := (v_comp->>'finished_good_id')::bigint;
    v_qty_per := coalesce((v_comp->>'qty_per_bundle')::numeric, 1);
    v_total_needed := v_qty_per * p_bundle_qty;

    select name into v_comp_name from public.finished_goods where id = v_fg_id;
    
    select coalesce(quantity, 0) into v_current_stock
    from public.logistics_stock_balances
    where item_kind = 'FINISHED_GOOD'
      and finished_good_id = v_fg_id
      and location_id = p_location_id;

    if coalesce(v_current_stock, 0) < v_total_needed then
      raise exception 'Stok komponen "%" tidak mencukupi di lokasi ini. Tersedia: %, Dibutuhkan: %',
        coalesce(v_comp_name, '#' || v_fg_id), coalesce(v_current_stock, 0), v_total_needed;
    end if;
  end loop;

  -- 2. Deduct component stocks and record items
  insert into public.finished_goods_bundling (
    bundling_code, bundling_date, bundle_name, bundle_finished_good_id,
    location_id, bundle_qty, notes, created_by
  ) values (
    v_bundling_code, coalesce(p_date, current_date), v_bundle_name, p_bundle_fg_id,
    p_location_id, p_bundle_qty, p_notes, auth.uid()
  ) returning id into v_bundling_id;

  for v_comp in select * from jsonb_array_elements(p_components) loop
    v_fg_id := (v_comp->>'finished_good_id')::bigint;
    v_qty_per := coalesce((v_comp->>'qty_per_bundle')::numeric, 1);
    v_total_needed := v_qty_per * p_bundle_qty;

    insert into public.finished_goods_bundling_items (
      bundling_id, component_finished_good_id, qty_per_bundle, total_qty
    ) values (
      v_bundling_id, v_fg_id, v_qty_per, v_total_needed
    );

    -- Deduct component stock
    update public.logistics_stock_balances
    set quantity = quantity - v_total_needed,
        updated_at = now()
    where item_kind = 'FINISHED_GOOD'
      and finished_good_id = v_fg_id
      and location_id = p_location_id;

    -- Record ledger for component out
    insert into public.logistics_stock_ledger (
      item_kind, finished_good_id, location_id, movement_kind,
      quantity_delta, notes
    ) values (
      'FINISHED_GOOD', v_fg_id, p_location_id, 'OUT',
      -v_total_needed, 'Komponen Bundling ' || v_bundling_code
    );
  end loop;

  -- 3. Add bundle stock in logistics_stock_balances
  select id into v_balance_id
  from public.logistics_stock_balances
  where item_kind = 'FINISHED_GOOD'
    and finished_good_id = p_bundle_fg_id
    and location_id = p_location_id
  for update;

  if v_balance_id is not null then
    update public.logistics_stock_balances
    set quantity = quantity + p_bundle_qty,
        updated_at = now()
    where id = v_balance_id;
  else
    insert into public.logistics_stock_balances (
      item_kind, finished_good_id, location_id, quantity
    ) values (
      'FINISHED_GOOD', p_bundle_fg_id, p_location_id, p_bundle_qty
    );
  end if;

  -- Record ledger for bundle in
  insert into public.logistics_stock_ledger (
    item_kind, finished_good_id, location_id, movement_kind,
    quantity_delta, notes
  ) values (
    'FINISHED_GOOD', p_bundle_fg_id, p_location_id, 'IN',
    p_bundle_qty, 'Hasil Bundling Isian ' || v_bundling_code
  );

  return jsonb_build_object(
    'success', true,
    'bundling_id', v_bundling_id,
    'bundling_code', v_bundling_code,
    'bundle_qty', p_bundle_qty
  );
end;
$$;


ALTER FUNCTION "public"."process_bundling_isian"("p_date" "date", "p_bundle_fg_id" bigint, "p_location_id" bigint, "p_bundle_qty" numeric, "p_notes" "text", "p_components" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_production_order"("p_order_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."publish_production_order"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_embarkation_shipment"("p_shipment_id" bigint, "p_received" numeric, "p_reject" numeric, "p_damaged" numeric, "p_missing" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare s public.embarkation_shipments%rowtype; begin
  if not public.has_permission('pengiriman_embarkasi.operate') then raise exception 'Tidak memiliki izin konfirmasi penerimaan.' using errcode='42501';end if;select * into s from public.embarkation_shipments where id=p_shipment_id for update;if not found or s.status<>'DIKIRIM' then raise exception 'Pengiriman harus DIKIRIM.';end if;
  if least(coalesce(p_received,0),coalesce(p_reject,0),coalesce(p_damaged,0),coalesce(p_missing,0))<0 or p_received+p_missing<>s.quantity or p_reject+p_damaged>p_received then raise exception 'Qty penerimaan tidak valid. Diterima + Kurang harus sama dengan Qty Kirim, dan Reject + Rusak tidak boleh melebihi Diterima.';end if;
  update public.embarkation_shipments set status='DITERIMA',received_qty=p_received,reject_qty=p_reject,damaged_qty=p_damaged,missing_qty=p_missing,notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),received_at=now() where id=p_shipment_id;
end $$;


ALTER FUNCTION "public"."receive_embarkation_shipment"("p_shipment_id" bigint, "p_received" numeric, "p_reject" numeric, "p_damaged" numeric, "p_missing" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_external_finished_good"("p_date" "date", "p_finished_good_id" bigint, "p_vendor_id" bigint, "p_location_id" bigint, "p_quantity" numeric, "p_document_no" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare v_event bigint;v_id bigint;v_unit text; begin
  if not public.has_permission('barang_luar.receive') then raise exception 'Tidak memiliki izin Barang Luar.' using errcode='42501'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Qty harus lebih besar dari nol.';end if;select unit into v_unit from public.finished_goods where id=p_finished_good_id and status='AKTIF';if v_unit is null then raise exception 'Barang Jadi tidak ditemukan.';end if;
  v_event:=public.smpt_new_logistics_event('EXTERNAL_RECEIPT','BARANG_LUAR',null,null,p_date,p_notes,null);perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',p_finished_good_id,null,p_location_id,p_quantity,v_unit,'BARANG LUAR MASUK',p_notes);
  insert into public.external_finished_receipts(receipt_date,finished_good_id,vendor_id,location_id,quantity,document_no,notes,stock_event_id) values(coalesce(p_date,current_date),p_finished_good_id,p_vendor_id,p_location_id,p_quantity,p_document_no,p_notes,v_event) returning id into v_id;
    return v_id;
end $$;


ALTER FUNCTION "public"."receive_external_finished_good"("p_date" "date", "p_finished_good_id" bigint, "p_vendor_id" bigint, "p_location_id" bigint, "p_quantity" numeric, "p_document_no" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_checker_result"("p_order_item_id" bigint, "p_check_date" "date", "p_good_qty" numeric, "p_reject_qty" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."record_checker_result"("p_order_item_id" bigint, "p_check_date" "date", "p_good_qty" numeric, "p_reject_qty" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_cutting_material_usage"("p_usage_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_quantity" numeric, "p_officer" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."record_cutting_material_usage"("p_usage_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_quantity" numeric, "p_officer" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_cutting_result"("p_result_date" "date", "p_cutting_component_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric, "p_officer" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."record_cutting_result"("p_result_date" "date", "p_cutting_component_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric, "p_officer" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_manual_production_result"("p_result_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_work_item_id" bigint, "p_worker_id" bigint, "p_qty" numeric, "p_reason" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_project public.projects%rowtype;
  v_product public.project_products%rowtype;
  v_item public.work_items%rowtype;
  v_worker public.workers%rowtype;
  v_id bigint;
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_submission numeric;
begin
  if not public.has_permission('hasil_produksi.write') then
    raise exception 'Tidak memiliki izin input Hasil Produksi manual.' using errcode='42501';
  end if;
  if coalesce(p_qty,0)<=0 then raise exception 'Qty hasil harus lebih dari 0.'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Alasan/catatan manipulasi wajib diisi.'; end if;
  if v_email='' then raise exception 'Email akun login tidak tersedia untuk audit trail.'; end if;
  if exists(
    select 1 from public.operator_payroll_runs r
    where r.status='FINAL' and coalesce(p_result_date,current_date) between r.period_start and r.period_end
  ) then
    raise exception 'Periode hasil ini sudah masuk Payroll Operator FINAL. Hasil manual baru tidak boleh disisipkan ke snapshot payroll lama.';
  end if;

  select * into v_project from public.projects where id=p_project_id;
  if not found then raise exception 'Proyek tidak ditemukan.'; end if;
  if upper(coalesce(v_project.status,'')) in ('SELESAI','NONAKTIF','BATAL','DIBATALKAN') then
    raise exception 'Proyek sudah tidak aktif untuk input hasil.';
  end if;

  select * into v_product from public.project_products
  where id=p_product_id and project_id=p_project_id and status='AKTIF';
  if not found then raise exception 'Produk/Tas tidak sesuai Proyek atau NONAKTIF.'; end if;

  select * into v_item from public.work_items
  where id=p_work_item_id and project_id=p_project_id and product_id=p_product_id and status='AKTIF';
  if not found then raise exception 'Item Pekerjaan tidak sesuai Proyek/Produk atau NONAKTIF.'; end if;
  if v_item.executor_scope not in ('PEKERJA_HARIAN','KEDUANYA') then
    raise exception 'Item Pekerjaan ini tidak dikonfigurasi untuk Pekerja HARIAN.';
  end if;
  if v_item.submission_category<>'BORONGAN' then
    raise exception 'Item Pekerjaan ini tidak mempunyai kategori pengajuan BORONGAN.';
  end if;

  select * into v_worker from public.workers where id=p_worker_id and status='AKTIF';
  if not found then raise exception 'Pekerja tidak ditemukan atau NONAKTIF.'; end if;
  if upper(coalesce(v_worker.pay_system,''))<>'HARIAN' then
    raise exception 'Flow manipulasi ini hanya untuk pekerja dengan sistem bayar HARIAN.';
  end if;

  v_submission:=round((p_qty*v_item.proposed_price)::numeric,2);

  insert into public.production_manual_results(
    result_date,project_id,product_id,work_item_id,worker_id,
    project_code_snapshot,project_name_snapshot,product_code_snapshot,product_name_snapshot,
    work_item_code_snapshot,work_item_name_snapshot,worker_code_snapshot,worker_name_snapshot,worker_pay_system_snapshot,
    qty_good,operator_price_snapshot,submission_price_snapshot,operator_value,submission_value,reason,
    created_by,created_by_email_snapshot
  ) values(
    coalesce(p_result_date,current_date),p_project_id,p_product_id,p_work_item_id,p_worker_id,
    v_project.project_code,v_project.name,v_product.product_code,v_product.name,
    v_item.item_code,v_item.name,v_worker.worker_code,v_worker.name,'HARIAN',
    p_qty,v_item.operator_price,v_item.proposed_price,0,v_submission,btrim(p_reason),
    auth.uid(),v_email
  ) returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."record_manual_production_result"("p_result_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_work_item_id" bigint, "p_worker_id" bigint, "p_qty" numeric, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_manufacturing_transaction"("p_flow_type" "text", "p_date" "date", "p_project_id" bigint DEFAULT NULL::bigint, "p_product_id" bigint DEFAULT NULL::bigint, "p_material_id" bigint DEFAULT NULL::bigint, "p_finished_good_id" bigint DEFAULT NULL::bigint, "p_vendor_id" bigint DEFAULT NULL::bigint, "p_quantity" numeric DEFAULT 0, "p_unit" "text" DEFAULT NULL::"text", "p_document_no" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
                      DECLARE
                        v_code text;
                          v_prefix text;
                            v_next_id bigint;
                            BEGIN
                              IF p_flow_type ILIKE '%OPNAME%' THEN
                                  v_prefix := 'OPN';
                                    ELSIF p_flow_type = 'TITIPAN' THEN
                                        v_prefix := 'TIT';
                                          ELSIF p_flow_type = 'BARANG_LUAR' THEN
                                              v_prefix := 'BLR';
                                                ELSIF p_flow_type = 'PENGIRIMAN' THEN
                                                    v_prefix := 'KRM';
                                                      ELSE
                                                          v_prefix := 'MNF';
                                                            END IF;

                                                              v_code := v_prefix || '-' || to_char(p_date, 'YYYYMMDD') || '-' || lpad(floor(random() * 9000 + 1000)::text, 4, '0');

                                                                INSERT INTO public.manufacturing_transactions (
                                                                    manufacturing_code,
                                                                        transaction_date,
                                                                            flow_type,
                                                                                project_id,
                                                                                    product_id,
                                                                                        material_id,
                                                                                            finished_good_id,
                                                                                                vendor_id,
                                                                                                    quantity,
                                                                                                        unit,
                                                                                                            document_no,
                                                                                                                description,
                                                                                                                    status
                                                                                                                      ) VALUES (
                                                                                                                          v_code,
                                                                                                                              p_date,
                                                                                                                                  p_flow_type,
                                                                                                                                      p_project_id,
                                                                                                                                          p_product_id,
                                                                                                                                              p_material_id,
                                                                                                                                                  p_finished_good_id,
                                                                                                                                                      p_vendor_id,
                                                                                                                                                          p_quantity,
                                                                                                                                                              p_unit,
                                                                                                                                                                  p_document_no,
                                                                                                                                                                      p_description,
                                                                                                                                                                          'AKTIF'
                                                                                                                                                                            )
                                                                                                                                                                              RETURNING id INTO v_next_id;

                                                                                                                                                                                RETURN v_next_id;
                                                                                                                                                                                END;
                                                                                                                                                                                $$;


ALTER FUNCTION "public"."record_manufacturing_transaction"("p_flow_type" "text", "p_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_material_id" bigint, "p_finished_good_id" bigint, "p_vendor_id" bigint, "p_quantity" numeric, "p_unit" "text", "p_document_no" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_quality_control"("p_production_check_id" bigint, "p_inspection_date" "date", "p_good_qty" numeric, "p_reject_qty" numeric, "p_rework_qty" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."record_quality_control"("p_production_check_id" bigint, "p_inspection_date" "date", "p_good_qty" numeric, "p_reject_qty" numeric, "p_rework_qty" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_ready_production_usage"("p_usage_date" "date", "p_item_kind" "text", "p_reference_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_quantity" numeric, "p_officer" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."record_ready_production_usage"("p_usage_date" "date", "p_item_kind" "text", "p_reference_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_quantity" numeric, "p_officer" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_warung_debt"("p_worker_id" bigint, "p_amount" numeric, "p_warung_name" "text" DEFAULT NULL::"text", "p_date" "date" DEFAULT CURRENT_DATE, "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_id bigint;
  v_warung text;
begin
  if not public.has_permission('warung.write') 
     and not public.has_permission('kasbon.write') 
     and upper(coalesce(public.current_user_role(),'')) <> 'ADMIN' then
    raise exception 'Tidak memiliki izin mencatat hutang warung.' using errcode='42501';
  end if;

  if p_worker_id is null or not exists(select 1 from public.workers where id = p_worker_id and status = 'AKTIF') then
    raise exception 'Pekerja tidak valid atau nonaktif.';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Nominal hutang harus lebih besar dari 0.';
  end if;

  v_warung := coalesce(nullif(btrim(p_warung_name), ''), 'Warung Luar');

  insert into public.cash_advances (
    worker_id,
    advance_date,
    amount,
    paid_amount,
    category,
    warung_name,
    installment_count,
    installment_amount,
    installments_paid,
    status,
    notes,
    created_by
  ) values (
    p_worker_id,
    coalesce(p_date, current_date),
    p_amount,
    0,
    'KASBON_WARUNG',
    v_warung,
    1,
    p_amount,
    0,
    'AKTIF',
    p_notes,
    auth.uid()
  ) returning id into v_id;

  return v_id;
end $$;


ALTER FUNCTION "public"."record_warung_debt"("p_worker_id" bigint, "p_amount" numeric, "p_warung_name" "text", "p_date" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_material_request_item"("p_item_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_status text;
begin
  if not public.has_permission('permintaan_produksi.write') then raise exception 'Tidak memiliki izin Permintaan Barang.' using errcode='42501'; end if;
  select r.status into v_status from public.material_request_items i join public.material_requests r on r.id=i.request_id where i.id=p_item_id for update of r;
  if v_status is null or v_status<>'DRAFT' then raise exception 'Hanya detail DRAFT yang dapat dihapus.'; end if;
  delete from public.material_request_items where id=p_item_id;
end; $$;


ALTER FUNCTION "public"."remove_material_request_item"("p_item_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_production_order_item"("p_order_id" bigint, "p_order_item_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.has_permission('spk.write') then
    raise exception 'Tidak memiliki izin mengubah SPK.' using errcode='42501';
  end if;

  perform 1 from public.production_orders
  where id = p_order_id and status in ('DRAFT', 'AKTIF')
  for update;

  if not found then
    raise exception 'SPK tidak valid atau sudah selesai/dibatalkan.';
  end if;

  if exists(
    select 1 from public.production_checks c
    where c.order_item_id = p_order_item_id
      and c.status = 'AKTIF'
      and (c.good_qty + c.reject_qty) > 0
  ) then
    raise exception 'Item SPK sudah diperiksa oleh Checker dan terkunci.';
  end if;

  delete from public.production_order_items
  where id = p_order_item_id and order_id = p_order_id;

  update public.production_orders
  set updated_at = now()
  where id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."remove_production_order_item"("p_order_id" bigint, "p_order_item_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_payroll_attendance"("p_attendance_id" bigint, "p_day_class" "text" DEFAULT NULL::"text", "p_overtime_review_status" "text" DEFAULT NULL::"text", "p_overtime_approved_minutes" integer DEFAULT 0, "p_meal_class" "text" DEFAULT NULL::"text", "p_bonus_ot_review_status" "text" DEFAULT NULL::"text", "p_is_holiday" boolean DEFAULT false, "p_holiday_review_status" "text" DEFAULT NULL::"text", "p_holiday_manual_amount" numeric DEFAULT 0, "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare a public.attendance_records%rowtype;v_day text:=nullif(upper(btrim(coalesce(p_day_class,''))),'');v_ot text:=nullif(upper(btrim(coalesce(p_overtime_review_status,''))),'');v_meal text:=nullif(upper(btrim(coalesce(p_meal_class,''))),'');v_bonus text:=nullif(upper(btrim(coalesce(p_bonus_ot_review_status,''))),'');v_holiday text:=nullif(upper(btrim(coalesce(p_holiday_review_status,''))),'');
begin
  if not public.has_permission('payroll.write') and not public.has_permission('absensi.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin review Payroll.' using errcode='42501'; end if;
  select * into a from public.attendance_records where id=p_attendance_id for update;
  if not found then raise exception 'Absensi tidak ditemukan.'; end if;
  if a.verification_status<>'TERVERIFIKASI' then raise exception 'Absensi harus TERVERIFIKASI sebelum review Payroll.'; end if;
  if v_day is not null and v_day not in ('FULL_DAY','HALF_DAY') then raise exception 'Klasifikasi hari tidak valid.'; end if;
  if v_ot is not null and v_ot not in ('DISETUJUI','DITOLAK') then raise exception 'Status review lembur tidak valid.'; end if;
  if v_meal is not null and v_meal not in ('FULL','HALF','ZERO') then raise exception 'Klasifikasi uang makan tidak valid.'; end if;
  if v_bonus is not null and v_bonus not in ('DISETUJUI','DITOLAK') then raise exception 'Status bonus OT tidak valid.'; end if;
  if v_holiday is not null and v_holiday not in ('TANPA_TAMBAHAN','NOMINAL_MANUAL') then raise exception 'Status hari libur tidak valid.'; end if;
  if coalesce(p_overtime_approved_minutes,0)<0 or coalesce(p_overtime_approved_minutes,0)>a.overtime_minutes then raise exception 'OT disetujui tidak boleh melebihi kandidat OT % menit.',a.overtime_minutes; end if;
  if v_ot='DITOLAK' then p_overtime_approved_minutes:=0; end if;
  if coalesce(p_holiday_manual_amount,0)<0 then raise exception 'Nominal hari libur tidak valid.'; end if;
  insert into public.payroll_attendance_reviews(attendance_id,day_class,overtime_review_status,overtime_candidate_snapshot,overtime_approved_minutes,meal_class,bonus_ot_review_status,is_holiday,holiday_review_status,holiday_manual_amount,notes,reviewed_by,reviewed_at)
  values(a.id,v_day,v_ot,a.overtime_minutes,coalesce(p_overtime_approved_minutes,0),v_meal,v_bonus,coalesce(p_is_holiday,false),v_holiday,coalesce(p_holiday_manual_amount,0),p_notes,auth.uid(),now())
  on conflict(attendance_id) do update set day_class=excluded.day_class,overtime_review_status=excluded.overtime_review_status,overtime_candidate_snapshot=excluded.overtime_candidate_snapshot,overtime_approved_minutes=excluded.overtime_approved_minutes,meal_class=excluded.meal_class,bonus_ot_review_status=excluded.bonus_ot_review_status,is_holiday=excluded.is_holiday,holiday_review_status=excluded.holiday_review_status,holiday_manual_amount=excluded.holiday_manual_amount,notes=excluded.notes,reviewed_by=auth.uid(),reviewed_at=now();
  update public.attendance_records set day_class=v_day where id=a.id;
end $$;


ALTER FUNCTION "public"."review_payroll_attendance"("p_attendance_id" bigint, "p_day_class" "text", "p_overtime_review_status" "text", "p_overtime_approved_minutes" integer, "p_meal_class" "text", "p_bonus_ot_review_status" "text", "p_is_holiday" boolean, "p_holiday_review_status" "text", "p_holiday_manual_amount" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_bom_requirement"("p_requirement_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_material_id" bigint, "p_component_type" "text", "p_component_name" "text", "p_unit" "text", "p_qty_per_unit" numeric, "p_unit_price" numeric, "p_status" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_id bigint;
  v_type text;
  v_name text;
  v_unit text;
  v_status text;
  v_material_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak ditemukan.' using errcode = '42501';
  end if;

  if not public.has_permission('master_kebutuhan.write') then
    raise exception 'Tidak memiliki izin mengubah Master Kebutuhan.' using errcode = '42501';
  end if;

  v_type := upper(btrim(coalesce(p_component_type, 'BAHAN')));
  v_status := upper(btrim(coalesce(p_status, 'AKTIF')));
  v_name := regexp_replace(btrim(coalesce(p_component_name, '')), '\s+', ' ', 'g');
  v_unit := regexp_replace(btrim(coalesce(p_unit, '')), '\s+', ' ', 'g');
  v_material_id := p_material_id;

  if p_project_id is null then
    raise exception 'Proyek wajib dipilih.';
  end if;

  if p_product_id is null then
    raise exception 'Produk/Tas wajib dipilih agar kebutuhan dan modal tidak tercampur.';
  end if;

  perform 1
  from public.project_products pp
  where pp.id = p_product_id
    and pp.project_id = p_project_id;

  if not found then
    raise exception 'Produk/Tas tidak ditemukan pada proyek yang dipilih.';
  end if;

  if v_type not in ('BAHAN', 'JASA', 'BIAYA') then
    raise exception 'Jenis komponen tidak valid.';
  end if;

  if p_qty_per_unit is null or p_qty_per_unit < 0 then
    raise exception 'Kebutuhan per unit tidak boleh negatif.';
  end if;

  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'Harga satuan tidak boleh negatif.';
  end if;

  if v_status not in ('AKTIF', 'NONAKTIF') then
    raise exception 'Status kebutuhan tidak valid.';
  end if;

  if v_type = 'BAHAN' then
    if v_material_id is null then
      raise exception 'Komponen BAHAN wajib dipilih dari Master Bahan.';
    end if;

    select m.name, m.standard_unit
    into v_name, v_unit
    from public.materials m
    where m.id = v_material_id;

    if not found then
      raise exception 'Master Bahan tidak ditemukan.';
    end if;
  else
    v_material_id := null;

    if v_name = '' then
      raise exception 'Nama komponen wajib diisi.';
    end if;

    if v_unit = '' then
      raise exception 'Satuan wajib diisi.';
    end if;
  end if;

  if p_requirement_id is null then
    insert into public.bom_requirements (
      project_id,
      product_id,
      material_id,
      component_type,
      component_name,
      unit,
      qty_per_unit,
      unit_price,
      status,
      legacy_project_level,
      created_by,
      updated_by
    )
    values (
      p_project_id,
      p_product_id,
      v_material_id,
      v_type,
      v_name,
      v_unit,
      p_qty_per_unit,
      p_unit_price,
      v_status,
      false,
      auth.uid(),
      auth.uid()
    )
    returning id into v_id;
  else
    update public.bom_requirements
    set
      project_id = p_project_id,
      product_id = p_product_id,
      material_id = v_material_id,
      component_type = v_type,
      component_name = v_name,
      unit = v_unit,
      qty_per_unit = p_qty_per_unit,
      unit_price = p_unit_price,
      status = v_status,
      legacy_project_level = false,
      updated_by = auth.uid()
    where id = p_requirement_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Data kebutuhan yang akan diedit tidak ditemukan.';
    end if;
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."save_bom_requirement"("p_requirement_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_material_id" bigint, "p_component_type" "text", "p_component_name" "text", "p_unit" "text", "p_qty_per_unit" numeric, "p_unit_price" numeric, "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_bom_requirement_v2"("p_requirement_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_material_id" bigint, "p_component_type" "text", "p_component_name" "text", "p_unit" "text", "p_qty_per_unit" numeric, "p_unit_price" numeric, "p_status" "text", "p_fulfillment_source" "text", "p_calculation_method" "text", "p_net_usage_per_product" numeric, "p_allowance_percent" numeric, "p_waste_percent" numeric, "p_final_requirement" numeric, "p_calculation_input_snapshot" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."save_bom_requirement_v2"("p_requirement_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_material_id" bigint, "p_component_type" "text", "p_component_name" "text", "p_unit" "text", "p_qty_per_unit" numeric, "p_unit_price" numeric, "p_status" "text", "p_fulfillment_source" "text", "p_calculation_method" "text", "p_net_usage_per_product" numeric, "p_allowance_percent" numeric, "p_waste_percent" numeric, "p_final_requirement" numeric, "p_calculation_input_snapshot" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_cutting_component"("p_component_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_name" "text", "p_qty_per_product" numeric, "p_unit" "text", "p_color" "text" DEFAULT ''::"text", "p_notes" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT 'AKTIF'::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."save_cutting_component"("p_component_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_name" "text", "p_qty_per_product" numeric, "p_unit" "text", "p_color" "text", "p_notes" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_material_supplier"("p_material_id" bigint, "p_supplier_id" bigint, "p_supplier_material_code" "text", "p_supplier_material_name" "text", "p_supplier_unit" "text", "p_conversion_factor" numeric, "p_last_price" numeric, "p_preferred" boolean, "p_moq" numeric, "p_estimated_lead_time_days" integer, "p_default_purchase_unit" "text", "p_notes" "text", "p_status" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."save_material_supplier"("p_material_id" bigint, "p_supplier_id" bigint, "p_supplier_material_code" "text", "p_supplier_material_name" "text", "p_supplier_unit" "text", "p_conversion_factor" numeric, "p_last_price" numeric, "p_preferred" boolean, "p_moq" numeric, "p_estimated_lead_time_days" integer, "p_default_purchase_unit" "text", "p_notes" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_payroll_shift_settings"("p_settings" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  k text;
  v text;
  v_num numeric;
begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin mengubah pengaturan Payroll.' using errcode='42501';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Data pengaturan tidak valid.';
  end if;

  for k, v in select key, value#>>'{}' from jsonb_each(p_settings) loop
    if v ~ '^-?[0-9]+(\.[0-9]+)?$' then
      v_num := v::numeric;
      insert into public.payroll_settings(key, value_numeric, value_text, updated_by, updated_at)
      values(k, v_num, v, auth.uid(), now())
      on conflict(key) do update set
        value_numeric = excluded.value_numeric,
        value_text = excluded.value_text,
        updated_by = auth.uid(),
        updated_at = now();
    else
      insert into public.payroll_settings(key, value_numeric, value_text, updated_by, updated_at)
      values(k, null, v, auth.uid(), now())
      on conflict(key) do update set
        value_numeric = null,
        value_text = excluded.value_text,
        updated_by = auth.uid(),
        updated_at = now();
    end if;
  end loop;

  return jsonb_build_object('success', true, 'message', 'Pengaturan berhasil disimpan.');
end $_$;


ALTER FUNCTION "public"."save_payroll_shift_settings"("p_settings" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_work_item"("p_item_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_name" "text", "p_unit" "text", "p_qty_per_product" integer, "p_operator_price" bigint, "p_proposed_price" bigint, "p_status" "text", "p_output_final" boolean) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_id bigint;
  v_name text;
  v_unit text;
  v_status text;
  v_output_final boolean;
  v_existing public.work_items%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak ditemukan.' using errcode = '42501';
  end if;

  if not public.has_permission('master_item.write') then
    raise exception 'Anda tidak memiliki izin mengubah Master Item Pekerjaan.' using errcode = '42501';
  end if;

  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_unit := btrim(coalesce(p_unit, ''));
  v_status := upper(btrim(coalesce(p_status, 'AKTIF')));
  v_output_final := coalesce(p_output_final, false);

  if p_project_id is null then
    raise exception 'Proyek wajib dipilih.';
  end if;

  if p_product_id is null then
    raise exception 'Produk wajib dipilih.';
  end if;

  if v_name = '' then
    raise exception 'Nama pekerjaan wajib diisi.';
  end if;

  if v_unit = '' then
    raise exception 'Satuan wajib dipilih.';
  end if;

  if p_qty_per_product is null or p_qty_per_product <= 0 then
    raise exception 'Qty Pekerjaan / Produk harus bilangan bulat lebih dari 0.';
  end if;

  if p_operator_price is null or p_operator_price < 0 then
    raise exception 'Harga Operator tidak boleh negatif.';
  end if;

  if p_proposed_price is null or p_proposed_price < 0 then
    raise exception 'Harga Pengajuan tidak boleh negatif.';
  end if;

  if v_status not in ('AKTIF', 'NONAKTIF') then
    raise exception 'Status item tidak valid.';
  end if;

  perform 1
  from public.project_products pp
  where pp.id = p_product_id
    and pp.project_id = p_project_id;

  if not found then
    raise exception 'Produk tidak ditemukan pada proyek yang dipilih.';
  end if;

  if v_status <> 'AKTIF' then
    v_output_final := false;
  end if;

  -- Serialize Output Final changes per Produk.
  perform pg_advisory_xact_lock(p_product_id);

  if p_item_id is not null then
    select *
    into v_existing
    from public.work_items wi
    where wi.id = p_item_id
    for update;

    if not found then
      raise exception 'Item pekerjaan yang akan diedit tidak ditemukan.';
    end if;
  end if;

  if v_output_final then
    update public.work_items
    set output_final = false
    where project_id = p_project_id
      and product_id = p_product_id
      and output_final = true
      and (p_item_id is null or id <> p_item_id);
  end if;

  if p_item_id is null then
    insert into public.work_items (
      project_id,
      product_id,
      name,
      unit,
      qty_per_product,
      operator_price,
      proposed_price,
      status,
      output_final,
      legacy_unassigned_product,
      created_by,
      updated_by
    )
    values (
      p_project_id,
      p_product_id,
      v_name,
      v_unit,
      p_qty_per_product,
      p_operator_price,
      p_proposed_price,
      v_status,
      v_output_final,
      false,
      auth.uid(),
      auth.uid()
    )
    returning id into v_id;
  else
    update public.work_items
    set
      project_id = p_project_id,
      product_id = p_product_id,
      name = v_name,
      unit = v_unit,
      qty_per_product = p_qty_per_product,
      operator_price = p_operator_price,
      proposed_price = p_proposed_price,
      status = v_status,
      output_final = v_output_final,
      legacy_unassigned_product = false,
      updated_by = auth.uid()
    where id = p_item_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."save_work_item"("p_item_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_name" "text", "p_unit" "text", "p_qty_per_product" integer, "p_operator_price" bigint, "p_proposed_price" bigint, "p_status" "text", "p_output_final" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_embarkation_shipment"("p_shipment_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare s public.embarkation_shipments%rowtype;t public.embarkation_targets%rowtype;v_event bigint;v_unit text; begin
  if not public.has_permission('pengiriman_embarkasi.operate') then raise exception 'Tidak memiliki izin mengirim.' using errcode='42501';end if;select * into s from public.embarkation_shipments where id=p_shipment_id for update;if not found or s.status<>'DISIAPKAN' then raise exception 'Pengiriman harus DISIAPKAN.';end if;select * into t from public.embarkation_targets where id=s.target_id;
  v_event:=public.smpt_new_logistics_event('SHIPMENT_SEND','EMBARKASI',s.id,s.shipment_code,s.shipment_date,s.notes,null);
  if t.item_kind='FINISHED_GOOD' then select unit into v_unit from public.finished_goods where id=t.finished_good_id;perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',t.finished_good_id,null,s.source_location_id,-s.quantity,v_unit,'EMBARKASI KELUAR',s.notes);else perform public.smpt_apply_logistics_stock(v_event,'SET',null,t.set_id,s.source_location_id,-s.quantity,'SET','EMBARKASI KELUAR',s.notes);end if;
  update public.embarkation_shipments set status='DIKIRIM',sent_event_id=v_event where id=p_shipment_id;
end $$;


ALTER FUNCTION "public"."send_embarkation_shipment"("p_shipment_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_master_updated_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();

  if auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_master_updated_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_material_lot_tracking_mode"("p_material_id" bigint, "p_mode" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."set_material_lot_tracking_mode"("p_material_id" bigint, "p_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_work_item_flow"("p_work_item_id" bigint, "p_flow_mode" "text", "p_flow_order" integer DEFAULT NULL::integer, "p_validation_mode" "text" DEFAULT 'WARNING'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."set_work_item_flow"("p_work_item_id" bigint, "p_flow_mode" "text", "p_flow_order" integer, "p_validation_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_work_item_payroll_profile"("p_work_item_id" bigint, "p_executor_scope" "text", "p_submission_category" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_executor text:=upper(btrim(coalesce(p_executor_scope,'')));
  v_category text:=upper(btrim(coalesce(p_submission_category,'')));
begin
  if not public.has_permission('master_item.write') then
    raise exception 'Tidak memiliki izin mengatur profil Item Pekerjaan.' using errcode='42501';
  end if;
  if v_executor not in ('OPERATOR_BORONGAN','PEKERJA_HARIAN','KEDUANYA') then
    raise exception 'Pelaksana Item Pekerjaan tidak valid.';
  end if;
  if v_category not in ('BORONGAN','TIDAK_ADA') then
    raise exception 'Kategori pengajuan Item Pekerjaan tidak valid.';
  end if;

  update public.work_items
  set executor_scope=v_executor,
      submission_category=v_category,
      updated_by=auth.uid(),
      updated_at=now()
  where id=p_work_item_id;

  if not found then raise exception 'Item Pekerjaan tidak ditemukan.'; end if;
end;
$$;


ALTER FUNCTION "public"."set_work_item_payroll_profile"("p_work_item_id" bigint, "p_executor_scope" "text", "p_submission_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_work_item_routing_meta"("p_work_item_id" bigint, "p_display_order" integer, "p_validation_mode" "text" DEFAULT 'WARNING'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."set_work_item_routing_meta"("p_work_item_id" bigint, "p_display_order" integer, "p_validation_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_work_item_status"("p_item_id" bigint, "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_status text;
  v_product_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Sesi login tidak ditemukan.' using errcode = '42501';
  end if;

  if public.current_user_role() <> 'ADMIN'
     or not public.has_permission('master_item.write') then
    raise exception 'Perubahan Master Item Pekerjaan hanya boleh dilakukan oleh Admin.' using errcode = '42501';
  end if;

  v_status := upper(btrim(coalesce(p_status, '')));
  if v_status not in ('AKTIF', 'NONAKTIF') then
    raise exception 'Status item tidak valid.';
  end if;

  select product_id into v_product_id
  from public.work_items
  where id = p_item_id;

  if not found then
    raise exception 'Item pekerjaan tidak ditemukan.';
  end if;

  if v_product_id is not null then
    perform pg_advisory_xact_lock(v_product_id);
  end if;

  update public.work_items
  set
    status = v_status,
    output_final = case when v_status = 'NONAKTIF' then false else output_final end,
    updated_by = auth.uid()
  where id = p_item_id;
end;
$$;


ALTER FUNCTION "public"."set_work_item_status"("p_item_id" bigint, "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_admin_delete_user"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.has_permission('access_control.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin hapus user.' using errcode='42501';
  end if;

  if p_user_id is null then
    raise exception 'User ID tidak valid.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif digunakan.';
  end if;

  -- 1. Hapus link pekerja
  delete from public.user_worker_links where user_id = p_user_id;

  -- 2. Hapus profile user
  delete from public.profiles where id = p_user_id;

  -- 3. Hapus akun auth
  delete from auth.users where id = p_user_id;

  return true;
end;
$$;


ALTER FUNCTION "public"."smpt_admin_delete_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_admin_role_options"() RETURNS TABLE("role_id" bigint, "role_code" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    r.id::bigint,
    upper(coalesce(
      nullif(r.code, ''),
      nullif(r.name, ''),
      'ROLE-' || r.id::text
    ))::text as role_code
  from public.roles r
  where r.is_active is not false
    and (
      upper(coalesce(public.current_user_role(),'')) = 'ADMIN'
      or public.has_permission('access_control.write')
    )
  order by r.id;
$$;


ALTER FUNCTION "public"."smpt_admin_role_options"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_admin_save_user_access"("p_user_id" "uuid", "p_role_code" "text", "p_worker_id" bigint DEFAULT NULL::bigint, "p_is_active" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_role_id bigint;
  v_role_code text := upper(btrim(coalesce(p_role_code,'')));
  v_old_role_code text;
begin
  if upper(coalesce(public.current_user_role(),'')) <> 'ADMIN' then
    raise exception 'Hanya ADMIN yang dapat mengubah akses user.' using errcode='42501';
  end if;

  if p_user_id is null then raise exception 'User wajib dipilih.'; end if;
  if v_role_code = '' then raise exception 'Role wajib dipilih.'; end if;

  select
    r.id::bigint,
    upper(coalesce(
      nullif(to_jsonb(old_r)->>'code',''),
      nullif(to_jsonb(old_r)->>'name',''),
      nullif(to_jsonb(old_r)->>'role',''),
      'USER'
    ))::text
  into v_role_id, v_old_role_code
  from public.roles r
  left join public.profiles old_p on old_p.id = p_user_id
  left join public.roles old_r on old_r.id = old_p.role_id
  where upper(coalesce(
    nullif(to_jsonb(r)->>'code',''),
    nullif(to_jsonb(r)->>'name',''),
    nullif(to_jsonb(r)->>'role',''),
    ''
  )) = v_role_code
  limit 1;

  if v_role_id is null then raise exception 'Role % tidak ditemukan.', v_role_code; end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id) then raise exception 'Akun Auth tidak ditemukan.'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id) then raise exception 'Profile user belum terbentuk. Login sekali atau periksa trigger profile.'; end if;

  -- CHECKER is legacy only. Existing CHECKER may remain until migrated.
  if v_role_code = 'CHECKER' and coalesce(v_old_role_code,'') <> 'CHECKER' then
    raise exception 'CHECKER adalah role legacy. Checker baru harus memakai USER + permission checker.';
  end if;

  if v_role_code = 'PEKERJA' and p_worker_id is null then
    raise exception 'Role PEKERJA wajib dihubungkan ke Master Pekerja.';
  end if;

  if p_user_id=auth.uid() and (v_role_code <> 'ADMIN' or not coalesce(p_is_active,false)) then
    raise exception 'Akun ADMIN yang sedang dipakai tidak boleh menurunkan role atau menonaktifkan dirinya sendiri.';
  end if;

  update public.profiles
  set role_id=v_role_id,
      is_active=coalesce(p_is_active,true)
  where id=p_user_id;

  if p_worker_id is null then
    update public.user_worker_links
    set active=false, updated_at=now()
    where user_id=p_user_id and active=true;
  else
    perform 1 from public.workers where id=p_worker_id and status='AKTIF';
    if not found then raise exception 'Pekerja tidak ditemukan atau NONAKTIF.'; end if;

    if exists(
      select 1
      from public.user_worker_links uw
      where uw.worker_id=p_worker_id
        and uw.active=true
        and uw.user_id<>p_user_id
    ) then
      raise exception 'Pekerja ini sudah terhubung ke akun aktif lain.';
    end if;

    insert into public.user_worker_links(user_id,worker_id,active,created_by)
    values(p_user_id,p_worker_id,true,auth.uid())
    on conflict(user_id) do update
      set worker_id=excluded.worker_id,
          active=true,
          updated_at=now();
  end if;
end;
$$;


ALTER FUNCTION "public"."smpt_admin_save_user_access"("p_user_id" "uuid", "p_role_code" "text", "p_worker_id" bigint, "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_admin_update_user_profile"("p_user_id" "uuid", "p_display_name" "text", "p_role_code" "text", "p_worker_id" bigint, "p_is_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_role_id bigint;
  v_role_code text := upper(btrim(coalesce(p_role_code, 'USER')));
  v_old_role_code text;
begin
  if not public.has_permission('access_control.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin kelola user.' using errcode='42501';
  end if;

  select
    r.id::bigint,
    upper(coalesce(
      nullif(to_jsonb(old_r)->>'code',''),
      nullif(to_jsonb(old_r)->>'name',''),
      nullif(to_jsonb(old_r)->>'role',''),
      'USER'
    ))::text
  into v_role_id, v_old_role_code
  from public.roles r
  left join public.profiles old_p on old_p.id = p_user_id
  left join public.roles old_r on old_r.id = old_p.role_id
  where upper(coalesce(
    nullif(to_jsonb(r)->>'code',''),
    nullif(to_jsonb(r)->>'name',''),
    nullif(to_jsonb(r)->>'role',''),
    ''
  )) = v_role_code
  limit 1;

  if v_role_id is null then raise exception 'Role % tidak ditemukan.', v_role_code; end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id) then raise exception 'Akun Auth tidak ditemukan.'; end if;

  if p_user_id = auth.uid() and (v_role_code <> 'ADMIN' or not coalesce(p_is_active, true)) then
    raise exception 'Akun ADMIN yang sedang aktif tidak boleh menurunkan role atau menonaktifkan dirinya sendiri.';
  end if;

  if v_role_code = 'PEKERJA' and p_worker_id is null then
    raise exception 'Role PEKERJA wajib dihubungkan ke Master Pekerja.';
  end if;

  -- Update profiles table
  update public.profiles set
    display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
    role_id = v_role_id,
    is_active = coalesce(p_is_active, true),
    updated_at = now()
  where id = p_user_id;

  -- Update worker links
  if p_worker_id is null then
    update public.user_worker_links
    set active = false, updated_at = now()
    where user_id = p_user_id and active = true;
  else
    perform 1 from public.workers where id = p_worker_id and status = 'AKTIF';
    if not found then raise exception 'Pekerja tidak ditemukan atau NONAKTIF.'; end if;

    if exists (
      select 1 from public.user_worker_links uw
      where uw.worker_id = p_worker_id
        and uw.active = true
        and uw.user_id <> p_user_id
    ) then
      raise exception 'Pekerja ini sudah terhubung ke akun aktif lain.';
    end if;

    insert into public.user_worker_links (user_id, worker_id, active, created_by)
    values (p_user_id, p_worker_id, true, auth.uid())
    on conflict (user_id) do update
      set worker_id = excluded.worker_id,
          active = true,
          updated_at = now();
  end if;
end;
$$;


ALTER FUNCTION "public"."smpt_admin_update_user_profile"("p_user_id" "uuid", "p_display_name" "text", "p_role_code" "text", "p_worker_id" bigint, "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_admin_user_directory"() RETURNS TABLE("user_id" "uuid", "email" "text", "display_name" "text", "role_code" "text", "is_active" boolean, "worker_id" bigint, "worker_name" "text", "worker_code" "text", "worker_position" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if upper(coalesce(public.current_user_role(),'')) <> 'ADMIN' then
    raise exception 'Hanya ADMIN yang dapat melihat Manajemen User.' using errcode='42501';
  end if;

  return query
  select
    u.id::uuid,
    coalesce(u.email,'')::text,
    p.display_name::text,
    upper(coalesce(
      nullif(to_jsonb(r)->>'code',''),
      nullif(to_jsonb(r)->>'name',''),
      nullif(to_jsonb(r)->>'role',''),
      'USER'
    ))::text,
    coalesce(p.is_active,true)::boolean,
    uw.worker_id::bigint,
    w.name::text,
    w.worker_code::text,
    w.position::text
  from auth.users u
  left join public.profiles p on p.id=u.id
  left join public.roles r on r.id=p.role_id
  left join public.user_worker_links uw on uw.user_id=u.id and uw.active=true
  left join public.workers w on w.id=uw.worker_id
  order by lower(coalesce(u.email,'')), u.created_at;
end;
$$;


ALTER FUNCTION "public"."smpt_admin_user_directory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_apply_logistics_stock"("p_event_id" bigint, "p_item_kind" "text", "p_finished_good_id" bigint, "p_set_id" bigint, "p_location_id" bigint, "p_delta" numeric, "p_unit" "text", "p_kind" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare v_id bigint;v_qty numeric; begin
  if coalesce(p_delta,0)=0 then raise exception 'Delta stok tidak boleh nol.'; end if;
  insert into public.logistics_stock_balances(item_kind,finished_good_id,set_id,location_id,quantity)
  values(p_item_kind,p_finished_good_id,p_set_id,p_location_id,0) on conflict do nothing;
  select id,quantity into v_id,v_qty from public.logistics_stock_balances where item_kind=p_item_kind and coalesce(finished_good_id,0)=coalesce(p_finished_good_id,0) and coalesce(set_id,0)=coalesce(p_set_id,0) and location_id=p_location_id for update;
  if v_qty+p_delta<0 then raise exception 'Stok tidak cukup. Tersedia %, diminta %.',v_qty,abs(p_delta); end if;
  update public.logistics_stock_balances set quantity=v_qty+p_delta,updated_at=now() where id=v_id;
  insert into public.logistics_stock_ledger(event_id,item_kind,finished_good_id,set_id,location_id,movement_kind,quantity_delta,unit_snapshot,notes) values(p_event_id,p_item_kind,p_finished_good_id,p_set_id,p_location_id,p_kind,p_delta,p_unit,p_notes);
end $$;


ALTER FUNCTION "public"."smpt_apply_logistics_stock"("p_event_id" bigint, "p_item_kind" "text", "p_finished_good_id" bigint, "p_set_id" bigint, "p_location_id" bigint, "p_delta" numeric, "p_unit" "text", "p_kind" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_apply_stock_delta"("p_event_id" bigint, "p_item_kind" "text", "p_material_id" bigint, "p_component_id" bigint, "p_location_code" "text", "p_project_id" bigint, "p_product_id" bigint, "p_bom_id" bigint, "p_delta" numeric, "p_movement_kind" "text", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_apply_stock_delta"("p_event_id" bigint, "p_item_kind" "text", "p_material_id" bigint, "p_component_id" bigint, "p_location_code" "text", "p_project_id" bigint, "p_product_id" bigint, "p_bom_id" bigint, "p_delta" numeric, "p_movement_kind" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_apply_stock_delta_lot"("p_event_id" bigint, "p_item_kind" "text", "p_material_id" bigint, "p_component_id" bigint, "p_location_code" "text", "p_project_id" bigint, "p_product_id" bigint, "p_bom_id" bigint, "p_delta" numeric, "p_movement_kind" "text", "p_notes" "text", "p_material_lot_id" bigint DEFAULT NULL::bigint, "p_original_quantity_delta" numeric DEFAULT NULL::numeric, "p_original_unit" "text" DEFAULT NULL::"text", "p_work_item_id" bigint DEFAULT NULL::bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_apply_stock_delta_lot"("p_event_id" bigint, "p_item_kind" "text", "p_material_id" bigint, "p_component_id" bigint, "p_location_code" "text", "p_project_id" bigint, "p_product_id" bigint, "p_bom_id" bigint, "p_delta" numeric, "p_movement_kind" "text", "p_notes" "text", "p_material_lot_id" bigint, "p_original_quantity_delta" numeric, "p_original_unit" "text", "p_work_item_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_audit_row_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op='INSERT' then insert into public.audit_events(table_name,record_id,action,new_data) values(tg_table_name,coalesce(to_jsonb(new)->>'id',''),tg_op,to_jsonb(new));return new;
  elsif tg_op='UPDATE' then insert into public.audit_events(table_name,record_id,action,old_data,new_data) values(tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',''),tg_op,to_jsonb(old),to_jsonb(new));return new;
  else insert into public.audit_events(table_name,record_id,action,old_data) values(tg_table_name,coalesce(to_jsonb(old)->>'id',''),tg_op,to_jsonb(old));return old;end if;
end $$;


ALTER FUNCTION "public"."smpt_audit_row_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_cancel_po_receipt"("p_receipt_id" bigint, "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_cancel_po_receipt"("p_receipt_id" bigint, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_cancel_purchase_order"("p_purchase_order_id" bigint, "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_cancel_purchase_order"("p_purchase_order_id" bigint, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_capture_test_entity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_run text;
begin
  v_run:=current_setting('smpt.test_run_id',true);
  if coalesce(v_run,'')<>'' then
    insert into public.system_test_run_entities(run_id,table_name,row_id)
    values(v_run::bigint,tg_table_name,(to_jsonb(new)->>'id')::bigint)
    on conflict do nothing;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."smpt_capture_test_entity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_common_unit_family"("p_unit" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case public.smpt_unit_key(p_unit)
    when 'METER' then 'LENGTH' when 'YARD' then 'LENGTH' when 'CM' then 'LENGTH'
    when 'MM' then 'LENGTH' when 'FT' then 'LENGTH' when 'INCH' then 'LENGTH'
    when 'KG' then 'MASS' when 'GRAM' then 'MASS' when 'MG' then 'MASS' when 'TON' then 'MASS'
    when 'LITER' then 'VOLUME' when 'ML' then 'VOLUME'
    when 'PCS' then 'COUNT' when 'LUSIN' then 'COUNT'
    else null end
$$;


ALTER FUNCTION "public"."smpt_common_unit_family"("p_unit" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_common_unit_scale"("p_unit" "text") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_common_unit_scale"("p_unit" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_create_data_backup"("p_label" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_code text;
  v_table text;
  v_rows jsonb;
  v_snapshot jsonb:='{}'::jsonb;
  v_counts jsonb:='{}'::jsonb;
  v_count bigint;
  v_id bigint;
  v_bytes bigint;
  v_run_code text;
begin
  if not public.has_permission('setup_test.admin') then
    raise exception 'Tidak memiliki izin Backup Data.' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));
  v_code:='BKP-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||lpad(nextval('public.smpt_data_backup_seq')::text,4,'0');

  foreach v_table in array public.smpt_maintenance_tables() loop
    if pg_catalog.to_regclass('public.'||v_table) is null then continue; end if;
    execute pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb),count(*) from public.%I t',v_table)
      into v_rows,v_count;
    v_snapshot:=jsonb_set(v_snapshot,array[v_table],coalesce(v_rows,'[]'::jsonb),true);
    v_counts:=jsonb_set(v_counts,array[v_table],to_jsonb(v_count),true);
  end loop;
  v_bytes:=pg_catalog.octet_length(v_snapshot::text);

  insert into public.system_data_backups(backup_code,label,schema_fingerprint,snapshot,table_counts,byte_size,created_by)
  values(v_code,nullif(btrim(coalesce(p_label,'')),''),public.smpt_maintenance_schema_fingerprint(),v_snapshot,v_counts,v_bytes,auth.uid())
  returning id into v_id;

  v_run_code:='BKP-RUN-'||lpad(nextval('public.smpt_system_test_run_seq')::text,6,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,started_at,finished_at,created_by)
  values(v_run_code,'BACKUP','PASS',jsonb_build_object('backup_id',v_id,'backup_code',v_code,'byte_size',v_bytes,'table_counts',v_counts),now(),now(),auth.uid());

  return jsonb_build_object('backup_id',v_id,'backup_code',v_code,'byte_size',v_bytes,'table_counts',v_counts,'status','PASS');
end;
$$;


ALTER FUNCTION "public"."smpt_create_data_backup"("p_label" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_create_draft_purchase_order"("p_purchase_plan_id" bigint, "p_supplier_id" bigint, "p_order_date" "date" DEFAULT CURRENT_DATE, "p_expected_date" "date" DEFAULT NULL::"date", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_create_draft_purchase_order"("p_purchase_plan_id" bigint, "p_supplier_id" bigint, "p_order_date" "date", "p_expected_date" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_create_purchase_plan"("p_project_id" bigint, "p_product_id" bigint DEFAULT NULL::bigint, "p_plan_date" "date" DEFAULT CURRENT_DATE, "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_create_purchase_plan"("p_project_id" bigint, "p_product_id" bigint, "p_plan_date" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_create_repeat_order"("p_source_project_id" bigint, "p_project_code" "text", "p_name" "text", "p_product_category" "text" DEFAULT NULL::"text", "p_customer_name" "text" DEFAULT NULL::"text", "p_contract_value" numeric DEFAULT 0, "p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date", "p_status" "text" DEFAULT 'Pending'::"text", "p_repeat_note" "text" DEFAULT NULL::"text", "p_product_targets" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_source public.projects%rowtype;
  v_new_project bigint;
  v_product_map jsonb:='{}'::jsonb;
  v_item_map jsonb:='{}'::jsonb;
  v_source_product_count integer:=0;
  v_only_new_product bigint;
  v_product_count integer:=0;
  v_item_count integer:=0;
  v_bom_count integer:=0;
  v_dependency_count integer:=0;
  v_new_product bigint;
  v_new_item bigint;
  v_target numeric;
  v_mapped_product bigint;
  r record;
begin
  if not (
    public.has_permission('master_proyek.write')
    and public.has_permission('master_produk_proyek.write')
    and public.has_permission('master_item.write')
    and public.has_permission('master_kebutuhan.write')
  ) then
    raise exception 'Repeat Order memerlukan izin tulis Proyek, Produk/Tas, Item Pekerjaan, dan Kebutuhan.' using errcode='42501';
  end if;

  select * into v_source from public.projects where id=p_source_project_id;
  if not found then raise exception 'Source project Repeat Order tidak ditemukan.'; end if;
  if btrim(coalesce(p_project_code,''))='' then raise exception 'ID Proyek baru wajib diisi.'; end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'Nama Proyek baru wajib diisi.'; end if;
  if coalesce(p_contract_value,0)<0 then raise exception 'Nilai kontrak tidak boleh negatif.'; end if;
  if coalesce(nullif(btrim(coalesce(p_status,'')),''),'Pending') not in ('Pending','Berjalan','Selesai') then
    raise exception 'Status proyek Repeat Order tidak valid.';
  end if;
  if p_start_date is not null and p_end_date is not null and p_end_date<p_start_date then
    raise exception 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
  end if;
  if coalesce(p_product_targets,'{}'::jsonb) is null or jsonb_typeof(coalesce(p_product_targets,'{}'::jsonb))<>'object' then
    raise exception 'Target Produk/Tas Repeat Order harus berupa object JSON.';
  end if;

  insert into public.projects(
    project_code,name,product_category,customer_name,contract_value,legacy_target_production,
    start_date,end_date,status,repeat_source_project_id,repeat_order_note,created_by,updated_by
  ) values(
    btrim(p_project_code),btrim(p_name),nullif(btrim(coalesce(p_product_category,'')),''),
    nullif(btrim(coalesce(p_customer_name,'')),''),coalesce(p_contract_value,0),0,
    p_start_date,p_end_date,coalesce(nullif(btrim(coalesce(p_status,'')),''),'Pending'),
    p_source_project_id,nullif(btrim(coalesce(p_repeat_note,'')),''),auth.uid(),auth.uid()
  ) returning id into v_new_project;

  select count(*) into v_source_product_count
  from public.project_products where project_id=p_source_project_id;

  for r in
    select * from public.project_products where project_id=p_source_project_id order by id
  loop
    v_target:=case
      when coalesce(p_product_targets,'{}'::jsonb) ? r.id::text
        then nullif(p_product_targets->>r.id::text,'')::numeric
      else r.target_production
    end;
    if coalesce(v_target,0)<=0 then
      raise exception 'Target baru Produk/Tas % harus lebih dari 0.',r.name;
    end if;

    insert into public.project_products(
      project_id,name,target_production,unit,status,notes,created_by,updated_by
    ) values(
      v_new_project,r.name,v_target,r.unit,r.status,r.notes,auth.uid(),auth.uid()
    ) returning id into v_new_product;

    v_product_map:=v_product_map||jsonb_build_object(r.id::text,v_new_product);
    v_product_count:=v_product_count+1;
    if v_source_product_count=1 then v_only_new_product:=v_new_product; end if;
  end loop;

  for r in
    select * from public.work_items where project_id=p_source_project_id order by id
  loop
    v_mapped_product:=case
      when r.product_id is not null then nullif(v_product_map->>r.product_id::text,'')::bigint
      when v_source_product_count=1 then v_only_new_product
      else null
    end;

    insert into public.work_items(
      project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,output_final,
      legacy_unassigned_product,display_order,routing_validation_mode,flow_mode,flow_order,
      executor_scope,submission_category,created_by,updated_by
    ) values(
      v_new_project,v_mapped_product,r.name,r.unit,r.qty_per_product,r.operator_price,r.proposed_price,r.status,r.output_final,
      case when v_mapped_product is null then true else false end,
      r.display_order,r.routing_validation_mode,r.flow_mode,r.flow_order,
      r.executor_scope,r.submission_category,auth.uid(),auth.uid()
    ) returning id into v_new_item;

    v_item_map:=v_item_map||jsonb_build_object(r.id::text,v_new_item);
    v_item_count:=v_item_count+1;
  end loop;

  for r in
    select * from public.bom_requirements where project_id=p_source_project_id order by id
  loop
    v_mapped_product:=case
      when r.product_id is not null then nullif(v_product_map->>r.product_id::text,'')::bigint
      when v_source_product_count=1 then v_only_new_product
      else null
    end;

    insert into public.bom_requirements(
      project_id,product_id,material_id,component_type,component_name,unit,qty_per_unit,unit_price,status,
      legacy_total_requirement,legacy_project_level,created_by,updated_by
    ) values(
      v_new_project,v_mapped_product,r.material_id,r.component_type,r.component_name,r.unit,r.qty_per_unit,r.unit_price,r.status,
      r.legacy_total_requirement,case when v_mapped_product is null then true else false end,auth.uid(),auth.uid()
    );
    v_bom_count:=v_bom_count+1;
  end loop;

  for r in
    select d.*
    from public.work_item_dependencies d
    join public.project_products pp on pp.id=d.product_id
    where pp.project_id=p_source_project_id
    order by d.id
  loop
    v_mapped_product:=nullif(v_product_map->>r.product_id::text,'')::bigint;
    if v_mapped_product is not null
       and (v_item_map ? r.predecessor_work_item_id::text)
       and (v_item_map ? r.successor_work_item_id::text) then
      insert into public.work_item_dependencies(
        product_id,predecessor_work_item_id,successor_work_item_id,dependency_type,validation_mode,
        enforce_from,status,notes,source_mode,created_by,updated_by
      ) values(
        v_mapped_product,
        (v_item_map->>r.predecessor_work_item_id::text)::bigint,
        (v_item_map->>r.successor_work_item_id::text)::bigint,
        r.dependency_type,r.validation_mode,r.enforce_from,r.status,r.notes,r.source_mode,auth.uid(),auth.uid()
      );
      v_dependency_count:=v_dependency_count+1;
    end if;
  end loop;

  return jsonb_build_object(
    'status','PASS',
    'source_project_id',p_source_project_id,
    'project_id',v_new_project,
    'project_code',btrim(p_project_code),
    'products_copied',v_product_count,
    'work_items_copied',v_item_count,
    'bom_copied',v_bom_count,
    'routing_copied',v_dependency_count,
    'transactions_copied',0
  );
end;
$$;


ALTER FUNCTION "public"."smpt_create_repeat_order"("p_source_project_id" bigint, "p_project_code" "text", "p_name" "text", "p_product_category" "text", "p_customer_name" "text", "p_contract_value" numeric, "p_start_date" "date", "p_end_date" "date", "p_status" "text", "p_repeat_note" "text", "p_product_targets" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_create_stock_event"("p_type" "text", "p_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_reference_type" "text", "p_reference_code" "text", "p_reversal" bigint, "p_notes" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_id bigint;
begin
  insert into public.stock_events(event_type,event_date,project_id,product_id,reference_type,reference_code,reversal_of_event_id,notes)
  values(upper(btrim(p_type)),p_date,p_project_id,p_product_id,nullif(btrim(coalesce(p_reference_type,'')),''),nullif(btrim(coalesce(p_reference_code,'')),''),p_reversal,nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_id;
  return v_id;
end; $$;


ALTER FUNCTION "public"."smpt_create_stock_event"("p_type" "text", "p_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_reference_type" "text", "p_reference_code" "text", "p_reversal" bigint, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_current_worker_id"() RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select uw.worker_id from public.user_worker_links uw where uw.user_id=auth.uid() and uw.active=true limit 1 $$;


ALTER FUNCTION "public"."smpt_current_worker_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_db_resource_usage"() RETURNS TABLE("db_size_bytes" bigint, "db_size_pretty" "text", "db_size_pct" numeric, "table_count" integer, "status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    pg_database_size(current_database()),
    pg_size_pretty(pg_database_size(current_database())),
    ROUND((pg_database_size(current_database())::numeric / (500 * 1024 * 1024)) * 100, 1),
    (SELECT COUNT(*)::integer FROM pg_tables WHERE schemaname = 'public'),
    CASE
      WHEN pg_database_size(current_database()) > 450 * 1024 * 1024 THEN 'CRITICAL'
      WHEN pg_database_size(current_database()) > 350 * 1024 * 1024 THEN 'WARNING'
      ELSE 'OK'
    END;
$$;


ALTER FUNCTION "public"."smpt_db_resource_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_delete_table_set"("p_tables" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_allowed text[]:=public.smpt_maintenance_tables();
  v_remaining text[]:=array[]::text[];
  v_table text;
  v_name text;
  v_count bigint;
  v_counts jsonb:='{}'::jsonb;
begin
  foreach v_name in array coalesce(p_tables,array[]::text[]) loop
    if v_name=any(v_allowed) and not v_name=any(v_remaining) then v_remaining:=array_append(v_remaining,v_name); end if;
  end loop;

  while cardinality(v_remaining)>0 loop
    select candidate into v_table
    from unnest(v_remaining) candidate
    where not exists(
      select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class child on child.oid=c.conrelid
      join pg_catalog.pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
      join pg_catalog.pg_class parent on parent.oid=c.confrelid
      join pg_catalog.pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
      where c.contype='f'
        and parent.relname=candidate
        and child.relname::text=any(v_remaining)
        and child.relname<>parent.relname
    )
    order by candidate
    limit 1;

    if v_table is null then
      raise exception 'Reset dihentikan: ditemukan siklus FK pada table %.',array_to_string(v_remaining,', ');
    end if;

    execute pg_catalog.format('delete from public.%I',v_table);
    get diagnostics v_count=row_count;
    v_counts:=jsonb_set(v_counts,array[v_table],to_jsonb(v_count),true);
    v_remaining:=array_remove(v_remaining,v_table);
  end loop;
  return v_counts;
end;
$$;


ALTER FUNCTION "public"."smpt_delete_table_set"("p_tables" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_expand_reset_tables"("p_seed" "text"[]) RETURNS "text"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_allowed text[]:=public.smpt_maintenance_tables();
  v_tables text[]:=array[]::text[];
  v_new text[];
  v_name text;
begin
  foreach v_name in array coalesce(p_seed,array[]::text[]) loop
    if v_name=any(v_allowed) and not v_name=any(v_tables) then v_tables:=array_append(v_tables,v_name); end if;
  end loop;

  loop
    select array_agg(distinct child.relname::text)
    into v_new
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child on child.oid=c.conrelid
    join pg_catalog.pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
    join pg_catalog.pg_class parent on parent.oid=c.confrelid
    join pg_catalog.pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
    where c.contype='f'
      and parent.relname::text=any(v_tables)
      and child.relname::text=any(v_allowed)
      and not child.relname::text=any(v_tables)
      and child.oid<>parent.oid;
    exit when v_new is null or cardinality(v_new)=0;
    v_tables:=v_tables||v_new;
  end loop;
  return v_tables;
end;
$$;


ALTER FUNCTION "public"."smpt_expand_reset_tables"("p_seed" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_final_health"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
select jsonb_build_object(
 'production_orders', (select count(*) from public.production_orders),
 'production_checks', (select count(*) from public.production_checks where status='AKTIF'),
 'qc_inspections', (select count(*) from public.qc_inspections where status='AKTIF'),
 'finished_goods', (select count(*) from public.finished_goods where status='AKTIF'),
 'shipments_open', (select count(*) from public.embarkation_shipments where status in ('DISIAPKAN','DIKIRIM')),
 'attendance_records', (select count(*) from public.attendance_records),
 'payroll_runs', (select count(*) from public.payroll_runs where status='FINAL'),
 'negative_raw_stock', (select count(*) from public.stock_balances where quantity<0),
 'negative_logistics_stock', (select count(*) from public.logistics_stock_balances where quantity<0)
) $$;


ALTER FUNCTION "public"."smpt_final_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_force_confirm_user"("p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_count int;
  v_role_id bigint;
  v_user_id uuid;
begin
  update auth.users
  set email_confirmed_at = now()
  where lower(email) = lower(p_email);
  get diagnostics v_count = row_count;

  select id into v_role_id from public.roles where code = 'ADMIN_MR_WU' limit 1;
  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;

  if v_user_id is not null and v_role_id is not null then
    insert into public.profiles (id, role_id, display_name, email, is_active)
    values (v_user_id, v_role_id, 'Admin MR WU', p_email, true)
    on conflict (id) do update
    set role_id = v_role_id,
        is_active = true,
        display_name = 'Admin MR WU';
  end if;

  return json_build_object('updated_rows', v_count, 'user_id', v_user_id, 'role_id', v_role_id);
end;
$$;


ALTER FUNCTION "public"."smpt_force_confirm_user"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_get_active_workers_for_reference"() RETURNS TABLE("id" bigint, "worker_code" "text", "name" "text", "pay_system" "text", "department" "text", "status" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select id, worker_code, name, pay_system, department, status
  from public.workers
  where status = 'AKTIF'
  order by name asc;
$$;


ALTER FUNCTION "public"."smpt_get_active_workers_for_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_get_checker_route_status"("p_order_item_ids" bigint[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_get_checker_route_status"("p_order_item_ids" bigint[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_get_equivalent_progress"("p_project_id" bigint DEFAULT NULL::bigint, "p_product_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_get_equivalent_progress"("p_project_id" bigint, "p_product_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_get_my_worker_profile"() RETURNS TABLE("id" bigint, "name" "text", "worker_code" "text", "pay_system" "text", "daily_wage" numeric, "monthly_salary" numeric, "department" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select w.id, w.name, w.worker_code, w.pay_system, w.daily_wage, w.monthly_salary, w.department
  from public.workers w
  where w.id = public.smpt_current_worker_id()
  limit 1;
$$;


ALTER FUNCTION "public"."smpt_get_my_worker_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_get_route_capacity"("p_product_id" bigint, "p_successor_work_item_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_get_route_capacity"("p_product_id" bigint, "p_successor_work_item_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_get_spk_item_capacities"("p_order_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_get_spk_item_capacities"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_guard_lot_tracked_ledger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_guard_lot_tracked_ledger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_gudang_pending_count"() RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_count bigint;
begin
  if not public.has_permission('barang_keluar_gudang.view') then return 0; end if;
  select count(*) into v_count from public.material_requests r
  where r.status in ('MENUNGGU GUDANG','SEBAGIAN')
    and exists(select 1 from public.material_request_items i where i.request_id=r.id and i.status<>'DIBATALKAN' and i.fulfilled_qty<i.requested_qty);
  return coalesce(v_count,0);
end;
$$;


ALTER FUNCTION "public"."smpt_gudang_pending_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_gudang_pending_inbox"() RETURNS TABLE("request_id" bigint, "request_code" "text", "request_date" "date", "project_id" bigint, "project_name" "text", "product_id" bigint, "product_name" "text", "purpose" "text", "request_status" "text", "item_id" bigint, "source_type" "text", "bom_requirement_id" bigint, "cutting_component_id" bigint, "material_id" bigint, "item_name_snapshot" "text", "color_snapshot" "text", "unit_snapshot" "text", "requested_qty" numeric, "fulfilled_qty" numeric, "item_status" "text", "available_material" numeric, "available_cutting" numeric, "available_sablon" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_gudang_pending_inbox"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_issue_purchase_order"("p_purchase_order_id" bigint) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_issue_purchase_order"("p_purchase_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_last_keepalive"() RETURNS TABLE("last_ping" timestamp with time zone, "last_ping_wib" "text", "is_ok" boolean, "jam_sejak" numeric, "status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    k.pinged_at,
    TO_CHAR(k.pinged_at AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY HH24:MI WIB'),
    k.all_ok,
    ROUND(EXTRACT(EPOCH FROM (NOW() - k.pinged_at)) / 3600, 1),
    CASE
      WHEN k.all_ok THEN '✅ Aktif'
      ELSE '⚠️ Perlu Cek'
    END
  FROM smpt_keepalive_log k
  ORDER BY k.pinged_at DESC
  LIMIT 1;
$$;


ALTER FUNCTION "public"."smpt_last_keepalive"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_maintenance_schema_fingerprint"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
select md5(coalesce(string_agg(
  c.table_name||'|'||c.ordinal_position::text||'|'||c.column_name||'|'||c.data_type||'|'||c.is_nullable||'|'||coalesce(c.column_default,''),
  E'\n' order by c.table_name,c.ordinal_position
),''))
from information_schema.columns c
where c.table_schema='public'
  and c.table_name::text=any(public.smpt_maintenance_tables());
$$;


ALTER FUNCTION "public"."smpt_maintenance_schema_fingerprint"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_maintenance_tables"() RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
select array[
  'projects','project_products','materials','work_items','bom_requirements','workers','cutting_components',
  'stock_events','stock_balances','stock_ledger_entries','warehouse_receipts','material_requests','material_request_items',
  'warehouse_issues','cutting_material_usages','cutting_daily_results','ready_production_usages','user_worker_links',
  'production_orders','production_order_items','production_checks','production_manual_results','finished_goods','locations','vendors','embarkations',
  'product_sets','product_set_components','logistics_stock_events','logistics_stock_balances','logistics_stock_ledger',
  'qc_inspections','qc_reworks','finished_goods_transfers','external_finished_receipts','packing_runs','embarkation_targets',
  'embarkation_shipments','embarkation_issues','attendance_records','payroll_runs','payroll_run_items','operator_payroll_runs',
  'operator_payroll_items','cash_advances','cash_advance_payments','petty_cash_transactions','finance_transactions',
  'manufacturing_transactions','payroll_attendance_reviews','attendance_month_closures','payroll_run_details','payroll_payouts',
  'payroll_payout_details','payroll_payout_adjustments','payroll_payout_deductions','salary_submissions','attendance_import_batches',
  'attendance_import_rows','work_item_dependencies','production_wip_consumptions','production_anomalies','material_lots',
  'warehouse_issue_lots','ready_production_usage_lots','material_suppliers','purchase_plans','purchase_plan_lines',
  'purchase_orders','purchase_order_lines'
]::text[];
$$;


ALTER FUNCTION "public"."smpt_maintenance_tables"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_manager_dashboard_detail"("p_section" "text", "p_from" "date" DEFAULT NULL::"date", "p_to" "date" DEFAULT NULL::"date", "p_project_id" bigint DEFAULT NULL::bigint, "p_product_id" bigint DEFAULT NULL::bigint, "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_role text:=upper(coalesce(public.current_user_role(),''));
  v_section text:=upper(btrim(coalesce(p_section,'')));
  v_from date:=coalesce(p_from,(now() at time zone 'Asia/Jakarta')::date);
  v_to date:=coalesce(p_to,(now() at time zone 'Asia/Jakarta')::date);
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_result jsonb;
begin
  if v_role not in ('MANAGER','ADMIN') then
    raise exception 'Dashboard Manager hanya untuk MANAGER/ADMIN.' using errcode='42501';
  end if;
  if v_to<v_from then raise exception 'Periode dashboard tidak valid.'; end if;
  if v_to-v_from>366 then raise exception 'Periode dashboard maksimal 366 hari.'; end if;

  if v_section='PRODUCTION' then
    with period_qty as (
      select i.work_item_id,coalesce(sum(c.good_qty),0)::numeric qty_period
      from public.production_checks c
      join public.production_order_items i on i.id=c.order_item_id
      join public.production_orders o on o.id=i.order_id
      where c.status='AKTIF' and o.status<>'DIBATALKAN' and c.check_date between v_from and v_to
      group by i.work_item_id
    ), q as (
      select
        pr.id project_id,pr.name project_name,pp.id product_id,pp.name product_name,pp.target_production,
        w.id work_item_id,w.name work_item_name,w.flow_mode,w.flow_order,w.qty_per_product,w.unit,
        coalesce(v.target_raw_qty,pp.target_production*w.qty_per_product) target_item_qty,
        coalesce(v.qty_sah,0) qty_sah,coalesce(v.equivalent_product,0) equivalent_product,
        coalesce(v.remaining_equivalent,pp.target_production) remaining_equivalent,
        coalesce(v.over_equivalent,0) over_equivalent,coalesce(v.progress_percent,0) progress_percent,
        coalesce(pq.qty_period,0) qty_sah_period
      from public.work_items w
      join public.project_products pp on pp.id=w.product_id and pp.project_id=w.project_id
      join public.projects pr on pr.id=w.project_id
      left join public.v_work_item_equivalent_progress v on v.work_item_id=w.id
      left join period_qty pq on pq.work_item_id=w.id
      where w.status='AKTIF'
        and (p_project_id is null or w.project_id=p_project_id)
        and (p_product_id is null or w.product_id=p_product_id)
      order by pr.name,pp.name,coalesce(w.flow_order,2147483647),w.name
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','PRODUCTION','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  elsif v_section='MATERIAL' then
    with receipt as (
      select material_id,coalesce(sum(quantity),0)::numeric received_global
      from public.warehouse_receipts where status='AKTIF' group by material_id
    ), gudang as (
      select b.material_id,coalesce(sum(b.quantity),0)::numeric qty
      from public.stock_balances b join public.stock_locations l on l.id=b.location_id
      where b.item_kind='MATERIAL' and l.code='GUDANG_BAHAN'
      group by b.material_id
    ), issued as (
      select project_id,product_id,material_id,coalesce(sum(quantity),0)::numeric qty
      from public.warehouse_issues
      where purpose='PRODUKSI' and material_id is not null
      group by project_id,product_id,material_id
    ), consumed as (
      select project_id,product_id,material_id,coalesce(sum(normalized_quantity),0)::numeric qty
      from public.v_material_actual_consumption
      where process='PRODUKSI' and consumption_date<=v_to
      group by project_id,product_id,material_id
    ), area as (
      select b.project_id,b.product_id,b.material_id,coalesce(sum(b.quantity),0)::numeric qty
      from public.stock_balances b join public.stock_locations l on l.id=b.location_id
      where b.item_kind='MATERIAL' and l.code='SIAP_PRODUKSI'
      group by b.project_id,b.product_id,b.material_id
    ), q as (
      select
        br.project_id,pr.name project_name,br.product_id,pp.name product_name,br.material_id,m.name material_name,m.standard_unit unit,
        round((pp.target_production*br.qty_per_unit)::numeric,4) total_requirement,
        coalesce(r.received_global,0) received_global,
        greatest(round((pp.target_production*br.qty_per_unit)::numeric,4)-coalesce(r.received_global,0),0) shortfall_vs_global_receipt,
        coalesce(g.qty,0) warehouse_stock_global,
        coalesce(i.qty,0) issued_to_production,
        coalesce(c.qty,0) actual_consumed,
        coalesce(a.qty,0) production_area_stock,
        coalesce(g.qty,0)+coalesce(a.qty,0) total_visible_stock,
        'Barang Masuk dan stok Gudang bahan masih global per material; angka global tidak dialokasikan eksklusif ke satu Produk/Tas.'::text scope_note
      from public.bom_requirements br
      join public.projects pr on pr.id=br.project_id
      join public.project_products pp on pp.id=br.product_id
      join public.materials m on m.id=br.material_id
      left join receipt r on r.material_id=br.material_id
      left join gudang g on g.material_id=br.material_id
      left join issued i on i.project_id=br.project_id and i.product_id=br.product_id and i.material_id=br.material_id
      left join consumed c on c.project_id=br.project_id and c.product_id=br.product_id and c.material_id=br.material_id
      left join area a on a.project_id=br.project_id and a.product_id=br.product_id and a.material_id=br.material_id
      where br.status='AKTIF' and br.component_type='BAHAN' and br.product_id is not null
        and (p_project_id is null or br.project_id=p_project_id)
        and (p_product_id is null or br.product_id=p_product_id)
      order by pr.name,pp.name,m.name
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','MATERIAL','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  elsif v_section='WORKFORCE' then
    with att as (
      select worker_id,max(attendance_status) filter(where attendance_date=v_today and verification_status='TERVERIFIKASI') attendance_today
      from public.attendance_records group by worker_id
    ), spk as (
      select operator_worker_id,count(*) filter(where status='AKTIF')::int active_spk
      from public.production_orders group by operator_worker_id
    ), prod as (
      select o.operator_worker_id,coalesce(sum(c.good_qty),0)::numeric qty_sah,
             coalesce(sum(c.good_qty*i.operator_price_snapshot),0)::numeric operator_value
      from public.production_checks c
      join public.production_order_items i on i.id=c.order_item_id
      join public.production_orders o on o.id=i.order_id
      where c.status='AKTIF' and o.status<>'DIBATALKAN' and c.check_date between v_from and v_to
      group by o.operator_worker_id
    ), q as (
      select w.id worker_id,w.worker_code,w.name,w.department,w.position,w.pay_system,w.status,
             coalesce(a.attendance_today,'BELUM ADA DATA') attendance_today,
             coalesce(s.active_spk,0) active_spk,coalesce(p.qty_sah,0) qty_sah_period,coalesce(p.operator_value,0) upah_borongan_period
      from public.workers w
      left join att a on a.worker_id=w.id
      left join spk s on s.operator_worker_id=w.id
      left join prod p on p.operator_worker_id=w.id
      where w.status='AKTIF'
      order by w.name
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','WORKFORCE','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  elsif v_section='FINANCE' then
    with q as (
      select * from (
        select 'KEUANGAN'::text source,transaction_date,transaction_code code,direction,category,amount,description,status
        from public.finance_transactions
        where transaction_date between v_from and v_to
        union all
        select 'KAS_KECIL',transaction_date,transaction_code,direction,category,amount,description,status
        from public.petty_cash_transactions
        where transaction_date between v_from and v_to
      ) x
      order by transaction_date desc,code desc
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','FINANCE','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  elsif v_section='ATTENTION' then
    with product_progress as (
      select
        pp.id product_id,pp.project_id,pp.name product_name,p.name project_name,p.end_date,
        coalesce(sum(c.good_qty) filter(where c.status='AKTIF' and o.status<>'DIBATALKAN'),0)::numeric/nullif(max(w.qty_per_product),0) actual,
        pp.target_production
      from public.project_products pp
      join public.projects p on p.id=pp.project_id
      left join public.work_items w on w.product_id=pp.id and w.output_final=true and w.status='AKTIF'
      left join public.production_order_items i on i.work_item_id=w.id and i.status<>'DIBATALKAN'
      left join public.production_orders o on o.id=i.order_id
      left join public.production_checks c on c.order_item_id=i.id and c.status='AKTIF'
      where pp.status='AKTIF'
      group by pp.id,pp.project_id,pp.name,p.name,p.end_date,pp.target_production
    ), q as (
      select * from (
        select a.detected_at event_at,a.severity,a.anomaly_type attention_type,
               coalesce(pr.name,'-') project_name,coalesce(pp.name,'-') product_name,
               coalesce(w.name,'-') source_name,
               concat('Anomaly ',a.anomaly_code,' · excess ',coalesce(a.excess_equivalent,0)) detail
        from public.production_anomalies a
        left join public.projects pr on pr.id=a.project_id
        left join public.project_products pp on pp.id=a.product_id
        left join public.work_items w on w.id=a.work_item_id
        where a.status='OPEN'
          and (p_project_id is null or a.project_id=p_project_id)
          and (p_product_id is null or a.product_id=p_product_id)
        union all
        select o.created_at,'WARNING','SPK_TERLAMBAT',pr.name,pp.name,o.spk_code,
               concat('Due ',o.due_date,' · operator ',coalesce(w.name,'-'))
        from public.production_orders o
        join public.projects pr on pr.id=o.project_id
        join public.project_products pp on pp.id=o.product_id
        join public.workers w on w.id=o.operator_worker_id
        where o.status='AKTIF' and o.due_date is not null and o.due_date<v_today
          and (p_project_id is null or o.project_id=p_project_id)
          and (p_product_id is null or o.product_id=p_product_id)
        union all
        select now(),'WARNING','PRODUK_TERLAMBAT',project_name,product_name,product_name,
               concat('Target ',target_production,' · actual ',round(coalesce(actual,0)::numeric,4),' · deadline ',end_date)
        from product_progress
        where end_date is not null and end_date<v_today and coalesce(actual,0)<target_production
          and (p_project_id is null or project_id=p_project_id)
          and (p_product_id is null or product_id=p_product_id)
      ) a
      order by event_at desc
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','ATTENTION','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  elsif v_section='HISTORY' then
    with q as (
      select * from (
        select c.created_at event_at,'CHECKER'::text event_type,c.check_code code,o.project_id,o.product_id,
               pr.name project_name,pp.name product_name,
               concat(i.work_item_name_snapshot,' · Sah ',c.good_qty,' · Reject ',c.reject_qty) detail,c.status
        from public.production_checks c
        join public.production_order_items i on i.id=c.order_item_id
        join public.production_orders o on o.id=i.order_id
        join public.projects pr on pr.id=o.project_id
        join public.project_products pp on pp.id=o.product_id
        where c.check_date between v_from and v_to
        union all
        select o.created_at,'SPK',o.spk_code,o.project_id,o.product_id,pr.name,pp.name,
               concat('Operator ',w.name,' · status ',o.status),o.status
        from public.production_orders o
        join public.projects pr on pr.id=o.project_id
        join public.project_products pp on pp.id=o.product_id
        join public.workers w on w.id=o.operator_worker_id
        where o.order_date between v_from and v_to
        union all
        select e.created_at,'STOK/WIP',e.event_code,e.project_id,e.product_id,coalesce(pr.name,'-'),coalesce(pp.name,'-'),
               concat(e.event_type,' · ',coalesce(e.reference_type,'-'),' ',coalesce(e.reference_code,'')),case when e.reversal_of_event_id is null then 'AKTIF' else 'REVERSAL' end
        from public.stock_events e
        left join public.projects pr on pr.id=e.project_id
        left join public.project_products pp on pp.id=e.product_id
        where e.event_date between v_from and v_to
        union all
        select qci.created_at,'QC',qci.qc_code,o.project_id,o.product_id,pr.name,pp.name,
               concat('Good ',qci.good_qty,' · Reject ',qci.reject_qty,' · Rework ',qci.rework_qty),qci.status
        from public.qc_inspections qci
        join public.production_checks pc on pc.id=qci.production_check_id
        join public.production_order_items poi on poi.id=pc.order_item_id
        join public.production_orders o on o.id=poi.order_id
        join public.projects pr on pr.id=o.project_id
        join public.project_products pp on pp.id=o.product_id
        where qci.inspection_date between v_from and v_to
        union all
        select f.created_at,'KEUANGAN',f.transaction_code,null::bigint,null::bigint,'-'::text,'-'::text,
               concat(f.direction,' · ',f.category,' · ',f.description),f.status
        from public.finance_transactions f
        where f.transaction_date between v_from and v_to
      ) x
      where (p_project_id is null or x.project_id=p_project_id)
        and (p_product_id is null or x.product_id=p_product_id)
      order by event_at desc
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','HISTORY','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  else
    raise exception 'Section dashboard tidak valid.';
  end if;

  return coalesce(v_result,jsonb_build_object('section',v_section,'items','[]'::jsonb,'limit',v_limit,'offset',v_offset));
end;
$$;


ALTER FUNCTION "public"."smpt_manager_dashboard_detail"("p_section" "text", "p_from" "date", "p_to" "date", "p_project_id" bigint, "p_product_id" bigint, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."smpt_manager_dashboard_detail"("p_section" "text", "p_from" "date", "p_to" "date", "p_project_id" bigint, "p_product_id" bigint, "p_limit" integer, "p_offset" integer) IS 'Lazy manager dashboard detail endpoint with bounded pagination.';



CREATE OR REPLACE FUNCTION "public"."smpt_manager_dashboard_summary"("p_from" "date" DEFAULT NULL::"date", "p_to" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_role text:=upper(coalesce(public.current_user_role(),''));
  v_from date:=coalesce(p_from,(now() at time zone 'Asia/Jakarta')::date);
  v_to date:=coalesce(p_to,(now() at time zone 'Asia/Jakarta')::date);
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_result jsonb;
begin
  if v_role not in ('MANAGER','ADMIN') then
    raise exception 'Dashboard Manager hanya untuk MANAGER/ADMIN.' using errcode='42501';
  end if;
  if v_to<v_from then raise exception 'Periode dashboard tidak valid.'; end if;
  if v_to-v_from>366 then raise exception 'Periode dashboard maksimal 366 hari.'; end if;

  with final_output as (
    select
      pp.id product_id,
      pp.project_id,
      pp.name product_name,
      pp.target_production,
      pp.status product_status,
      p.name project_name,
      p.end_date project_end_date,
      w.id work_item_id,
      w.qty_per_product,
      coalesce(sum(c.good_qty) filter(where c.status='AKTIF' and o.status<>'DIBATALKAN'),0)::numeric as qty_sah
    from public.project_products pp
    join public.projects p on p.id=pp.project_id
    left join public.work_items w
      on w.product_id=pp.id and w.project_id=pp.project_id and w.output_final=true and w.status='AKTIF'
    left join public.production_order_items i
      on i.work_item_id=w.id and i.status<>'DIBATALKAN'
    left join public.production_orders o
      on o.id=i.order_id and o.status<>'DIBATALKAN'
    left join public.production_checks c
      on c.order_item_id=i.id and c.status='AKTIF'
    where pp.status='AKTIF'
    group by pp.id,pp.project_id,pp.name,pp.target_production,pp.status,p.name,p.end_date,w.id,w.qty_per_product
  ), product_progress as (
    select
      product_id,project_id,product_name,target_production,product_status,project_name,project_end_date,
      (work_item_id is not null) as output_final_configured,
      round(coalesce(qty_sah/nullif(qty_per_product,0),0)::numeric,4) actual,
      round(greatest(target_production-coalesce(qty_sah/nullif(qty_per_product,0),0),0)::numeric,4) remaining,
      round(case when target_production>0 then (coalesce(qty_sah/nullif(qty_per_product,0),0)/target_production)*100 else 0 end::numeric,2) progress_percent
    from final_output
  ), top_products as (
    select * from product_progress
    order by progress_percent asc,project_name,product_name
    limit 12
  ), workforce as (
    select
      count(*)::int total_workers,
      count(*) filter(where status='AKTIF')::int active_workers,
      count(*) filter(where status='AKTIF' and upper(coalesce(pay_system,''))='HARIAN')::int harian,
      count(*) filter(where status='AKTIF' and upper(coalesce(pay_system,''))='BULANAN')::int bulanan,
      count(*) filter(where status='AKTIF' and upper(coalesce(pay_system,''))='BORONGAN')::int borongan
    from public.workers
  ), attendance_today as (
    select count(distinct worker_id)::int hadir
    from public.attendance_records
    where attendance_date=v_today
      and attendance_status='HADIR'
      and verification_status='TERVERIFIKASI'
  ), prod_period as (
    select
      coalesce(sum(c.good_qty),0)::numeric qty_sah,
      coalesce(sum(c.good_qty*i.operator_price_snapshot),0)::numeric operator_value
    from public.production_checks c
    join public.production_order_items i on i.id=c.order_item_id
    join public.production_orders o on o.id=i.order_id
    where c.status='AKTIF' and o.status<>'DIBATALKAN' and c.check_date between v_from and v_to
  ), finance_period as (
    select
      coalesce(sum(amount) filter(where direction='MASUK' and status='AKTIF'),0)::numeric kas_masuk,
      coalesce(sum(amount) filter(where direction='KELUAR' and status='AKTIF'),0)::numeric kas_keluar,
      coalesce(sum(amount) filter(where direction='KELUAR' and status='AKTIF' and upper(category) like '%OPERAS%'),0)::numeric operational_expense
    from public.finance_transactions
    where transaction_date between v_from and v_to
  ), petty as (
    select coalesce(sum(case when direction='MASUK' then amount else -amount end) filter(where status='AKTIF'),0)::numeric saldo
    from public.petty_cash_transactions
  ), general_payroll as (
    select coalesce(sum(total_net),0)::numeric total_net
    from public.payroll_runs
    where status='FINAL' and period_start<=v_to and period_end>=v_from
  ), operator_payroll as (
    select coalesce(sum(total_operator_value),0)::numeric total_operator
    from public.operator_payroll_runs
    where status='FINAL' and period_start<=v_to and period_end>=v_from
  ), kasbon as (
    select coalesce(sum(greatest(amount-paid_amount,0)),0)::numeric outstanding
    from public.cash_advances where status='AKTIF'
  ), alerts as (
    select
      (select count(*) from public.production_anomalies where status='OPEN')::int open_anomalies,
      (select count(*) from public.production_orders where status='AKTIF' and due_date is not null and due_date<v_today)::int overdue_spk,
      (select count(*) from product_progress where project_end_date is not null and project_end_date<v_today and progress_percent<100)::int late_products,
      (select count(*) from product_progress where not output_final_configured)::int missing_output_final
  )
  select jsonb_build_object(
    'period',jsonb_build_object('from',v_from,'to',v_to),
    'production',jsonb_build_object(
      'active_projects',(select count(*) from public.projects where upper(coalesce(status,'')) not in ('SELESAI','BATAL','DIBATALKAN','NONAKTIF')),
      'active_products',(select count(*) from public.project_products where status='AKTIF'),
      'active_spk',(select count(*) from public.production_orders where status='AKTIF'),
      'qty_sah_period',(select qty_sah from prod_period),
      'top_products',coalesce((select jsonb_agg(to_jsonb(t)) from top_products t),'[]'::jsonb)
    ),
    'workforce',jsonb_build_object(
      'total',(select total_workers from workforce),
      'active',(select active_workers from workforce),
      'harian',(select harian from workforce),
      'bulanan',(select bulanan from workforce),
      'borongan',(select borongan from workforce),
      'hadir_today',(select hadir from attendance_today),
      'belum_hadir',greatest((select active_workers from workforce)-(select hadir from attendance_today),0),
      'operator_spk_active',(select count(distinct operator_worker_id) from public.production_orders where status='AKTIF'),
      'spk_active',(select count(*) from public.production_orders where status='AKTIF'),
      'qty_sah_period',(select qty_sah from prod_period),
      'upah_borongan_period',(select operator_value from prod_period)
    ),
    'finance',jsonb_build_object(
      'kas_masuk',(select kas_masuk from finance_period),
      'kas_keluar',(select kas_keluar from finance_period),
      'saldo',(select kas_masuk-kas_keluar from finance_period),
      'kas_kecil',(select saldo from petty),
      'payroll_harian_bulanan',(select total_net from general_payroll),
      'payroll_borongan',(select total_operator from operator_payroll),
      'kasbon_outstanding',(select outstanding from kasbon),
      'pengeluaran_operasional',(select operational_expense from finance_period)
    ),
    'attention',jsonb_build_object(
      'workflow_anomaly',(select open_anomalies from alerts),
      'spk_terlambat',(select overdue_spk from alerts),
      'produk_terlambat',(select late_products from alerts),
      'output_final_belum_diset',(select missing_output_final from alerts)
    ),
    'filters',jsonb_build_object(
      'projects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name) from public.projects p where upper(coalesce(p.status,'')) not in ('BATAL','DIBATALKAN','NONAKTIF')),'[]'::jsonb),
      'products',coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'project_id',pp.project_id,'name',pp.name) order by pp.project_id,pp.name) from public.project_products pp where pp.status='AKTIF'),'[]'::jsonb)
    ),
    'generated_at',now()
  ) into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."smpt_manager_dashboard_summary"("p_from" "date", "p_to" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."smpt_manager_dashboard_summary"("p_from" "date", "p_to" "date") IS 'Read-only executive summary for MANAGER/ADMIN. Initial dashboard uses one aggregate RPC.';



CREATE OR REPLACE FUNCTION "public"."smpt_master_item_equivalent_progress"("p_product_id" bigint) RETURNS TABLE("work_item_id" bigint, "qty_sah" numeric, "equivalent_product" numeric, "equivalent_today" numeric, "target_raw_qty" numeric, "remaining_equivalent" numeric, "over_equivalent" numeric, "progress_percent" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.has_permission('master_item.view') then
    raise exception 'Tidak memiliki izin melihat progress Item Pekerjaan.' using errcode='42501';
  end if;
  if p_product_id is null or p_product_id <= 0 then
    return;
  end if;

  return query
  select
    v.work_item_id,
    v.qty_sah,
    v.equivalent_product,
    v.equivalent_today,
    v.target_raw_qty,
    v.remaining_equivalent,
    v.over_equivalent,
    v.progress_percent
  from public.v_work_item_equivalent_progress v
  where v.product_id=p_product_id
  order by v.work_item_id;
end;
$$;


ALTER FUNCTION "public"."smpt_master_item_equivalent_progress"("p_product_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_new_logistics_event"("p_event_type" "text", "p_reference_type" "text", "p_reference_id" bigint, "p_reference_code" "text", "p_event_date" "date", "p_notes" "text", "p_reversal_of" bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare v bigint; begin insert into public.logistics_stock_events(event_type,reference_type,reference_id,reference_code,event_date,notes,reversal_of_event_id) values(p_event_type,p_reference_type,p_reference_id,p_reference_code,coalesce(p_event_date,current_date),p_notes,p_reversal_of) returning id into v; return v; end $$;


ALTER FUNCTION "public"."smpt_new_logistics_event"("p_event_type" "text", "p_reference_type" "text", "p_reference_id" bigint, "p_reference_code" "text", "p_event_date" "date", "p_notes" "text", "p_reversal_of" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_normalize_finger_id"("p_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
  select case
    when btrim(coalesce(p_value,'')) ~ '^[0-9]+$'
      then coalesce(nullif(ltrim(btrim(p_value),'0'),''),'0')
    else upper(btrim(coalesce(p_value,'')))
  end
$_$;


ALTER FUNCTION "public"."smpt_normalize_finger_id"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_payroll_cfg_num"("p_config" "jsonb", "p_key" "text", "p_default" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select coalesce(nullif(p_config->>p_key,'')::numeric,p_default)
$$;


ALTER FUNCTION "public"."smpt_payroll_cfg_num"("p_config" "jsonb", "p_key" "text", "p_default" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_payroll_cfg_text"("p_config" "jsonb", "p_key" "text", "p_default" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select upper(coalesce(nullif(p_config->>p_key,''),p_default))
$$;


ALTER FUNCTION "public"."smpt_payroll_cfg_text"("p_config" "jsonb", "p_key" "text", "p_default" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_payroll_config_snapshot"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_object_agg(key,coalesce(to_jsonb(value_numeric),to_jsonb(value_text)))
  from public.payroll_settings
$$;


ALTER FUNCTION "public"."smpt_payroll_config_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_payroll_row_calc"("p_attendance_id" bigint, "p_daily_wage" numeric, "p_monthly_salary" numeric, "p_pay_system" "text", "p_config" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare a public.attendance_records%rowtype;r public.payroll_attendance_reviews%rowtype;v_system text:=upper(coalesce(p_pay_system,''));v_policy text;v_day text;v_meal text;v_ot_status text;v_bonus_status text;v_holiday_status text;v_candidate int;v_approved int;v_base numeric:=0;v_meal_amt numeric:=0;v_ot_amt numeric:=0;v_bonus numeric:=0;v_holiday_bonus numeric:=0;v_holiday_manual numeric:=0;v_div numeric;v_bonus_mode text;v_ready boolean:=true;v_message text:='';v_qualifies boolean:=false;
begin
  select * into a from public.attendance_records where id=p_attendance_id;
  if not found then return jsonb_build_object('ready',false,'message','Absensi tidak ditemukan.'); end if;
  if a.verification_status<>'TERVERIFIKASI' then return jsonb_build_object('ready',false,'message','Absensi belum TERVERIFIKASI.'); end if;
  select * into r from public.payroll_attendance_reviews where attendance_id=a.id;
  v_day:=coalesce(r.day_class,a.day_class);v_meal:=r.meal_class;v_ot_status:=r.overtime_review_status;v_bonus_status:=r.bonus_ot_review_status;v_holiday_status:=r.holiday_review_status;v_candidate:=coalesce(a.overtime_minutes,0);
  if a.attendance_status='HADIR' and v_day not in ('FULL_DAY','HALF_DAY') then v_ready:=false;v_message:='Klasifikasi FULL/HALF belum direview.'; end if;
  if v_ready and v_system='HARIAN' and a.attendance_status='HADIR' then
    v_base:=case when v_day='FULL_DAY' then coalesce(p_daily_wage,0) when v_day='HALF_DAY' then coalesce(p_daily_wage,0)/2 else 0 end;
    if coalesce(r.is_holiday,false) then v_holiday_bonus:=case when v_day='FULL_DAY' then public.smpt_payroll_cfg_num(p_config,'HARIAN_HOLIDAY_BONUS_FULL',20000) when v_day='HALF_DAY' then public.smpt_payroll_cfg_num(p_config,'HARIAN_HOLIDAY_BONUS_HALF',10000) else 0 end; end if;
  end if;
  if v_ready and v_system='BULANAN' then
    if a.attendance_status='HADIR' then v_meal:=case when v_day='FULL_DAY' then 'FULL' when v_day='HALF_DAY' then 'HALF' else null end;
    else
      v_policy:=public.smpt_payroll_cfg_text(p_config,'MEAL_POLICY_'||a.attendance_status,case when a.attendance_status='ALPHA' then 'ZERO' else 'MANUAL' end);
      if v_policy='MANUAL' and v_meal not in ('FULL','HALF','ZERO') then v_ready:=false;v_message:='Keputusan uang makan belum direview.'; else v_meal:=case when v_policy='MANUAL' then v_meal else v_policy end; end if;
    end if;
    if v_ready then v_meal_amt:=case v_meal when 'FULL' then public.smpt_payroll_cfg_num(p_config,'MEAL_FULL',50000) when 'HALF' then public.smpt_payroll_cfg_num(p_config,'MEAL_HALF',25000) else 0 end; end if;
  end if;
  if v_ready and v_candidate>0 then
    if r.id is null or r.overtime_candidate_snapshot<>v_candidate or v_ot_status not in ('DISETUJUI','DITOLAK') then v_ready:=false;v_message:='Review kandidat lembur belum selesai atau stale.';
    elsif v_ot_status='DISETUJUI' then v_approved:=least(v_candidate,coalesce(r.overtime_approved_minutes,0)); else v_approved:=0; end if;
  else v_approved:=0; end if;
  if v_ready and v_approved>0 then
    v_div:=case when v_system='HARIAN' then public.smpt_payroll_cfg_num(p_config,'OT_DIVISOR_HARIAN',8) else public.smpt_payroll_cfg_num(p_config,'OT_DIVISOR_BULANAN',190) end;
    v_ot_amt:=(v_approved/60.0)*(case when v_system='HARIAN' then coalesce(p_daily_wage,0) else coalesce(p_monthly_salary,0) end)/greatest(v_div,0.0001);
    v_qualifies:=v_approved>=240;v_bonus_mode:=public.smpt_payroll_cfg_text(p_config,'OT_BONUS_4H_MODE','MANUAL_REVIEW');
    if v_qualifies and v_bonus_mode='MANUAL_REVIEW' and v_bonus_status not in ('DISETUJUI','DITOLAK') then v_ready:=false;v_message:='Bonus OT >=4 jam belum direview.';
    elsif v_qualifies and (v_bonus_mode='PER_HARI' or (v_bonus_mode='MANUAL_REVIEW' and v_bonus_status='DISETUJUI')) then v_bonus:=case when v_system='HARIAN' then public.smpt_payroll_cfg_num(p_config,'OT_BONUS_HARIAN_4H',5000) else public.smpt_payroll_cfg_num(p_config,'OT_BONUS_BULANAN_4H',17500) end; end if;
  end if;
  if v_ready and v_system='BULANAN' and a.attendance_status='HADIR' and coalesce(r.is_holiday,false) and public.smpt_payroll_cfg_text(p_config,'BULANAN_HOLIDAY_MODE','MANUAL_REVIEW')='MANUAL_REVIEW' then
    if v_holiday_status not in ('TANPA_TAMBAHAN','NOMINAL_MANUAL') then v_ready:=false;v_message:='Hari libur BULANAN belum direview.';
    elsif v_holiday_status='NOMINAL_MANUAL' then v_holiday_manual:=coalesce(r.holiday_manual_amount,0); end if;
  end if;
  return jsonb_build_object('ready',v_ready,'message',v_message,'day_class',v_day,'meal_class',v_meal,'base_amount',round(v_base,2),'meal_amount',round(v_meal_amt,2),'overtime_candidate_minutes',v_candidate,'overtime_approved_minutes',coalesce(v_approved,0),'overtime_amount',round(v_ot_amt,2),'overtime_bonus',round(v_bonus,2),'is_holiday',coalesce(r.is_holiday,false),'holiday_bonus',round(v_holiday_bonus,2),'holiday_manual_amount',round(v_holiday_manual,2),'qualifies_4h',v_qualifies,'row_total',round(v_base+v_meal_amt+v_ot_amt+v_bonus+v_holiday_bonus+v_holiday_manual,2));
end $$;


ALTER FUNCTION "public"."smpt_payroll_row_calc"("p_attendance_id" bigint, "p_daily_wage" numeric, "p_monthly_salary" numeric, "p_pay_system" "text", "p_config" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_payroll_weekly_component"("p_attendance_id" bigint, "p_daily" numeric, "p_monthly" numeric, "p_system" "text", "p_config" "jsonb") RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare c jsonb;begin c:=public.smpt_payroll_row_calc(p_attendance_id,p_daily,p_monthly,p_system,p_config);if coalesce((c->>'ready')::boolean,false)=false then raise exception '%',coalesce(c->>'message','Review Payroll belum lengkap.');end if;if upper(p_system)='HARIAN' then return coalesce((c->>'base_amount')::numeric,0)+coalesce((c->>'overtime_amount')::numeric,0)+coalesce((c->>'overtime_bonus')::numeric,0)+coalesce((c->>'holiday_bonus')::numeric,0);else return coalesce((c->>'meal_amount')::numeric,0);end if;end $$;


ALTER FUNCTION "public"."smpt_payroll_weekly_component"("p_attendance_id" bigint, "p_daily" numeric, "p_monthly" numeric, "p_system" "text", "p_config" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_preview_checker_route"("p_order_item_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_preview_checker_route"("p_order_item_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_receive_purchase_order_line"("p_purchase_order_line_id" bigint, "p_receipt_date" "date", "p_quantity" numeric, "p_input_unit" "text" DEFAULT NULL::"text", "p_conversion_factor" numeric DEFAULT NULL::numeric, "p_document_no" "text" DEFAULT NULL::"text", "p_roll_number" "text" DEFAULT NULL::"text", "p_supplier_lot_no" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_receive_purchase_order_line"("p_purchase_order_line_id" bigint, "p_receipt_date" "date", "p_quantity" numeric, "p_input_unit" "text", "p_conversion_factor" numeric, "p_document_no" "text", "p_roll_number" "text", "p_supplier_lot_no" "text", "p_notes" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_reject_logistics_history_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$ begin raise exception 'Histori logistik immutable. Gunakan reversal.'; end $$;


ALTER FUNCTION "public"."smpt_reject_logistics_history_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_reject_stock_history_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
                                                BEGIN
                                                  RAISE EXCEPTION 'Histori stock ledger immutable. Gunakan reversal/adjustment.';
                                                  END;
                                                  $$;


ALTER FUNCTION "public"."smpt_reject_stock_history_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_reset_business_data"("p_groups" "text"[], "p_confirmation" "text", "p_backup_before" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_group text;
  v_groups text[]:=array[]::text[];
  v_seed text[]:=array[]::text[];
  v_tables text[];
  v_backup jsonb;
  v_deleted jsonb;
  v_run_code text;
  v_full boolean:=false;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Reset Data.' using errcode='42501'; end if;
  foreach v_group in array coalesce(p_groups,array[]::text[]) loop
    v_group:=upper(btrim(v_group));
    if v_group not in ('PROCUREMENT','RAW_MATERIAL_FLOW','PRODUCTION_QC_LOGISTICS','HR_FINANCE','MASTER','ALL') then
      raise exception 'Kelompok reset tidak valid: %.',v_group;
    end if;
    if not v_group=any(v_groups) then v_groups:=array_append(v_groups,v_group); end if;
  end loop;
  if cardinality(v_groups)=0 then raise exception 'Pilih minimal satu kelompok data.'; end if;
  v_full:=('ALL'=any(v_groups) or 'MASTER'=any(v_groups));
  if v_full and upper(btrim(coalesce(p_confirmation,'')))<>'FULL RESET' then
    raise exception 'MASTER/ALL menghapus seluruh data bisnis. Ketik FULL RESET untuk melanjutkan.';
  elsif not v_full and upper(btrim(coalesce(p_confirmation,'')))<>'RESET' then
    raise exception 'Ketik RESET untuk melanjutkan Selective Reset.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));
  if coalesce(p_backup_before,true) then
    v_backup:=public.smpt_create_data_backup('AUTO BEFORE RESET '||array_to_string(v_groups,','));
  end if;

  if v_full then
    v_tables:=public.smpt_maintenance_tables();
  else
    if 'PROCUREMENT'=any(v_groups) then
      -- Procurement receipt changes canonical raw stock, so stock flow is reset together for consistency.
      v_seed:=v_seed||array['purchase_plans','stock_events','stock_balances','material_requests'];
    end if;
    if 'RAW_MATERIAL_FLOW'=any(v_groups) then
      -- Raw stock may contain PO receipts. Reset the linked procurement graph too so PO received/outstanding totals cannot drift.
      v_seed:=v_seed||array['purchase_plans','stock_events','stock_balances','material_requests'];
    end if;
    if 'PRODUCTION_QC_LOGISTICS'=any(v_groups) then
      v_seed:=v_seed||array['production_orders','production_manual_results','logistics_stock_events','logistics_stock_balances','embarkation_shipments'];
    end if;
    if 'HR_FINANCE'=any(v_groups) then
      v_seed:=v_seed||array[
        'attendance_records','attendance_import_batches','payroll_runs','operator_payroll_runs','cash_advances',
        'petty_cash_transactions','finance_transactions','manufacturing_transactions','attendance_month_closures',
        'payroll_payouts','salary_submissions'
      ];
    end if;
    v_tables:=public.smpt_expand_reset_tables(v_seed);
  end if;

  v_deleted:=public.smpt_delete_table_set(v_tables);

  -- Any broad reset can remove only part of an older dummy run. Invalidate stale row-id captures.
  delete from public.system_test_run_entities;
  update public.system_test_runs
  set result=result||jsonb_build_object('maintenance_invalidated_at',now(),'maintenance_reason','RESET '||array_to_string(v_groups,','))
  where run_type in ('DUMMY_FULL','REPEAT_ORDER','MANIPULASI_PAYROLL') and status='PASS' and coalesce(result->>'reset_at','')='' and coalesce(result->>'maintenance_invalidated_at','')='';

  -- Recreate canonical PUSAT only for full/master reset; stock_locations are protected config and are never deleted.
  if v_full and not exists(select 1 from public.locations where upper(name)='PUSAT' and status='AKTIF') then
    insert into public.locations(name,location_type,status,notes) values('PUSAT','GUDANG','AKTIF','Baseline lokasi sistem untuk QC/FG');
  end if;

  v_run_code:='RST-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,started_at,finished_at,created_by)
  values(v_run_code,'RESET','PASS',jsonb_build_object('groups',v_groups,'expanded_tables',v_tables,'deleted_rows',v_deleted,'backup',v_backup,'protected','auth + roles + permissions + profiles + stock_locations + payroll_settings + audit_events'),now(),now(),auth.uid());

  return jsonb_build_object('status','PASS','run_code',v_run_code,'groups',v_groups,'deleted_rows',v_deleted,'backup',v_backup);
end;
$$;


ALTER FUNCTION "public"."smpt_reset_business_data"("p_groups" "text"[], "p_confirmation" "text", "p_backup_before" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_reset_dummy_run"("p_run_id" bigint, "p_confirmation" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_run public.system_test_runs%rowtype;
  v_remaining text[];
  v_table text;
  v_ids bigint[];
  v_deleted bigint;
  v_counts jsonb:='{}'::jsonb;
  v_reset_code text;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Reset Dummy.' using errcode='42501'; end if;
  if upper(btrim(coalesce(p_confirmation,'')))<>'DELETE DUMMY' then raise exception 'Ketik DELETE DUMMY untuk menghapus run test.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));
  select * into v_run from public.system_test_runs
  where id=p_run_id and run_type in ('DUMMY_FULL','REPEAT_ORDER','MANIPULASI_PAYROLL') and status='PASS'
  for update;
  if not found then raise exception 'Run test PASS yang dapat dibersihkan tidak ditemukan.'; end if;
  if coalesce((v_run.result->>'reset_at'),'')<>'' then raise exception 'Run test ini sudah pernah di-reset.'; end if;
  if coalesce((v_run.result->>'maintenance_invalidated_at'),'')<>'' then raise exception 'Tracking Run Test ini sudah diinvalidasi oleh maintenance/reset lain. Jangan hapus berdasarkan ID lama.'; end if;

  select array_agg(distinct table_name order by table_name) into v_remaining
  from public.system_test_run_entities where run_id=p_run_id;
  v_remaining:=coalesce(v_remaining,array[]::text[]);

  while cardinality(v_remaining)>0 loop
    select candidate into v_table
    from unnest(v_remaining) candidate
    where not exists(
      select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_class child on child.oid=c.conrelid
      join pg_catalog.pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
      join pg_catalog.pg_class parent on parent.oid=c.confrelid
      join pg_catalog.pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
      where c.contype='f' and parent.relname=candidate and child.relname::text=any(v_remaining) and child.relname<>parent.relname
    ) order by candidate limit 1;
    if v_table is null then raise exception 'Reset Dummy dihentikan: siklus FK pada %.',array_to_string(v_remaining,', '); end if;

    select array_agg(row_id) into v_ids from public.system_test_run_entities where run_id=p_run_id and table_name=v_table;
    if cardinality(coalesce(v_ids,array[]::bigint[]))>0 then
      execute pg_catalog.format('delete from public.%I where id=any($1)',v_table) using v_ids;
      get diagnostics v_deleted=row_count;
    else v_deleted:=0;
    end if;
    v_counts:=jsonb_set(v_counts,array[v_table],to_jsonb(v_deleted),true);
    v_remaining:=array_remove(v_remaining,v_table);
  end loop;

  delete from public.system_test_run_entities where run_id=p_run_id;
  update public.system_test_runs
  set result=result||jsonb_build_object('reset_at',now(),'reset_by',auth.uid(),'deleted_rows',v_counts)
  where id=p_run_id;

  v_reset_code:='RST-DMY-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,started_at,finished_at,created_by)
  values(v_reset_code,'RESET','PASS',jsonb_build_object('dummy_run_id',p_run_id,'dummy_run_code',v_run.run_code,'source_run_type',v_run.run_type,'deleted_rows',v_counts),now(),now(),auth.uid());
  return jsonb_build_object('status','PASS','run_code',v_reset_code,'dummy_run_code',v_run.run_code,'source_run_type',v_run.run_type,'deleted_rows',v_counts);
end;
$_$;


ALTER FUNCTION "public"."smpt_reset_dummy_run"("p_run_id" bigint, "p_confirmation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_resolve_conversion_factor"("p_from_unit" "text", "p_to_unit" "text", "p_manual_factor" numeric DEFAULT NULL::numeric) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_resolve_conversion_factor"("p_from_unit" "text", "p_to_unit" "text", "p_manual_factor" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_restore_data_backup"("p_backup_id" bigint, "p_confirmation" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_backup public.system_data_backups%rowtype;
  v_expected text:=public.smpt_maintenance_schema_fingerprint();
  v_tables text[]:=public.smpt_maintenance_tables();
  v_remaining text[];
  v_table text;
  v_rows jsonb;
  v_identity boolean;
  v_inserted bigint;
  v_counts jsonb:='{}'::jsonb;
  v_run_code text;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Restore Data.' using errcode='42501'; end if;
  if upper(btrim(coalesce(p_confirmation,'')))<>'RESTORE' then raise exception 'Ketik RESTORE untuk mengonfirmasi restore.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));

  select * into v_backup from public.system_data_backups where id=p_backup_id and status in ('READY','RESTORED') for update;
  if not found then raise exception 'Backup tidak ditemukan/valid.'; end if;
  if v_backup.schema_fingerprint<>v_expected then
    raise exception 'Schema sudah berubah sejak backup dibuat. Restore dihentikan untuk mencegah data parsial.';
  end if;

  -- Restoring business IDs makes previous dummy row-id captures unsafe. Invalidate them first.
  delete from public.system_test_run_entities;
  update public.system_test_runs
  set result=result||jsonb_build_object('maintenance_invalidated_at',now(),'maintenance_reason','RESTORE '||v_backup.backup_code)
  where run_type in ('DUMMY_FULL','REPEAT_ORDER','MANIPULASI_PAYROLL') and status='PASS' and coalesce(result->>'reset_at','')='' and coalesce(result->>'maintenance_invalidated_at','')='';

  perform public.smpt_delete_table_set(v_tables);
  v_remaining:=v_tables;

  -- Parent-first insert order, computed from live FK metadata.
  while cardinality(v_remaining)>0 loop
    select candidate into v_table
    from unnest(v_remaining) candidate
    where not exists(
      select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class child on child.oid=c.conrelid
      join pg_catalog.pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
      join pg_catalog.pg_class parent on parent.oid=c.confrelid
      join pg_catalog.pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
      where c.contype='f'
        and child.relname=candidate
        and parent.relname::text=any(v_remaining)
        and child.relname<>parent.relname
    )
    order by candidate
    limit 1;

    if v_table is null then raise exception 'Restore dihentikan: siklus FK pada %.',array_to_string(v_remaining,', '); end if;
    v_rows:=coalesce(v_backup.snapshot->v_table,'[]'::jsonb);
    if jsonb_array_length(v_rows)>0 then
      select exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name=v_table and is_identity='YES'
      ) into v_identity;
      if v_identity then
        execute pg_catalog.format(
          'insert into public.%I overriding system value select * from jsonb_populate_recordset(null::public.%I,$1)',v_table,v_table
        ) using v_rows;
      else
        execute pg_catalog.format(
          'insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',v_table,v_table
        ) using v_rows;
      end if;
      get diagnostics v_inserted=row_count;
    else v_inserted:=0;
    end if;
    v_counts:=jsonb_set(v_counts,array[v_table],to_jsonb(v_inserted),true);
    v_remaining:=array_remove(v_remaining,v_table);
  end loop;

  update public.system_data_backups set status='RESTORED',last_restored_by=auth.uid(),last_restored_at=now() where id=v_backup.id;
  v_run_code:='RST-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,started_at,finished_at,created_by)
  values(v_run_code,'RESTORE','PASS',jsonb_build_object('backup_id',v_backup.id,'backup_code',v_backup.backup_code,'restored_rows',v_counts),now(),now(),auth.uid());

  return jsonb_build_object('status','PASS','run_code',v_run_code,'backup_code',v_backup.backup_code,'restored_rows',v_counts);
end;
$_$;


ALTER FUNCTION "public"."smpt_restore_data_backup"("p_backup_id" bigint, "p_confirmation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_run_dummy_full"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_run_id bigint;
  v_run_code text;
  v_step text:='INIT';
  v_steps jsonb:='[]'::jsonb;
  v_result jsonb;
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_project bigint; v_product bigint; v_material bigint; v_supplier bigint; v_ms bigint; v_bom bigint; v_component bigint;
  v_supervisor bigint; v_operator bigint; v_work1 bigint; v_work2 bigint; v_dep bigint; v_fg bigint; v_pusat bigint;
  v_plan bigint; v_plan_line bigint; v_po bigint; v_po_line bigint; v_receipt1 jsonb; v_receipt2 jsonb; v_replay jsonb; v_lot1 bigint;
  v_req_raw bigint; v_req_raw_item bigint; v_req_wip bigint; v_req_wip_item bigint;
  v_spk bigint; v_spk_item1 bigint; v_spk_item2 bigint; v_check1 bigint; v_check2 bigint; v_qc bigint;
  v_set bigint; v_emb bigint; v_target bigint; v_shipment bigint;
  v_negative_raw bigint; v_negative_log bigint; v_pending bigint;
  v_fail_message text; v_fail_state text;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Dummy Full.' using errcode='42501'; end if;
  if v_email='' then raise exception 'Email akun login tidak tersedia. Dummy Full memerlukan akun Auth aktif.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));

  -- QC runtime depends on canonical location PUSAT. Treat this as baseline config, not dummy data.
  select id into v_pusat from public.locations where upper(name)='PUSAT' and status='AKTIF' order by id limit 1;
  if v_pusat is null then
    insert into public.locations(name,location_type,status,notes) values('PUSAT','GUDANG','AKTIF','Baseline lokasi sistem untuk QC/FG') returning id into v_pusat;
  end if;

  v_run_code:='DMY-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,created_by)
  values(v_run_code,'DUMMY_FULL','RUNNING',jsonb_build_object('current_step','INIT'),auth.uid()) returning id into v_run_id;

  begin
    perform set_config('smpt.test_run_id',v_run_id::text,true);

    v_step:='MASTER';
    insert into public.projects(project_code,name,product_category,customer_name,start_date,end_date,status,created_by,updated_by)
    values(v_run_code,'DUMMY E2E '||v_run_code,'TEST','SYSTEM TEST',current_date,current_date+30,'Aktif',auth.uid(),auth.uid()) returning id into v_project;
    insert into public.project_products(project_id,name,target_production,unit,status,notes)
    values(v_project,'DUMMY PRODUCT',10,'PCS','AKTIF',v_run_code) returning id into v_product;
    insert into public.materials(name,standard_unit,category,status,calculation_type,lot_tracking_mode)
    values('DUMMY MATERIAL '||v_run_code,'YARD','KAIN','AKTIF','ROLL_LENGTH','ROLL') returning id into v_material;
    insert into public.vendors(name,status,default_currency,lead_time_days,notes)
    values('DUMMY SUPPLIER '||v_run_code,'AKTIF','IDR',3,v_run_code) returning id into v_supplier;
    v_ms:=public.save_material_supplier(v_material,v_supplier,'DMY-SKU','DUMMY ROLL','YARD',1,25000,true,1,3,'YARD',v_run_code,'AKTIF');
    insert into public.bom_requirements(project_id,product_id,material_id,component_type,component_name,unit,qty_per_unit,unit_price,status,
      fulfillment_source,calculation_method,net_usage_per_product,net_requirement,allowance_percent,allowance_qty,waste_percent,waste_qty,final_requirement,calculation_input_snapshot,calculated_at,calculated_by)
    values(v_project,v_product,v_material,'BAHAN','DUMMY MATERIAL','YARD',2,25000,'AKTIF','COMPANY_PURCHASE','CONSUMPTION',2,20,0,0,0,0,20,
      jsonb_build_object('dummy_run',v_run_code,'target',10,'consumption',2),now(),auth.uid()) returning id into v_bom;
    insert into public.cutting_components(project_id,product_id,name,qty_per_product,unit,color,notes,status)
    values(v_project,v_product,'DUMMY CUT PART',1,'PCS','TEST',v_run_code,'AKTIF') returning id into v_component;
    insert into public.workers(name,department,position,pay_system,status,notes)
    values('DUMMY SPV '||v_run_code,'PRODUKSI','SUPERVISOR PRODUKSI','BULANAN','AKTIF',v_run_code) returning id into v_supervisor;
    insert into public.workers(name,department,position,pay_system,status,notes)
    values('DUMMY OPERATOR '||v_run_code,'PRODUKSI','OPERATOR JAHIT','BORONGAN','AKTIF',v_run_code) returning id into v_operator;
    insert into public.work_items(project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,output_final)
    values(v_project,v_product,'DUMMY PROSES AWAL','PCS',1,1000,1200,'AKTIF',false) returning id into v_work1;
    insert into public.work_items(project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,output_final)
    values(v_project,v_product,'DUMMY FINAL','PCS',1,1500,1800,'AKTIF',true) returning id into v_work2;
    v_dep:=public.upsert_work_item_dependency(v_product,v_work1,v_work2,'SEQUENTIAL','HARD',v_run_code);
    insert into public.finished_goods(project_id,product_id,name,category,unit,source,final_work_item_id,status,notes)
    values(v_project,v_product,'DUMMY FG '||v_run_code,'TEST','PCS','INTERNAL',v_work2,'AKTIF',v_run_code) returning id into v_fg;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('project',v_project,'product',v_product,'material',v_material,'supplier',v_supplier),'expected','Master test lengkap dan HARD route aktif.'));

    v_step:='PURCHASE_PLANNING';
    v_plan:=public.smpt_create_purchase_plan(v_project,v_product,current_date,v_run_code);
    select id into v_plan_line from public.purchase_plan_lines where purchase_plan_id=v_plan and material_id=v_material limit 1;
    if v_plan_line is null then raise exception 'Purchase plan line dummy tidak terbentuk.'; end if;
    perform public.smpt_update_purchase_plan_line(v_plan_line,0,20,v_supplier,25000,v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('plan_id',v_plan,'planned_qty',20),'expected','Net need 20 YARD.'));

    v_step:='PO_DRAFT_ISSUE';
    v_po:=public.smpt_create_draft_purchase_order(v_plan,v_supplier,current_date,current_date+7,v_run_code);
    select id into v_po_line from public.purchase_order_lines where purchase_order_id=v_po and material_id=v_material limit 1;
    if v_po_line is null then raise exception 'PO line dummy tidak terbentuk.'; end if;
    perform public.smpt_issue_purchase_order(v_po);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('po_id',v_po,'line_id',v_po_line),'expected','Draft direview lalu status ISSUED.'));

    v_step:='PO_PARTIAL_RECEIPT_ROLL';
    v_receipt1:=public.smpt_receive_purchase_order_line(v_po_line,current_date,10,'YARD',1,'DMY-PO-1',v_run_code||'-ROLL-1','SUP-LOT-1',v_run_code,v_run_code||'-POR1');
    v_lot1:=(v_receipt1->>'lot_id')::bigint;
    v_receipt2:=public.smpt_receive_purchase_order_line(v_po_line,current_date,10,'YARD',1,'DMY-PO-2',v_run_code||'-ROLL-2','SUP-LOT-2',v_run_code,v_run_code||'-POR2');
    v_replay:=public.smpt_receive_purchase_order_line(v_po_line,current_date,10,'YARD',1,'DMY-PO-1',v_run_code||'-ROLL-1','SUP-LOT-1',v_run_code,v_run_code||'-POR1');
    if coalesce((v_replay->>'idempotent_replay')::boolean,false) is not true then raise exception 'Idempotency replay PO gagal.'; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('receipt1',v_receipt1,'receipt2',v_receipt2,'replay',v_replay),'expected','2 x 10 YARD, PO RECEIVED, dua roll aktual, replay tidak menggandakan stok.'));

    v_step:='GUDANG_TO_CUTTING';
    v_req_raw:=public.create_material_request_header(current_date,v_project,v_product,v_supervisor,'CUTTING',v_run_code);
    v_req_raw_item:=public.add_material_request_item(v_req_raw,'BAHAN BAKU',v_bom,10,v_run_code);
    perform public.submit_material_request(v_req_raw);
    perform public.fulfill_material_request_with_lot(current_date,v_req_raw_item,v_lot1,v_operator,null,v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('request_id',v_req_raw,'lot_id',v_lot1),'expected','SPV request muncul dan Gudang memenuhi Roll/Lot ke Cutting.'));

    v_step:='CUTTING';
    perform public.consume_material_lot(current_date,v_lot1,10,'YARD','CUTTING',null,'DUMMY CUTTER',v_run_code);
    perform public.record_cutting_result(current_date,v_component,2,0,'DUMMY CUTTER',v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual','10 YARD consumed; 2 PCS WIP returned to Gudang Hasil','expected','Cutting tidak kirim langsung ke proses berikutnya.'));

    v_step:='SABLON_CUSTODY';
    perform public.move_wip_stock(current_date,v_component,v_product,2,'TANDAI_SABLON',v_run_code);
    perform public.move_wip_stock(current_date,v_component,v_product,2,'KIRIM_SABLON',v_run_code);
    perform public.move_wip_stock(current_date,v_component,v_product,2,'KEMBALI_DARI_SABLON',v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual','Gudang Hasil -> Sablon -> Gudang Hasil Selesai Sablon','expected','Gudang tetap pusat custody.'));

    v_step:='SPV_REQUEST_GUDANG';
    v_req_wip:=public.create_material_request_header(current_date,v_project,v_product,v_supervisor,'PRODUKSI',v_run_code);
    v_req_wip_item:=public.add_material_request_item(v_req_wip,'HASIL SABLON',v_component,2,v_run_code);
    perform public.submit_material_request(v_req_wip);
    perform public.fulfill_material_request_item(v_req_wip_item,current_date,2,v_operator,null,null,'HASIL_SABLON',v_run_code);
    perform public.record_ready_production_usage(current_date,'CUTTING_COMPONENT',v_component,v_project,v_product,2,'DUMMY PRODUKSI',v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('request_id',v_req_wip,'item_id',v_req_wip_item),'expected','SPV WIP -> Gudang inbox -> fulfill -> Siap Produksi.'));

    v_step:='SPK_OPERATOR_CHECKER_HARD';
    v_spk:=public.create_production_order(current_date,v_project,v_product,v_operator,v_email,v_supervisor,current_date+7,v_run_code);
    v_spk_item1:=public.add_production_order_item(v_spk,v_work1,2);
    v_spk_item2:=public.add_production_order_item(v_spk,v_work2,2);
    perform public.publish_production_order(v_spk);
    v_check1:=public.record_checker_result(v_spk_item1,current_date,2,0,v_run_code||' predecessor');
    v_check2:=public.record_checker_result(v_spk_item2,current_date,2,0,v_run_code||' final HARD');
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('spk',v_spk,'predecessor_check',v_check1,'final_check',v_check2),'expected','Operator assignment oleh SPV; Checker final lolos HARD only setelah predecessor.'));

    v_step:='QC_BARANG_JADI';
    v_qc:=public.record_quality_control(v_check2,current_date,2,0,0,v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('qc_id',v_qc,'good_qty',2),'expected','QC menambah 2 PCS Barang Jadi di PUSAT.'));

    v_step:='PACKING_SET';
    insert into public.product_sets(project_id,name,unit,status,notes) values(v_project,'DUMMY SET '||v_run_code,'SET','AKTIF',v_run_code) returning id into v_set;
    insert into public.product_set_components(set_id,finished_good_id,qty_per_set) values(v_set,v_fg,1);
    perform public.pack_product_set(current_date,v_set,v_pusat,1,v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual','1 SET packed at PUSAT','expected','FG consumed 1, SET stock +1.'));

    v_step:='SHIPMENT';
    insert into public.embarkations(name,short_code,status,notes) values('DUMMY EMBARKASI '||v_run_code,'DMY','AKTIF',v_run_code) returning id into v_emb;
    insert into public.embarkation_targets(embarkation_id,item_kind,set_id,target_qty,status,notes)
    values(v_emb,'SET',v_set,1,'AKTIF',v_run_code) returning id into v_target;
    v_shipment:=public.create_embarkation_shipment(v_target,current_date,v_pusat,1,'DMY-DOC','DUMMY DRIVER','DMY-01',v_run_code);
    perform public.send_embarkation_shipment(v_shipment);
    perform public.receive_embarkation_shipment(v_shipment,1,0,0,0,v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('shipment_id',v_shipment,'received',1),'expected','SET dikirim lalu diterima penuh.'));

    v_step:='FINAL_HEALTH';
    select count(*) into v_negative_raw from public.stock_balances where quantity<0;
    select count(*) into v_negative_log from public.logistics_stock_balances where quantity<0;
    select count(*) into v_pending from public.material_requests where project_id=v_project and status in ('MENUNGGU GUDANG','SEBAGIAN');
    if v_negative_raw<>0 or v_negative_log<>0 or v_pending<>0 then
      raise exception 'Final health dummy gagal: negative raw %, negative logistics %, pending request %.',v_negative_raw,v_negative_log,v_pending;
    end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('negative_raw',v_negative_raw,'negative_logistics',v_negative_log,'pending_requests',v_pending),'expected','Negative stock 0 dan tidak ada request dummy tertinggal.'));

    perform set_config('smpt.test_run_id','',true);
  exception when others then
    v_fail_message:=sqlerrm; v_fail_state:=sqlstate;
    perform set_config('smpt.test_run_id','',true);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
      'step',v_step,'status','FAIL','actual',v_fail_message,'expected','Step selesai tanpa exception.',
      'error_database',v_fail_message,'sqlstate',v_fail_state,
      'possible_cause',case when v_fail_state='42501' then 'Permission/RLS belum sesuai atau akun test bukan ADMIN/berizin.'
                            when v_fail_state='23503' then 'Dependency/FK data dummy tidak lengkap.'
                            when v_fail_state='23505' then 'Duplicate/idempotency guard mendeteksi data ganda.'
                            else 'Periksa migration terbaru, function signature, stock state, dan diagnostic step ini.' end
    ));
  end;

  if v_fail_message is not null then
    v_result:=jsonb_build_object('run_code',v_run_code,'status','FAIL','failed_step',v_step,'steps',v_steps,'error',v_fail_message,'sqlstate',v_fail_state,'reference_test_run_id',v_run_id,'rolled_back_dummy_data',true);
    update public.system_test_runs set status='FAIL',result=v_result,finished_at=now() where id=v_run_id;
    return v_result;
  end if;

  v_result:=jsonb_build_object(
    'run_code',v_run_code,'status','PASS','project_id',v_project,'project_code',v_run_code,'steps',v_steps,
    'reference_test_run_id',v_run_id,
    'summary',jsonb_build_object('purchase_plan',v_plan,'purchase_order',v_po,'raw_request',v_req_raw,'spv_wip_request',v_req_wip,'spk',v_spk,'qc',v_qc,'shipment',v_shipment)
  );
  update public.system_test_runs set status='PASS',result=v_result,finished_at=now() where id=v_run_id;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."smpt_run_dummy_full"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_run_manual_borongan_test"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_run_id bigint;
  v_run_code text;
  v_step text:='INIT';
  v_steps jsonb:='[]'::jsonb;
  v_result jsonb;
  v_project bigint;v_product bigint;v_work bigint;v_worker bigint;v_manual bigint;v_op_run bigint;v_payout bigint;
  v_period_end date;v_period_start date;v_attendance_date date;
  v_qty numeric;v_eq numeric;v_op_value numeric;v_sub_value numeric;v_daily_paid numeric;
  v_fail_message text;v_fail_state text;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Runtime Test Manipulasi Payroll.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));

  v_run_code:='MNP-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,created_by)
  values(v_run_code,'MANIPULASI_PAYROLL','RUNNING',jsonb_build_object('current_step','INIT'),auth.uid()) returning id into v_run_id;

  begin
    perform set_config('smpt.test_run_id',v_run_id::text,true);

    -- Deterministic isolated Sat-Fri period; unique per test run and outside normal operational dates.
    v_period_end:=date '1900-01-05'+(v_run_id::integer*7);
    v_period_start:=v_period_end-6;
    v_attendance_date:=v_period_start;

    v_step:='MASTER_HARIAN';
    insert into public.projects(project_code,name,product_category,customer_name,start_date,end_date,status)
    values(v_run_code,'MANIP TEST '||v_run_code,'TEST','SYSTEM TEST',v_period_start,v_period_end,'Berjalan') returning id into v_project;
    insert into public.project_products(project_id,name,target_production,unit,status,notes)
    values(v_project,'MANIP PRODUCT',20,'PCS','AKTIF',v_run_code) returning id into v_product;
    insert into public.work_items(project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,executor_scope,submission_category)
    values(v_project,v_product,'MANIP WORK','Pcs',2,500,1200,'AKTIF','PEKERJA_HARIAN','BORONGAN') returning id into v_work;
    insert into public.workers(name,department,position,pay_system,daily_wage,status,notes)
    values('MANIP HARIAN '||v_run_code,'PRODUKSI','HELPER','HARIAN',100000,'AKTIF',v_run_code) returning id into v_worker;
    insert into public.attendance_records(worker_id,attendance_date,attendance_status,day_class,overtime_minutes,verification_status,source,verified_by,verified_at,notes)
    values(v_worker,v_attendance_date,'HADIR','FULL_DAY',0,'TERVERIFIKASI','MANUAL',auth.uid(),now(),v_run_code);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('worker_id',v_worker,'pay_system','HARIAN','daily_wage',100000),'expected','HARIAN + item PEKERJA_HARIAN/BORONGAN.'));

    v_step:='MANUAL_RESULT_PROGRESS';
    v_manual:=public.record_manual_production_result(v_attendance_date,v_project,v_product,v_work,v_worker,10,v_run_code||' alasan runtime test');
    select qty_sah,equivalent_product into v_qty,v_eq from public.v_work_item_equivalent_progress where work_item_id=v_work;
    if v_qty<>10 or v_eq<>5 then raise exception 'Progress hasil manual salah: qty %, equivalent %.',v_qty,v_eq; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('manual_result_id',v_manual,'qty_sah',v_qty,'equivalent_product',v_eq),'expected','Qty Sah 10; Equivalent 5.'));

    v_step:='OPERATOR_SUBMISSION_NO_DOUBLE_PAY';
    v_op_run:=public.finalize_operator_payroll(v_period_start,v_period_end,v_run_code);
    select operator_value,submission_value into v_op_value,v_sub_value
    from public.operator_payroll_items
    where run_id=v_op_run and worker_id=v_worker and work_item_id=v_work;
    if coalesce(v_op_value,-1)<>0 or coalesce(v_sub_value,-1)<>12000 then
      raise exception 'Payroll Operator salah: operator %, pengajuan %.',v_op_value,v_sub_value;
    end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('operator_value',v_op_value,'submission_value',v_sub_value),'expected','Operator=0; Pengajuan=10 x 1.200 = 12.000.'));

    v_step:='DAILY_PAYROLL_SEPARATE';
    v_payout:=public.finalize_payroll_payout('MINGGUAN',v_period_start,v_period_end,v_run_code);
    select total_paid into v_daily_paid from public.payroll_payout_details where payout_id=v_payout and worker_id=v_worker;
    if coalesce(v_daily_paid,-1)<>100000 then raise exception 'Payroll HARIAN salah: %.',v_daily_paid; end if;
    if v_op_value<>0 then raise exception 'Double-pay terdeteksi pada operator value.'; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('daily_payroll',v_daily_paid,'operator_value',v_op_value,'submission_value',v_sub_value),'expected','Payroll HARIAN=100.000 tetap terpisah; operator value=0; pengajuan=12.000.'));

    v_step:='AUDIT_TRAIL';
    perform 1 from public.production_manual_results m
    where m.id=v_manual and m.project_id=v_project and m.product_id=v_product and m.work_item_id=v_work and m.worker_id=v_worker
      and m.qty_good=10 and m.operator_price_snapshot=500 and m.submission_price_snapshot=1200
      and m.created_by=auth.uid() and btrim(m.created_by_email_snapshot)<>'' and btrim(m.reason)<>'';
    if not found then raise exception 'Audit trail hasil manual tidak lengkap.'; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('manual_result_id',v_manual),'expected','Actor/time/reason/scope/qty/price snapshot tersimpan.'));

    perform set_config('smpt.test_run_id','',true);
  exception when others then
    v_fail_message:=sqlerrm;v_fail_state:=sqlstate;
    perform set_config('smpt.test_run_id','',true);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','FAIL','actual',v_fail_message,'expected','Step selesai tanpa exception.','error_database',v_fail_message,'sqlstate',v_fail_state,'possible_cause','Periksa profile Item, manual result ledger, progress view, payroll operator, payout mingguan, atau permission.'));
  end;

  if v_fail_message is not null then
    v_result:=jsonb_build_object('run_code',v_run_code,'status','FAIL','failed_step',v_step,'steps',v_steps,'error',v_fail_message,'sqlstate',v_fail_state,'reference_test_run_id',v_run_id,'rolled_back_dummy_data',true);
    update public.system_test_runs set status='FAIL',result=v_result,finished_at=now() where id=v_run_id;
    return v_result;
  end if;

  v_result:=jsonb_build_object('run_code',v_run_code,'status','PASS','steps',v_steps,'reference_test_run_id',v_run_id,'manual_result_id',v_manual,'operator_payroll_run_id',v_op_run,'payroll_payout_id',v_payout,'double_pay',false,'resettable',true);
  update public.system_test_runs set status='PASS',result=v_result,finished_at=now() where id=v_run_id;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."smpt_run_manual_borongan_test"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_run_repeat_order_test"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_run_id bigint;
  v_run_code text;
  v_step text:='INIT';
  v_steps jsonb:='[]'::jsonb;
  v_result jsonb;
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_source bigint;v_repeat bigint;v_product bigint;v_material bigint;v_work1 bigint;v_work2 bigint;v_dep bigint;
  v_operator bigint;v_repeat_product bigint;v_repeat_work bigint;v_spk bigint;
  v_rpc jsonb;v_count bigint;v_tx bigint;v_target numeric;v_profile text;v_category text;
  v_fail_message text;v_fail_state text;
begin
  if not public.has_permission('setup_test.admin') then raise exception 'Tidak memiliki izin Runtime Test Repeat Order.' using errcode='42501'; end if;
  if v_email='' then raise exception 'Email akun login tidak tersedia. Runtime test memerlukan akun Auth aktif.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('SMPT_MAINTENANCE',0));

  v_run_code:='RPT-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,result,created_by)
  values(v_run_code,'REPEAT_ORDER','RUNNING',jsonb_build_object('current_step','INIT'),auth.uid()) returning id into v_run_id;

  begin
    perform set_config('smpt.test_run_id',v_run_id::text,true);

    v_step:='SOURCE_MASTER';
    insert into public.projects(project_code,name,product_category,customer_name,start_date,end_date,status)
    values(v_run_code||'-SRC','REPEAT SOURCE '||v_run_code,'TEST','SYSTEM TEST',current_date,current_date+30,'Berjalan') returning id into v_source;
    insert into public.project_products(project_id,name,target_production,unit,status,notes)
    values(v_source,'REPEAT PRODUCT',10,'PCS','AKTIF',v_run_code) returning id into v_product;
    insert into public.materials(name,standard_unit,category,status)
    values('REPEAT MATERIAL '||v_run_code,'PCS','LAINNYA','AKTIF') returning id into v_material;
    insert into public.bom_requirements(project_id,product_id,material_id,component_type,component_name,unit,qty_per_unit,unit_price,status)
    values(v_source,v_product,v_material,'BAHAN','REPEAT MATERIAL '||v_run_code,'PCS',2,1000,'AKTIF');
    insert into public.work_items(project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,output_final,flow_mode,routing_validation_mode,executor_scope,submission_category)
    values(v_source,v_product,'REPEAT STEP 1','Pcs',1,500,800,'AKTIF',false,'KHUSUS','HARD','KEDUANYA','BORONGAN') returning id into v_work1;
    insert into public.work_items(project_id,product_id,name,unit,qty_per_product,operator_price,proposed_price,status,output_final,flow_mode,routing_validation_mode,executor_scope,submission_category)
    values(v_source,v_product,'REPEAT STEP 2','Pcs',1,600,900,'AKTIF',true,'KHUSUS','HARD','KEDUANYA','BORONGAN') returning id into v_work2;
    insert into public.work_item_dependencies(product_id,predecessor_work_item_id,successor_work_item_id,dependency_type,validation_mode,status,source_mode,notes)
    values(v_product,v_work1,v_work2,'SEQUENTIAL','HARD','AKTIF','MANUAL_SPECIAL',v_run_code) returning id into v_dep;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('project',v_source,'product',v_product,'work_items',2,'routing',v_dep),'expected','Source master/config lengkap.'));

    v_step:='REPEAT_CLONE';
    v_rpc:=public.smpt_create_repeat_order(
      v_source,v_run_code||'-NEW','REPEAT NEW '||v_run_code,'TEST','SYSTEM TEST',0,current_date,current_date+60,'Pending',v_run_code,
      jsonb_build_object(v_product::text,25)
    );
    v_repeat:=(v_rpc->>'project_id')::bigint;
    select id,target_production into v_repeat_product,v_target from public.project_products where project_id=v_repeat order by id limit 1;
    select id,executor_scope,submission_category into v_repeat_work,v_profile,v_category from public.work_items where project_id=v_repeat and name='REPEAT STEP 1';
    if v_repeat is null or v_target<>25 or v_profile<>'KEDUANYA' or v_category<>'BORONGAN' then
      raise exception 'Repeat clone master/config tidak sesuai target/profile.';
    end if;
    select count(*) into v_count from public.work_items where project_id=v_repeat;
    if v_count<>2 then raise exception 'Repeat clone Item Pekerjaan %, expected 2.',v_count; end if;
    select count(*) into v_count from public.bom_requirements where project_id=v_repeat;
    if v_count<>1 then raise exception 'Repeat clone BOM %, expected 1.',v_count; end if;
    select count(*) into v_count from public.work_item_dependencies d join public.project_products pp on pp.id=d.product_id where pp.project_id=v_repeat;
    if v_count<>1 then raise exception 'Repeat clone Routing %, expected 1.',v_count; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',v_rpc,'expected','Produk target=25, Item=2, BOM=1, Routing=1, profile payroll ikut tercopy.'));

    v_step:='NO_TRANSACTION_COPY';
    select
      (select count(*) from public.production_orders where project_id=v_repeat)
      +(select count(*) from public.material_requests where project_id=v_repeat)
      +(select count(*) from public.purchase_plans where project_id=v_repeat)
      +(select count(*) from public.finished_goods where project_id=v_repeat)
      +(select count(*) from public.production_manual_results where project_id=v_repeat)
    into v_tx;
    if v_tx<>0 then raise exception 'Transaksi ikut tercopy: % row.',v_tx; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',v_tx,'expected',0));

    v_step:='TRACEABILITY';
    perform 1 from public.projects where id=v_repeat and repeat_source_project_id=v_source and repeat_order_note=v_run_code;
    if not found then raise exception 'Trace source project Repeat Order tidak tersimpan.'; end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('source_project_id',v_source,'repeat_project_id',v_repeat),'expected','repeat_source_project_id menunjuk source.'));

    v_step:='REPEAT_USABLE';
    insert into public.workers(name,department,position,pay_system,status,notes)
    values('REPEAT OPERATOR '||v_run_code,'PRODUKSI','OPERATOR JAHIT','BORONGAN','AKTIF',v_run_code) returning id into v_operator;
    v_spk:=public.create_production_order(current_date,v_repeat,v_repeat_product,v_operator,v_email,null,current_date+7,v_run_code);
    perform public.add_production_order_item(v_spk,v_repeat_work,1);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','PASS','actual',jsonb_build_object('spk_id',v_spk),'expected','Repeat project dapat dipakai membuat Draft SPK normal setelah clone.'));

    perform set_config('smpt.test_run_id','',true);
  exception when others then
    v_fail_message:=sqlerrm;v_fail_state:=sqlstate;
    perform set_config('smpt.test_run_id','',true);
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('step',v_step,'status','FAIL','actual',v_fail_message,'expected','Step selesai tanpa exception.','error_database',v_fail_message,'sqlstate',v_fail_state,'possible_cause','Periksa migration Repeat Order, permission, FK, RPC signature, dan data test.'));
  end;

  if v_fail_message is not null then
    v_result:=jsonb_build_object('run_code',v_run_code,'status','FAIL','failed_step',v_step,'steps',v_steps,'error',v_fail_message,'sqlstate',v_fail_state,'reference_test_run_id',v_run_id,'rolled_back_dummy_data',true);
    update public.system_test_runs set status='FAIL',result=v_result,finished_at=now() where id=v_run_id;
    return v_result;
  end if;

  v_result:=jsonb_build_object('run_code',v_run_code,'status','PASS','steps',v_steps,'reference_test_run_id',v_run_id,'source_project_id',v_source,'repeat_project_id',v_repeat,'transactions_copied',0,'resettable',true);
  update public.system_test_runs set status='PASS',result=v_result,finished_at=now() where id=v_run_id;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."smpt_run_repeat_order_test"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_run_system_diagnostic"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_run_id bigint;
  v_run_code text;
  v_result jsonb;
  v_steps jsonb;
  v_status text:='PASS';
  v_negative_raw bigint;
  v_negative_logistics bigint;
  v_pending_requests bigint;
  v_pending_items bigint;
  v_procurement_plans bigint;
  v_open_po bigint;
  v_open_po_lines bigint;
  v_po_receipts bigint;
  v_fulfill_overloads bigint;
  v_projects bigint;
  v_materials bigint;
  v_bom bigint;
  v_suppliers bigint;
  v_cutting_results bigint;
  v_wip_gudang numeric;
begin
  if not public.has_permission('setup_test.admin') then
    raise exception 'Tidak memiliki izin Setup & Data Test.' using errcode='42501';
  end if;

  v_run_code:='TST-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.smpt_system_test_run_seq')::text,4,'0');
  insert into public.system_test_runs(run_code,run_type,status,created_by)
  values(v_run_code,'DIAGNOSTIC','RUNNING',auth.uid()) returning id into v_run_id;

  select count(*) into v_negative_raw from public.stock_balances where quantity<0;
  select count(*) into v_negative_logistics from public.logistics_stock_balances where quantity<0;
  select count(*) into v_pending_requests from public.material_requests where status in ('MENUNGGU GUDANG','SEBAGIAN');
  select count(*) into v_pending_items from public.material_request_items i join public.material_requests r on r.id=i.request_id
    where r.status in ('MENUNGGU GUDANG','SEBAGIAN') and i.status<>'DIBATALKAN' and i.fulfilled_qty<i.requested_qty;
  select count(*) into v_procurement_plans from public.purchase_plans where status<>'CANCELLED';
  select count(*) into v_open_po from public.purchase_orders where status in ('ISSUED','PARTIAL');
  select count(*) into v_open_po_lines from public.purchase_order_lines pol join public.purchase_orders po on po.id=pol.purchase_order_id
    where po.status in ('ISSUED','PARTIAL') and pol.status in ('OPEN','PARTIAL');
  select count(*) into v_po_receipts from public.warehouse_receipts where receipt_source='PO' and status='AKTIF';
  select count(*) into v_projects from public.projects;
  select count(*) into v_materials from public.materials;
  select count(*) into v_bom from public.bom_requirements where component_type='BAHAN' and status='AKTIF';
  select count(*) into v_suppliers from public.vendors where status='AKTIF';
  select count(*) into v_cutting_results from public.cutting_daily_results where status='AKTIF';
  select coalesce(sum(sb.quantity),0) into v_wip_gudang
  from public.stock_balances sb join public.stock_locations sl on sl.id=sb.location_id
  where sb.item_kind='CUTTING_COMPONENT' and sl.physical_group='GUDANG_HASIL';

  select count(*) into v_fulfill_overloads
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='fulfill_material_request_item';

  if v_negative_raw>0 or v_negative_logistics>0 or v_fulfill_overloads<>1 then v_status:='FAIL';
  elsif v_pending_requests>0 and v_pending_items=0 then v_status:='WARN';
  end if;

  v_steps:=jsonb_build_array(
    jsonb_build_object('step','MASTER','status',case when v_projects>0 and v_materials>0 then 'PASS' else 'WARN' end,'actual',jsonb_build_object('projects',v_projects,'materials',v_materials,'active_bom',v_bom,'suppliers',v_suppliers),'expected','Master boleh kosong di instalasi baru, tetapi data dasar harus tersedia sebelum E2E.'),
    jsonb_build_object('step','STOCK','status',case when v_negative_raw=0 and v_negative_logistics=0 then 'PASS' else 'FAIL' end,'actual',jsonb_build_object('negative_raw_stock',v_negative_raw,'negative_logistics_stock',v_negative_logistics),'expected','Semua negative stock = 0.','possible_cause',case when v_negative_raw>0 or v_negative_logistics>0 then 'Ledger/balance tidak sinkron atau ada flow lama yang melewati guarded stock RPC.' else null end),
    jsonb_build_object('step','CUTTING_GUDANG_HASIL','status','PASS','actual',jsonb_build_object('active_cutting_results',v_cutting_results,'wip_gudang_hasil',v_wip_gudang),'expected','Monitoring; angka dapat 0 bila belum ada transaksi.'),
    jsonb_build_object('step','SPV_REQUEST_GUDANG','status',case when v_pending_requests>0 and v_pending_items=0 then 'WARN' else 'PASS' end,'actual',jsonb_build_object('pending_requests',v_pending_requests,'outstanding_items',v_pending_items),'expected','Setiap request MENUNGGU/SEBAGIAN yang belum selesai harus memiliki item outstanding.','possible_cause',case when v_pending_requests>0 and v_pending_items=0 then 'Header request tertinggal pada status pending walau seluruh detail sudah terpenuhi/dibatalkan.' else null end),
    jsonb_build_object('step','PROCUREMENT','status','PASS','actual',jsonb_build_object('plans',v_procurement_plans,'open_po',v_open_po,'open_po_lines',v_open_po_lines,'po_receipts',v_po_receipts),'expected','Open PO line dapat diterima parsial sampai outstanding 0.'),
    jsonb_build_object('step','RPC_FULFILL_SIGNATURE','status',case when v_fulfill_overloads=1 then 'PASS' else 'FAIL' end,'actual',v_fulfill_overloads,'expected','Tepat satu overload fulfill_material_request_item aktif (signature 8 parameter).','possible_cause',case when v_fulfill_overloads<>1 then 'Migration fulfill lama/baru hidup bersamaan atau migration terbaru belum ter-push.' else null end)
  );

  v_result:=jsonb_build_object(
    'run_code',v_run_code,
    'status',v_status,
    'role',public.current_user_role(),
    'steps',v_steps,
    'summary',jsonb_build_object(
      'negative_raw_stock',v_negative_raw,
      'negative_logistics_stock',v_negative_logistics,
      'pending_requests',v_pending_requests,
      'open_po',v_open_po,
      'po_receipts',v_po_receipts,
      'fulfill_rpc_overloads',v_fulfill_overloads
    ),
    'checked_at',now()
  );

  update public.system_test_runs set status=v_status,result=v_result,finished_at=now() where id=v_run_id;
  return v_result;
exception when others then
  -- The EXCEPTION block rolls back statements executed inside the failed subtransaction,
  -- including the initial RUNNING row. Re-create the failed run here and RETURN it so
  -- the diagnostic error itself remains auditable instead of disappearing on RAISE.
  if v_run_code is null then raise; end if;
  v_result:=jsonb_build_object(
    'run_code',v_run_code,'status','FAIL','error',sqlerrm,'sqlstate',sqlstate,
    'possible_cause','Database/RLS/permission/schema check gagal. Lihat error + SQLSTATE pada run ini.',
    'checked_at',now()
  );
  insert into public.system_test_runs(run_code,run_type,status,result,started_at,finished_at,created_by)
  values(v_run_code,'DIAGNOSTIC','FAIL',v_result,now(),now(),auth.uid())
  on conflict(run_code) do update set status='FAIL',result=excluded.result,finished_at=excluded.finished_at;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."smpt_run_system_diagnostic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_secure_date"("p_value" "text") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
declare v text:=btrim(coalesce(p_value,''));
begin
  if v !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  begin return v::date; exception when others then return null; end;
end $_$;


ALTER FUNCTION "public"."smpt_secure_date"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_secure_time"("p_value" "text") RETURNS time without time zone
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
declare v text:=btrim(coalesce(p_value,''));
begin
  if v !~ '^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$' then return null; end if;
  begin return v::time; exception when others then return null; end;
end $_$;


ALTER FUNCTION "public"."smpt_secure_time"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_spk_checker_options"() RETURNS TABLE("user_id" "uuid", "email" "text", "display_name" "text", "role_code" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.has_permission('spk.view') then
    raise exception 'Tidak memiliki izin melihat referensi Checker SPK.' using errcode='42501';
  end if;

  return query
  select u.id::uuid,
         lower(coalesce(u.email,''))::text,
         coalesce(nullif(btrim(p.display_name),''),u.email,'Checker')::text,
         upper(r.code)::text
  from auth.users u
  join public.profiles p on p.id=u.id and p.is_active=true
  join public.roles r on r.id=p.role_id and r.is_active=true
  where nullif(btrim(coalesce(u.email,'')),'') is not null
    and public.smpt_user_has_permission(u.id,'borongan.operate')
  order by lower(coalesce(nullif(btrim(p.display_name),''),u.email,'')), lower(coalesce(u.email,''));
end;
$$;


ALTER FUNCTION "public"."smpt_spk_checker_options"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_spk_item_capacity"("p_order_id" bigint, "p_work_item_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_spk_item_capacity"("p_order_id" bigint, "p_work_item_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_sync_auto_linear_dependencies"("p_product_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_sync_auto_linear_dependencies"("p_product_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_sync_payroll_run_advances"("p_run_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_item record;
  v_kasbon_p numeric;
  v_kasbon_w numeric;
  v_deduction numeric;
  v_gross numeric;
  v_net numeric;
  v_run_gross numeric := 0;
  v_run_deduction numeric := 0;
  v_run_net numeric := 0;
  v_updated_count int := 0;
begin
  if auth.uid() is not null 
     and not public.has_permission('payroll.write') 
     and upper(coalesce(public.current_user_role(),'')) <> 'ADMIN' then
    raise exception 'Tidak memiliki izin Payroll.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.payroll_runs where id = p_run_id) then
    raise exception 'Payroll run dengan ID % tidak ditemukan.', p_run_id;
  end if;

  for v_item in (
    select id, worker_id, base_amount, meal_amount, overtime_amount, manual_overtime_amount, overtime_bonus, holiday_bonus
    from public.payroll_run_items
    where payroll_run_id = p_run_id
  ) loop
    -- 1. Ambil cicilan aktif Kasbon Perusahaan
    select coalesce(sum(least(case when installment_amount > 0 then installment_amount else (amount - paid_amount) end, amount - paid_amount)), 0)
    into v_kasbon_p
    from public.cash_advances
    where worker_id = v_item.worker_id and status = 'AKTIF' and category = 'KASBON_PERUSAHAAN';

    -- 2. Ambil saldo aktif Kasbon Warung
    select coalesce(sum(amount - paid_amount), 0)
    into v_kasbon_w
    from public.cash_advances
    where worker_id = v_item.worker_id and status = 'AKTIF' and category = 'KASBON_WARUNG';

    v_deduction := v_kasbon_p + v_kasbon_w;
    v_gross := round((coalesce(v_item.base_amount, 0) + coalesce(v_item.meal_amount, 0) + coalesce(v_item.overtime_amount, 0) + coalesce(v_item.manual_overtime_amount, 0) + coalesce(v_item.overtime_bonus, 0) + coalesce(v_item.holiday_bonus, 0))::numeric, 2);
    v_net := greatest(0, round((v_gross - v_deduction)::numeric, 2));

    update public.payroll_run_items set
      kasbon_perusahaan_amount = v_kasbon_p,
      kasbon_warung_amount = v_kasbon_w,
      deduction_amount = v_deduction,
      net_amount = v_net
    where id = v_item.id;

    v_updated_count := v_updated_count + 1;
  end loop;

  -- 3. Sinkronkan total di tabel payroll_runs
  select
    coalesce(sum(base_amount + meal_amount + overtime_amount + manual_overtime_amount + overtime_bonus + holiday_bonus), 0),
    coalesce(sum(deduction_amount), 0),
    coalesce(sum(net_amount), 0)
  into v_run_gross, v_run_deduction, v_run_net
  from public.payroll_run_items
  where payroll_run_id = p_run_id;

  update public.payroll_runs set
    total_gross = v_run_gross,
    total_deduction = v_run_deduction,
    total_net = v_run_net
  where id = p_run_id;

  return jsonb_build_object(
    'run_id', p_run_id,
    'updated_workers', v_updated_count,
    'total_gross', v_run_gross,
    'total_deduction', v_run_deduction,
    'total_net', v_run_net
  );
end;
$$;


ALTER FUNCTION "public"."smpt_sync_payroll_run_advances"("p_run_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_unit_key"("p_unit" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_unit_key"("p_unit" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_update_draft_purchase_order_line"("p_line_id" bigint, "p_ordered_quantity" numeric, "p_purchase_unit" "text", "p_conversion_factor" numeric, "p_unit_price" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_update_draft_purchase_order_line"("p_line_id" bigint, "p_ordered_quantity" numeric, "p_purchase_unit" "text", "p_conversion_factor" numeric, "p_unit_price" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_update_purchase_plan_line"("p_line_id" bigint, "p_confirmed_incoming" numeric, "p_planned_quantity" numeric, "p_supplier_id" bigint, "p_unit_price" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_line public.purchase_plan_lines%rowtype;
  v_net numeric(18,4);
  v_planned numeric(18,4);
begin
  if not public.has_permission('procurement.edit_draft') then
    raise exception 'Tidak memiliki izin mengubah Purchase Planning.' using errcode='42501';
  end if;

  select l.* into v_line
  from public.purchase_plan_lines l
  join public.purchase_plans p on p.id=l.purchase_plan_id
  where l.id=p_line_id and p.status='DRAFT'
  for update of l;

  if not found then
    raise exception 'Baris Purchase Planning DRAFT tidak ditemukan.';
  end if;

  if coalesce(p_confirmed_incoming,0)<0
     or coalesce(p_planned_quantity,0)<0
     or coalesce(p_unit_price,0)<0 then
    raise exception 'Qty/harga tidak boleh negatif.';
  end if;

  v_planned := round(coalesce(p_planned_quantity,0)::numeric,4);

  -- A line with quantity to purchase is not actionable without a supplier.
  -- Keep the database rule aligned with the inline UI validation so direct
  -- RPC calls cannot bypass the business rule.
  if v_planned > 0 and p_supplier_id is null then
    raise exception 'Supplier wajib dipilih karena Qty Direncanakan lebih dari 0.';
  end if;

  if p_supplier_id is not null then
    perform 1
    from public.vendors
    where id=p_supplier_id and status='AKTIF';
    if not found then
      raise exception 'Supplier tidak ditemukan/aktif.';
    end if;
  end if;

  v_net:=greatest(
    round((v_line.final_requirement-v_line.usable_stock-coalesce(p_confirmed_incoming,0)-v_line.open_po_quantity)::numeric,4),
    0
  );

  update public.purchase_plan_lines set
    confirmed_incoming=round(coalesce(p_confirmed_incoming,0)::numeric,4),
    net_procurement_need=v_net,
    planned_quantity=v_planned,
    supplier_id=p_supplier_id,
    unit_price=p_unit_price,
    notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_by=auth.uid(),
    updated_at=now()
  where id=p_line_id;
end;
$$;


ALTER FUNCTION "public"."smpt_update_purchase_plan_line"("p_line_id" bigint, "p_confirmed_incoming" numeric, "p_planned_quantity" numeric, "p_supplier_id" bigint, "p_unit_price" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_user_has_permission"("p_user_id" "uuid", "p_permission" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_requested text := lower(trim(coalesce(p_permission,'')));
  v_role_code text;
  v_effect text;
begin
  if p_user_id is null or v_requested='' then return false; end if;

  select upper(r.code) into v_role_code
  from public.profiles p
  join public.roles r on r.id=p.role_id
  where p.id=p_user_id and p.is_active=true and r.is_active=true
  limit 1;

  if v_role_code is null then return false; end if;
  if v_role_code='ADMIN' then return true; end if;

  select o.effect into v_effect
  from public.user_permission_overrides o
  where o.user_id=p_user_id and o.is_active=true
    and (
      lower(o.permission_pattern)=v_requested
      or o.permission_pattern='*'
      or (right(lower(o.permission_pattern),2)='.*'
        and left(v_requested,char_length(o.permission_pattern)-1)=left(lower(o.permission_pattern),char_length(o.permission_pattern)-1))
    )
  order by case when lower(o.permission_pattern)=v_requested then 3 when o.permission_pattern='*' then 1 else 2 end desc,
           char_length(o.permission_pattern) desc, o.id asc
  limit 1;

  if found then return upper(coalesce(v_effect,''))='ALLOW'; end if;

  return exists(
    select 1
    from public.role_permissions rp
    join public.roles r on r.id=rp.role_id and r.is_active=true
    join public.permissions p on p.id=rp.permission_id
    where upper(r.code)=v_role_code and lower(p.code)=v_requested
  );
end;
$$;


ALTER FUNCTION "public"."smpt_user_has_permission"("p_user_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_validate_finished_good_relations"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare v_w public.work_items%rowtype;
begin
  if new.product_id is not null then
    perform 1 from public.project_products pp where pp.id=new.product_id and pp.project_id=new.project_id and pp.status='AKTIF';
    if not found then raise exception 'Produk/Tas Barang Jadi tidak sesuai Proyek atau NONAKTIF.'; end if;
  end if;

  if new.final_work_item_id is not null then
    select * into v_w from public.work_items where id=new.final_work_item_id;
    if not found or v_w.status<>'AKTIF' or not coalesce(v_w.output_final,false) then
      raise exception 'Output Final harus Item Pekerjaan aktif yang ditandai OUTPUT FINAL.';
    end if;
    if v_w.project_id<>new.project_id or v_w.product_id is distinct from new.product_id then
      raise exception 'Output Final tidak berasal dari Proyek/Produk yang sama dengan Barang Jadi.';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."smpt_validate_finished_good_relations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_validate_set_component_project"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare v_set_project bigint;v_fg_project bigint;v_set_status text;v_fg_status text;
begin
  select project_id,status into v_set_project,v_set_status from public.product_sets where id=new.set_id;
  if v_set_project is null then raise exception 'Set tidak ditemukan.'; end if;
  select project_id,status into v_fg_project,v_fg_status from public.finished_goods where id=new.finished_good_id;
  if v_fg_project is null then raise exception 'Barang Jadi tidak ditemukan.'; end if;
  if v_set_status<>'AKTIF' or v_fg_status<>'AKTIF' then raise exception 'Set dan Barang Jadi harus aktif.'; end if;
  if v_set_project<>v_fg_project then raise exception 'Barang Jadi harus berasal dari Proyek yang sama dengan Set.'; end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."smpt_validate_set_component_project"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_validate_work_item_dependency"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."smpt_validate_work_item_dependency"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."smpt_work_item_snapshot"("p_work_item_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v jsonb;
begin
  select to_jsonb(w) into v from public.work_items w where w.id=p_work_item_id;
  if v is null then raise exception 'Item pekerjaan tidak ditemukan.'; end if;
  return jsonb_build_object(
    'id',p_work_item_id,
    'project_id',nullif(coalesce(v->>'project_id',''),'')::bigint,
    'product_id',nullif(coalesce(v->>'product_id',''),'')::bigint,
    'name',coalesce(nullif(v->>'name',''),nullif(v->>'item_name',''),nullif(v->>'work_name',''),'Item #'||p_work_item_id),
    'unit',coalesce(nullif(v->>'unit',''),nullif(v->>'satuan',''),'PCS'),
    'qty_per_product',coalesce(nullif(v->>'qty_per_product','')::numeric,nullif(v->>'quantity_per_product','')::numeric,1),
    'operator_price',coalesce(nullif(v->>'operator_price','')::numeric,nullif(v->>'harga_operator','')::numeric,0),
    'submission_price',coalesce(nullif(v->>'submission_price','')::numeric,nullif(v->>'proposal_price','')::numeric,nullif(v->>'harga_pengajuan','')::numeric,0),
    'is_final_output',case when upper(coalesce(v->>'is_final_output',v->>'output_final','TIDAK')) in ('TRUE','T','1','YA','YES') then true else false end,
    'status',upper(coalesce(nullif(v->>'status',''),'AKTIF'))
  );
end $$;


ALTER FUNCTION "public"."smpt_work_item_snapshot"("p_work_item_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_material_request"("p_request_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_count int;
begin
  if not public.has_permission('permintaan_produksi.write') then raise exception 'Tidak memiliki izin Permintaan Barang.' using errcode='42501'; end if;
  perform 1 from public.material_requests where id=p_request_id and status='DRAFT' for update; if not found then raise exception 'Hanya DRAFT yang dapat dikirim.'; end if;
  select count(*) into v_count from public.material_request_items where request_id=p_request_id and status='AKTIF'; if v_count=0 then raise exception 'Tambahkan minimal satu item.'; end if;
  update public.material_requests set status='MENUNGGU GUDANG',submitted_at=now(),updated_by=auth.uid(),updated_at=now() where id=p_request_id;
end; $$;


ALTER FUNCTION "public"."submit_material_request"("p_request_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_finished_good"("p_date" "date", "p_finished_good_id" bigint, "p_source_location_id" bigint, "p_destination_location_id" bigint, "p_quantity" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare v_event bigint;v_id bigint;v_unit text; begin
  if not public.has_permission('transfer_barang_jadi.write') then raise exception 'Tidak memiliki izin transfer Barang Jadi.' using errcode='42501'; end if;
  if p_source_location_id=p_destination_location_id then raise exception 'Lokasi sumber dan tujuan harus berbeda.'; end if;if coalesce(p_quantity,0)<=0 then raise exception 'Qty harus lebih besar dari nol.';end if;
  select unit into v_unit from public.finished_goods where id=p_finished_good_id and status='AKTIF';if v_unit is null then raise exception 'Barang Jadi tidak ditemukan.';end if;
  v_event:=public.smpt_new_logistics_event('TRANSFER_FG','TRANSFER',null,null,p_date,p_notes,null);
  perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',p_finished_good_id,null,p_source_location_id,-p_quantity,v_unit,'TRANSFER KELUAR',p_notes);
  perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',p_finished_good_id,null,p_destination_location_id,p_quantity,v_unit,'TRANSFER MASUK',p_notes);
  insert into public.finished_goods_transfers(transfer_date,finished_good_id,source_location_id,destination_location_id,quantity,notes,stock_event_id) values(coalesce(p_date,current_date),p_finished_good_id,p_source_location_id,p_destination_location_id,p_quantity,p_notes,v_event) returning id into v_id;
    return v_id;
end $$;


ALTER FUNCTION "public"."transfer_finished_good"("p_date" "date", "p_finished_good_id" bigint, "p_source_location_id" bigint, "p_destination_location_id" bigint, "p_quantity" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_payroll_item_manual"("p_item_id" bigint, "p_base_amount" numeric DEFAULT NULL::numeric, "p_meal_amount" numeric DEFAULT NULL::numeric, "p_overtime_amount" numeric DEFAULT NULL::numeric, "p_manual_overtime_amount" numeric DEFAULT NULL::numeric, "p_overtime_bonus" numeric DEFAULT NULL::numeric, "p_holiday_bonus" numeric DEFAULT NULL::numeric, "p_kasbon_perusahaan_amount" numeric DEFAULT NULL::numeric, "p_kasbon_warung_amount" numeric DEFAULT NULL::numeric, "p_deduction_amount" numeric DEFAULT NULL::numeric, "p_overtime_minutes" integer DEFAULT NULL::integer, "p_manual_overtime_hours" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_item record;
  v_run_id bigint;
  v_base numeric;
  v_meal numeric;
  v_ot numeric;
  v_manual_ot numeric;
  v_bonus numeric;
  v_holiday numeric;
  v_kasbon_p numeric;
  v_kasbon_w numeric;
  v_deduction numeric;
  v_ot_min int;
  v_manual_ot_h numeric;
  v_gross numeric;
  v_net numeric;
  v_run_gross numeric := 0;
  v_run_deduction numeric := 0;
  v_run_net numeric := 0;
begin
  if auth.uid() is not null and not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),'')) <> 'ADMIN' then
    raise exception 'Tidak memiliki izin Payroll.' using errcode = '42501';
  end if;

  select * into v_item from public.payroll_run_items where id = p_item_id;
  if not found then
    raise exception 'Item payroll dengan ID % tidak ditemukan.', p_item_id;
  end if;
  v_run_id := v_item.payroll_run_id;

  v_base := coalesce(p_base_amount, v_item.base_amount, 0);
  v_meal := coalesce(p_meal_amount, v_item.meal_amount, 0);
  v_ot := coalesce(p_overtime_amount, v_item.overtime_amount, 0);
  v_manual_ot := coalesce(p_manual_overtime_amount, v_item.manual_overtime_amount, 0);
  v_bonus := coalesce(p_overtime_bonus, v_item.overtime_bonus, 0);
  v_holiday := coalesce(p_holiday_bonus, v_item.holiday_bonus, 0);
  v_kasbon_p := coalesce(p_kasbon_perusahaan_amount, v_item.kasbon_perusahaan_amount, 0);
  v_kasbon_w := coalesce(p_kasbon_warung_amount, v_item.kasbon_warung_amount, 0);
  v_deduction := coalesce(p_deduction_amount, v_kasbon_p + v_kasbon_w);
  v_ot_min := coalesce(p_overtime_minutes, v_item.overtime_minutes, 0);
  v_manual_ot_h := coalesce(p_manual_overtime_hours, v_item.manual_overtime_hours, 0);

  v_gross := round((v_base + v_meal + v_ot + v_manual_ot + v_bonus + v_holiday)::numeric, 2);
  v_net := greatest(0, round((v_gross - v_deduction)::numeric, 2));

  update public.payroll_run_items set
    base_amount = v_base,
    meal_amount = v_meal,
    overtime_amount = v_ot,
    manual_overtime_amount = v_manual_ot,
    overtime_bonus = v_bonus,
    holiday_bonus = v_holiday,
    kasbon_perusahaan_amount = v_kasbon_p,
    kasbon_warung_amount = v_kasbon_w,
    deduction_amount = v_deduction,
    overtime_minutes = v_ot_min,
    manual_overtime_hours = v_manual_ot_h,
    net_amount = v_net
  where id = p_item_id;

  -- Sinkronkan total run di payroll_runs
  select
    coalesce(sum(base_amount + meal_amount + overtime_amount + manual_overtime_amount + overtime_bonus + holiday_bonus), 0),
    coalesce(sum(deduction_amount), 0),
    coalesce(sum(net_amount), 0)
  into v_run_gross, v_run_deduction, v_run_net
  from public.payroll_run_items
  where payroll_run_id = v_run_id;

  update public.payroll_runs set
    total_gross = v_run_gross,
    total_deduction = v_run_deduction,
    total_net = v_run_net
  where id = v_run_id;

  return jsonb_build_object(
    'item_id', p_item_id,
    'gross', v_gross,
    'net', v_net,
    'run_gross', v_run_gross,
    'run_net', v_run_net
  );
end;
$$;


ALTER FUNCTION "public"."update_payroll_item_manual"("p_item_id" bigint, "p_base_amount" numeric, "p_meal_amount" numeric, "p_overtime_amount" numeric, "p_manual_overtime_amount" numeric, "p_overtime_bonus" numeric, "p_holiday_bonus" numeric, "p_kasbon_perusahaan_amount" numeric, "p_kasbon_warung_amount" numeric, "p_deduction_amount" numeric, "p_overtime_minutes" integer, "p_manual_overtime_hours" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_shipment_surat_jalan_photo"("p_shipment_id" bigint, "p_photo_url" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.embarkation_shipments
  set surat_jalan_photo_url = p_photo_url,
      updated_at = now()
  where id = p_shipment_id;

  return json_build_object('success', true, 'id', p_shipment_id);
end;
$$;


ALTER FUNCTION "public"."update_shipment_surat_jalan_photo"("p_shipment_id" bigint, "p_photo_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_warehouse_receipt"("p_receipt_id" bigint, "p_receipt_date" "date", "p_quantity" numeric, "p_input_unit" "text" DEFAULT NULL::"text", "p_conversion_factor" numeric DEFAULT NULL::numeric, "p_supplier" "text" DEFAULT NULL::"text", "p_document_no" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."update_warehouse_receipt"("p_receipt_id" bigint, "p_receipt_date" "date", "p_quantity" numeric, "p_input_unit" "text", "p_conversion_factor" numeric, "p_supplier" "text", "p_document_no" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_special_work_item_dependency"("p_product_id" bigint, "p_predecessor_work_item_id" bigint, "p_successor_work_item_id" bigint, "p_dependency_type" "text" DEFAULT 'SEQUENTIAL'::"text", "p_validation_mode" "text" DEFAULT 'WARNING'::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."upsert_special_work_item_dependency"("p_product_id" bigint, "p_predecessor_work_item_id" bigint, "p_successor_work_item_id" bigint, "p_dependency_type" "text", "p_validation_mode" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_work_item_dependency"("p_product_id" bigint, "p_predecessor_work_item_id" bigint, "p_successor_work_item_id" bigint, "p_dependency_type" "text" DEFAULT 'SEQUENTIAL'::"text", "p_validation_mode" "text" DEFAULT 'WARNING'::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."upsert_work_item_dependency"("p_product_id" bigint, "p_predecessor_work_item_id" bigint, "p_successor_work_item_id" bigint, "p_dependency_type" "text", "p_validation_mode" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_attendance"("p_attendance_id" bigint, "p_day_class" "text", "p_overtime_minutes" integer DEFAULT 0, "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ begin
  if not public.has_permission('absensi.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin verifikasi Absensi.' using errcode='42501';end if;
  if upper(coalesce(p_day_class,'')) not in ('FULL_DAY','HALF_DAY') then raise exception 'Klasifikasi hari harus FULL_DAY atau HALF_DAY.';end if;
  update public.attendance_records set day_class=upper(p_day_class),overtime_minutes=greatest(coalesce(p_overtime_minutes,0),0),verification_status='TERVERIFIKASI',notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),verified_by=auth.uid(),verified_at=now() where id=p_attendance_id;
  if not found then raise exception 'Absensi tidak ditemukan.';end if;
end $$;


ALTER FUNCTION "public"."verify_attendance"("p_attendance_id" bigint, "p_day_class" "text", "p_overtime_minutes" integer, "p_notes" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "private"."legacy_import_map" (
    "id" bigint NOT NULL,
    "source_system" "text" DEFAULT 'SMPT_V1_GSHEET'::"text" NOT NULL,
    "source_sheet" "text" NOT NULL,
    "source_key" "text" NOT NULL,
    "source_row" integer,
    "target_table" "text" NOT NULL,
    "target_id" bigint NOT NULL,
    "raw_data" "jsonb",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "legacy_import_source_row_positive" CHECK ((("source_row" IS NULL) OR ("source_row" > 0)))
);


ALTER TABLE "private"."legacy_import_map" OWNER TO "postgres";


ALTER TABLE "private"."legacy_import_map" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "private"."legacy_import_map_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_att_import_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_att_import_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_import_batches" (
    "id" bigint NOT NULL,
    "import_code" "text" DEFAULT ('ABI-'::"text" || "lpad"(("nextval"('"public"."smpt_att_import_code_seq"'::"regclass"))::"text", 7, '0'::"text")) NOT NULL,
    "source_file" "text" NOT NULL,
    "row_count" integer DEFAULT 0 NOT NULL,
    "matched_count" integer DEFAULT 0 NOT NULL,
    "problem_count" integer DEFAULT 0 NOT NULL,
    "duplicate_count" integer DEFAULT 0 NOT NULL,
    "verified_protected_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'COMMITTED'::"text" NOT NULL,
    "imported_by" "uuid" DEFAULT "auth"."uid"(),
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_import_batches_duplicate_count_check" CHECK (("duplicate_count" >= 0)),
    CONSTRAINT "attendance_import_batches_matched_count_check" CHECK (("matched_count" >= 0)),
    CONSTRAINT "attendance_import_batches_problem_count_check" CHECK (("problem_count" >= 0)),
    CONSTRAINT "attendance_import_batches_row_count_check" CHECK (("row_count" >= 0)),
    CONSTRAINT "attendance_import_batches_status_check" CHECK (("status" = ANY (ARRAY['COMMITTED'::"text", 'DIBATALKAN'::"text"]))),
    CONSTRAINT "attendance_import_batches_verified_protected_count_check" CHECK (("verified_protected_count" >= 0))
);


ALTER TABLE "public"."attendance_import_batches" OWNER TO "postgres";


ALTER TABLE "public"."attendance_import_batches" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."attendance_import_batches_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."attendance_import_rows" (
    "id" bigint NOT NULL,
    "batch_id" bigint NOT NULL,
    "source_row_no" integer,
    "sheet_name" "text",
    "sheet_row" integer,
    "finger_id" "text" NOT NULL,
    "worker_id" bigint,
    "employee_code" "text",
    "employee_name_raw" "text",
    "position_raw" "text",
    "department_raw" "text",
    "day_name" "text",
    "attendance_date" "date" NOT NULL,
    "schedule_text" "text",
    "activity" "text",
    "actual_in" time without time zone,
    "actual_out" time without time zone,
    "late_text" "text",
    "early_leave_text" "text",
    "effective_text" "text",
    "overtime_text" "text",
    "notes" "text",
    "problem" "text" NOT NULL,
    "row_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attendance_import_rows" OWNER TO "postgres";


ALTER TABLE "public"."attendance_import_rows" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."attendance_import_rows_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."attendance_month_closures" (
    "id" bigint NOT NULL,
    "month_start" "date" NOT NULL,
    "status" "text" DEFAULT 'FINAL'::"text" NOT NULL,
    "finalized_by" "uuid" DEFAULT "auth"."uid"(),
    "finalized_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    CONSTRAINT "attendance_month_closures_month_start_check" CHECK (("month_start" = ("date_trunc"('month'::"text", ("month_start")::timestamp with time zone))::"date")),
    CONSTRAINT "attendance_month_closures_status_check" CHECK (("status" = ANY (ARRAY['FINAL'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."attendance_month_closures" OWNER TO "postgres";


ALTER TABLE "public"."attendance_month_closures" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."attendance_month_closures_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_att_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_att_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_records" (
    "id" bigint NOT NULL,
    "attendance_code" "text" DEFAULT ('ABS-'::"text" || "lpad"(("nextval"('"public"."smpt_att_code_seq"'::"regclass"))::"text", 8, '0'::"text")) NOT NULL,
    "worker_id" bigint NOT NULL,
    "attendance_date" "date" NOT NULL,
    "schedule_in" time without time zone,
    "schedule_out" time without time zone,
    "actual_in" time without time zone,
    "actual_out" time without time zone,
    "attendance_status" "text" DEFAULT 'HADIR'::"text" NOT NULL,
    "day_class" "text",
    "overtime_minutes" integer DEFAULT 0 NOT NULL,
    "verification_status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "source" "text" DEFAULT 'MANUAL'::"text" NOT NULL,
    "source_file" "text",
    "notes" "text",
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_import_row_id" bigint,
    "manual_overtime_hours" numeric(18,2) DEFAULT 0 NOT NULL,
    "late_minutes" integer DEFAULT 0,
    "late_deduction" numeric DEFAULT 0,
    CONSTRAINT "attendance_records_attendance_status_check" CHECK (("attendance_status" = ANY (ARRAY['HADIR'::"text", 'IZIN'::"text", 'SAKIT'::"text", 'CUTI'::"text", 'ALPHA'::"text", 'LIBUR'::"text", 'DINAS_LUAR'::"text"]))),
    CONSTRAINT "attendance_records_day_class_check" CHECK ((("day_class" IS NULL) OR ("day_class" = ANY (ARRAY['FULL_DAY'::"text", 'HALF_DAY'::"text"])))),
    CONSTRAINT "attendance_records_overtime_minutes_check" CHECK (("overtime_minutes" >= 0)),
    CONSTRAINT "attendance_records_source_check" CHECK (("source" = ANY (ARRAY['MANUAL'::"text", 'FINGERPRINT_IMPORT'::"text"]))),
    CONSTRAINT "attendance_records_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['DRAFT'::"text", 'PERLU_PERBAIKAN'::"text", 'TERVERIFIKASI'::"text"])))
);


ALTER TABLE "public"."attendance_records" OWNER TO "postgres";


ALTER TABLE "public"."attendance_records" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."attendance_records_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_audit_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_audit_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_events" (
    "id" bigint NOT NULL,
    "audit_code" "text" DEFAULT ('AUD-'::"text" || "lpad"(("nextval"('"public"."smpt_audit_code_seq"'::"regclass"))::"text", 9, '0'::"text")) NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_user_id" "uuid" DEFAULT "auth"."uid"(),
    "table_name" "text" NOT NULL,
    "record_id" "text",
    "action" "text" NOT NULL,
    "old_data" "jsonb",
    "new_data" "jsonb",
    "notes" "text"
);


ALTER TABLE "public"."audit_events" OWNER TO "postgres";


ALTER TABLE "public"."audit_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_bom_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_bom_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bom_requirements" (
    "id" bigint NOT NULL,
    "requirement_code" "text" DEFAULT ('KBT-'::"text" || "lpad"(("nextval"('"public"."smpt_bom_code_seq"'::"regclass"))::"text", 4, '0'::"text")) NOT NULL,
    "project_id" bigint NOT NULL,
    "product_id" bigint,
    "material_id" bigint,
    "component_type" "text" DEFAULT 'BAHAN'::"text" NOT NULL,
    "component_name" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "qty_per_unit" numeric(18,4) DEFAULT 0 NOT NULL,
    "unit_price" numeric(18,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "legacy_total_requirement" numeric(18,4),
    "legacy_project_level" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fulfillment_source" "text",
    "calculation_method" "text",
    "net_usage_per_product" numeric(18,6),
    "net_requirement" numeric(18,4),
    "allowance_percent" numeric(9,4),
    "allowance_qty" numeric(18,4),
    "waste_percent" numeric(9,4),
    "waste_qty" numeric(18,4),
    "final_requirement" numeric(18,4),
    "calculation_input_snapshot" "jsonb",
    "calculated_at" timestamp with time zone,
    "calculated_by" "uuid",
    CONSTRAINT "bom_calc_nonnegative_check" CHECK (((("net_usage_per_product" IS NULL) OR ("net_usage_per_product" >= (0)::numeric)) AND (("net_requirement" IS NULL) OR ("net_requirement" >= (0)::numeric)) AND (("allowance_percent" IS NULL) OR ("allowance_percent" >= (0)::numeric)) AND (("allowance_qty" IS NULL) OR ("allowance_qty" >= (0)::numeric)) AND (("waste_percent" IS NULL) OR ("waste_percent" >= (0)::numeric)) AND (("waste_qty" IS NULL) OR ("waste_qty" >= (0)::numeric)) AND (("final_requirement" IS NULL) OR ("final_requirement" >= (0)::numeric)))),
    CONSTRAINT "bom_calculation_method_check" CHECK ((("calculation_method" IS NULL) OR ("calculation_method" = ANY (ARRAY['MANUAL'::"text", 'SAMPLE'::"text", 'CONSUMPTION'::"text", 'MARKER'::"text"])))),
    CONSTRAINT "bom_fulfillment_source_check" CHECK ((("fulfillment_source" IS NULL) OR ("fulfillment_source" = ANY (ARRAY['COMPANY_PURCHASE'::"text", 'CUSTOMER_SUPPLIED'::"text", 'VENDOR_SUPPLIED'::"text", 'INTERNAL_STOCK'::"text", 'OTHER'::"text"])))),
    CONSTRAINT "bom_requirements_code_not_blank" CHECK (("btrim"("requirement_code") <> ''::"text")),
    CONSTRAINT "bom_requirements_component_name_not_blank" CHECK (("btrim"("component_name") <> ''::"text")),
    CONSTRAINT "bom_requirements_component_type_check" CHECK (("component_type" = ANY (ARRAY['BAHAN'::"text", 'JASA'::"text", 'BIAYA'::"text"]))),
    CONSTRAINT "bom_requirements_material_rule" CHECK (((("component_type" = 'BAHAN'::"text") AND ("material_id" IS NOT NULL)) OR (("component_type" = ANY (ARRAY['JASA'::"text", 'BIAYA'::"text"])) AND ("material_id" IS NULL)))),
    CONSTRAINT "bom_requirements_price_nonnegative" CHECK (("unit_price" >= (0)::numeric)),
    CONSTRAINT "bom_requirements_qty_nonnegative" CHECK (("qty_per_unit" >= (0)::numeric)),
    CONSTRAINT "bom_requirements_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"]))),
    CONSTRAINT "bom_requirements_unit_not_blank" CHECK (("btrim"("unit") <> ''::"text"))
);


ALTER TABLE "public"."bom_requirements" OWNER TO "postgres";


COMMENT ON TABLE "public"."bom_requirements" IS 'SMPT V2 replacement for V1 Master_Kebutuhan_Bahan / BOM costing.';



COMMENT ON COLUMN "public"."bom_requirements"."legacy_total_requirement" IS 'Original stored V1 TOTAL_KEBUTUHAN for reconciliation only; runtime uses bom_requirements_calculated.';



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_material_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_material_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."materials" (
    "id" bigint NOT NULL,
    "material_code" "text" DEFAULT ('BHN-'::"text" || "lpad"(("nextval"('"public"."smpt_material_code_seq"'::"regclass"))::"text", 4, '0'::"text")) NOT NULL,
    "name" "text" NOT NULL,
    "standard_unit" "text" NOT NULL,
    "category" "text" NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lot_tracking_mode" "text" DEFAULT 'NONE'::"text" NOT NULL,
    "calculation_type" "text" DEFAULT 'LENGTH'::"text" NOT NULL,
    CONSTRAINT "materials_calculation_type_check" CHECK (("calculation_type" = ANY (ARRAY['SHEET'::"text", 'LENGTH'::"text", 'PCS'::"text", 'ROLL_LENGTH'::"text"]))),
    CONSTRAINT "materials_category_not_blank" CHECK (("btrim"("category") <> ''::"text")),
    CONSTRAINT "materials_code_not_blank" CHECK (("btrim"("material_code") <> ''::"text")),
    CONSTRAINT "materials_lot_tracking_mode_check" CHECK (("lot_tracking_mode" = ANY (ARRAY['NONE'::"text", 'LOT'::"text", 'ROLL'::"text"]))),
    CONSTRAINT "materials_name_not_blank" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "materials_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"]))),
    CONSTRAINT "materials_unit_not_blank" CHECK (("btrim"("standard_unit") <> ''::"text"))
);


ALTER TABLE "public"."materials" OWNER TO "postgres";


COMMENT ON TABLE "public"."materials" IS 'SMPT V2 replacement for V1 Master_Bahan.';



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_product_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_product_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_products" (
    "id" bigint NOT NULL,
    "product_code" "text" DEFAULT ('PRDK-'::"text" || "lpad"(("nextval"('"public"."smpt_product_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "project_id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "target_production" numeric(18,4) NOT NULL,
    "unit" "text" DEFAULT 'pcs'::"text" NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_products_code_not_blank" CHECK (("btrim"("product_code") <> ''::"text")),
    CONSTRAINT "project_products_name_not_blank" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "project_products_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"]))),
    CONSTRAINT "project_products_target_positive" CHECK (("target_production" > (0)::numeric)),
    CONSTRAINT "project_products_unit_not_blank" CHECK (("btrim"("unit") <> ''::"text"))
);


ALTER TABLE "public"."project_products" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_products" IS 'SMPT V2 replacement for V1 Master_Produk_Proyek.';



CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" bigint NOT NULL,
    "project_code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "product_category" "text" DEFAULT 'REGULER'::"text",
    "customer_name" "text",
    "contract_value" numeric(18,2) DEFAULT 0 NOT NULL,
    "legacy_target_production" numeric(18,4) DEFAULT 0 NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "repeat_source_project_id" bigint,
    "repeat_order_note" "text",
    CONSTRAINT "projects_code_not_blank" CHECK (("btrim"("project_code") <> ''::"text")),
    CONSTRAINT "projects_contract_nonnegative" CHECK (("contract_value" >= (0)::numeric)),
    CONSTRAINT "projects_date_order" CHECK ((("start_date" IS NULL) OR ("end_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "projects_legacy_target_nonnegative" CHECK (("legacy_target_production" >= (0)::numeric)),
    CONSTRAINT "projects_name_not_blank" CHECK (("btrim"("name") <> ''::"text"))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON TABLE "public"."projects" IS 'SMPT V2 normalized replacement for V1 Master_Proyek.';



COMMENT ON COLUMN "public"."projects"."project_code" IS 'V1 ID Proyek; retained as stable business code for migration/audit.';



COMMENT ON COLUMN "public"."projects"."legacy_target_production" IS 'Legacy project-level target. New authoritative production target is project_products.target_production.';



CREATE OR REPLACE VIEW "public"."bom_requirements_calculated" WITH ("security_invoker"='true') AS
 SELECT "br"."id",
    "br"."requirement_code",
    "br"."project_id",
    "pr"."project_code",
    "pr"."name" AS "project_name",
    "br"."product_id",
    "pp"."product_code",
    "pp"."name" AS "product_name",
    "br"."material_id",
    "m"."material_code",
    "br"."component_type",
    "br"."component_name",
    "br"."unit",
    "br"."qty_per_unit",
    "br"."unit_price",
    "br"."status",
    "br"."legacy_total_requirement",
    "br"."legacy_project_level",
        CASE
            WHEN ("br"."product_id" IS NOT NULL) THEN "pp"."target_production"
            ELSE "pr"."legacy_target_production"
        END AS "effective_target_production",
    "round"((
        CASE
            WHEN ("br"."product_id" IS NOT NULL) THEN "pp"."target_production"
            ELSE "pr"."legacy_target_production"
        END * "br"."qty_per_unit"), 4) AS "calculated_total_requirement",
    "round"(("br"."qty_per_unit" * "br"."unit_price"), 2) AS "cost_per_product",
    "round"(((
        CASE
            WHEN ("br"."product_id" IS NOT NULL) THEN "pp"."target_production"
            ELSE "pr"."legacy_target_production"
        END * "br"."qty_per_unit") * "br"."unit_price"), 2) AS "calculated_total_cost"
   FROM ((("public"."bom_requirements" "br"
     JOIN "public"."projects" "pr" ON (("pr"."id" = "br"."project_id")))
     LEFT JOIN "public"."project_products" "pp" ON (("pp"."id" = "br"."product_id")))
     LEFT JOIN "public"."materials" "m" ON (("m"."id" = "br"."material_id")));


ALTER VIEW "public"."bom_requirements_calculated" OWNER TO "postgres";


ALTER TABLE "public"."bom_requirements" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."bom_requirements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."bundle_package_balances" (
    "id" bigint NOT NULL,
    "package_id" bigint NOT NULL,
    "location_id" bigint NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bundle_package_balances" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."bundle_package_balances_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."bundle_package_balances_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."bundle_package_balances_id_seq" OWNED BY "public"."bundle_package_balances"."id";



CREATE TABLE IF NOT EXISTS "public"."bundle_package_recipes" (
    "id" bigint NOT NULL,
    "package_id" bigint NOT NULL,
    "finished_good_id" bigint NOT NULL,
    "qty_per_bundle" numeric DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bundle_package_recipes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."bundle_package_recipes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."bundle_package_recipes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."bundle_package_recipes_id_seq" OWNED BY "public"."bundle_package_recipes"."id";



CREATE TABLE IF NOT EXISTS "public"."bundle_packages" (
    "id" bigint NOT NULL,
    "package_code" character varying(50) NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "status" character varying(20) DEFAULT 'AKTIF'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bundle_packages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."bundle_packages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."bundle_packages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."bundle_packages_id_seq" OWNED BY "public"."bundle_packages"."id";



CREATE TABLE IF NOT EXISTS "public"."bundle_packing_log_items" (
    "id" bigint NOT NULL,
    "log_id" bigint NOT NULL,
    "finished_good_id" bigint NOT NULL,
    "qty_per_bundle" numeric NOT NULL,
    "total_qty" numeric NOT NULL
);


ALTER TABLE "public"."bundle_packing_log_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."bundle_packing_log_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."bundle_packing_log_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."bundle_packing_log_items_id_seq" OWNED BY "public"."bundle_packing_log_items"."id";



CREATE TABLE IF NOT EXISTS "public"."bundle_packing_logs" (
    "id" bigint NOT NULL,
    "bundling_code" character varying(50) NOT NULL,
    "package_id" bigint NOT NULL,
    "location_id" bigint NOT NULL,
    "bundling_date" "date" NOT NULL,
    "bundle_qty" numeric NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bundle_packing_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."bundle_packing_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."bundle_packing_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."bundle_packing_logs_id_seq" OWNED BY "public"."bundle_packing_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."bundle_recipes" (
    "id" bigint NOT NULL,
    "bundle_finished_good_id" bigint NOT NULL,
    "component_finished_good_id" bigint NOT NULL,
    "qty_per_bundle" numeric DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bundle_recipes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."bundle_recipes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."bundle_recipes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."bundle_recipes_id_seq" OWNED BY "public"."bundle_recipes"."id";



CREATE TABLE IF NOT EXISTS "public"."cash_advance_payments" (
    "id" bigint NOT NULL,
    "advance_id" bigint NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "amount" numeric(18,2) NOT NULL,
    "source" "text" DEFAULT 'MANUAL'::"text" NOT NULL,
    "reference" "text",
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cash_advance_payments_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."cash_advance_payments" OWNER TO "postgres";


ALTER TABLE "public"."cash_advance_payments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."cash_advance_payments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_advance_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_advance_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_advances" (
    "id" bigint NOT NULL,
    "advance_code" "text" DEFAULT ('KSB-'::"text" || "lpad"(("nextval"('"public"."smpt_advance_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "worker_id" bigint NOT NULL,
    "advance_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "amount" numeric(18,2) NOT NULL,
    "paid_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text" DEFAULT 'KASBON_PERUSAHAAN'::"text" NOT NULL,
    "warung_name" "text",
    "installment_count" integer DEFAULT 1 NOT NULL,
    "installment_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "installments_paid" integer DEFAULT 0 NOT NULL,
    "warung_id" "uuid",
    CONSTRAINT "cash_advances_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "cash_advances_paid_amount_check" CHECK (("paid_amount" >= (0)::numeric)),
    CONSTRAINT "cash_advances_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'LUNAS'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."cash_advances" OWNER TO "postgres";


ALTER TABLE "public"."cash_advances" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."cash_advances_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_cut_component_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_cut_component_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cutting_components" (
    "id" bigint NOT NULL,
    "component_code" "text" DEFAULT ('CKM-'::"text" || "lpad"(("nextval"('"public"."smpt_cut_component_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "project_id" bigint NOT NULL,
    "product_id" bigint,
    "name" "text" NOT NULL,
    "qty_per_product" numeric(18,4) NOT NULL,
    "unit" "text" NOT NULL,
    "color" "text" DEFAULT ''::"text" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "legacy_project_level" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cutting_components_name_check" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "cutting_components_qty_per_product_check" CHECK (("qty_per_product" > (0)::numeric)),
    CONSTRAINT "cutting_components_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"]))),
    CONSTRAINT "cutting_components_unit_check" CHECK (("btrim"("unit") <> ''::"text"))
);


ALTER TABLE "public"."cutting_components" OWNER TO "postgres";


ALTER TABLE "public"."cutting_components" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."cutting_components_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cutting_daily_results" (
    "id" bigint NOT NULL,
    "result_code" "text" NOT NULL,
    "result_date" "date" NOT NULL,
    "project_id" bigint NOT NULL,
    "product_id" bigint,
    "cutting_component_id" bigint NOT NULL,
    "good_qty" numeric(18,4) DEFAULT 0 NOT NULL,
    "reject_qty" numeric(18,4) DEFAULT 0 NOT NULL,
    "unit_snapshot" "text" NOT NULL,
    "officer" "text" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "stock_event_id" bigint,
    "cancellation_event_id" bigint,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cutting_daily_results_check" CHECK ((("good_qty" > (0)::numeric) OR ("reject_qty" > (0)::numeric))),
    CONSTRAINT "cutting_daily_results_good_qty_check" CHECK (("good_qty" >= (0)::numeric)),
    CONSTRAINT "cutting_daily_results_reject_qty_check" CHECK (("reject_qty" >= (0)::numeric)),
    CONSTRAINT "cutting_daily_results_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."cutting_daily_results" OWNER TO "postgres";


ALTER TABLE "public"."cutting_daily_results" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."cutting_daily_results_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cutting_material_usages" (
    "id" bigint NOT NULL,
    "usage_code" "text" NOT NULL,
    "usage_date" "date" NOT NULL,
    "project_id" bigint NOT NULL,
    "product_id" bigint,
    "bom_requirement_id" bigint NOT NULL,
    "material_id" bigint NOT NULL,
    "quantity" numeric(18,4) NOT NULL,
    "unit_snapshot" "text" NOT NULL,
    "officer" "text" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "stock_event_id" bigint NOT NULL,
    "cancellation_event_id" bigint,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "material_lot_id" bigint,
    "input_quantity" numeric(18,4),
    "input_unit" "text",
    "conversion_factor" numeric(20,10),
    CONSTRAINT "cutting_material_usages_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "cutting_material_usages_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."cutting_material_usages" OWNER TO "postgres";


ALTER TABLE "public"."cutting_material_usages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."cutting_material_usages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_issue_problem_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_issue_problem_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."embarkation_issues" (
    "id" bigint NOT NULL,
    "issue_code" "text" DEFAULT ('EMI-'::"text" || "lpad"(("nextval"('"public"."smpt_issue_problem_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "shipment_id" bigint NOT NULL,
    "issue_type" "text" NOT NULL,
    "quantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "resolution" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "embarkation_issues_issue_type_check" CHECK (("issue_type" = ANY (ARRAY['REJECT'::"text", 'RUSAK'::"text", 'KURANG'::"text", 'LAINNYA'::"text"]))),
    CONSTRAINT "embarkation_issues_quantity_check" CHECK (("quantity" >= (0)::numeric)),
    CONSTRAINT "embarkation_issues_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'SELESAI'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."embarkation_issues" OWNER TO "postgres";


ALTER TABLE "public"."embarkation_issues" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."embarkation_issues_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_shipment_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_shipment_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."embarkation_shipments" (
    "id" bigint NOT NULL,
    "shipment_code" "text" DEFAULT ('SHP-'::"text" || "lpad"(("nextval"('"public"."smpt_shipment_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "public_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target_id" bigint NOT NULL,
    "shipment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "source_location_id" bigint NOT NULL,
    "quantity" numeric(18,4) NOT NULL,
    "document_no" "text",
    "driver_name" "text",
    "vehicle_no" "text",
    "notes" "text",
    "status" "text" DEFAULT 'DISIAPKAN'::"text" NOT NULL,
    "sent_event_id" bigint,
    "return_event_id" bigint,
    "received_qty" numeric(18,4) DEFAULT 0 NOT NULL,
    "reject_qty" numeric(18,4) DEFAULT 0 NOT NULL,
    "damaged_qty" numeric(18,4) DEFAULT 0 NOT NULL,
    "missing_qty" numeric(18,4) DEFAULT 0 NOT NULL,
    "received_at" timestamp with time zone,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "surat_jalan_photo_url" "text",
    CONSTRAINT "embarkation_shipments_damaged_qty_check" CHECK (("damaged_qty" >= (0)::numeric)),
    CONSTRAINT "embarkation_shipments_missing_qty_check" CHECK (("missing_qty" >= (0)::numeric)),
    CONSTRAINT "embarkation_shipments_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "embarkation_shipments_received_qty_check" CHECK (("received_qty" >= (0)::numeric)),
    CONSTRAINT "embarkation_shipments_reject_qty_check" CHECK (("reject_qty" >= (0)::numeric)),
    CONSTRAINT "embarkation_shipments_status_check" CHECK (("status" = ANY (ARRAY['DISIAPKAN'::"text", 'DIKIRIM'::"text", 'DITERIMA'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."embarkation_shipments" OWNER TO "postgres";


ALTER TABLE "public"."embarkation_shipments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."embarkation_shipments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_target_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_target_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."embarkation_targets" (
    "id" bigint NOT NULL,
    "target_code" "text" DEFAULT ('TGT-'::"text" || "lpad"(("nextval"('"public"."smpt_target_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "embarkation_id" bigint NOT NULL,
    "item_kind" "text" NOT NULL,
    "finished_good_id" bigint,
    "set_id" bigint,
    "target_qty" numeric(18,4) NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "embarkation_targets_check" CHECK (((("item_kind" = 'FINISHED_GOOD'::"text") AND ("finished_good_id" IS NOT NULL) AND ("set_id" IS NULL)) OR (("item_kind" = 'SET'::"text") AND ("set_id" IS NOT NULL) AND ("finished_good_id" IS NULL)))),
    CONSTRAINT "embarkation_targets_item_kind_check" CHECK (("item_kind" = ANY (ARRAY['FINISHED_GOOD'::"text", 'SET'::"text"]))),
    CONSTRAINT "embarkation_targets_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"]))),
    CONSTRAINT "embarkation_targets_target_qty_check" CHECK (("target_qty" >= (0)::numeric))
);


ALTER TABLE "public"."embarkation_targets" OWNER TO "postgres";


ALTER TABLE "public"."embarkation_targets" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."embarkation_targets_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_embarkation_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_embarkation_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."embarkations" (
    "id" bigint NOT NULL,
    "embarkation_code" "text" DEFAULT ('EMB-'::"text" || "lpad"(("nextval"('"public"."smpt_embarkation_code_seq"'::"regclass"))::"text", 5, '0'::"text")) NOT NULL,
    "name" "text" NOT NULL,
    "short_code" "text",
    "address" "text",
    "pic_name" "text",
    "phone" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "embarkations_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"])))
);


ALTER TABLE "public"."embarkations" OWNER TO "postgres";


ALTER TABLE "public"."embarkations" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."embarkations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_external_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_external_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_finished_receipts" (
    "id" bigint NOT NULL,
    "receipt_code" "text" DEFAULT ('EXT-'::"text" || "lpad"(("nextval"('"public"."smpt_external_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "receipt_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "finished_good_id" bigint NOT NULL,
    "vendor_id" bigint,
    "location_id" bigint NOT NULL,
    "quantity" numeric(18,4) NOT NULL,
    "document_no" "text",
    "notes" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "stock_event_id" bigint NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unit_price" numeric DEFAULT 0,
    "gross_bill" numeric DEFAULT 0,
    "dp_deduction" numeric DEFAULT 0,
    "cash_payment" numeric DEFAULT 0,
    "payment_status" character varying(30) DEFAULT 'BELUM_LUNAS'::character varying,
    CONSTRAINT "external_finished_receipts_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "external_finished_receipts_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."external_finished_receipts" OWNER TO "postgres";


ALTER TABLE "public"."external_finished_receipts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."external_finished_receipts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_finance_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_finance_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finance_transactions" (
    "id" bigint NOT NULL,
    "transaction_code" "text" DEFAULT ('FIN-'::"text" || "lpad"(("nextval"('"public"."smpt_finance_code_seq"'::"regclass"))::"text", 7, '0'::"text")) NOT NULL,
    "transaction_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "direction" "text" NOT NULL,
    "category" "text" NOT NULL,
    "amount" numeric(18,2) NOT NULL,
    "description" "text" NOT NULL,
    "reference_type" "text",
    "reference_id" bigint,
    "document_no" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finance_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "finance_transactions_direction_check" CHECK (("direction" = ANY (ARRAY['MASUK'::"text", 'KELUAR'::"text"]))),
    CONSTRAINT "finance_transactions_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."finance_transactions" OWNER TO "postgres";


ALTER TABLE "public"."finance_transactions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."finance_transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_finished_good_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_finished_good_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finished_goods" (
    "id" bigint NOT NULL,
    "finished_good_code" "text" DEFAULT ('BJ-'::"text" || "lpad"(("nextval"('"public"."smpt_finished_good_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "project_id" bigint,
    "product_id" bigint,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "unit" "text" DEFAULT 'PCS'::"text" NOT NULL,
    "source" "text" DEFAULT 'INTERNAL'::"text" NOT NULL,
    "final_work_item_id" bigint,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finished_goods_check" CHECK ((("btrim"("name") <> ''::"text") AND ("btrim"("unit") <> ''::"text"))),
    CONSTRAINT "finished_goods_source_check" CHECK (("source" = ANY (ARRAY['INTERNAL'::"text", 'LUAR'::"text", 'INTERNAL + LUAR'::"text"]))),
    CONSTRAINT "finished_goods_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"])))
);


ALTER TABLE "public"."finished_goods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finished_goods_bundling" (
    "id" bigint NOT NULL,
    "bundling_code" "text" NOT NULL,
    "bundling_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "bundle_name" "text" DEFAULT 'Bundle Isian Koper Haji'::"text" NOT NULL,
    "bundle_finished_good_id" bigint NOT NULL,
    "location_id" bigint DEFAULT 1 NOT NULL,
    "bundle_qty" numeric NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finished_goods_bundling_bundle_qty_check" CHECK (("bundle_qty" > (0)::numeric))
);


ALTER TABLE "public"."finished_goods_bundling" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."finished_goods_bundling_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."finished_goods_bundling_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."finished_goods_bundling_id_seq" OWNED BY "public"."finished_goods_bundling"."id";



CREATE TABLE IF NOT EXISTS "public"."finished_goods_bundling_items" (
    "id" bigint NOT NULL,
    "bundling_id" bigint NOT NULL,
    "component_finished_good_id" bigint NOT NULL,
    "qty_per_bundle" numeric DEFAULT 1 NOT NULL,
    "total_qty" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finished_goods_bundling_items_qty_per_bundle_check" CHECK (("qty_per_bundle" > (0)::numeric)),
    CONSTRAINT "finished_goods_bundling_items_total_qty_check" CHECK (("total_qty" > (0)::numeric))
);


ALTER TABLE "public"."finished_goods_bundling_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."finished_goods_bundling_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."finished_goods_bundling_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."finished_goods_bundling_items_id_seq" OWNED BY "public"."finished_goods_bundling_items"."id";



ALTER TABLE "public"."finished_goods" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."finished_goods_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_transfer_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_transfer_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finished_goods_transfers" (
    "id" bigint NOT NULL,
    "transfer_code" "text" DEFAULT ('TRF-'::"text" || "lpad"(("nextval"('"public"."smpt_transfer_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "transfer_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "finished_good_id" bigint,
    "source_location_id" bigint NOT NULL,
    "destination_location_id" bigint NOT NULL,
    "quantity" numeric(18,4) NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "stock_event_id" bigint NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "document_no" "text",
    "driver_name" "text",
    "vehicle_no" "text",
    "delivery_status" "text" DEFAULT 'DITERIMA'::"text" NOT NULL,
    "received_qty" numeric,
    "reject_qty" numeric DEFAULT 0,
    "damaged_qty" numeric DEFAULT 0,
    "received_at" timestamp with time zone,
    "received_by" "uuid",
    "received_notes" "text",
    "surat_jalan_photo_url" "text",
    "item_kind" character varying(30) DEFAULT 'FINISHED_GOOD'::character varying,
    "package_id" bigint,
    CONSTRAINT "finished_goods_transfers_check" CHECK (("source_location_id" <> "destination_location_id")),
    CONSTRAINT "finished_goods_transfers_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "finished_goods_transfers_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."finished_goods_transfers" OWNER TO "postgres";


ALTER TABLE "public"."finished_goods_transfers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."finished_goods_transfers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_location_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_location_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" bigint NOT NULL,
    "location_code" "text" DEFAULT ('LOK-'::"text" || "lpad"(("nextval"('"public"."smpt_location_code_seq"'::"regclass"))::"text", 5, '0'::"text")) NOT NULL,
    "name" "text" NOT NULL,
    "location_type" "text" DEFAULT 'GUDANG'::"text" NOT NULL,
    "address" "text",
    "pic_name" "text",
    "phone" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "locations_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"])))
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


ALTER TABLE "public"."locations" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."logistics_stock_balances" (
    "id" bigint NOT NULL,
    "item_kind" "text" NOT NULL,
    "finished_good_id" bigint,
    "set_id" bigint,
    "location_id" bigint NOT NULL,
    "quantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "logistics_stock_balances_check" CHECK (((("item_kind" = 'FINISHED_GOOD'::"text") AND ("finished_good_id" IS NOT NULL) AND ("set_id" IS NULL)) OR (("item_kind" = 'SET'::"text") AND ("set_id" IS NOT NULL) AND ("finished_good_id" IS NULL)))),
    CONSTRAINT "logistics_stock_balances_item_kind_check" CHECK (("item_kind" = ANY (ARRAY['FINISHED_GOOD'::"text", 'SET'::"text"]))),
    CONSTRAINT "logistics_stock_balances_quantity_check" CHECK (("quantity" >= (0)::numeric))
);


ALTER TABLE "public"."logistics_stock_balances" OWNER TO "postgres";


ALTER TABLE "public"."logistics_stock_balances" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."logistics_stock_balances_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_log_stock_event_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_log_stock_event_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logistics_stock_events" (
    "id" bigint NOT NULL,
    "event_code" "text" DEFAULT ('LSE-'::"text" || "lpad"(("nextval"('"public"."smpt_log_stock_event_seq"'::"regclass"))::"text", 8, '0'::"text")) NOT NULL,
    "event_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "event_type" "text" NOT NULL,
    "reference_type" "text" NOT NULL,
    "reference_id" bigint,
    "reference_code" "text",
    "notes" "text",
    "reversal_of_event_id" bigint,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."logistics_stock_events" OWNER TO "postgres";


ALTER TABLE "public"."logistics_stock_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."logistics_stock_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."logistics_stock_ledger" (
    "id" bigint NOT NULL,
    "event_id" bigint NOT NULL,
    "item_kind" "text" NOT NULL,
    "finished_good_id" bigint,
    "set_id" bigint,
    "location_id" bigint NOT NULL,
    "movement_kind" "text" NOT NULL,
    "quantity_delta" numeric(18,4) NOT NULL,
    "unit_snapshot" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "logistics_stock_ledger_check" CHECK (((("item_kind" = 'FINISHED_GOOD'::"text") AND ("finished_good_id" IS NOT NULL) AND ("set_id" IS NULL)) OR (("item_kind" = 'SET'::"text") AND ("set_id" IS NOT NULL) AND ("finished_good_id" IS NULL)))),
    CONSTRAINT "logistics_stock_ledger_item_kind_check" CHECK (("item_kind" = ANY (ARRAY['FINISHED_GOOD'::"text", 'SET'::"text"]))),
    CONSTRAINT "logistics_stock_ledger_quantity_delta_check" CHECK (("quantity_delta" <> (0)::numeric))
);


ALTER TABLE "public"."logistics_stock_ledger" OWNER TO "postgres";


ALTER TABLE "public"."logistics_stock_ledger" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."logistics_stock_ledger_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_mfg_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_mfg_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manufacturing_transactions" (
    "id" bigint NOT NULL,
    "manufacturing_code" "text" DEFAULT ('MFG-'::"text" || "lpad"(("nextval"('"public"."smpt_mfg_code_seq"'::"regclass"))::"text", 7, '0'::"text")) NOT NULL,
    "transaction_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "flow_type" "text" NOT NULL,
    "project_id" bigint,
    "product_id" bigint,
    "material_id" bigint,
    "finished_good_id" bigint,
    "vendor_id" bigint,
    "quantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "unit" "text",
    "document_no" "text",
    "description" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "raw_stock_event_id" bigint,
    "logistics_event_id" bigint,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "manufacturing_transactions_flow_type_check" CHECK (("flow_type" = ANY (ARRAY['TITIPAN'::"text", 'BARANG_LUAR'::"text", 'PENGIRIMAN'::"text", 'OPNAME'::"text", 'OPNAME_MASUK'::"text", 'OPNAME_KELUAR'::"text"]))),
    CONSTRAINT "manufacturing_transactions_quantity_check" CHECK (("quantity" >= (0)::numeric)),
    CONSTRAINT "manufacturing_transactions_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."manufacturing_transactions" OWNER TO "postgres";


ALTER TABLE "public"."manufacturing_transactions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."manufacturing_transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_material_lot_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_material_lot_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."material_lots" (
    "id" bigint NOT NULL,
    "lot_code" "text" DEFAULT ('LOT-'::"text" || "lpad"(("nextval"('"public"."smpt_material_lot_code_seq"'::"regclass"))::"text", 8, '0'::"text")) NOT NULL,
    "material_id" bigint NOT NULL,
    "receipt_id" bigint,
    "roll_number" "text" NOT NULL,
    "original_quantity" numeric(18,4) NOT NULL,
    "original_unit" "text" NOT NULL,
    "conversion_factor" numeric(20,10) NOT NULL,
    "normalized_quantity" numeric(18,4) NOT NULL,
    "normalized_unit" "text" NOT NULL,
    "remaining_normalized_quantity" numeric(18,4) NOT NULL,
    "current_location_id" smallint NOT NULL,
    "status" "text" DEFAULT 'AVAILABLE'::"text" NOT NULL,
    "supplier_lot_no" "text",
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_project_id" bigint,
    "current_product_id" bigint,
    "current_bom_requirement_id" bigint,
    CONSTRAINT "material_lots_check" CHECK (("remaining_normalized_quantity" <= "normalized_quantity")),
    CONSTRAINT "material_lots_conversion_factor_check" CHECK (("conversion_factor" > (0)::numeric)),
    CONSTRAINT "material_lots_normalized_quantity_check" CHECK (("normalized_quantity" > (0)::numeric)),
    CONSTRAINT "material_lots_original_quantity_check" CHECK (("original_quantity" > (0)::numeric)),
    CONSTRAINT "material_lots_remaining_normalized_quantity_check" CHECK (("remaining_normalized_quantity" >= (0)::numeric)),
    CONSTRAINT "material_lots_status_check" CHECK (("status" = ANY (ARRAY['AVAILABLE'::"text", 'PARTIAL'::"text", 'DEPLETED'::"text", 'QUARANTINE'::"text", 'CLOSED'::"text"])))
);


ALTER TABLE "public"."material_lots" OWNER TO "postgres";


ALTER TABLE "public"."material_lots" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."material_lots_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."material_request_items" (
    "id" bigint NOT NULL,
    "detail_code" "text" NOT NULL,
    "request_id" bigint NOT NULL,
    "source_type" "text" NOT NULL,
    "bom_requirement_id" bigint,
    "cutting_component_id" bigint,
    "material_id" bigint,
    "item_name_snapshot" "text" NOT NULL,
    "color_snapshot" "text" DEFAULT ''::"text" NOT NULL,
    "unit_snapshot" "text" NOT NULL,
    "requested_qty" numeric(18,4) NOT NULL,
    "fulfilled_qty" numeric(18,4) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_request_items_check" CHECK ((("fulfilled_qty" >= (0)::numeric) AND ("fulfilled_qty" <= "requested_qty"))),
    CONSTRAINT "material_request_items_requested_qty_check" CHECK (("requested_qty" > (0)::numeric)),
    CONSTRAINT "material_request_items_source_reference_check_v2" CHECK (((("source_type" = 'BAHAN BAKU'::"text") AND ("bom_requirement_id" IS NOT NULL) AND ("material_id" IS NOT NULL) AND ("cutting_component_id" IS NULL)) OR (("source_type" = ANY (ARRAY['HASIL CUTTING'::"text", 'HASIL SABLON'::"text"])) AND ("cutting_component_id" IS NOT NULL) AND ("bom_requirement_id" IS NULL) AND ("material_id" IS NULL)))),
    CONSTRAINT "material_request_items_source_type_check_v2" CHECK (("source_type" = ANY (ARRAY['BAHAN BAKU'::"text", 'HASIL CUTTING'::"text", 'HASIL SABLON'::"text"]))),
    CONSTRAINT "material_request_items_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIPENUHI'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."material_request_items" OWNER TO "postgres";


ALTER TABLE "public"."material_request_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."material_request_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."material_requests" (
    "id" bigint NOT NULL,
    "request_code" "text" NOT NULL,
    "request_date" "date" NOT NULL,
    "project_id" bigint NOT NULL,
    "product_id" bigint,
    "supervisor_worker_id" bigint NOT NULL,
    "purpose" "text" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "notes" "text",
    "submitted_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_requests_purpose_check" CHECK (("purpose" = ANY (ARRAY['CUTTING'::"text", 'SABLON'::"text", 'PRODUKSI'::"text"]))),
    CONSTRAINT "material_requests_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'MENUNGGU GUDANG'::"text", 'SEBAGIAN'::"text", 'SELESAI'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."material_requests" OWNER TO "postgres";


ALTER TABLE "public"."material_requests" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."material_requests_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."material_suppliers" (
    "id" bigint NOT NULL,
    "material_id" bigint NOT NULL,
    "supplier_id" bigint NOT NULL,
    "supplier_material_code" "text",
    "supplier_material_name" "text",
    "supplier_unit" "text",
    "conversion_factor" numeric(20,10) DEFAULT 1 NOT NULL,
    "last_price" numeric(18,2),
    "preferred" boolean DEFAULT false NOT NULL,
    "moq" numeric(18,4),
    "estimated_lead_time_days" integer,
    "default_purchase_unit" "text",
    "notes" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_suppliers_conversion_factor_check" CHECK (("conversion_factor" > (0)::numeric)),
    CONSTRAINT "material_suppliers_estimated_lead_time_days_check" CHECK ((("estimated_lead_time_days" IS NULL) OR ("estimated_lead_time_days" >= 0))),
    CONSTRAINT "material_suppliers_last_price_check" CHECK ((("last_price" IS NULL) OR ("last_price" >= (0)::numeric))),
    CONSTRAINT "material_suppliers_moq_check" CHECK ((("moq" IS NULL) OR ("moq" >= (0)::numeric))),
    CONSTRAINT "material_suppliers_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"])))
);


ALTER TABLE "public"."material_suppliers" OWNER TO "postgres";


ALTER TABLE "public"."material_suppliers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."material_suppliers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."materials" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."materials_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."operator_payroll_items" (
    "id" bigint NOT NULL,
    "run_id" bigint NOT NULL,
    "worker_id" bigint NOT NULL,
    "work_item_id" bigint NOT NULL,
    "worker_name_snapshot" "text" NOT NULL,
    "work_item_name_snapshot" "text" NOT NULL,
    "qty_approved" numeric(18,4) NOT NULL,
    "operator_price_snapshot" numeric(18,2) NOT NULL,
    "submission_price_snapshot" numeric(18,2) NOT NULL,
    "operator_value" numeric(18,2) NOT NULL,
    "submission_value" numeric(18,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."operator_payroll_items" OWNER TO "postgres";


ALTER TABLE "public"."operator_payroll_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."operator_payroll_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_operator_payroll_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_operator_payroll_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operator_payroll_runs" (
    "id" bigint NOT NULL,
    "payroll_code" "text" DEFAULT ('OPR-'::"text" || "lpad"(("nextval"('"public"."smpt_operator_payroll_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "status" "text" DEFAULT 'FINAL'::"text" NOT NULL,
    "total_operator_value" numeric(18,2) DEFAULT 0 NOT NULL,
    "total_submission_value" numeric(18,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operator_payroll_runs_check" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "operator_payroll_runs_status_check" CHECK (("status" = ANY (ARRAY['FINAL'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."operator_payroll_runs" OWNER TO "postgres";


ALTER TABLE "public"."operator_payroll_runs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."operator_payroll_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_pack_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_pack_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."packing_runs" (
    "id" bigint NOT NULL,
    "packing_code" "text" DEFAULT ('PCK-'::"text" || "lpad"(("nextval"('"public"."smpt_pack_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "packing_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "set_id" bigint NOT NULL,
    "location_id" bigint NOT NULL,
    "set_qty" numeric(18,4) NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "stock_event_id" bigint NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "packing_runs_set_qty_check" CHECK (("set_qty" > (0)::numeric)),
    CONSTRAINT "packing_runs_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."packing_runs" OWNER TO "postgres";


ALTER TABLE "public"."packing_runs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."packing_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."payroll_attendance_reviews" (
    "id" bigint NOT NULL,
    "attendance_id" bigint NOT NULL,
    "day_class" "text",
    "overtime_review_status" "text",
    "overtime_candidate_snapshot" integer DEFAULT 0 NOT NULL,
    "overtime_approved_minutes" integer DEFAULT 0 NOT NULL,
    "meal_class" "text",
    "bonus_ot_review_status" "text",
    "is_holiday" boolean DEFAULT false NOT NULL,
    "holiday_review_status" "text",
    "holiday_manual_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "reviewed_by" "uuid" DEFAULT "auth"."uid"(),
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payroll_attendance_reviews_bonus_ot_review_status_check" CHECK ((("bonus_ot_review_status" IS NULL) OR ("bonus_ot_review_status" = ANY (ARRAY['DISETUJUI'::"text", 'DITOLAK'::"text"])))),
    CONSTRAINT "payroll_attendance_reviews_check" CHECK (("overtime_approved_minutes" <= "overtime_candidate_snapshot")),
    CONSTRAINT "payroll_attendance_reviews_day_class_check" CHECK ((("day_class" IS NULL) OR ("day_class" = ANY (ARRAY['FULL_DAY'::"text", 'HALF_DAY'::"text"])))),
    CONSTRAINT "payroll_attendance_reviews_holiday_manual_amount_check" CHECK (("holiday_manual_amount" >= (0)::numeric)),
    CONSTRAINT "payroll_attendance_reviews_holiday_review_status_check" CHECK ((("holiday_review_status" IS NULL) OR ("holiday_review_status" = ANY (ARRAY['TANPA_TAMBAHAN'::"text", 'NOMINAL_MANUAL'::"text"])))),
    CONSTRAINT "payroll_attendance_reviews_meal_class_check" CHECK ((("meal_class" IS NULL) OR ("meal_class" = ANY (ARRAY['FULL'::"text", 'HALF'::"text", 'ZERO'::"text"])))),
    CONSTRAINT "payroll_attendance_reviews_overtime_approved_minutes_check" CHECK (("overtime_approved_minutes" >= 0)),
    CONSTRAINT "payroll_attendance_reviews_overtime_candidate_snapshot_check" CHECK (("overtime_candidate_snapshot" >= 0)),
    CONSTRAINT "payroll_attendance_reviews_overtime_review_status_check" CHECK ((("overtime_review_status" IS NULL) OR ("overtime_review_status" = ANY (ARRAY['DISETUJUI'::"text", 'DITOLAK'::"text"]))))
);


ALTER TABLE "public"."payroll_attendance_reviews" OWNER TO "postgres";


ALTER TABLE "public"."payroll_attendance_reviews" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."payroll_attendance_reviews_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."payroll_payout_adjustments" (
    "id" bigint NOT NULL,
    "source_payout_detail_id" bigint NOT NULL,
    "target_payout_id" bigint NOT NULL,
    "worker_id" bigint NOT NULL,
    "source_friday" "date" NOT NULL,
    "provisional_amount" numeric(18,2) NOT NULL,
    "actual_amount" numeric(18,2) NOT NULL,
    "adjustment_amount" numeric(18,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payroll_payout_adjustments" OWNER TO "postgres";


ALTER TABLE "public"."payroll_payout_adjustments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."payroll_payout_adjustments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."payroll_payout_deductions" (
    "id" bigint NOT NULL,
    "payout_id" bigint NOT NULL,
    "worker_id" bigint NOT NULL,
    "cash_advance_id" bigint NOT NULL,
    "amount" numeric(18,2) NOT NULL,
    "cash_advance_payment_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payroll_payout_deductions_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."payroll_payout_deductions" OWNER TO "postgres";


ALTER TABLE "public"."payroll_payout_deductions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."payroll_payout_deductions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."payroll_payout_details" (
    "id" bigint NOT NULL,
    "payout_id" bigint NOT NULL,
    "worker_id" bigint NOT NULL,
    "worker_name_snapshot" "text" NOT NULL,
    "department_snapshot" "text",
    "identity_no_snapshot" "text",
    "pay_system_snapshot" "text" NOT NULL,
    "daily_wage_snapshot" numeric(18,2) DEFAULT 0 NOT NULL,
    "monthly_salary_snapshot" numeric(18,2) DEFAULT 0 NOT NULL,
    "full_days" numeric(18,2) DEFAULT 0 NOT NULL,
    "half_days" numeric(18,2) DEFAULT 0 NOT NULL,
    "wage_salary_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "meal_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "overtime_minutes" integer DEFAULT 0 NOT NULL,
    "overtime_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "overtime_bonus" numeric(18,2) DEFAULT 0 NOT NULL,
    "holiday_bonus" numeric(18,2) DEFAULT 0 NOT NULL,
    "adjustment_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "deduction_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "total_paid" numeric(18,2) DEFAULT 0 NOT NULL,
    "friday_date" "date",
    "friday_attendance_id" bigint,
    "friday_provisional_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "source_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payroll_payout_details" OWNER TO "postgres";


ALTER TABLE "public"."payroll_payout_details" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."payroll_payout_details_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_payout_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_payout_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_payouts" (
    "id" bigint NOT NULL,
    "payout_code" "text" DEFAULT ('PYO-'::"text" || "lpad"(("nextval"('"public"."smpt_payout_code_seq"'::"regclass"))::"text", 7, '0'::"text")) NOT NULL,
    "payout_type" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "month_key" "text" NOT NULL,
    "status" "text" DEFAULT 'FINAL'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'BELUM_DIBAYAR'::"text" NOT NULL,
    "total_gross" numeric(18,2) DEFAULT 0 NOT NULL,
    "total_adjustment" numeric(18,2) DEFAULT 0 NOT NULL,
    "total_deduction" numeric(18,2) DEFAULT 0 NOT NULL,
    "total_net" numeric(18,2) DEFAULT 0 NOT NULL,
    "config_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "snapshot_hash" "text" NOT NULL,
    "notes" "text",
    "finalized_by" "uuid" DEFAULT "auth"."uid"(),
    "finalized_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_by" "uuid",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payroll_payouts_check" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "payroll_payouts_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['BELUM_DIBAYAR'::"text", 'SUDAH_DIBAYAR'::"text"]))),
    CONSTRAINT "payroll_payouts_payout_type_check" CHECK (("payout_type" = ANY (ARRAY['MINGGUAN'::"text", 'BULANAN'::"text"]))),
    CONSTRAINT "payroll_payouts_status_check" CHECK (("status" = ANY (ARRAY['FINAL'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."payroll_payouts" OWNER TO "postgres";


ALTER TABLE "public"."payroll_payouts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."payroll_payouts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."payroll_run_details" (
    "id" bigint NOT NULL,
    "payroll_run_id" bigint NOT NULL,
    "attendance_id" bigint NOT NULL,
    "worker_id" bigint NOT NULL,
    "attendance_date" "date" NOT NULL,
    "attendance_status" "text" NOT NULL,
    "day_class" "text",
    "meal_class" "text",
    "base_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "meal_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "overtime_candidate_minutes" integer DEFAULT 0 NOT NULL,
    "overtime_approved_minutes" integer DEFAULT 0 NOT NULL,
    "overtime_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "overtime_bonus" numeric(18,2) DEFAULT 0 NOT NULL,
    "is_holiday" boolean DEFAULT false NOT NULL,
    "holiday_bonus" numeric(18,2) DEFAULT 0 NOT NULL,
    "holiday_manual_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "row_total" numeric(18,2) DEFAULT 0 NOT NULL,
    "source_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payroll_run_details" OWNER TO "postgres";


ALTER TABLE "public"."payroll_run_details" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."payroll_run_details_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."payroll_run_items" (
    "id" bigint NOT NULL,
    "payroll_run_id" bigint NOT NULL,
    "worker_id" bigint NOT NULL,
    "worker_name_snapshot" "text" NOT NULL,
    "pay_system_snapshot" "text" NOT NULL,
    "daily_wage_snapshot" numeric(18,2) DEFAULT 0 NOT NULL,
    "monthly_salary_snapshot" numeric(18,2) DEFAULT 0 NOT NULL,
    "full_days" numeric(18,2) DEFAULT 0 NOT NULL,
    "half_days" numeric(18,2) DEFAULT 0 NOT NULL,
    "overtime_minutes" integer DEFAULT 0 NOT NULL,
    "base_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "meal_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "overtime_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "overtime_bonus" numeric(18,2) DEFAULT 0 NOT NULL,
    "deduction_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "net_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "holiday_bonus" numeric(18,2) DEFAULT 0 NOT NULL,
    "holiday_manual_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "pending_count" integer DEFAULT 0 NOT NULL,
    "kasbon_perusahaan_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "kasbon_warung_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "manual_overtime_hours" numeric(18,2) DEFAULT 0 NOT NULL,
    "manual_overtime_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "payment_status" "text" DEFAULT 'PENDING'::"text"
);


ALTER TABLE "public"."payroll_run_items" OWNER TO "postgres";


ALTER TABLE "public"."payroll_run_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."payroll_run_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_payroll_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_payroll_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_runs" (
    "id" bigint NOT NULL,
    "payroll_code" "text" DEFAULT ('PAY-'::"text" || "lpad"(("nextval"('"public"."smpt_payroll_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "payroll_type" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "status" "text" DEFAULT 'FINAL'::"text" NOT NULL,
    "total_gross" numeric(18,2) DEFAULT 0 NOT NULL,
    "total_deduction" numeric(18,2) DEFAULT 0 NOT NULL,
    "total_net" numeric(18,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finalized_at" timestamp with time zone,
    "config_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "snapshot_hash" "text",
    CONSTRAINT "payroll_runs_check" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "payroll_runs_payroll_type_check" CHECK (("payroll_type" = ANY (ARRAY['MINGGUAN'::"text", 'BULANAN'::"text"]))),
    CONSTRAINT "payroll_runs_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'FINAL'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."payroll_runs" OWNER TO "postgres";


ALTER TABLE "public"."payroll_runs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."payroll_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."payroll_settings" (
    "key" "text" NOT NULL,
    "value_numeric" numeric(18,4),
    "value_text" "text",
    "description" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payroll_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "permissions_code_lowercase" CHECK (("code" = "lower"(TRIM(BOTH FROM "code"))))
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


ALTER TABLE "public"."permissions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."permissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_petty_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_petty_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."petty_cash_transactions" (
    "id" bigint NOT NULL,
    "transaction_code" "text" DEFAULT ('KK-'::"text" || "lpad"(("nextval"('"public"."smpt_petty_code_seq"'::"regclass"))::"text", 7, '0'::"text")) NOT NULL,
    "transaction_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "direction" "text" NOT NULL,
    "category" "text" NOT NULL,
    "amount" numeric(18,2) NOT NULL,
    "description" "text" NOT NULL,
    "document_no" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "receipt_url" "text",
    CONSTRAINT "petty_cash_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "petty_cash_transactions_direction_check" CHECK (("direction" = ANY (ARRAY['MASUK'::"text", 'KELUAR'::"text"]))),
    CONSTRAINT "petty_cash_transactions_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."petty_cash_transactions" OWNER TO "postgres";


ALTER TABLE "public"."petty_cash_transactions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."petty_cash_transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."product_set_components" (
    "id" bigint NOT NULL,
    "set_id" bigint NOT NULL,
    "finished_good_id" bigint NOT NULL,
    "qty_per_set" numeric(18,4) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_set_components_qty_per_set_check" CHECK (("qty_per_set" > (0)::numeric))
);


ALTER TABLE "public"."product_set_components" OWNER TO "postgres";


ALTER TABLE "public"."product_set_components" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."product_set_components_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_set_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_set_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_sets" (
    "id" bigint NOT NULL,
    "set_code" "text" DEFAULT ('SET-'::"text" || "lpad"(("nextval"('"public"."smpt_set_code_seq"'::"regclass"))::"text", 5, '0'::"text")) NOT NULL,
    "project_id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" DEFAULT 'SET'::"text" NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_sets_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"])))
);


ALTER TABLE "public"."product_sets" OWNER TO "postgres";


ALTER TABLE "public"."product_sets" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."product_sets_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_production_anomaly_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_production_anomaly_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_anomalies" (
    "id" bigint NOT NULL,
    "anomaly_code" "text" DEFAULT ('ANM-'::"text" || "lpad"(("nextval"('"public"."smpt_production_anomaly_code_seq"'::"regclass"))::"text", 7, '0'::"text")) NOT NULL,
    "anomaly_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'WARNING'::"text" NOT NULL,
    "project_id" bigint,
    "product_id" bigint,
    "work_item_id" bigint,
    "dependency_id" bigint,
    "production_check_id" bigint,
    "available_equivalent" numeric(18,4),
    "attempted_equivalent" numeric(18,4),
    "excess_equivalent" numeric(18,4),
    "source_kind" "text" DEFAULT 'RUNTIME'::"text" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "acknowledged_by" "uuid",
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "production_anomalies_severity_check" CHECK (("severity" = ANY (ARRAY['WARNING'::"text", 'HARD'::"text"]))),
    CONSTRAINT "production_anomalies_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'ACKNOWLEDGED'::"text", 'RESOLVED'::"text"])))
);


ALTER TABLE "public"."production_anomalies" OWNER TO "postgres";


ALTER TABLE "public"."production_anomalies" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."production_anomalies_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_check_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_check_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_checks" (
    "id" bigint NOT NULL,
    "check_code" "text" DEFAULT ('CHK-'::"text" || "lpad"(("nextval"('"public"."smpt_check_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "order_item_id" bigint NOT NULL,
    "check_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "good_qty" numeric(18,4) DEFAULT 0 NOT NULL,
    "reject_qty" numeric(18,4) DEFAULT 0 NOT NULL,
    "notes" "text",
    "checker_user_id" "uuid" DEFAULT "auth"."uid"(),
    "checker_email" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "production_checks_check" CHECK ((("good_qty" + "reject_qty") > (0)::numeric)),
    CONSTRAINT "production_checks_good_qty_check" CHECK (("good_qty" >= (0)::numeric)),
    CONSTRAINT "production_checks_reject_qty_check" CHECK (("reject_qty" >= (0)::numeric)),
    CONSTRAINT "production_checks_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'BATAL'::"text", 'DIBATALKAN'::"text", 'NONAKTIF'::"text", 'PENDING'::"text", 'APPROVED'::"text", 'REJECTED'::"text"])))
);


ALTER TABLE "public"."production_checks" OWNER TO "postgres";


ALTER TABLE "public"."production_checks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."production_checks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_manual_result_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_manual_result_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_manual_results" (
    "id" bigint NOT NULL,
    "result_code" "text" DEFAULT ('MHR-'::"text" || "lpad"(("nextval"('"public"."smpt_manual_result_code_seq"'::"regclass"))::"text", 7, '0'::"text")) NOT NULL,
    "result_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "project_id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "work_item_id" bigint NOT NULL,
    "worker_id" bigint NOT NULL,
    "project_code_snapshot" "text" NOT NULL,
    "project_name_snapshot" "text" NOT NULL,
    "product_code_snapshot" "text" NOT NULL,
    "product_name_snapshot" "text" NOT NULL,
    "work_item_code_snapshot" "text" NOT NULL,
    "work_item_name_snapshot" "text" NOT NULL,
    "worker_code_snapshot" "text" NOT NULL,
    "worker_name_snapshot" "text" NOT NULL,
    "worker_pay_system_snapshot" "text" NOT NULL,
    "qty_good" numeric(18,4) NOT NULL,
    "operator_price_snapshot" numeric(18,2) DEFAULT 0 NOT NULL,
    "submission_price_snapshot" numeric(18,2) DEFAULT 0 NOT NULL,
    "operator_value" numeric(18,2) DEFAULT 0 NOT NULL,
    "submission_value" numeric(18,2) DEFAULT 0 NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_by_email_snapshot" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancelled_by" "uuid",
    "cancelled_by_email_snapshot" "text",
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    CONSTRAINT "production_manual_results_check" CHECK (((("status" = 'AKTIF'::"text") AND ("cancelled_at" IS NULL) AND ("cancellation_reason" IS NULL)) OR (("status" = 'DIBATALKAN'::"text") AND ("cancelled_at" IS NOT NULL) AND ("btrim"(COALESCE("cancellation_reason", ''::"text")) <> ''::"text")))),
    CONSTRAINT "production_manual_results_operator_price_snapshot_check" CHECK (("operator_price_snapshot" >= (0)::numeric)),
    CONSTRAINT "production_manual_results_operator_value_check" CHECK (("operator_value" >= (0)::numeric)),
    CONSTRAINT "production_manual_results_qty_good_check" CHECK (("qty_good" > (0)::numeric)),
    CONSTRAINT "production_manual_results_reason_check" CHECK (("btrim"("reason") <> ''::"text")),
    CONSTRAINT "production_manual_results_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"]))),
    CONSTRAINT "production_manual_results_submission_price_snapshot_check" CHECK (("submission_price_snapshot" >= (0)::numeric)),
    CONSTRAINT "production_manual_results_submission_value_check" CHECK (("submission_value" >= (0)::numeric))
);


ALTER TABLE "public"."production_manual_results" OWNER TO "postgres";


ALTER TABLE "public"."production_manual_results" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."production_manual_results_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."production_order_items" (
    "id" bigint NOT NULL,
    "order_id" bigint NOT NULL,
    "work_item_id" bigint NOT NULL,
    "work_item_name_snapshot" "text" NOT NULL,
    "unit_snapshot" "text",
    "qty_per_product_snapshot" numeric(18,4),
    "operator_price_snapshot" numeric(18,2) DEFAULT 0 NOT NULL,
    "submission_price_snapshot" numeric(18,2) DEFAULT 0 NOT NULL,
    "assigned_qty" numeric(18,4) NOT NULL,
    "is_final_output_snapshot" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "production_order_items_assigned_qty_check" CHECK (("assigned_qty" > (0)::numeric)),
    CONSTRAINT "production_order_items_operator_price_snapshot_check" CHECK (("operator_price_snapshot" >= (0)::numeric)),
    CONSTRAINT "production_order_items_qty_per_product_snapshot_check" CHECK (("qty_per_product_snapshot" > (0)::numeric)),
    CONSTRAINT "production_order_items_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'SELESAI'::"text", 'DIBATALKAN'::"text"]))),
    CONSTRAINT "production_order_items_submission_price_snapshot_check" CHECK (("submission_price_snapshot" >= (0)::numeric))
);


ALTER TABLE "public"."production_order_items" OWNER TO "postgres";


ALTER TABLE "public"."production_order_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."production_order_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_spk_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_spk_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_orders" (
    "id" bigint NOT NULL,
    "spk_code" "text" DEFAULT ('SPK-'::"text" || "lpad"(("nextval"('"public"."smpt_spk_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "order_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "project_id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "operator_worker_id" bigint NOT NULL,
    "checker_email" "text",
    "supervisor_worker_id" bigint,
    "due_date" "date",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "notes" "text",
    "published_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "production_orders_checker_email_check" CHECK (("btrim"("checker_email") <> ''::"text")),
    CONSTRAINT "production_orders_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'AKTIF'::"text", 'SELESAI'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."production_orders" OWNER TO "postgres";


ALTER TABLE "public"."production_orders" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."production_orders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."production_wip_consumptions" (
    "id" bigint NOT NULL,
    "dependency_id" bigint NOT NULL,
    "production_check_id" bigint NOT NULL,
    "predecessor_work_item_id" bigint NOT NULL,
    "successor_work_item_id" bigint NOT NULL,
    "equivalent_quantity" numeric(18,4) NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "reversal_of_id" bigint,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reversed_at" timestamp with time zone,
    CONSTRAINT "production_wip_consumptions_equivalent_quantity_check" CHECK (("equivalent_quantity" > (0)::numeric)),
    CONSTRAINT "production_wip_consumptions_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBALIK'::"text"])))
);


ALTER TABLE "public"."production_wip_consumptions" OWNER TO "postgres";


ALTER TABLE "public"."production_wip_consumptions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."production_wip_consumptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role_id" bigint NOT NULL,
    "legacy_username" "text",
    "display_name" "text",
    "email" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_legacy_username_normalized" CHECK ((("legacy_username" IS NULL) OR ("legacy_username" = "lower"(TRIM(BOTH FROM "legacy_username")))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


ALTER TABLE "public"."project_products" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_products_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."projects" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."projects_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."purchase_order_lines" (
    "id" bigint NOT NULL,
    "purchase_order_id" bigint NOT NULL,
    "purchase_plan_line_id" bigint,
    "material_id" bigint NOT NULL,
    "ordered_quantity" numeric(18,4) NOT NULL,
    "purchase_unit" "text" NOT NULL,
    "conversion_factor" numeric(20,10) DEFAULT 1 NOT NULL,
    "ordered_stock_quantity" numeric(18,4) NOT NULL,
    "stock_unit" "text" NOT NULL,
    "received_stock_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "unit_price" numeric(18,2) DEFAULT 0 NOT NULL,
    "supplier_material_code" "text",
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchase_order_lines_check" CHECK (("received_stock_quantity" <= ("ordered_stock_quantity" + 0.00005))),
    CONSTRAINT "purchase_order_lines_conversion_factor_check" CHECK (("conversion_factor" > (0)::numeric)),
    CONSTRAINT "purchase_order_lines_ordered_quantity_check" CHECK (("ordered_quantity" > (0)::numeric)),
    CONSTRAINT "purchase_order_lines_ordered_stock_quantity_check" CHECK (("ordered_stock_quantity" > (0)::numeric)),
    CONSTRAINT "purchase_order_lines_received_stock_quantity_check" CHECK (("received_stock_quantity" >= (0)::numeric)),
    CONSTRAINT "purchase_order_lines_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'PARTIAL'::"text", 'RECEIVED'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "purchase_order_lines_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."purchase_order_lines" OWNER TO "postgres";


ALTER TABLE "public"."purchase_order_lines" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."purchase_order_lines_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" bigint NOT NULL,
    "po_number" "text" NOT NULL,
    "purchase_plan_id" bigint,
    "supplier_id" bigint,
    "order_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "expected_date" "date",
    "currency" "text" DEFAULT 'IDR'::"text" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "notes" "text",
    "issued_at" timestamp with time zone,
    "issued_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchase_orders_check" CHECK ((("expected_date" IS NULL) OR ("expected_date" >= "order_date"))),
    CONSTRAINT "purchase_orders_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'ISSUED'::"text", 'PARTIAL'::"text", 'RECEIVED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


ALTER TABLE "public"."purchase_orders" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."purchase_orders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."purchase_plan_lines" (
    "id" bigint NOT NULL,
    "purchase_plan_id" bigint NOT NULL,
    "material_id" bigint NOT NULL,
    "final_requirement" numeric(18,4) NOT NULL,
    "usable_stock" numeric(18,4) DEFAULT 0 NOT NULL,
    "confirmed_incoming" numeric(18,4) DEFAULT 0 NOT NULL,
    "open_po_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "net_procurement_need" numeric(18,4) DEFAULT 0 NOT NULL,
    "planned_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "unit_snapshot" "text" NOT NULL,
    "supplier_id" bigint,
    "unit_price" numeric(18,2),
    "source_requirement_count" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchase_plan_lines_confirmed_incoming_check" CHECK (("confirmed_incoming" >= (0)::numeric)),
    CONSTRAINT "purchase_plan_lines_final_requirement_check" CHECK (("final_requirement" >= (0)::numeric)),
    CONSTRAINT "purchase_plan_lines_net_procurement_need_check" CHECK (("net_procurement_need" >= (0)::numeric)),
    CONSTRAINT "purchase_plan_lines_open_po_quantity_check" CHECK (("open_po_quantity" >= (0)::numeric)),
    CONSTRAINT "purchase_plan_lines_planned_quantity_check" CHECK (("planned_quantity" >= (0)::numeric)),
    CONSTRAINT "purchase_plan_lines_source_requirement_count_check" CHECK (("source_requirement_count" >= 0)),
    CONSTRAINT "purchase_plan_lines_unit_price_check" CHECK ((("unit_price" IS NULL) OR ("unit_price" >= (0)::numeric))),
    CONSTRAINT "purchase_plan_lines_usable_stock_check" CHECK (("usable_stock" >= (0)::numeric))
);


ALTER TABLE "public"."purchase_plan_lines" OWNER TO "postgres";


ALTER TABLE "public"."purchase_plan_lines" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."purchase_plan_lines_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_purchase_plan_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_purchase_plan_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_plans" (
    "id" bigint NOT NULL,
    "plan_code" "text" DEFAULT ('PPLAN-'::"text" || "lpad"(("nextval"('"public"."smpt_purchase_plan_code_seq"'::"regclass"))::"text", 7, '0'::"text")) NOT NULL,
    "plan_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "project_id" bigint,
    "product_id" bigint,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchase_plans_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'CONVERTED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."purchase_plans" OWNER TO "postgres";


ALTER TABLE "public"."purchase_plans" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."purchase_plans_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_qc_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_qc_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qc_inspections" (
    "id" bigint NOT NULL,
    "qc_code" "text" DEFAULT ('QC-'::"text" || "lpad"(("nextval"('"public"."smpt_qc_code_seq"'::"regclass"))::"text", 7, '0'::"text")) NOT NULL,
    "production_check_id" bigint NOT NULL,
    "finished_good_id" bigint NOT NULL,
    "inspection_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "inspected_qty" numeric(18,4) NOT NULL,
    "good_qty" numeric(18,4) NOT NULL,
    "reject_qty" numeric(18,4) NOT NULL,
    "rework_qty" numeric(18,4) NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "stock_event_id" bigint NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancelled_at" timestamp with time zone,
    CONSTRAINT "qc_inspections_check" CHECK (((("good_qty" + "reject_qty") + "rework_qty") = "inspected_qty")),
    CONSTRAINT "qc_inspections_good_qty_check" CHECK (("good_qty" >= (0)::numeric)),
    CONSTRAINT "qc_inspections_inspected_qty_check" CHECK (("inspected_qty" > (0)::numeric)),
    CONSTRAINT "qc_inspections_reject_qty_check" CHECK (("reject_qty" >= (0)::numeric)),
    CONSTRAINT "qc_inspections_rework_qty_check" CHECK (("rework_qty" >= (0)::numeric)),
    CONSTRAINT "qc_inspections_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."qc_inspections" OWNER TO "postgres";


ALTER TABLE "public"."qc_inspections" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."qc_inspections_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_rework_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_rework_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qc_reworks" (
    "id" bigint NOT NULL,
    "rework_code" "text" DEFAULT ('RWK-'::"text" || "lpad"(("nextval"('"public"."smpt_rework_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "qc_inspection_id" bigint NOT NULL,
    "quantity" numeric(18,4) NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "result_good_qty" numeric(18,4) DEFAULT 0 NOT NULL,
    "result_reject_qty" numeric(18,4) DEFAULT 0 NOT NULL,
    "notes" "text",
    "stock_event_id" bigint,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "qc_reworks_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "qc_reworks_result_good_qty_check" CHECK (("result_good_qty" >= (0)::numeric)),
    CONSTRAINT "qc_reworks_result_reject_qty_check" CHECK (("result_reject_qty" >= (0)::numeric)),
    CONSTRAINT "qc_reworks_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'SELESAI'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."qc_reworks" OWNER TO "postgres";


ALTER TABLE "public"."qc_reworks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."qc_reworks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ready_production_usage_lots" (
    "id" bigint NOT NULL,
    "usage_id" bigint NOT NULL,
    "material_lot_id" bigint NOT NULL,
    "quantity_normalized" numeric(18,4) NOT NULL,
    "normalized_unit" "text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ready_production_usage_lots_quantity_normalized_check" CHECK (("quantity_normalized" > (0)::numeric))
);


ALTER TABLE "public"."ready_production_usage_lots" OWNER TO "postgres";


ALTER TABLE "public"."ready_production_usage_lots" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ready_production_usage_lots_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ready_production_usages" (
    "id" bigint NOT NULL,
    "usage_code" "text" NOT NULL,
    "usage_date" "date" NOT NULL,
    "project_id" bigint NOT NULL,
    "product_id" bigint,
    "item_kind" "text" NOT NULL,
    "bom_requirement_id" bigint,
    "material_id" bigint,
    "cutting_component_id" bigint,
    "quantity" numeric(18,4) NOT NULL,
    "unit_snapshot" "text" NOT NULL,
    "officer" "text" NOT NULL,
    "notes" "text",
    "stock_event_id" bigint NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "work_item_id" bigint,
    "process_code" "text" DEFAULT 'PRODUKSI'::"text" NOT NULL,
    "material_lot_id" bigint,
    "input_quantity" numeric(18,4),
    "input_unit" "text",
    "conversion_factor" numeric(20,10),
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "cancellation_event_id" bigint,
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    CONSTRAINT "ready_production_usages_check" CHECK (((("item_kind" = 'MATERIAL'::"text") AND ("material_id" IS NOT NULL) AND ("bom_requirement_id" IS NOT NULL) AND ("cutting_component_id" IS NULL)) OR (("item_kind" = 'CUTTING_COMPONENT'::"text") AND ("cutting_component_id" IS NOT NULL) AND ("material_id" IS NULL) AND ("bom_requirement_id" IS NULL)))),
    CONSTRAINT "ready_production_usages_item_kind_check" CHECK (("item_kind" = ANY (ARRAY['MATERIAL'::"text", 'CUTTING_COMPONENT'::"text"]))),
    CONSTRAINT "ready_production_usages_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "ready_production_usages_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."ready_production_usages" OWNER TO "postgres";


ALTER TABLE "public"."ready_production_usages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ready_production_usages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" bigint NOT NULL,
    "permission_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "roles_code_uppercase" CHECK (("code" = "upper"(TRIM(BOTH FROM "code"))))
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


ALTER TABLE "public"."roles" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."roles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_salary_submission_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_salary_submission_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salary_submissions" (
    "id" bigint NOT NULL,
    "submission_code" "text" DEFAULT ('PGJ-'::"text" || "lpad"(("nextval"('"public"."smpt_salary_submission_seq"'::"regclass"))::"text", 7, '0'::"text")) NOT NULL,
    "payout_id" bigint NOT NULL,
    "status" "text" DEFAULT 'SIAP_DIAJUKAN'::"text" NOT NULL,
    "total_workers" integer DEFAULT 0 NOT NULL,
    "total_gross" numeric(18,2) DEFAULT 0 NOT NULL,
    "total_deduction" numeric(18,2) DEFAULT 0 NOT NULL,
    "total_net" numeric(18,2) DEFAULT 0 NOT NULL,
    "snapshot_hash" "text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "paid_by" "uuid",
    CONSTRAINT "salary_submissions_status_check" CHECK (("status" = ANY (ARRAY['SIAP_DIAJUKAN'::"text", 'DIBAYAR'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."salary_submissions" OWNER TO "postgres";


ALTER TABLE "public"."salary_submissions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."salary_submissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."smpt_cut_result_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_cut_result_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_cut_usage_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_cut_usage_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_data_backup_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_data_backup_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_issue_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_issue_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."smpt_keepalive_log" (
    "id" bigint NOT NULL,
    "pinged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auth_ok" boolean DEFAULT false NOT NULL,
    "db_ok" boolean DEFAULT false NOT NULL,
    "all_ok" boolean DEFAULT false NOT NULL,
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."smpt_keepalive_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_keepalive_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_keepalive_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."smpt_keepalive_log_id_seq" OWNED BY "public"."smpt_keepalive_log"."id";



CREATE OR REPLACE VIEW "public"."smpt_keepalive_status" AS
 SELECT "id",
    "pinged_at",
    "to_char"(("pinged_at" AT TIME ZONE 'Asia/Jakarta'::"text"), 'DD Mon YYYY HH24:MI WIB'::"text") AS "waktu_wib",
    "auth_ok",
    "db_ok",
    "all_ok",
        CASE
            WHEN "all_ok" THEN '✅ OK'::"text"
            WHEN (NOT "auth_ok") THEN '❌ Auth Gagal'::"text"
            WHEN (NOT "db_ok") THEN '❌ DB Gagal'::"text"
            ELSE '⚠️ Partial'::"text"
        END AS "status_label",
    (EXTRACT(epoch FROM ("now"() - "pinged_at")) / (3600)::numeric) AS "jam_sejak_ping"
   FROM "public"."smpt_keepalive_log" "k"
  ORDER BY "pinged_at" DESC
 LIMIT 20;


ALTER VIEW "public"."smpt_keepalive_status" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_purchase_order_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_purchase_order_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_ready_usage_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_ready_usage_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_receipt_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_receipt_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_request_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_request_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_request_item_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_request_item_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_stock_event_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_stock_event_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_system_test_run_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_system_test_run_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_vendor_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_vendor_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_work_item_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_work_item_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."smpt_worker_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."smpt_worker_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_balances" (
    "id" bigint NOT NULL,
    "item_kind" "text" NOT NULL,
    "material_id" bigint,
    "cutting_component_id" bigint,
    "location_id" smallint NOT NULL,
    "project_id" bigint,
    "product_id" bigint,
    "bom_requirement_id" bigint,
    "quantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_balances_check" CHECK (((("item_kind" = 'MATERIAL'::"text") AND ("material_id" IS NOT NULL) AND ("cutting_component_id" IS NULL)) OR (("item_kind" = 'CUTTING_COMPONENT'::"text") AND ("cutting_component_id" IS NOT NULL) AND ("material_id" IS NULL) AND ("bom_requirement_id" IS NULL)))),
    CONSTRAINT "stock_balances_item_kind_check" CHECK (("item_kind" = ANY (ARRAY['MATERIAL'::"text", 'CUTTING_COMPONENT'::"text"]))),
    CONSTRAINT "stock_balances_quantity_check" CHECK (("quantity" >= (0)::numeric))
);


ALTER TABLE "public"."stock_balances" OWNER TO "postgres";


ALTER TABLE "public"."stock_balances" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."stock_balances_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."stock_events" (
    "id" bigint NOT NULL,
    "event_code" "text" DEFAULT ('STX-'::"text" || "lpad"(("nextval"('"public"."smpt_stock_event_code_seq"'::"regclass"))::"text", 9, '0'::"text")) NOT NULL,
    "event_type" "text" NOT NULL,
    "event_date" "date" NOT NULL,
    "project_id" bigint,
    "product_id" bigint,
    "reference_type" "text",
    "reference_code" "text",
    "reversal_of_event_id" bigint,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "work_item_id" bigint
);


ALTER TABLE "public"."stock_events" OWNER TO "postgres";


ALTER TABLE "public"."stock_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."stock_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."stock_ledger_entries" (
    "id" bigint NOT NULL,
    "event_id" bigint,
    "item_kind" "text" NOT NULL,
    "material_id" bigint,
    "cutting_component_id" bigint,
    "location_id" smallint NOT NULL,
    "project_id" bigint,
    "product_id" bigint,
    "bom_requirement_id" bigint,
    "movement_kind" "text" NOT NULL,
    "quantity_delta" numeric(18,4) NOT NULL,
    "unit_snapshot" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "material_lot_id" bigint,
    "work_item_id" bigint,
    "original_quantity_delta" numeric(18,4),
    "original_unit_snapshot" "text",
    CONSTRAINT "stock_ledger_entries_check" CHECK (((("item_kind" = 'MATERIAL'::"text") AND ("material_id" IS NOT NULL) AND ("cutting_component_id" IS NULL)) OR (("item_kind" = 'CUTTING_COMPONENT'::"text") AND ("cutting_component_id" IS NOT NULL) AND ("material_id" IS NULL) AND ("bom_requirement_id" IS NULL)))),
    CONSTRAINT "stock_ledger_entries_item_kind_check" CHECK (("item_kind" = ANY (ARRAY['MATERIAL'::"text", 'CUTTING_COMPONENT'::"text"]))),
    CONSTRAINT "stock_ledger_entries_quantity_delta_check" CHECK (("quantity_delta" <> (0)::numeric))
);


ALTER TABLE "public"."stock_ledger_entries" OWNER TO "postgres";


ALTER TABLE "public"."stock_ledger_entries" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."stock_ledger_entries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."stock_locations" (
    "id" smallint NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "physical_group" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."stock_locations" OWNER TO "postgres";


ALTER TABLE "public"."stock_locations" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."stock_locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."system_data_backups" (
    "id" bigint NOT NULL,
    "backup_code" "text" NOT NULL,
    "label" "text",
    "scope" "text" DEFAULT 'BUSINESS_DATA'::"text" NOT NULL,
    "status" "text" DEFAULT 'READY'::"text" NOT NULL,
    "schema_fingerprint" "text" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "table_counts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "byte_size" bigint DEFAULT 0 NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_restored_by" "uuid",
    "last_restored_at" timestamp with time zone,
    CONSTRAINT "system_data_backups_scope_check" CHECK (("scope" = 'BUSINESS_DATA'::"text")),
    CONSTRAINT "system_data_backups_status_check" CHECK (("status" = ANY (ARRAY['READY'::"text", 'RESTORED'::"text", 'INVALID'::"text"])))
);


ALTER TABLE "public"."system_data_backups" OWNER TO "postgres";


ALTER TABLE "public"."system_data_backups" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."system_data_backups_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."system_test_run_entities" (
    "id" bigint NOT NULL,
    "run_id" bigint NOT NULL,
    "table_name" "text" NOT NULL,
    "row_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_test_run_entities" OWNER TO "postgres";


ALTER TABLE "public"."system_test_run_entities" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."system_test_run_entities_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."system_test_runs" (
    "id" bigint NOT NULL,
    "run_code" "text" NOT NULL,
    "run_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_test_runs_run_type_check" CHECK (("run_type" = ANY (ARRAY['DIAGNOSTIC'::"text", 'DUMMY_FULL'::"text", 'REPEAT_ORDER'::"text", 'MANIPULASI_PAYROLL'::"text", 'BACKUP'::"text", 'RESTORE'::"text", 'RESET'::"text"]))),
    CONSTRAINT "system_test_runs_status_check" CHECK (("status" = ANY (ARRAY['RUNNING'::"text", 'PASS'::"text", 'WARN'::"text", 'FAIL'::"text"])))
);


ALTER TABLE "public"."system_test_runs" OWNER TO "postgres";


ALTER TABLE "public"."system_test_runs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."system_test_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_permission_overrides" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "permission_pattern" "text" NOT NULL,
    "effect" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_permission_overrides_effect_check" CHECK (("effect" = ANY (ARRAY['ALLOW'::"text", 'DENY'::"text"]))),
    CONSTRAINT "user_permission_overrides_pattern_normalized" CHECK (("permission_pattern" = "lower"(TRIM(BOTH FROM "permission_pattern"))))
);


ALTER TABLE "public"."user_permission_overrides" OWNER TO "postgres";


ALTER TABLE "public"."user_permission_overrides" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."user_permission_overrides_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_worker_links" (
    "user_id" "uuid" NOT NULL,
    "worker_id" bigint NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_worker_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workers" (
    "id" bigint NOT NULL,
    "worker_code" "text" DEFAULT ('PKR-'::"text" || "lpad"(("nextval"('"public"."smpt_worker_code_seq"'::"regclass"))::"text", 6, '0'::"text")) NOT NULL,
    "finger_id" "text",
    "name" "text" NOT NULL,
    "identity_no" "text",
    "department" "text",
    "position" "text",
    "pay_system" "text",
    "daily_wage" numeric(18,2) DEFAULT 0 NOT NULL,
    "monthly_salary" numeric(18,2) DEFAULT 0 NOT NULL,
    "phone" "text",
    "address" "text",
    "entry_date" "date",
    "exit_date" "date",
    "bank_name" "text",
    "bank_account_no" "text",
    "bank_account_name" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "children_count" integer DEFAULT 0 NOT NULL,
    "ktp_photo_url" "text",
    "user_id" "uuid",
    CONSTRAINT "workers_check" CHECK ((("entry_date" IS NULL) OR ("exit_date" IS NULL) OR ("exit_date" >= "entry_date"))),
    CONSTRAINT "workers_children_count_check" CHECK (("children_count" >= 0)),
    CONSTRAINT "workers_daily_wage_check" CHECK (("daily_wage" >= (0)::numeric)),
    CONSTRAINT "workers_monthly_salary_check" CHECK (("monthly_salary" >= (0)::numeric)),
    CONSTRAINT "workers_name_check" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "workers_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"])))
);


ALTER TABLE "public"."workers" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_cash_advance_balance" WITH ("security_invoker"='true') AS
 SELECT "a"."id",
    "a"."advance_code",
    "a"."worker_id",
    "w"."name" AS "worker_name",
    "a"."advance_date",
    "a"."amount",
    "a"."paid_amount",
    GREATEST(("a"."amount" - "a"."paid_amount"), (0)::numeric) AS "remaining_amount",
    "a"."status",
    "a"."notes"
   FROM ("public"."cash_advances" "a"
     JOIN "public"."workers" "w" ON (("w"."id" = "a"."worker_id")));


ALTER VIEW "public"."v_cash_advance_balance" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_finance_activity" WITH ("security_invoker"='true') AS
 SELECT 'KEUANGAN'::"text" AS "source",
    "finance_transactions"."transaction_code" AS "code",
    "finance_transactions"."transaction_date",
    "finance_transactions"."direction",
    "finance_transactions"."category",
    "finance_transactions"."amount",
    "finance_transactions"."description",
    "finance_transactions"."status"
   FROM "public"."finance_transactions"
UNION ALL
 SELECT 'KAS_KECIL'::"text" AS "source",
    "petty_cash_transactions"."transaction_code" AS "code",
    "petty_cash_transactions"."transaction_date",
    "petty_cash_transactions"."direction",
    "petty_cash_transactions"."category",
    "petty_cash_transactions"."amount",
    "petty_cash_transactions"."description",
    "petty_cash_transactions"."status"
   FROM "public"."petty_cash_transactions";


ALTER VIEW "public"."v_finance_activity" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_finished_stock" WITH ("security_invoker"='true') AS
 SELECT "b"."id",
    "b"."item_kind",
    "b"."finished_good_id",
    "b"."set_id",
    "b"."location_id",
    "l"."name" AS "location_name",
    "b"."quantity",
        CASE
            WHEN ("b"."item_kind" = 'FINISHED_GOOD'::"text") THEN "f"."name"
            ELSE "s"."name"
        END AS "item_name",
        CASE
            WHEN ("b"."item_kind" = 'FINISHED_GOOD'::"text") THEN "f"."unit"
            ELSE "s"."unit"
        END AS "unit"
   FROM ((("public"."logistics_stock_balances" "b"
     JOIN "public"."locations" "l" ON (("l"."id" = "b"."location_id")))
     LEFT JOIN "public"."finished_goods" "f" ON (("f"."id" = "b"."finished_good_id")))
     LEFT JOIN "public"."product_sets" "s" ON (("s"."id" = "b"."set_id")));


ALTER VIEW "public"."v_finished_stock" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_material_actual_consumption" WITH ("security_invoker"='true') AS
 SELECT "u"."project_id",
    "u"."product_id",
    "u"."work_item_id",
    "u"."material_id",
    "u"."process_code" AS "process",
    "u"."usage_date" AS "consumption_date",
    "u"."quantity" AS "normalized_quantity",
    "u"."unit_snapshot" AS "normalized_unit",
    "u"."usage_code" AS "source_code",
    'READY_PRODUCTION_USAGE'::"text" AS "source_type",
    "u"."created_by" AS "user_id",
    "u"."created_at",
    "u"."material_lot_id",
    "u"."input_quantity" AS "original_quantity",
    "u"."input_unit" AS "original_unit"
   FROM "public"."ready_production_usages" "u"
  WHERE (("u"."item_kind" = 'MATERIAL'::"text") AND ("u"."status" = 'AKTIF'::"text"))
UNION ALL
 SELECT "c"."project_id",
    "c"."product_id",
    NULL::bigint AS "work_item_id",
    "c"."material_id",
    'CUTTING'::"text" AS "process",
    "c"."usage_date" AS "consumption_date",
    "c"."quantity" AS "normalized_quantity",
    "c"."unit_snapshot" AS "normalized_unit",
    "c"."usage_code" AS "source_code",
    'CUTTING_USAGE'::"text" AS "source_type",
    "c"."created_by" AS "user_id",
    "c"."created_at",
    "c"."material_lot_id",
    "c"."input_quantity" AS "original_quantity",
    "c"."input_unit" AS "original_unit"
   FROM "public"."cutting_material_usages" "c"
  WHERE ("c"."status" = 'AKTIF'::"text");


ALTER VIEW "public"."v_material_actual_consumption" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouse_receipts" (
    "id" bigint NOT NULL,
    "receipt_code" "text" NOT NULL,
    "receipt_date" "date" NOT NULL,
    "material_id" bigint NOT NULL,
    "quantity" numeric(18,4) NOT NULL,
    "unit_snapshot" "text" NOT NULL,
    "supplier" "text",
    "document_no" "text",
    "notes" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "base_event_id" bigint NOT NULL,
    "cancellation_event_id" bigint,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "input_quantity" numeric(18,4) NOT NULL,
    "input_unit" "text" NOT NULL,
    "conversion_factor" numeric(20,10) NOT NULL,
    "receipt_source" "text" DEFAULT 'NON_PO'::"text" NOT NULL,
    "supplier_id" bigint,
    "purchase_order_id" bigint,
    "purchase_order_line_id" bigint,
    "idempotency_key" "text",
    CONSTRAINT "warehouse_receipts_conversion_factor_positive" CHECK (("conversion_factor" > (0)::numeric)),
    CONSTRAINT "warehouse_receipts_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "warehouse_receipts_receipt_source_check" CHECK (("receipt_source" = ANY (ARRAY['NON_PO'::"text", 'PO'::"text"]))),
    CONSTRAINT "warehouse_receipts_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'DIBATALKAN'::"text"])))
);


ALTER TABLE "public"."warehouse_receipts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_material_lot_status" WITH ("security_invoker"='true') AS
 SELECT "l"."id",
    "l"."lot_code",
    "l"."material_id",
    "m"."name" AS "material_name",
    "l"."receipt_id",
    "r"."receipt_code",
    "l"."roll_number",
    "l"."original_quantity",
    "l"."original_unit",
    "l"."conversion_factor",
    "l"."normalized_quantity",
    "l"."normalized_unit",
    "l"."remaining_normalized_quantity",
    "round"(("l"."normalized_quantity" - "l"."remaining_normalized_quantity"), 4) AS "used_normalized_quantity",
    "l"."current_location_id",
    "sl"."code" AS "location_code",
    "sl"."name" AS "location_name",
    "l"."status",
    "l"."created_at",
    "l"."updated_at",
    "l"."current_project_id",
    "p"."name" AS "project_name",
    "l"."current_product_id",
    "pp"."name" AS "product_name",
    "l"."current_bom_requirement_id",
    "b"."component_name" AS "bom_component_name"
   FROM (((((("public"."material_lots" "l"
     JOIN "public"."materials" "m" ON (("m"."id" = "l"."material_id")))
     LEFT JOIN "public"."warehouse_receipts" "r" ON (("r"."id" = "l"."receipt_id")))
     JOIN "public"."stock_locations" "sl" ON (("sl"."id" = "l"."current_location_id")))
     LEFT JOIN "public"."projects" "p" ON (("p"."id" = "l"."current_project_id")))
     LEFT JOIN "public"."project_products" "pp" ON (("pp"."id" = "l"."current_product_id")))
     LEFT JOIN "public"."bom_requirements" "b" ON (("b"."id" = "l"."current_bom_requirement_id")));


ALTER VIEW "public"."v_material_lot_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" bigint NOT NULL,
    "vendor_code" "text" DEFAULT ('VND-'::"text" || "lpad"(("nextval"('"public"."smpt_vendor_code_seq"'::"regclass"))::"text", 5, '0'::"text")) NOT NULL,
    "name" "text" NOT NULL,
    "pic_name" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "tax_no" "text",
    "bank_name" "text",
    "bank_account_no" "text",
    "bank_account_name" "text",
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "whatsapp" "text",
    "city" "text",
    "province" "text",
    "payment_terms" "text",
    "default_currency" "text" DEFAULT 'IDR'::"text" NOT NULL,
    "lead_time_days" integer,
    "rating" numeric(5,2),
    "internal_notes" "text",
    CONSTRAINT "vendors_lead_time_nonnegative" CHECK ((("lead_time_days" IS NULL) OR ("lead_time_days" >= 0))),
    CONSTRAINT "vendors_rating_nonnegative" CHECK ((("rating" IS NULL) OR ("rating" >= (0)::numeric))),
    CONSTRAINT "vendors_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"])))
);


ALTER TABLE "public"."vendors" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_procurement_plan_lines" WITH ("security_invoker"='true') AS
 SELECT "ppl"."id",
    "ppl"."purchase_plan_id",
    "pp"."plan_code",
    "pp"."plan_date",
    "pp"."project_id",
    "pp"."product_id",
    "pp"."status" AS "plan_status",
    "ppl"."material_id",
    "m"."material_code",
    "m"."name" AS "material_name",
    "ppl"."unit_snapshot",
    "ppl"."final_requirement",
    "ppl"."usable_stock",
    "ppl"."confirmed_incoming",
    "ppl"."open_po_quantity",
    "ppl"."net_procurement_need",
    "ppl"."planned_quantity",
    "ppl"."supplier_id",
    "v"."name" AS "supplier_name",
    "ppl"."unit_price",
    "ppl"."source_requirement_count",
    "ppl"."notes",
    "ppl"."updated_at"
   FROM ((("public"."purchase_plan_lines" "ppl"
     JOIN "public"."purchase_plans" "pp" ON (("pp"."id" = "ppl"."purchase_plan_id")))
     JOIN "public"."materials" "m" ON (("m"."id" = "ppl"."material_id")))
     LEFT JOIN "public"."vendors" "v" ON (("v"."id" = "ppl"."supplier_id")));


ALTER VIEW "public"."v_procurement_plan_lines" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_production_progress" WITH ("security_invoker"='true') AS
 SELECT "o"."id" AS "order_id",
    "o"."spk_code",
    "o"."project_id",
    "o"."product_id",
    "o"."operator_worker_id",
    "w"."name" AS "operator_name",
    "o"."checker_email",
    "o"."status",
    "sum"("i"."assigned_qty") AS "assigned_qty",
    COALESCE("sum"("c"."good_qty") FILTER (WHERE ("c"."status" = 'AKTIF'::"text")), (0)::numeric) AS "approved_qty",
    COALESCE("sum"("c"."reject_qty") FILTER (WHERE ("c"."status" = 'AKTIF'::"text")), (0)::numeric) AS "rejected_qty"
   FROM ((("public"."production_orders" "o"
     JOIN "public"."workers" "w" ON (("w"."id" = "o"."operator_worker_id")))
     JOIN "public"."production_order_items" "i" ON (("i"."order_id" = "o"."id")))
     LEFT JOIN "public"."production_checks" "c" ON (("c"."order_item_id" = "i"."id")))
  GROUP BY "o"."id", "o"."spk_code", "o"."project_id", "o"."product_id", "o"."operator_worker_id", "w"."name", "o"."checker_email", "o"."status";


ALTER VIEW "public"."v_production_progress" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_purchase_order_open_lines" WITH ("security_invoker"='true') AS
 SELECT "pol"."id" AS "purchase_order_line_id",
    "po"."id" AS "purchase_order_id",
    "po"."po_number",
    "po"."order_date",
    "po"."expected_date",
    "po"."supplier_id",
    "v"."name" AS "supplier_name",
    "pol"."material_id",
    "m"."material_code",
    "m"."name" AS "material_name",
    "pol"."ordered_quantity",
    "pol"."purchase_unit",
    "pol"."conversion_factor",
    "pol"."ordered_stock_quantity",
    "pol"."stock_unit",
    "pol"."received_stock_quantity",
    (GREATEST(("pol"."ordered_stock_quantity" - "pol"."received_stock_quantity"), (0)::numeric))::numeric(18,4) AS "outstanding_stock_quantity",
    "pol"."unit_price",
    "pol"."status",
    "m"."lot_tracking_mode"
   FROM ((("public"."purchase_order_lines" "pol"
     JOIN "public"."purchase_orders" "po" ON (("po"."id" = "pol"."purchase_order_id")))
     JOIN "public"."vendors" "v" ON (("v"."id" = "po"."supplier_id")))
     JOIN "public"."materials" "m" ON (("m"."id" = "pol"."material_id")))
  WHERE (("po"."status" = ANY (ARRAY['ISSUED'::"text", 'PARTIAL'::"text"])) AND ("pol"."status" = ANY (ARRAY['OPEN'::"text", 'PARTIAL'::"text"])));


ALTER VIEW "public"."v_purchase_order_open_lines" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_purchase_orders" AS
SELECT
    NULL::bigint AS "id",
    NULL::"text" AS "po_number",
    NULL::bigint AS "purchase_plan_id",
    NULL::bigint AS "supplier_id",
    NULL::"text" AS "supplier_name",
    NULL::"date" AS "order_date",
    NULL::"date" AS "expected_date",
    NULL::"text" AS "currency",
    NULL::"text" AS "status",
    NULL::"text" AS "notes",
    NULL::timestamp with time zone AS "issued_at",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::numeric(18,2) AS "total_amount",
    NULL::numeric(18,4) AS "ordered_stock_quantity",
    NULL::numeric(18,4) AS "received_stock_quantity";


ALTER VIEW "public"."v_purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_items" (
    "id" bigint NOT NULL,
    "item_code" "text" DEFAULT ('ITM-'::"text" || "lpad"(("nextval"('"public"."smpt_work_item_code_seq"'::"regclass"))::"text", 5, '0'::"text")) NOT NULL,
    "project_id" bigint NOT NULL,
    "product_id" bigint,
    "name" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "qty_per_product" integer NOT NULL,
    "operator_price" bigint DEFAULT 0 NOT NULL,
    "proposed_price" bigint DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "output_final" boolean DEFAULT false NOT NULL,
    "legacy_unassigned_product" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "routing_validation_mode" "text" DEFAULT 'WARNING'::"text" NOT NULL,
    "flow_mode" "text" DEFAULT 'MANDIRI'::"text" NOT NULL,
    "flow_order" integer,
    "executor_scope" "text" DEFAULT 'OPERATOR_BORONGAN'::"text" NOT NULL,
    "submission_category" "text" DEFAULT 'BORONGAN'::"text" NOT NULL,
    CONSTRAINT "work_items_code_not_blank" CHECK (("btrim"("item_code") <> ''::"text")),
    CONSTRAINT "work_items_executor_scope_check" CHECK (("executor_scope" = ANY (ARRAY['OPERATOR_BORONGAN'::"text", 'PEKERJA_HARIAN'::"text", 'KEDUANYA'::"text"]))),
    CONSTRAINT "work_items_flow_mode_check" CHECK (("flow_mode" = ANY (ARRAY['MANDIRI'::"text", 'BERANTAI'::"text", 'KHUSUS'::"text"]))),
    CONSTRAINT "work_items_flow_order_check" CHECK ((("flow_order" IS NULL) OR ("flow_order" > 0))),
    CONSTRAINT "work_items_name_not_blank" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "work_items_operator_price_nonnegative" CHECK (("operator_price" >= 0)),
    CONSTRAINT "work_items_output_final_active_only" CHECK ((("output_final" = false) OR ("status" = 'AKTIF'::"text"))),
    CONSTRAINT "work_items_product_assignment_check" CHECK ((("product_id" IS NOT NULL) OR ("legacy_unassigned_product" = true))),
    CONSTRAINT "work_items_proposed_price_nonnegative" CHECK (("proposed_price" >= 0)),
    CONSTRAINT "work_items_qty_positive" CHECK (("qty_per_product" > 0)),
    CONSTRAINT "work_items_routing_validation_mode_check" CHECK (("routing_validation_mode" = ANY (ARRAY['WARNING'::"text", 'HARD'::"text"]))),
    CONSTRAINT "work_items_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"]))),
    CONSTRAINT "work_items_submission_category_check" CHECK (("submission_category" = ANY (ARRAY['BORONGAN'::"text", 'TIDAK_ADA'::"text"]))),
    CONSTRAINT "work_items_unit_not_blank" CHECK (("btrim"("unit") <> ''::"text"))
);


ALTER TABLE "public"."work_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."work_items" IS 'SMPT V2 replacement for V1 Master_Item_Pekerjaan.';



CREATE OR REPLACE VIEW "public"."v_work_item_equivalent_progress" WITH ("security_invoker"='true') AS
 WITH "checker_agg" AS (
         SELECT "i"."work_item_id",
            (COALESCE("sum"("c"."good_qty") FILTER (WHERE (("c"."status" = 'AKTIF'::"text") AND ("o"."status" <> 'DIBATALKAN'::"text"))), (0)::numeric))::numeric(18,4) AS "qty_sah",
            (COALESCE("sum"("c"."good_qty") FILTER (WHERE (("c"."status" = 'AKTIF'::"text") AND ("o"."status" <> 'DIBATALKAN'::"text") AND ("c"."check_date" = CURRENT_DATE))), (0)::numeric))::numeric(18,4) AS "qty_sah_today"
           FROM (("public"."production_order_items" "i"
             JOIN "public"."production_orders" "o" ON (("o"."id" = "i"."order_id")))
             LEFT JOIN "public"."production_checks" "c" ON (("c"."order_item_id" = "i"."id")))
          WHERE ("i"."status" <> 'DIBATALKAN'::"text")
          GROUP BY "i"."work_item_id"
        ), "manual_agg" AS (
         SELECT "m"."work_item_id",
            (COALESCE("sum"("m"."qty_good") FILTER (WHERE ("m"."status" = 'AKTIF'::"text")), (0)::numeric))::numeric(18,4) AS "qty_sah",
            (COALESCE("sum"("m"."qty_good") FILTER (WHERE (("m"."status" = 'AKTIF'::"text") AND ("m"."result_date" = CURRENT_DATE))), (0)::numeric))::numeric(18,4) AS "qty_sah_today"
           FROM "public"."production_manual_results" "m"
          GROUP BY "m"."work_item_id"
        ), "agg" AS (
         SELECT "w"."project_id",
            "w"."product_id",
            "w"."id" AS "work_item_id",
            "w"."name" AS "work_item_name",
            "w"."unit",
            "w"."qty_per_product",
            "w"."display_order",
            "w"."routing_validation_mode",
            "pp"."target_production",
            ((COALESCE("c"."qty_sah", (0)::numeric) + COALESCE("m"."qty_sah", (0)::numeric)))::numeric(18,4) AS "qty_sah",
            ((COALESCE("c"."qty_sah_today", (0)::numeric) + COALESCE("m"."qty_sah_today", (0)::numeric)))::numeric(18,4) AS "qty_sah_today"
           FROM ((("public"."work_items" "w"
             JOIN "public"."project_products" "pp" ON ((("pp"."id" = "w"."product_id") AND ("pp"."project_id" = "w"."project_id"))))
             LEFT JOIN "checker_agg" "c" ON (("c"."work_item_id" = "w"."id")))
             LEFT JOIN "manual_agg" "m" ON (("m"."work_item_id" = "w"."id")))
          WHERE ("w"."product_id" IS NOT NULL)
        )
 SELECT "project_id",
    "product_id",
    "work_item_id",
    "work_item_name",
    "unit",
    "qty_per_product",
    "display_order",
    "routing_validation_mode",
    "target_production",
    "qty_sah",
    "qty_sah_today",
    "round"(("target_production" * ("qty_per_product")::numeric), 4) AS "target_raw_qty",
    "round"(("qty_sah" / (NULLIF("qty_per_product", 0))::numeric), 4) AS "equivalent_product",
    "round"(("qty_sah_today" / (NULLIF("qty_per_product", 0))::numeric), 4) AS "equivalent_today",
    "round"(GREATEST(("target_production" - ("qty_sah" / (NULLIF("qty_per_product", 0))::numeric)), (0)::numeric), 4) AS "remaining_equivalent",
    "round"(GREATEST((("qty_sah" / (NULLIF("qty_per_product", 0))::numeric) - "target_production"), (0)::numeric), 4) AS "over_equivalent",
    "round"(
        CASE
            WHEN ("target_production" > (0)::numeric) THEN ((("qty_sah" / (NULLIF("qty_per_product", 0))::numeric) / "target_production") * (100)::numeric)
            ELSE (0)::numeric
        END, 2) AS "progress_percent"
   FROM "agg" "a";


ALTER VIEW "public"."v_work_item_equivalent_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_item_dependencies" (
    "id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "predecessor_work_item_id" bigint NOT NULL,
    "successor_work_item_id" bigint NOT NULL,
    "dependency_type" "text" DEFAULT 'SEQUENTIAL'::"text" NOT NULL,
    "validation_mode" "text" DEFAULT 'WARNING'::"text" NOT NULL,
    "enforce_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'AKTIF'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opening_consumed_equivalent" numeric(18,4) DEFAULT 0 NOT NULL,
    "source_mode" "text" DEFAULT 'MANUAL_SPECIAL'::"text" NOT NULL,
    CONSTRAINT "work_item_dependencies_check" CHECK (("predecessor_work_item_id" <> "successor_work_item_id")),
    CONSTRAINT "work_item_dependencies_dependency_type_check" CHECK (("dependency_type" = ANY (ARRAY['SEQUENTIAL'::"text", 'JOIN'::"text", 'OPTIONAL'::"text"]))),
    CONSTRAINT "work_item_dependencies_opening_consumed_equivalent_check" CHECK (("opening_consumed_equivalent" >= (0)::numeric)),
    CONSTRAINT "work_item_dependencies_source_mode_check" CHECK (("source_mode" = ANY (ARRAY['AUTO_LINEAR'::"text", 'MANUAL_SPECIAL'::"text"]))),
    CONSTRAINT "work_item_dependencies_status_check" CHECK (("status" = ANY (ARRAY['AKTIF'::"text", 'NONAKTIF'::"text"]))),
    CONSTRAINT "work_item_dependencies_validation_mode_check" CHECK (("validation_mode" = ANY (ARRAY['WARNING'::"text", 'HARD'::"text"])))
);


ALTER TABLE "public"."work_item_dependencies" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_routing_progress_anomalies" WITH ("security_invoker"='true') AS
 SELECT "d"."id" AS "dependency_id",
    "d"."product_id",
    "d"."predecessor_work_item_id",
    "d"."successor_work_item_id",
    "d"."validation_mode",
    "p"."equivalent_product" AS "predecessor_equivalent",
    "s"."equivalent_product" AS "successor_equivalent",
    "round"(GREATEST(("s"."equivalent_product" - "p"."equivalent_product"), (0)::numeric), 4) AS "excess_equivalent"
   FROM (("public"."work_item_dependencies" "d"
     JOIN "public"."v_work_item_equivalent_progress" "p" ON (("p"."work_item_id" = "d"."predecessor_work_item_id")))
     JOIN "public"."v_work_item_equivalent_progress" "s" ON (("s"."work_item_id" = "d"."successor_work_item_id")))
  WHERE (("d"."status" = 'AKTIF'::"text") AND ("d"."dependency_type" <> 'OPTIONAL'::"text") AND ("s"."equivalent_product" > "p"."equivalent_product"));


ALTER VIEW "public"."v_routing_progress_anomalies" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_work_item_dependency_capacity" WITH ("security_invoker"='true') AS
 WITH "consumed" AS (
         SELECT "production_wip_consumptions"."dependency_id",
            (COALESCE("sum"("production_wip_consumptions"."equivalent_quantity") FILTER (WHERE ("production_wip_consumptions"."status" = 'AKTIF'::"text")), (0)::numeric))::numeric(18,4) AS "consumed_equivalent"
           FROM "public"."production_wip_consumptions"
          GROUP BY "production_wip_consumptions"."dependency_id"
        )
 SELECT "d"."id" AS "dependency_id",
    "d"."product_id",
    "d"."predecessor_work_item_id",
    "d"."successor_work_item_id",
    "d"."dependency_type",
    "d"."validation_mode",
    "d"."enforce_from",
    "d"."status",
    COALESCE("p"."equivalent_product", (0)::numeric) AS "predecessor_approved_equivalent",
    (("d"."opening_consumed_equivalent" + COALESCE("c"."consumed_equivalent", (0)::numeric)))::numeric(18,4) AS "predecessor_consumed_equivalent",
    "round"(GREATEST(((COALESCE("p"."equivalent_product", (0)::numeric) - "d"."opening_consumed_equivalent") - COALESCE("c"."consumed_equivalent", (0)::numeric)), (0)::numeric), 4) AS "predecessor_available_equivalent"
   FROM (("public"."work_item_dependencies" "d"
     LEFT JOIN "public"."v_work_item_equivalent_progress" "p" ON (("p"."work_item_id" = "d"."predecessor_work_item_id")))
     LEFT JOIN "consumed" "c" ON (("c"."dependency_id" = "d"."id")));


ALTER VIEW "public"."v_work_item_dependency_capacity" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_work_item_flow_overview" WITH ("security_invoker"='true') AS
 SELECT "w"."id" AS "work_item_id",
    "w"."project_id",
    "w"."product_id",
    "w"."name" AS "work_item_name",
    "w"."qty_per_product",
    "w"."unit",
    "w"."display_order",
    "w"."flow_mode",
    "w"."flow_order",
    "w"."routing_validation_mode",
    "w"."status",
    "p"."qty_sah",
    "p"."equivalent_product",
    "p"."progress_percent"
   FROM ("public"."work_items" "w"
     LEFT JOIN "public"."v_work_item_equivalent_progress" "p" ON (("p"."work_item_id" = "w"."id")));


ALTER VIEW "public"."v_work_item_flow_overview" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_work_item_wip_available" WITH ("security_invoker"='true') AS
 WITH "edge_usage" AS (
         SELECT "v_work_item_dependency_capacity"."predecessor_work_item_id",
            ("max"("v_work_item_dependency_capacity"."predecessor_consumed_equivalent"))::numeric(18,4) AS "consumed_equivalent"
           FROM "public"."v_work_item_dependency_capacity"
          WHERE (("v_work_item_dependency_capacity"."status" = 'AKTIF'::"text") AND ("v_work_item_dependency_capacity"."dependency_type" <> 'OPTIONAL'::"text"))
          GROUP BY "v_work_item_dependency_capacity"."predecessor_work_item_id"
        )
 SELECT "p"."project_id",
    "p"."product_id",
    "p"."work_item_id",
    "p"."work_item_name",
    "p"."equivalent_product" AS "approved_equivalent",
    (COALESCE("e"."consumed_equivalent", (0)::numeric))::numeric(18,4) AS "consumed_equivalent",
    "round"(("p"."equivalent_product" - COALESCE("e"."consumed_equivalent", (0)::numeric)), 4) AS "raw_available_equivalent",
    "round"(GREATEST(("p"."equivalent_product" - COALESCE("e"."consumed_equivalent", (0)::numeric)), (0)::numeric), 4) AS "available_equivalent"
   FROM ("public"."v_work_item_equivalent_progress" "p"
     LEFT JOIN "edge_usage" "e" ON (("e"."predecessor_work_item_id" = "p"."work_item_id")));


ALTER VIEW "public"."v_work_item_wip_available" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_delivery_logs" (
    "id" bigint NOT NULL,
    "vendor_id" bigint NOT NULL,
    "log_code" character varying(50),
    "delivery_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "category" character varying(100) DEFAULT 'UMUM'::character varying,
    "item_description" "text" NOT NULL,
    "qty_18" numeric DEFAULT 0,
    "qty_26" numeric DEFAULT 0,
    "total_qty" numeric DEFAULT 0 NOT NULL,
    "total_bill" numeric DEFAULT 0 NOT NULL,
    "dp_cut" numeric DEFAULT 0 NOT NULL,
    "cash_paid" numeric DEFAULT 0 NOT NULL,
    "payment_date" character varying(100),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vendor_delivery_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."vendor_delivery_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."vendor_delivery_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vendor_delivery_logs_id_seq" OWNED BY "public"."vendor_delivery_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."vendor_down_payments" (
    "id" bigint NOT NULL,
    "vendor_id" bigint NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vendor_down_payments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."vendor_down_payments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."vendor_down_payments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vendor_down_payments_id_seq" OWNED BY "public"."vendor_down_payments"."id";



CREATE TABLE IF NOT EXISTS "public"."vendor_po_targets" (
    "id" bigint NOT NULL,
    "vendor_id" bigint NOT NULL,
    "category" character varying(100),
    "item_name" character varying(255) NOT NULL,
    "size" character varying(50),
    "target_po" numeric DEFAULT 0 NOT NULL,
    "price_per_unit" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vendor_po_targets" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."vendor_po_targets_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."vendor_po_targets_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vendor_po_targets_id_seq" OWNED BY "public"."vendor_po_targets"."id";



ALTER TABLE "public"."vendors" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vendors_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."warehouse_issue_lots" (
    "id" bigint NOT NULL,
    "issue_id" bigint NOT NULL,
    "material_lot_id" bigint NOT NULL,
    "quantity_normalized" numeric(18,4) NOT NULL,
    "normalized_unit" "text" NOT NULL,
    "source_original_quantity" numeric(18,4),
    "source_original_unit" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "warehouse_issue_lots_quantity_normalized_check" CHECK (("quantity_normalized" > (0)::numeric))
);


ALTER TABLE "public"."warehouse_issue_lots" OWNER TO "postgres";


ALTER TABLE "public"."warehouse_issue_lots" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."warehouse_issue_lots_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."warehouse_issues" (
    "id" bigint NOT NULL,
    "issue_code" "text" NOT NULL,
    "issue_date" "date" NOT NULL,
    "source" "text" NOT NULL,
    "request_id" bigint,
    "request_item_id" bigint,
    "project_id" bigint NOT NULL,
    "product_id" bigint,
    "purpose" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "bom_requirement_id" bigint,
    "cutting_component_id" bigint,
    "material_id" bigint,
    "item_name_snapshot" "text" NOT NULL,
    "color_snapshot" "text" DEFAULT ''::"text" NOT NULL,
    "quantity" numeric(18,4) NOT NULL,
    "unit_snapshot" "text" NOT NULL,
    "recipient_worker_id" bigint,
    "recipient_name" "text" NOT NULL,
    "supervisor_worker_id" bigint,
    "notes" "text",
    "stock_event_id" bigint NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "input_quantity" numeric(18,4) NOT NULL,
    "input_unit" "text" NOT NULL,
    "conversion_factor" numeric(20,10) NOT NULL,
    CONSTRAINT "warehouse_issues_conversion_factor_positive" CHECK (("conversion_factor" > (0)::numeric)),
    CONSTRAINT "warehouse_issues_purpose_check" CHECK (("purpose" = ANY (ARRAY['CUTTING'::"text", 'SABLON'::"text", 'PRODUKSI'::"text"]))),
    CONSTRAINT "warehouse_issues_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "warehouse_issues_source_check" CHECK (("source" = ANY (ARRAY['PERMINTAAN'::"text", 'LANGSUNG'::"text"]))),
    CONSTRAINT "warehouse_issues_source_type_check_v2" CHECK (("source_type" = ANY (ARRAY['BAHAN BAKU'::"text", 'HASIL CUTTING'::"text", 'HASIL SABLON'::"text"])))
);


ALTER TABLE "public"."warehouse_issues" OWNER TO "postgres";


ALTER TABLE "public"."warehouse_issues" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."warehouse_issues_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."warehouse_receipts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."warehouse_receipts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."warung_transaction_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cash_advance_id" bigint NOT NULL,
    "item_name" "text" NOT NULL,
    "qty" numeric(10,2) DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."warung_transaction_items" OWNER TO "postgres";


ALTER TABLE "public"."work_item_dependencies" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."work_item_dependencies_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."work_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."work_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."workers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."workers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."bundle_package_balances" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bundle_package_balances_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."bundle_package_recipes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bundle_package_recipes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."bundle_packages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bundle_packages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."bundle_packing_log_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bundle_packing_log_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."bundle_packing_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bundle_packing_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."bundle_recipes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bundle_recipes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."finished_goods_bundling" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."finished_goods_bundling_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."finished_goods_bundling_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."finished_goods_bundling_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."smpt_keepalive_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."smpt_keepalive_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vendor_delivery_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vendor_delivery_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vendor_down_payments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vendor_down_payments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vendor_po_targets" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vendor_po_targets_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."legacy_import_map"
    ADD CONSTRAINT "legacy_import_map_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."legacy_import_map"
    ADD CONSTRAINT "legacy_import_map_source_system_source_sheet_source_key_tar_key" UNIQUE ("source_system", "source_sheet", "source_key", "target_table");



ALTER TABLE ONLY "public"."attendance_import_batches"
    ADD CONSTRAINT "attendance_import_batches_import_code_key" UNIQUE ("import_code");



ALTER TABLE ONLY "public"."attendance_import_batches"
    ADD CONSTRAINT "attendance_import_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_import_rows"
    ADD CONSTRAINT "attendance_import_rows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_import_rows"
    ADD CONSTRAINT "attendance_import_rows_row_hash_key" UNIQUE ("row_hash");



ALTER TABLE ONLY "public"."attendance_month_closures"
    ADD CONSTRAINT "attendance_month_closures_month_start_key" UNIQUE ("month_start");



ALTER TABLE ONLY "public"."attendance_month_closures"
    ADD CONSTRAINT "attendance_month_closures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_attendance_code_key" UNIQUE ("attendance_code");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_worker_id_attendance_date_key" UNIQUE ("worker_id", "attendance_date");



ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_audit_code_key" UNIQUE ("audit_code");



ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bom_requirements"
    ADD CONSTRAINT "bom_requirements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bom_requirements"
    ADD CONSTRAINT "bom_requirements_requirement_code_key" UNIQUE ("requirement_code");



ALTER TABLE ONLY "public"."bundle_package_balances"
    ADD CONSTRAINT "bundle_package_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bundle_package_recipes"
    ADD CONSTRAINT "bundle_package_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bundle_packages"
    ADD CONSTRAINT "bundle_packages_package_code_key" UNIQUE ("package_code");



ALTER TABLE ONLY "public"."bundle_packages"
    ADD CONSTRAINT "bundle_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bundle_packing_log_items"
    ADD CONSTRAINT "bundle_packing_log_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bundle_packing_logs"
    ADD CONSTRAINT "bundle_packing_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bundle_recipes"
    ADD CONSTRAINT "bundle_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_advance_payments"
    ADD CONSTRAINT "cash_advance_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_advances"
    ADD CONSTRAINT "cash_advances_advance_code_key" UNIQUE ("advance_code");



ALTER TABLE ONLY "public"."cash_advances"
    ADD CONSTRAINT "cash_advances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cutting_components"
    ADD CONSTRAINT "cutting_components_component_code_key" UNIQUE ("component_code");



ALTER TABLE ONLY "public"."cutting_components"
    ADD CONSTRAINT "cutting_components_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cutting_daily_results"
    ADD CONSTRAINT "cutting_daily_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cutting_daily_results"
    ADD CONSTRAINT "cutting_daily_results_result_code_key" UNIQUE ("result_code");



ALTER TABLE ONLY "public"."cutting_material_usages"
    ADD CONSTRAINT "cutting_material_usages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cutting_material_usages"
    ADD CONSTRAINT "cutting_material_usages_usage_code_key" UNIQUE ("usage_code");



ALTER TABLE ONLY "public"."embarkation_issues"
    ADD CONSTRAINT "embarkation_issues_issue_code_key" UNIQUE ("issue_code");



ALTER TABLE ONLY "public"."embarkation_issues"
    ADD CONSTRAINT "embarkation_issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."embarkation_shipments"
    ADD CONSTRAINT "embarkation_shipments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."embarkation_shipments"
    ADD CONSTRAINT "embarkation_shipments_public_token_key" UNIQUE ("public_token");



ALTER TABLE ONLY "public"."embarkation_shipments"
    ADD CONSTRAINT "embarkation_shipments_shipment_code_key" UNIQUE ("shipment_code");



ALTER TABLE ONLY "public"."embarkation_targets"
    ADD CONSTRAINT "embarkation_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."embarkation_targets"
    ADD CONSTRAINT "embarkation_targets_target_code_key" UNIQUE ("target_code");



ALTER TABLE ONLY "public"."embarkations"
    ADD CONSTRAINT "embarkations_embarkation_code_key" UNIQUE ("embarkation_code");



ALTER TABLE ONLY "public"."embarkations"
    ADD CONSTRAINT "embarkations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."embarkations"
    ADD CONSTRAINT "embarkations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_finished_receipts"
    ADD CONSTRAINT "external_finished_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_finished_receipts"
    ADD CONSTRAINT "external_finished_receipts_receipt_code_key" UNIQUE ("receipt_code");



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "finance_transactions_transaction_code_key" UNIQUE ("transaction_code");



ALTER TABLE ONLY "public"."finished_goods_bundling"
    ADD CONSTRAINT "finished_goods_bundling_bundling_code_key" UNIQUE ("bundling_code");



ALTER TABLE ONLY "public"."finished_goods_bundling_items"
    ADD CONSTRAINT "finished_goods_bundling_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finished_goods_bundling"
    ADD CONSTRAINT "finished_goods_bundling_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finished_goods"
    ADD CONSTRAINT "finished_goods_finished_good_code_key" UNIQUE ("finished_good_code");



ALTER TABLE ONLY "public"."finished_goods"
    ADD CONSTRAINT "finished_goods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finished_goods_transfers"
    ADD CONSTRAINT "finished_goods_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finished_goods_transfers"
    ADD CONSTRAINT "finished_goods_transfers_transfer_code_key" UNIQUE ("transfer_code");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_location_code_key" UNIQUE ("location_code");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logistics_stock_balances"
    ADD CONSTRAINT "logistics_stock_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logistics_stock_events"
    ADD CONSTRAINT "logistics_stock_events_event_code_key" UNIQUE ("event_code");



ALTER TABLE ONLY "public"."logistics_stock_events"
    ADD CONSTRAINT "logistics_stock_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logistics_stock_ledger"
    ADD CONSTRAINT "logistics_stock_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manufacturing_transactions"
    ADD CONSTRAINT "manufacturing_transactions_manufacturing_code_key" UNIQUE ("manufacturing_code");



ALTER TABLE ONLY "public"."manufacturing_transactions"
    ADD CONSTRAINT "manufacturing_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_lots"
    ADD CONSTRAINT "material_lots_lot_code_key" UNIQUE ("lot_code");



ALTER TABLE ONLY "public"."material_lots"
    ADD CONSTRAINT "material_lots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_request_items"
    ADD CONSTRAINT "material_request_items_detail_code_key" UNIQUE ("detail_code");



ALTER TABLE ONLY "public"."material_request_items"
    ADD CONSTRAINT "material_request_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_requests"
    ADD CONSTRAINT "material_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_requests"
    ADD CONSTRAINT "material_requests_request_code_key" UNIQUE ("request_code");



ALTER TABLE ONLY "public"."material_suppliers"
    ADD CONSTRAINT "material_suppliers_material_id_supplier_id_key" UNIQUE ("material_id", "supplier_id");



ALTER TABLE ONLY "public"."material_suppliers"
    ADD CONSTRAINT "material_suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_material_code_key" UNIQUE ("material_code");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operator_payroll_items"
    ADD CONSTRAINT "operator_payroll_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operator_payroll_items"
    ADD CONSTRAINT "operator_payroll_items_run_id_worker_id_work_item_id_operat_key" UNIQUE ("run_id", "worker_id", "work_item_id", "operator_price_snapshot", "submission_price_snapshot");



ALTER TABLE ONLY "public"."operator_payroll_runs"
    ADD CONSTRAINT "operator_payroll_runs_payroll_code_key" UNIQUE ("payroll_code");



ALTER TABLE ONLY "public"."operator_payroll_runs"
    ADD CONSTRAINT "operator_payroll_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."packing_runs"
    ADD CONSTRAINT "packing_runs_packing_code_key" UNIQUE ("packing_code");



ALTER TABLE ONLY "public"."packing_runs"
    ADD CONSTRAINT "packing_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_attendance_reviews"
    ADD CONSTRAINT "payroll_attendance_reviews_attendance_id_key" UNIQUE ("attendance_id");



ALTER TABLE ONLY "public"."payroll_attendance_reviews"
    ADD CONSTRAINT "payroll_attendance_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_payout_adjustments"
    ADD CONSTRAINT "payroll_payout_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_payout_adjustments"
    ADD CONSTRAINT "payroll_payout_adjustments_source_payout_detail_id_key" UNIQUE ("source_payout_detail_id");



ALTER TABLE ONLY "public"."payroll_payout_deductions"
    ADD CONSTRAINT "payroll_payout_deductions_payout_id_cash_advance_id_key" UNIQUE ("payout_id", "cash_advance_id");



ALTER TABLE ONLY "public"."payroll_payout_deductions"
    ADD CONSTRAINT "payroll_payout_deductions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_payout_details"
    ADD CONSTRAINT "payroll_payout_details_payout_id_worker_id_key" UNIQUE ("payout_id", "worker_id");



ALTER TABLE ONLY "public"."payroll_payout_details"
    ADD CONSTRAINT "payroll_payout_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_payouts"
    ADD CONSTRAINT "payroll_payouts_payout_code_key" UNIQUE ("payout_code");



ALTER TABLE ONLY "public"."payroll_payouts"
    ADD CONSTRAINT "payroll_payouts_payout_type_period_start_period_end_status_key" UNIQUE ("payout_type", "period_start", "period_end", "status");



ALTER TABLE ONLY "public"."payroll_payouts"
    ADD CONSTRAINT "payroll_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_run_details"
    ADD CONSTRAINT "payroll_run_details_payroll_run_id_attendance_id_key" UNIQUE ("payroll_run_id", "attendance_id");



ALTER TABLE ONLY "public"."payroll_run_details"
    ADD CONSTRAINT "payroll_run_details_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_run_items"
    ADD CONSTRAINT "payroll_run_items_payroll_run_id_worker_id_key" UNIQUE ("payroll_run_id", "worker_id");



ALTER TABLE ONLY "public"."payroll_run_items"
    ADD CONSTRAINT "payroll_run_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_payroll_code_key" UNIQUE ("payroll_code");



ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_settings"
    ADD CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."petty_cash_transactions"
    ADD CONSTRAINT "petty_cash_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."petty_cash_transactions"
    ADD CONSTRAINT "petty_cash_transactions_transaction_code_key" UNIQUE ("transaction_code");



ALTER TABLE ONLY "public"."product_set_components"
    ADD CONSTRAINT "product_set_components_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_set_components"
    ADD CONSTRAINT "product_set_components_set_id_finished_good_id_key" UNIQUE ("set_id", "finished_good_id");



ALTER TABLE ONLY "public"."product_sets"
    ADD CONSTRAINT "product_sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_sets"
    ADD CONSTRAINT "product_sets_project_id_name_key" UNIQUE ("project_id", "name");



ALTER TABLE ONLY "public"."product_sets"
    ADD CONSTRAINT "product_sets_set_code_key" UNIQUE ("set_code");



ALTER TABLE ONLY "public"."production_anomalies"
    ADD CONSTRAINT "production_anomalies_anomaly_code_key" UNIQUE ("anomaly_code");



ALTER TABLE ONLY "public"."production_anomalies"
    ADD CONSTRAINT "production_anomalies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_checks"
    ADD CONSTRAINT "production_checks_check_code_key" UNIQUE ("check_code");



ALTER TABLE ONLY "public"."production_checks"
    ADD CONSTRAINT "production_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_manual_results"
    ADD CONSTRAINT "production_manual_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_manual_results"
    ADD CONSTRAINT "production_manual_results_result_code_key" UNIQUE ("result_code");



ALTER TABLE ONLY "public"."production_order_items"
    ADD CONSTRAINT "production_order_items_order_id_work_item_id_key" UNIQUE ("order_id", "work_item_id");



ALTER TABLE ONLY "public"."production_order_items"
    ADD CONSTRAINT "production_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_spk_code_key" UNIQUE ("spk_code");



ALTER TABLE ONLY "public"."production_wip_consumptions"
    ADD CONSTRAINT "production_wip_consumptions_dependency_id_production_check__key" UNIQUE ("dependency_id", "production_check_id");



ALTER TABLE ONLY "public"."production_wip_consumptions"
    ADD CONSTRAINT "production_wip_consumptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_legacy_username_key" UNIQUE ("legacy_username");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_products"
    ADD CONSTRAINT "project_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_products"
    ADD CONSTRAINT "project_products_product_code_key" UNIQUE ("product_code");



ALTER TABLE ONLY "public"."project_products"
    ADD CONSTRAINT "project_products_project_id_id_key" UNIQUE ("project_id", "id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_project_code_key" UNIQUE ("project_code");



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_po_number_key" UNIQUE ("po_number");



ALTER TABLE ONLY "public"."purchase_plan_lines"
    ADD CONSTRAINT "purchase_plan_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_plan_lines"
    ADD CONSTRAINT "purchase_plan_lines_purchase_plan_id_material_id_key" UNIQUE ("purchase_plan_id", "material_id");



ALTER TABLE ONLY "public"."purchase_plans"
    ADD CONSTRAINT "purchase_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_plans"
    ADD CONSTRAINT "purchase_plans_plan_code_key" UNIQUE ("plan_code");



ALTER TABLE ONLY "public"."qc_inspections"
    ADD CONSTRAINT "qc_inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qc_inspections"
    ADD CONSTRAINT "qc_inspections_qc_code_key" UNIQUE ("qc_code");



ALTER TABLE ONLY "public"."qc_reworks"
    ADD CONSTRAINT "qc_reworks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qc_reworks"
    ADD CONSTRAINT "qc_reworks_rework_code_key" UNIQUE ("rework_code");



ALTER TABLE ONLY "public"."ready_production_usage_lots"
    ADD CONSTRAINT "ready_production_usage_lots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ready_production_usage_lots"
    ADD CONSTRAINT "ready_production_usage_lots_usage_id_material_lot_id_key" UNIQUE ("usage_id", "material_lot_id");



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_usage_code_key" UNIQUE ("usage_code");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salary_submissions"
    ADD CONSTRAINT "salary_submissions_payout_id_key" UNIQUE ("payout_id");



ALTER TABLE ONLY "public"."salary_submissions"
    ADD CONSTRAINT "salary_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salary_submissions"
    ADD CONSTRAINT "salary_submissions_submission_code_key" UNIQUE ("submission_code");



ALTER TABLE ONLY "public"."smpt_keepalive_log"
    ADD CONSTRAINT "smpt_keepalive_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_events"
    ADD CONSTRAINT "stock_events_event_code_key" UNIQUE ("event_code");



ALTER TABLE ONLY "public"."stock_events"
    ADD CONSTRAINT "stock_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_ledger_entries"
    ADD CONSTRAINT "stock_ledger_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_locations"
    ADD CONSTRAINT "stock_locations_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."stock_locations"
    ADD CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_data_backups"
    ADD CONSTRAINT "system_data_backups_backup_code_key" UNIQUE ("backup_code");



ALTER TABLE ONLY "public"."system_data_backups"
    ADD CONSTRAINT "system_data_backups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_test_run_entities"
    ADD CONSTRAINT "system_test_run_entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_test_run_entities"
    ADD CONSTRAINT "system_test_run_entities_run_id_table_name_row_id_key" UNIQUE ("run_id", "table_name", "row_id");



ALTER TABLE ONLY "public"."system_test_runs"
    ADD CONSTRAINT "system_test_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_test_runs"
    ADD CONSTRAINT "system_test_runs_run_code_key" UNIQUE ("run_code");



ALTER TABLE ONLY "public"."bundle_recipes"
    ADD CONSTRAINT "uq_bundle_recipe_item" UNIQUE ("bundle_finished_good_id", "component_finished_good_id");



ALTER TABLE ONLY "public"."bundle_package_balances"
    ADD CONSTRAINT "uq_package_location_balance" UNIQUE ("package_id", "location_id");



ALTER TABLE ONLY "public"."bundle_package_recipes"
    ADD CONSTRAINT "uq_package_recipe_item" UNIQUE ("package_id", "finished_good_id");



ALTER TABLE ONLY "public"."user_permission_overrides"
    ADD CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_permission_overrides"
    ADD CONSTRAINT "user_permission_overrides_user_pattern_unique" UNIQUE ("user_id", "permission_pattern");



ALTER TABLE ONLY "public"."user_worker_links"
    ADD CONSTRAINT "user_worker_links_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_worker_links"
    ADD CONSTRAINT "user_worker_links_worker_id_key" UNIQUE ("worker_id");



ALTER TABLE ONLY "public"."vendor_delivery_logs"
    ADD CONSTRAINT "vendor_delivery_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_down_payments"
    ADD CONSTRAINT "vendor_down_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_po_targets"
    ADD CONSTRAINT "vendor_po_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_vendor_code_key" UNIQUE ("vendor_code");



ALTER TABLE ONLY "public"."warehouse_issue_lots"
    ADD CONSTRAINT "warehouse_issue_lots_issue_id_material_lot_id_key" UNIQUE ("issue_id", "material_lot_id");



ALTER TABLE ONLY "public"."warehouse_issue_lots"
    ADD CONSTRAINT "warehouse_issue_lots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_issue_code_key" UNIQUE ("issue_code");



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouse_receipts"
    ADD CONSTRAINT "warehouse_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouse_receipts"
    ADD CONSTRAINT "warehouse_receipts_receipt_code_key" UNIQUE ("receipt_code");



ALTER TABLE ONLY "public"."warung_transaction_items"
    ADD CONSTRAINT "warung_transaction_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_item_dependencies"
    ADD CONSTRAINT "work_item_dependencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_item_dependencies"
    ADD CONSTRAINT "work_item_dependencies_product_id_predecessor_work_item_id__key" UNIQUE ("product_id", "predecessor_work_item_id", "successor_work_item_id");



ALTER TABLE ONLY "public"."work_items"
    ADD CONSTRAINT "work_items_item_code_key" UNIQUE ("item_code");



ALTER TABLE ONLY "public"."work_items"
    ADD CONSTRAINT "work_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_worker_code_key" UNIQUE ("worker_code");



CREATE INDEX "attendance_date_idx" ON "public"."attendance_records" USING "btree" ("attendance_date" DESC, "worker_id");



CREATE INDEX "attendance_import_rows_batch_idx" ON "public"."attendance_import_rows" USING "btree" ("batch_id", "id");



CREATE INDEX "attendance_import_rows_worker_date_idx" ON "public"."attendance_import_rows" USING "btree" ("worker_id", "attendance_date" DESC, "id" DESC);



CREATE INDEX "attendance_worker_period_idx" ON "public"."attendance_records" USING "btree" ("worker_id", "attendance_date" DESC, "verification_status");



CREATE INDEX "audit_events_actor_idx" ON "public"."audit_events" USING "btree" ("actor_user_id", "occurred_at" DESC);



CREATE INDEX "audit_events_table_idx" ON "public"."audit_events" USING "btree" ("table_name", "occurred_at" DESC, "id" DESC);



CREATE INDEX "bom_fulfillment_source_idx" ON "public"."bom_requirements" USING "btree" ("fulfillment_source", "status", "project_id", "product_id") WHERE ("component_type" = 'BAHAN'::"text");



CREATE UNIQUE INDEX "bom_requirements_component_uq" ON "public"."bom_requirements" USING "btree" ("project_id", COALESCE("product_id", (0)::bigint), "component_type", "lower"("btrim"("component_name")));



CREATE INDEX "bom_requirements_material_idx" ON "public"."bom_requirements" USING "btree" ("material_id") WHERE ("material_id" IS NOT NULL);



CREATE INDEX "bom_requirements_project_product_status_idx" ON "public"."bom_requirements" USING "btree" ("project_id", "product_id", "status");



CREATE INDEX "cash_advance_worker_idx" ON "public"."cash_advances" USING "btree" ("worker_id", "status", "advance_date" DESC);



CREATE INDEX "cutting_components_scope_idx" ON "public"."cutting_components" USING "btree" ("project_id", "product_id", "status");



CREATE UNIQUE INDEX "cutting_components_scope_name_uq" ON "public"."cutting_components" USING "btree" ("project_id", COALESCE("product_id", (0)::bigint), "lower"("btrim"("name")), "lower"("btrim"("color")));



CREATE INDEX "cutting_result_date_idx" ON "public"."cutting_daily_results" USING "btree" ("project_id", "product_id", "result_date" DESC, "id" DESC);



CREATE INDEX "cutting_usage_date_idx" ON "public"."cutting_material_usages" USING "btree" ("project_id", "usage_date" DESC, "id" DESC);



CREATE UNIQUE INDEX "embarkation_target_uq" ON "public"."embarkation_targets" USING "btree" ("embarkation_id", "item_kind", COALESCE("finished_good_id", (0)::bigint), COALESCE("set_id", (0)::bigint));



CREATE INDEX "fg_bundling_date_idx" ON "public"."finished_goods_bundling" USING "btree" ("bundling_date" DESC);



CREATE INDEX "fg_bundling_items_bnd_idx" ON "public"."finished_goods_bundling_items" USING "btree" ("bundling_id");



CREATE INDEX "fg_bundling_loc_idx" ON "public"."finished_goods_bundling" USING "btree" ("location_id");



CREATE INDEX "finance_date_idx" ON "public"."finance_transactions" USING "btree" ("transaction_date" DESC, "status", "id" DESC);



CREATE INDEX "finished_balances_loc_idx" ON "public"."logistics_stock_balances" USING "btree" ("location_id", "item_kind", "quantity" DESC);



CREATE UNIQUE INDEX "finished_goods_final_item_uq" ON "public"."finished_goods" USING "btree" ("final_work_item_id") WHERE (("final_work_item_id" IS NOT NULL) AND ("status" = 'AKTIF'::"text"));



CREATE UNIQUE INDEX "finished_goods_name_no_proj_uq" ON "public"."finished_goods" USING "btree" ("lower"("name")) WHERE ("project_id" IS NULL);



CREATE UNIQUE INDEX "finished_goods_project_name_uq" ON "public"."finished_goods" USING "btree" ("project_id", "lower"("name"));



CREATE INDEX "idx_cash_advances_warung_tenant" ON "public"."cash_advances" USING "btree" ("warung_id", "category");



CREATE INDEX "idx_cash_advances_worker_warung" ON "public"."cash_advances" USING "btree" ("worker_id", "warung_id");



CREATE INDEX "idx_warung_items_advance_id" ON "public"."warung_transaction_items" USING "btree" ("cash_advance_id");



CREATE UNIQUE INDEX "logistics_stock_balance_uq" ON "public"."logistics_stock_balances" USING "btree" ("item_kind", COALESCE("finished_good_id", (0)::bigint), COALESCE("set_id", (0)::bigint), "location_id");



CREATE INDEX "logistics_stock_ledger_item_idx" ON "public"."logistics_stock_ledger" USING "btree" ("item_kind", "finished_good_id", "set_id", "location_id", "created_at" DESC, "id" DESC);



CREATE INDEX "material_lots_available_idx" ON "public"."material_lots" USING "btree" ("material_id", "current_location_id", "status", "remaining_normalized_quantity" DESC, "id");



CREATE INDEX "material_lots_receipt_idx" ON "public"."material_lots" USING "btree" ("receipt_id", "id");



CREATE INDEX "material_lots_remaining_idx" ON "public"."material_lots" USING "btree" ("current_location_id", "material_id", "status", "remaining_normalized_quantity" DESC, "id") WHERE (("status" = ANY (ARRAY['AVAILABLE'::"text", 'PARTIAL'::"text"])) AND ("remaining_normalized_quantity" > (0)::numeric));



CREATE UNIQUE INDEX "material_lots_roll_uq" ON "public"."material_lots" USING "btree" ("material_id", COALESCE("receipt_id", (0)::bigint), "lower"("btrim"("roll_number")));



CREATE INDEX "material_lots_scope_location_idx" ON "public"."material_lots" USING "btree" ("current_project_id", "current_product_id", "current_location_id", "status", "id");



CREATE INDEX "material_request_items_request_idx" ON "public"."material_request_items" USING "btree" ("request_id", "status");



CREATE INDEX "material_requests_status_idx" ON "public"."material_requests" USING "btree" ("status", "request_date" DESC, "id" DESC);



CREATE INDEX "material_suppliers_material_idx" ON "public"."material_suppliers" USING "btree" ("material_id", "status", "preferred" DESC);



CREATE UNIQUE INDEX "material_suppliers_one_preferred_uq" ON "public"."material_suppliers" USING "btree" ("material_id") WHERE (("preferred" = true) AND ("status" = 'AKTIF'::"text"));



CREATE INDEX "material_suppliers_supplier_idx" ON "public"."material_suppliers" USING "btree" ("supplier_id", "status", "preferred" DESC);



CREATE INDEX "materials_category_status_idx" ON "public"."materials" USING "btree" ("category", "status");



CREATE UNIQUE INDEX "materials_name_uq" ON "public"."materials" USING "btree" ("lower"("btrim"("name")));



CREATE INDEX "mfg_date_idx" ON "public"."manufacturing_transactions" USING "btree" ("transaction_date" DESC, "flow_type", "status", "id" DESC);



CREATE UNIQUE INDEX "operator_payroll_runs_period_uq" ON "public"."operator_payroll_runs" USING "btree" ("period_start", "period_end") WHERE ("status" <> 'DIBATALKAN'::"text");



CREATE UNIQUE INDEX "payroll_runs_period_uq" ON "public"."payroll_runs" USING "btree" ("payroll_type", "period_start", "period_end") WHERE ("status" <> 'DIBATALKAN'::"text");



CREATE INDEX "petty_date_idx" ON "public"."petty_cash_transactions" USING "btree" ("transaction_date" DESC, "status", "id" DESC);



CREATE INDEX "production_anomalies_check_idx" ON "public"."production_anomalies" USING "btree" ("production_check_id", "status", "id") WHERE ("production_check_id" IS NOT NULL);



CREATE INDEX "production_anomalies_manager_idx" ON "public"."production_anomalies" USING "btree" ("status", "severity", "detected_at" DESC, "id" DESC);



CREATE INDEX "production_anomalies_open_idx" ON "public"."production_anomalies" USING "btree" ("status", "severity", "detected_at" DESC, "id" DESC);



CREATE INDEX "production_anomalies_scope_idx" ON "public"."production_anomalies" USING "btree" ("project_id", "product_id", "work_item_id", "detected_at" DESC, "id" DESC);



CREATE INDEX "production_checks_checker_idx" ON "public"."production_checks" USING "btree" ("checker_user_id", "check_date" DESC);



CREATE INDEX "production_checks_date_idx" ON "public"."production_checks" USING "btree" ("check_date" DESC, "status", "order_item_id");



CREATE INDEX "production_checks_item_date_active_idx" ON "public"."production_checks" USING "btree" ("order_item_id", "check_date" DESC, "id" DESC) WHERE ("status" = 'AKTIF'::"text");



CREATE INDEX "production_checks_item_idx" ON "public"."production_checks" USING "btree" ("order_item_id", "status", "check_date" DESC, "id" DESC);



CREATE INDEX "production_manual_results_scope_idx" ON "public"."production_manual_results" USING "btree" ("project_id", "product_id", "work_item_id", "status", "result_date" DESC, "id" DESC);



CREATE INDEX "production_manual_results_worker_idx" ON "public"."production_manual_results" USING "btree" ("worker_id", "status", "result_date" DESC, "id" DESC);



CREATE INDEX "production_order_items_work_idx" ON "public"."production_order_items" USING "btree" ("work_item_id", "status");



CREATE INDEX "production_order_items_work_item_idx" ON "public"."production_order_items" USING "btree" ("work_item_id", "order_id", "status", "id");



CREATE INDEX "production_order_items_work_status_idx" ON "public"."production_order_items" USING "btree" ("work_item_id", "status", "order_id", "id");



CREATE INDEX "production_orders_checker_idx" ON "public"."production_orders" USING "btree" ("lower"("checker_email"), "status", "order_date" DESC);



CREATE INDEX "production_orders_manager_idx" ON "public"."production_orders" USING "btree" ("project_id", "product_id", "status", "due_date", "id");



CREATE INDEX "production_orders_operator_idx" ON "public"."production_orders" USING "btree" ("operator_worker_id", "status", "order_date" DESC);



CREATE INDEX "production_orders_product_status_idx" ON "public"."production_orders" USING "btree" ("product_id", "status", "id");



CREATE INDEX "production_orders_scope_status_idx" ON "public"."production_orders" USING "btree" ("project_id", "product_id", "status", "order_date" DESC, "id" DESC);



CREATE INDEX "production_orders_status_idx" ON "public"."production_orders" USING "btree" ("status", "order_date" DESC, "id" DESC);



CREATE INDEX "production_wip_check_idx" ON "public"."production_wip_consumptions" USING "btree" ("production_check_id", "status", "id");



CREATE INDEX "production_wip_consumptions_dep_status_idx" ON "public"."production_wip_consumptions" USING "btree" ("dependency_id", "status", "created_at" DESC, "id" DESC);



CREATE INDEX "production_wip_pred_idx" ON "public"."production_wip_consumptions" USING "btree" ("predecessor_work_item_id", "status", "created_at" DESC, "id" DESC);



CREATE INDEX "production_wip_succ_idx" ON "public"."production_wip_consumptions" USING "btree" ("successor_work_item_id", "status", "created_at" DESC, "id" DESC);



CREATE INDEX "profiles_role_id_idx" ON "public"."profiles" USING "btree" ("role_id");



CREATE UNIQUE INDEX "project_products_project_name_uq" ON "public"."project_products" USING "btree" ("project_id", "lower"("btrim"("name")));



CREATE INDEX "project_products_project_status_idx" ON "public"."project_products" USING "btree" ("project_id", "status");



CREATE INDEX "projects_name_lower_idx" ON "public"."projects" USING "btree" ("lower"("name"));



CREATE INDEX "projects_product_category_idx" ON "public"."projects" USING "btree" ("product_category");



CREATE INDEX "projects_repeat_source_idx" ON "public"."projects" USING "btree" ("repeat_source_project_id") WHERE ("repeat_source_project_id" IS NOT NULL);



CREATE INDEX "projects_status_idx" ON "public"."projects" USING "btree" ("status");



CREATE INDEX "purchase_order_lines_material_status_idx" ON "public"."purchase_order_lines" USING "btree" ("material_id", "status", "purchase_order_id");



CREATE INDEX "purchase_order_lines_plan_line_idx" ON "public"."purchase_order_lines" USING "btree" ("purchase_plan_line_id", "status") WHERE ("purchase_plan_line_id" IS NOT NULL);



CREATE UNIQUE INDEX "purchase_order_lines_po_material_uq" ON "public"."purchase_order_lines" USING "btree" ("purchase_order_id", "material_id") WHERE ("status" <> 'CANCELLED'::"text");



CREATE INDEX "purchase_orders_plan_idx" ON "public"."purchase_orders" USING "btree" ("purchase_plan_id", "status", "id") WHERE ("purchase_plan_id" IS NOT NULL);



CREATE INDEX "purchase_orders_status_date_idx" ON "public"."purchase_orders" USING "btree" ("status", "order_date" DESC, "id" DESC);



CREATE INDEX "purchase_orders_supplier_status_idx" ON "public"."purchase_orders" USING "btree" ("supplier_id", "status", "order_date" DESC, "id" DESC);



CREATE INDEX "purchase_plan_lines_plan_idx" ON "public"."purchase_plan_lines" USING "btree" ("purchase_plan_id", "id");



CREATE INDEX "purchase_plan_lines_supplier_idx" ON "public"."purchase_plan_lines" USING "btree" ("supplier_id", "purchase_plan_id") WHERE ("supplier_id" IS NOT NULL);



CREATE INDEX "purchase_plans_scope_status_idx" ON "public"."purchase_plans" USING "btree" ("project_id", "product_id", "status", "plan_date" DESC, "id" DESC);



CREATE INDEX "qc_date_idx" ON "public"."qc_inspections" USING "btree" ("inspection_date" DESC, "status", "finished_good_id");



CREATE INDEX "qc_inspections_check_idx" ON "public"."qc_inspections" USING "btree" ("production_check_id", "status", "inspection_date" DESC);



CREATE INDEX "ready_usage_date_idx" ON "public"."ready_production_usages" USING "btree" ("project_id", "product_id", "usage_date" DESC, "id" DESC);



CREATE INDEX "ready_usage_lots_lot_idx" ON "public"."ready_production_usage_lots" USING "btree" ("material_lot_id", "created_at" DESC, "id" DESC);



CREATE INDEX "ready_usage_manager_idx" ON "public"."ready_production_usages" USING "btree" ("project_id", "product_id", "material_id", "usage_date" DESC, "id" DESC) WHERE (("status" = 'AKTIF'::"text") AND ("item_kind" = 'MATERIAL'::"text"));



CREATE INDEX "ready_usage_scope_work_item_idx" ON "public"."ready_production_usages" USING "btree" ("project_id", "product_id", "work_item_id", "usage_date" DESC, "id" DESC);



CREATE INDEX "shipment_status_idx" ON "public"."embarkation_shipments" USING "btree" ("status", "shipment_date" DESC, "id" DESC);



CREATE INDEX "smpt_keepalive_log_pinged_at_idx" ON "public"."smpt_keepalive_log" USING "btree" ("pinged_at" DESC);



CREATE UNIQUE INDEX "stock_balances_dimension_uq" ON "public"."stock_balances" USING "btree" ("item_kind", COALESCE("material_id", (0)::bigint), COALESCE("cutting_component_id", (0)::bigint), "location_id", COALESCE("project_id", (0)::bigint), COALESCE("product_id", (0)::bigint), COALESCE("bom_requirement_id", (0)::bigint));



CREATE INDEX "stock_balances_location_idx" ON "public"."stock_balances" USING "btree" ("location_id", "item_kind");



CREATE INDEX "stock_balances_project_idx" ON "public"."stock_balances" USING "btree" ("project_id", "product_id", "location_id");



CREATE INDEX "stock_events_date_idx" ON "public"."stock_events" USING "btree" ("event_date" DESC, "id" DESC);



CREATE INDEX "stock_events_reference_idx" ON "public"."stock_events" USING "btree" ("reference_type", "reference_code");



CREATE INDEX "stock_ledger_event_idx" ON "public"."stock_ledger_entries" USING "btree" ("event_id");



CREATE INDEX "stock_ledger_item_idx" ON "public"."stock_ledger_entries" USING "btree" ("location_id", "item_kind", "created_at" DESC);



CREATE INDEX "stock_ledger_material_lot_idx" ON "public"."stock_ledger_entries" USING "btree" ("material_lot_id", "created_at" DESC, "id" DESC) WHERE ("material_lot_id" IS NOT NULL);



CREATE INDEX "stock_ledger_project_idx" ON "public"."stock_ledger_entries" USING "btree" ("project_id", "product_id", "created_at" DESC);



CREATE INDEX "stock_ledger_work_item_idx" ON "public"."stock_ledger_entries" USING "btree" ("work_item_id", "created_at" DESC, "id" DESC) WHERE ("work_item_id" IS NOT NULL);



CREATE INDEX "system_data_backups_date_idx" ON "public"."system_data_backups" USING "btree" ("created_at" DESC, "id" DESC);



CREATE INDEX "system_test_run_entities_run_idx" ON "public"."system_test_run_entities" USING "btree" ("run_id", "table_name", "row_id");



CREATE INDEX "system_test_runs_type_date_idx" ON "public"."system_test_runs" USING "btree" ("run_type", "started_at" DESC, "id" DESC);



CREATE INDEX "user_permission_overrides_lookup_idx" ON "public"."user_permission_overrides" USING "btree" ("user_id", "is_active", "permission_pattern");



CREATE INDEX "warehouse_issue_lots_lot_idx" ON "public"."warehouse_issue_lots" USING "btree" ("material_lot_id", "created_at" DESC, "id" DESC);



CREATE INDEX "warehouse_issues_date_idx" ON "public"."warehouse_issues" USING "btree" ("issue_date" DESC, "id" DESC);



CREATE INDEX "warehouse_issues_scope_date_idx" ON "public"."warehouse_issues" USING "btree" ("project_id", "product_id", "material_id", "issue_date" DESC, "id" DESC) WHERE ("source_type" = 'BAHAN BAKU'::"text");



CREATE INDEX "warehouse_receipts_date_idx" ON "public"."warehouse_receipts" USING "btree" ("receipt_date" DESC, "id" DESC);



CREATE UNIQUE INDEX "warehouse_receipts_idempotency_uq" ON "public"."warehouse_receipts" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "warehouse_receipts_material_date_idx" ON "public"."warehouse_receipts" USING "btree" ("material_id", "receipt_date" DESC, "id" DESC) WHERE ("status" = 'AKTIF'::"text");



CREATE INDEX "warehouse_receipts_po_line_idx" ON "public"."warehouse_receipts" USING "btree" ("purchase_order_line_id", "receipt_date" DESC, "id" DESC) WHERE ("purchase_order_line_id" IS NOT NULL);



CREATE INDEX "warehouse_receipts_supplier_idx" ON "public"."warehouse_receipts" USING "btree" ("supplier_id", "receipt_date" DESC, "id" DESC) WHERE ("supplier_id" IS NOT NULL);



CREATE INDEX "work_item_dependencies_predecessor_idx" ON "public"."work_item_dependencies" USING "btree" ("product_id", "predecessor_work_item_id", "status", "id");



CREATE INDEX "work_item_dependencies_source_idx" ON "public"."work_item_dependencies" USING "btree" ("product_id", "source_mode", "status", "id");



CREATE INDEX "work_item_dependencies_successor_idx" ON "public"."work_item_dependencies" USING "btree" ("product_id", "successor_work_item_id", "status", "id");



CREATE UNIQUE INDEX "work_items_active_linear_order_uidx" ON "public"."work_items" USING "btree" ("product_id", "flow_order") WHERE (("product_id" IS NOT NULL) AND ("status" = 'AKTIF'::"text") AND ("flow_mode" = 'BERANTAI'::"text") AND ("flow_order" IS NOT NULL));



CREATE INDEX "work_items_flow_idx" ON "public"."work_items" USING "btree" ("product_id", "flow_mode", "flow_order", "id") WHERE (("product_id" IS NOT NULL) AND ("status" = 'AKTIF'::"text"));



CREATE INDEX "work_items_manager_progress_idx" ON "public"."work_items" USING "btree" ("product_id", "status", "output_final", "id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "work_items_manual_result_profile_idx" ON "public"."work_items" USING "btree" ("project_id", "product_id", "status", "executor_scope", "submission_category", "id");



CREATE UNIQUE INDEX "work_items_one_output_final_uq" ON "public"."work_items" USING "btree" ("project_id", COALESCE("product_id", (0)::bigint)) WHERE ("output_final" = true);



CREATE UNIQUE INDEX "work_items_product_name_uq" ON "public"."work_items" USING "btree" ("project_id", COALESCE("product_id", (0)::bigint), "lower"("btrim"("name")));



CREATE INDEX "work_items_product_route_idx" ON "public"."work_items" USING "btree" ("product_id", "display_order", "id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "work_items_product_status_idx" ON "public"."work_items" USING "btree" ("project_id", "product_id", "status");



CREATE INDEX "workers_active_department_idx" ON "public"."workers" USING "btree" ("status", "department", "position");



CREATE INDEX "workers_finger_normalized_idx" ON "public"."workers" USING "btree" ("public"."smpt_normalize_finger_id"("finger_id")) WHERE (("finger_id" IS NOT NULL) AND ("btrim"("finger_id") <> ''::"text"));



CREATE INDEX "workers_name_idx" ON "public"."workers" USING "btree" ("lower"("name"));



CREATE OR REPLACE VIEW "public"."v_purchase_orders" WITH ("security_invoker"='true') AS
 SELECT "po"."id",
    "po"."po_number",
    "po"."purchase_plan_id",
    "po"."supplier_id",
    "v"."name" AS "supplier_name",
    "po"."order_date",
    "po"."expected_date",
    "po"."currency",
    "po"."status",
    "po"."notes",
    "po"."issued_at",
    "po"."created_at",
    "po"."updated_at",
    (COALESCE("sum"(("pol"."ordered_quantity" * "pol"."unit_price")), (0)::numeric))::numeric(18,2) AS "total_amount",
    (COALESCE("sum"("pol"."ordered_stock_quantity"), (0)::numeric))::numeric(18,4) AS "ordered_stock_quantity",
    (COALESCE("sum"("pol"."received_stock_quantity"), (0)::numeric))::numeric(18,4) AS "received_stock_quantity"
   FROM (("public"."purchase_orders" "po"
     JOIN "public"."vendors" "v" ON (("v"."id" = "po"."supplier_id")))
     LEFT JOIN "public"."purchase_order_lines" "pol" ON ((("pol"."purchase_order_id" = "po"."id") AND ("pol"."status" <> 'CANCELLED'::"text"))))
  GROUP BY "po"."id", "v"."name";



CREATE OR REPLACE TRIGGER "attendance_set_updated_at" BEFORE UPDATE ON "public"."attendance_records" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "audit_attendance_records" AFTER INSERT OR DELETE OR UPDATE ON "public"."attendance_records" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_cash_advances" AFTER INSERT OR DELETE OR UPDATE ON "public"."cash_advances" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_embarkation_shipments" AFTER INSERT OR DELETE OR UPDATE ON "public"."embarkation_shipments" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_manufacturing_transactions" AFTER INSERT OR DELETE OR UPDATE ON "public"."manufacturing_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_material_lots" AFTER INSERT OR DELETE OR UPDATE ON "public"."material_lots" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_operator_payroll_runs" AFTER INSERT OR DELETE OR UPDATE ON "public"."operator_payroll_runs" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_payroll_runs" AFTER INSERT OR DELETE OR UPDATE ON "public"."payroll_runs" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_petty_cash_transactions" AFTER INSERT OR DELETE OR UPDATE ON "public"."petty_cash_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_production_anomalies" AFTER INSERT OR DELETE OR UPDATE ON "public"."production_anomalies" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_production_checks" AFTER INSERT OR DELETE OR UPDATE ON "public"."production_checks" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_production_orders" AFTER INSERT OR DELETE OR UPDATE ON "public"."production_orders" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_qc_inspections" AFTER INSERT OR DELETE OR UPDATE ON "public"."qc_inspections" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_qc_reworks" AFTER INSERT OR DELETE OR UPDATE ON "public"."qc_reworks" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "audit_work_item_dependencies" AFTER INSERT OR DELETE OR UPDATE ON "public"."work_item_dependencies" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_audit_row_change"();



CREATE OR REPLACE TRIGGER "bom_requirements_updated_audit" BEFORE UPDATE ON "public"."bom_requirements" FOR EACH ROW EXECUTE FUNCTION "public"."set_master_updated_audit"();



CREATE OR REPLACE TRIGGER "cutting_components_set_updated_at" BEFORE UPDATE ON "public"."cutting_components" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "embarkation_shipments_set_updated_at" BEFORE UPDATE ON "public"."embarkation_shipments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "embarkations_set_updated_at" BEFORE UPDATE ON "public"."embarkations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "finished_goods_set_updated_at" BEFORE UPDATE ON "public"."finished_goods" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "finished_goods_validate_relations" BEFORE INSERT OR UPDATE OF "project_id", "product_id", "final_work_item_id" ON "public"."finished_goods" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_validate_finished_good_relations"();



CREATE OR REPLACE TRIGGER "locations_set_updated_at" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "logistics_events_immutable" BEFORE DELETE OR UPDATE ON "public"."logistics_stock_events" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_reject_logistics_history_mutation"();



CREATE OR REPLACE TRIGGER "logistics_ledger_immutable" BEFORE DELETE OR UPDATE ON "public"."logistics_stock_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_reject_logistics_history_mutation"();



CREATE OR REPLACE TRIGGER "material_request_items_set_updated_at" BEFORE UPDATE ON "public"."material_request_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "material_requests_set_updated_at" BEFORE UPDATE ON "public"."material_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "material_suppliers_set_updated_at" BEFORE UPDATE ON "public"."material_suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "materials_updated_audit" BEFORE UPDATE ON "public"."materials" FOR EACH ROW EXECUTE FUNCTION "public"."set_master_updated_audit"();



CREATE OR REPLACE TRIGGER "payroll_attendance_reviews_set_updated_at" BEFORE UPDATE ON "public"."payroll_attendance_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "product_set_components_validate_project" BEFORE INSERT OR UPDATE OF "set_id", "finished_good_id" ON "public"."product_set_components" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_validate_set_component_project"();



CREATE OR REPLACE TRIGGER "product_sets_set_updated_at" BEFORE UPDATE ON "public"."product_sets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "production_order_items_set_updated_at" BEFORE UPDATE ON "public"."production_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "production_orders_set_updated_at" BEFORE UPDATE ON "public"."production_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "project_products_updated_audit" BEFORE UPDATE ON "public"."project_products" FOR EACH ROW EXECUTE FUNCTION "public"."set_master_updated_audit"();



CREATE OR REPLACE TRIGGER "projects_updated_audit" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_master_updated_audit"();



CREATE OR REPLACE TRIGGER "purchase_order_lines_set_updated_at" BEFORE UPDATE ON "public"."purchase_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "purchase_orders_set_updated_at" BEFORE UPDATE ON "public"."purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "purchase_plan_lines_set_updated_at" BEFORE UPDATE ON "public"."purchase_plan_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "purchase_plans_set_updated_at" BEFORE UPDATE ON "public"."purchase_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_attendance_import_batches" AFTER INSERT ON "public"."attendance_import_batches" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_attendance_import_rows" AFTER INSERT ON "public"."attendance_import_rows" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_attendance_month_closures" AFTER INSERT ON "public"."attendance_month_closures" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_attendance_records" AFTER INSERT ON "public"."attendance_records" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_bom_requirements" AFTER INSERT ON "public"."bom_requirements" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_cash_advance_payments" AFTER INSERT ON "public"."cash_advance_payments" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_cash_advances" AFTER INSERT ON "public"."cash_advances" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_cutting_components" AFTER INSERT ON "public"."cutting_components" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_cutting_daily_results" AFTER INSERT ON "public"."cutting_daily_results" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_cutting_material_usages" AFTER INSERT ON "public"."cutting_material_usages" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_embarkation_issues" AFTER INSERT ON "public"."embarkation_issues" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_embarkation_shipments" AFTER INSERT ON "public"."embarkation_shipments" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_embarkation_targets" AFTER INSERT ON "public"."embarkation_targets" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_embarkations" AFTER INSERT ON "public"."embarkations" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_external_finished_receipts" AFTER INSERT ON "public"."external_finished_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_finance_transactions" AFTER INSERT ON "public"."finance_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_finished_goods" AFTER INSERT ON "public"."finished_goods" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_finished_goods_transfers" AFTER INSERT ON "public"."finished_goods_transfers" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_locations" AFTER INSERT ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_logistics_stock_balances" AFTER INSERT ON "public"."logistics_stock_balances" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_logistics_stock_events" AFTER INSERT ON "public"."logistics_stock_events" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_logistics_stock_ledger" AFTER INSERT ON "public"."logistics_stock_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_manufacturing_transactions" AFTER INSERT ON "public"."manufacturing_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_material_lots" AFTER INSERT ON "public"."material_lots" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_material_request_items" AFTER INSERT ON "public"."material_request_items" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_material_requests" AFTER INSERT ON "public"."material_requests" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_material_suppliers" AFTER INSERT ON "public"."material_suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_materials" AFTER INSERT ON "public"."materials" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_operator_payroll_items" AFTER INSERT ON "public"."operator_payroll_items" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_operator_payroll_runs" AFTER INSERT ON "public"."operator_payroll_runs" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_packing_runs" AFTER INSERT ON "public"."packing_runs" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_payroll_attendance_reviews" AFTER INSERT ON "public"."payroll_attendance_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_payroll_payout_adjustments" AFTER INSERT ON "public"."payroll_payout_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_payroll_payout_deductions" AFTER INSERT ON "public"."payroll_payout_deductions" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_payroll_payout_details" AFTER INSERT ON "public"."payroll_payout_details" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_payroll_payouts" AFTER INSERT ON "public"."payroll_payouts" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_payroll_run_details" AFTER INSERT ON "public"."payroll_run_details" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_payroll_run_items" AFTER INSERT ON "public"."payroll_run_items" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_payroll_runs" AFTER INSERT ON "public"."payroll_runs" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_petty_cash_transactions" AFTER INSERT ON "public"."petty_cash_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_product_set_components" AFTER INSERT ON "public"."product_set_components" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_product_sets" AFTER INSERT ON "public"."product_sets" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_production_anomalies" AFTER INSERT ON "public"."production_anomalies" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_production_checks" AFTER INSERT ON "public"."production_checks" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_production_manual_results" AFTER INSERT ON "public"."production_manual_results" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_production_order_items" AFTER INSERT ON "public"."production_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_production_orders" AFTER INSERT ON "public"."production_orders" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_production_wip_consumptions" AFTER INSERT ON "public"."production_wip_consumptions" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_project_products" AFTER INSERT ON "public"."project_products" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_projects" AFTER INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_purchase_order_lines" AFTER INSERT ON "public"."purchase_order_lines" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_purchase_orders" AFTER INSERT ON "public"."purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_purchase_plan_lines" AFTER INSERT ON "public"."purchase_plan_lines" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_purchase_plans" AFTER INSERT ON "public"."purchase_plans" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_qc_inspections" AFTER INSERT ON "public"."qc_inspections" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_qc_reworks" AFTER INSERT ON "public"."qc_reworks" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_ready_production_usage_lots" AFTER INSERT ON "public"."ready_production_usage_lots" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_ready_production_usages" AFTER INSERT ON "public"."ready_production_usages" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_salary_submissions" AFTER INSERT ON "public"."salary_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_stock_balances" AFTER INSERT ON "public"."stock_balances" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_stock_events" AFTER INSERT ON "public"."stock_events" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_stock_ledger_entries" AFTER INSERT ON "public"."stock_ledger_entries" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_vendors" AFTER INSERT ON "public"."vendors" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_warehouse_issue_lots" AFTER INSERT ON "public"."warehouse_issue_lots" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_warehouse_issues" AFTER INSERT ON "public"."warehouse_issues" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_warehouse_receipts" AFTER INSERT ON "public"."warehouse_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_work_item_dependencies" AFTER INSERT ON "public"."work_item_dependencies" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_work_items" AFTER INSERT ON "public"."work_items" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "smpt_test_capture_workers" AFTER INSERT ON "public"."workers" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_capture_test_entity"();



CREATE OR REPLACE TRIGGER "stock_events_immutable" BEFORE DELETE OR UPDATE ON "public"."stock_events" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_reject_stock_history_mutation"();



CREATE OR REPLACE TRIGGER "stock_ledger_immutable" BEFORE DELETE OR UPDATE ON "public"."stock_ledger_entries" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_reject_stock_history_mutation"();



CREATE OR REPLACE TRIGGER "stock_ledger_lot_tracking_guard" BEFORE INSERT ON "public"."stock_ledger_entries" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_guard_lot_tracked_ledger"();



CREATE OR REPLACE TRIGGER "tr_auto_link_worker_on_worker_inserted" BEFORE INSERT ON "public"."workers" FOR EACH ROW EXECUTE FUNCTION "public"."handle_auto_link_worker_on_worker_inserted"();



CREATE OR REPLACE TRIGGER "user_permission_overrides_set_updated_at" BEFORE UPDATE ON "public"."user_permission_overrides" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "user_worker_links_set_updated_at" BEFORE UPDATE ON "public"."user_worker_links" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "vendors_set_updated_at" BEFORE UPDATE ON "public"."vendors" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "warehouse_receipts_set_updated_at" BEFORE UPDATE ON "public"."warehouse_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "work_item_dependencies_validate" BEFORE INSERT OR UPDATE ON "public"."work_item_dependencies" FOR EACH ROW EXECUTE FUNCTION "public"."smpt_validate_work_item_dependency"();



CREATE OR REPLACE TRIGGER "work_items_updated_audit" BEFORE UPDATE ON "public"."work_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_master_updated_audit"();



CREATE OR REPLACE TRIGGER "workers_set_updated_at" BEFORE UPDATE ON "public"."workers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."attendance_import_batches"
    ADD CONSTRAINT "attendance_import_batches_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_import_rows"
    ADD CONSTRAINT "attendance_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."attendance_import_batches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."attendance_import_rows"
    ADD CONSTRAINT "attendance_import_rows_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."attendance_month_closures"
    ADD CONSTRAINT "attendance_month_closures_finalized_by_fkey" FOREIGN KEY ("finalized_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_source_import_row_id_fkey" FOREIGN KEY ("source_import_row_id") REFERENCES "public"."attendance_import_rows"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."audit_events"
    ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bom_requirements"
    ADD CONSTRAINT "bom_requirements_calculated_by_fkey" FOREIGN KEY ("calculated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bom_requirements"
    ADD CONSTRAINT "bom_requirements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bom_requirements"
    ADD CONSTRAINT "bom_requirements_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bom_requirements"
    ADD CONSTRAINT "bom_requirements_product_matches_project_fk" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bom_requirements"
    ADD CONSTRAINT "bom_requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bom_requirements"
    ADD CONSTRAINT "bom_requirements_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bundle_package_balances"
    ADD CONSTRAINT "bundle_package_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bundle_package_balances"
    ADD CONSTRAINT "bundle_package_balances_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."bundle_packages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bundle_package_recipes"
    ADD CONSTRAINT "bundle_package_recipes_finished_good_id_fkey" FOREIGN KEY ("finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bundle_package_recipes"
    ADD CONSTRAINT "bundle_package_recipes_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."bundle_packages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bundle_packing_log_items"
    ADD CONSTRAINT "bundle_packing_log_items_finished_good_id_fkey" FOREIGN KEY ("finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bundle_packing_log_items"
    ADD CONSTRAINT "bundle_packing_log_items_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "public"."bundle_packing_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bundle_packing_logs"
    ADD CONSTRAINT "bundle_packing_logs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bundle_packing_logs"
    ADD CONSTRAINT "bundle_packing_logs_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."bundle_packages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bundle_recipes"
    ADD CONSTRAINT "bundle_recipes_bundle_finished_good_id_fkey" FOREIGN KEY ("bundle_finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bundle_recipes"
    ADD CONSTRAINT "bundle_recipes_component_finished_good_id_fkey" FOREIGN KEY ("component_finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_advance_payments"
    ADD CONSTRAINT "cash_advance_payments_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "public"."cash_advances"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cash_advance_payments"
    ADD CONSTRAINT "cash_advance_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_advances"
    ADD CONSTRAINT "cash_advances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_advances"
    ADD CONSTRAINT "cash_advances_warung_id_fkey" FOREIGN KEY ("warung_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_advances"
    ADD CONSTRAINT "cash_advances_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_components"
    ADD CONSTRAINT "cutting_components_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cutting_components"
    ADD CONSTRAINT "cutting_components_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_components"
    ADD CONSTRAINT "cutting_components_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_components"
    ADD CONSTRAINT "cutting_components_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cutting_daily_results"
    ADD CONSTRAINT "cutting_daily_results_cancellation_event_id_fkey" FOREIGN KEY ("cancellation_event_id") REFERENCES "public"."stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_daily_results"
    ADD CONSTRAINT "cutting_daily_results_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cutting_daily_results"
    ADD CONSTRAINT "cutting_daily_results_cutting_component_id_fkey" FOREIGN KEY ("cutting_component_id") REFERENCES "public"."cutting_components"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_daily_results"
    ADD CONSTRAINT "cutting_daily_results_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_daily_results"
    ADD CONSTRAINT "cutting_daily_results_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_daily_results"
    ADD CONSTRAINT "cutting_daily_results_stock_event_id_fkey" FOREIGN KEY ("stock_event_id") REFERENCES "public"."stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_material_usages"
    ADD CONSTRAINT "cutting_material_usages_bom_requirement_id_fkey" FOREIGN KEY ("bom_requirement_id") REFERENCES "public"."bom_requirements"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_material_usages"
    ADD CONSTRAINT "cutting_material_usages_cancellation_event_id_fkey" FOREIGN KEY ("cancellation_event_id") REFERENCES "public"."stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_material_usages"
    ADD CONSTRAINT "cutting_material_usages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cutting_material_usages"
    ADD CONSTRAINT "cutting_material_usages_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_material_usages"
    ADD CONSTRAINT "cutting_material_usages_material_lot_id_fkey" FOREIGN KEY ("material_lot_id") REFERENCES "public"."material_lots"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_material_usages"
    ADD CONSTRAINT "cutting_material_usages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_material_usages"
    ADD CONSTRAINT "cutting_material_usages_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cutting_material_usages"
    ADD CONSTRAINT "cutting_material_usages_stock_event_id_fkey" FOREIGN KEY ("stock_event_id") REFERENCES "public"."stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."embarkation_issues"
    ADD CONSTRAINT "embarkation_issues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."embarkation_issues"
    ADD CONSTRAINT "embarkation_issues_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "public"."embarkation_shipments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."embarkation_shipments"
    ADD CONSTRAINT "embarkation_shipments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."embarkation_shipments"
    ADD CONSTRAINT "embarkation_shipments_return_event_id_fkey" FOREIGN KEY ("return_event_id") REFERENCES "public"."logistics_stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."embarkation_shipments"
    ADD CONSTRAINT "embarkation_shipments_sent_event_id_fkey" FOREIGN KEY ("sent_event_id") REFERENCES "public"."logistics_stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."embarkation_shipments"
    ADD CONSTRAINT "embarkation_shipments_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."embarkation_shipments"
    ADD CONSTRAINT "embarkation_shipments_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."embarkation_targets"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."embarkation_targets"
    ADD CONSTRAINT "embarkation_targets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."embarkation_targets"
    ADD CONSTRAINT "embarkation_targets_embarkation_id_fkey" FOREIGN KEY ("embarkation_id") REFERENCES "public"."embarkations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."embarkation_targets"
    ADD CONSTRAINT "embarkation_targets_finished_good_id_fkey" FOREIGN KEY ("finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."embarkation_targets"
    ADD CONSTRAINT "embarkation_targets_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "public"."product_sets"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."embarkations"
    ADD CONSTRAINT "embarkations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."external_finished_receipts"
    ADD CONSTRAINT "external_finished_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."external_finished_receipts"
    ADD CONSTRAINT "external_finished_receipts_finished_good_id_fkey" FOREIGN KEY ("finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."external_finished_receipts"
    ADD CONSTRAINT "external_finished_receipts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."external_finished_receipts"
    ADD CONSTRAINT "external_finished_receipts_stock_event_id_fkey" FOREIGN KEY ("stock_event_id") REFERENCES "public"."logistics_stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."external_finished_receipts"
    ADD CONSTRAINT "external_finished_receipts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."finance_transactions"
    ADD CONSTRAINT "finance_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finished_goods_bundling"
    ADD CONSTRAINT "finished_goods_bundling_bundle_finished_good_id_fkey" FOREIGN KEY ("bundle_finished_good_id") REFERENCES "public"."finished_goods"("id");



ALTER TABLE ONLY "public"."finished_goods_bundling"
    ADD CONSTRAINT "finished_goods_bundling_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."finished_goods_bundling_items"
    ADD CONSTRAINT "finished_goods_bundling_items_bundling_id_fkey" FOREIGN KEY ("bundling_id") REFERENCES "public"."finished_goods_bundling"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finished_goods_bundling_items"
    ADD CONSTRAINT "finished_goods_bundling_items_component_finished_good_id_fkey" FOREIGN KEY ("component_finished_good_id") REFERENCES "public"."finished_goods"("id");



ALTER TABLE ONLY "public"."finished_goods_bundling"
    ADD CONSTRAINT "finished_goods_bundling_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."finished_goods"
    ADD CONSTRAINT "finished_goods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finished_goods"
    ADD CONSTRAINT "finished_goods_final_work_item_id_fkey" FOREIGN KEY ("final_work_item_id") REFERENCES "public"."work_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."finished_goods"
    ADD CONSTRAINT "finished_goods_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."finished_goods"
    ADD CONSTRAINT "finished_goods_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."finished_goods_transfers"
    ADD CONSTRAINT "finished_goods_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finished_goods_transfers"
    ADD CONSTRAINT "finished_goods_transfers_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."finished_goods_transfers"
    ADD CONSTRAINT "finished_goods_transfers_finished_good_id_fkey" FOREIGN KEY ("finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."finished_goods_transfers"
    ADD CONSTRAINT "finished_goods_transfers_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."bundle_packages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finished_goods_transfers"
    ADD CONSTRAINT "finished_goods_transfers_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."finished_goods_transfers"
    ADD CONSTRAINT "finished_goods_transfers_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."finished_goods_transfers"
    ADD CONSTRAINT "finished_goods_transfers_stock_event_id_fkey" FOREIGN KEY ("stock_event_id") REFERENCES "public"."logistics_stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."finished_goods"
    ADD CONSTRAINT "finished_goods_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."logistics_stock_balances"
    ADD CONSTRAINT "logistics_stock_balances_finished_good_id_fkey" FOREIGN KEY ("finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."logistics_stock_balances"
    ADD CONSTRAINT "logistics_stock_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."logistics_stock_balances"
    ADD CONSTRAINT "logistics_stock_balances_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "public"."product_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."logistics_stock_events"
    ADD CONSTRAINT "logistics_stock_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."logistics_stock_events"
    ADD CONSTRAINT "logistics_stock_events_reversal_of_event_id_fkey" FOREIGN KEY ("reversal_of_event_id") REFERENCES "public"."logistics_stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."logistics_stock_ledger"
    ADD CONSTRAINT "logistics_stock_ledger_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."logistics_stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."logistics_stock_ledger"
    ADD CONSTRAINT "logistics_stock_ledger_finished_good_id_fkey" FOREIGN KEY ("finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."logistics_stock_ledger"
    ADD CONSTRAINT "logistics_stock_ledger_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."logistics_stock_ledger"
    ADD CONSTRAINT "logistics_stock_ledger_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "public"."product_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manufacturing_transactions"
    ADD CONSTRAINT "manufacturing_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manufacturing_transactions"
    ADD CONSTRAINT "manufacturing_transactions_finished_good_id_fkey" FOREIGN KEY ("finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."manufacturing_transactions"
    ADD CONSTRAINT "manufacturing_transactions_logistics_event_id_fkey" FOREIGN KEY ("logistics_event_id") REFERENCES "public"."logistics_stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."manufacturing_transactions"
    ADD CONSTRAINT "manufacturing_transactions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."manufacturing_transactions"
    ADD CONSTRAINT "manufacturing_transactions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."manufacturing_transactions"
    ADD CONSTRAINT "manufacturing_transactions_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."manufacturing_transactions"
    ADD CONSTRAINT "manufacturing_transactions_raw_stock_event_id_fkey" FOREIGN KEY ("raw_stock_event_id") REFERENCES "public"."stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."manufacturing_transactions"
    ADD CONSTRAINT "manufacturing_transactions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_lots"
    ADD CONSTRAINT "material_lots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."material_lots"
    ADD CONSTRAINT "material_lots_current_bom_requirement_id_fkey" FOREIGN KEY ("current_bom_requirement_id") REFERENCES "public"."bom_requirements"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_lots"
    ADD CONSTRAINT "material_lots_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "public"."stock_locations"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_lots"
    ADD CONSTRAINT "material_lots_current_product_fk" FOREIGN KEY ("current_project_id", "current_product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_lots"
    ADD CONSTRAINT "material_lots_current_project_id_fkey" FOREIGN KEY ("current_project_id") REFERENCES "public"."projects"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_lots"
    ADD CONSTRAINT "material_lots_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_lots"
    ADD CONSTRAINT "material_lots_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."warehouse_receipts"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_lots"
    ADD CONSTRAINT "material_lots_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."material_request_items"
    ADD CONSTRAINT "material_request_items_bom_requirement_id_fkey" FOREIGN KEY ("bom_requirement_id") REFERENCES "public"."bom_requirements"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_request_items"
    ADD CONSTRAINT "material_request_items_cutting_component_id_fkey" FOREIGN KEY ("cutting_component_id") REFERENCES "public"."cutting_components"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_request_items"
    ADD CONSTRAINT "material_request_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_request_items"
    ADD CONSTRAINT "material_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."material_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_requests"
    ADD CONSTRAINT "material_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."material_requests"
    ADD CONSTRAINT "material_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_requests"
    ADD CONSTRAINT "material_requests_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_requests"
    ADD CONSTRAINT "material_requests_supervisor_worker_id_fkey" FOREIGN KEY ("supervisor_worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_requests"
    ADD CONSTRAINT "material_requests_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."material_suppliers"
    ADD CONSTRAINT "material_suppliers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."material_suppliers"
    ADD CONSTRAINT "material_suppliers_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_suppliers"
    ADD CONSTRAINT "material_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."vendors"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_suppliers"
    ADD CONSTRAINT "material_suppliers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operator_payroll_items"
    ADD CONSTRAINT "operator_payroll_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."operator_payroll_runs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."operator_payroll_items"
    ADD CONSTRAINT "operator_payroll_items_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."operator_payroll_items"
    ADD CONSTRAINT "operator_payroll_items_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."operator_payroll_runs"
    ADD CONSTRAINT "operator_payroll_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."packing_runs"
    ADD CONSTRAINT "packing_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."packing_runs"
    ADD CONSTRAINT "packing_runs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."packing_runs"
    ADD CONSTRAINT "packing_runs_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "public"."product_sets"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."packing_runs"
    ADD CONSTRAINT "packing_runs_stock_event_id_fkey" FOREIGN KEY ("stock_event_id") REFERENCES "public"."logistics_stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_attendance_reviews"
    ADD CONSTRAINT "payroll_attendance_reviews_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance_records"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_attendance_reviews"
    ADD CONSTRAINT "payroll_attendance_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payroll_payout_adjustments"
    ADD CONSTRAINT "payroll_payout_adjustments_source_payout_detail_id_fkey" FOREIGN KEY ("source_payout_detail_id") REFERENCES "public"."payroll_payout_details"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_payout_adjustments"
    ADD CONSTRAINT "payroll_payout_adjustments_target_payout_id_fkey" FOREIGN KEY ("target_payout_id") REFERENCES "public"."payroll_payouts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_payout_adjustments"
    ADD CONSTRAINT "payroll_payout_adjustments_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_payout_deductions"
    ADD CONSTRAINT "payroll_payout_deductions_cash_advance_id_fkey" FOREIGN KEY ("cash_advance_id") REFERENCES "public"."cash_advances"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_payout_deductions"
    ADD CONSTRAINT "payroll_payout_deductions_cash_advance_payment_id_fkey" FOREIGN KEY ("cash_advance_payment_id") REFERENCES "public"."cash_advance_payments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_payout_deductions"
    ADD CONSTRAINT "payroll_payout_deductions_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."payroll_payouts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_payout_deductions"
    ADD CONSTRAINT "payroll_payout_deductions_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_payout_details"
    ADD CONSTRAINT "payroll_payout_details_friday_attendance_id_fkey" FOREIGN KEY ("friday_attendance_id") REFERENCES "public"."attendance_records"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_payout_details"
    ADD CONSTRAINT "payroll_payout_details_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."payroll_payouts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_payout_details"
    ADD CONSTRAINT "payroll_payout_details_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_payouts"
    ADD CONSTRAINT "payroll_payouts_finalized_by_fkey" FOREIGN KEY ("finalized_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payroll_payouts"
    ADD CONSTRAINT "payroll_payouts_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payroll_run_details"
    ADD CONSTRAINT "payroll_run_details_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance_records"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_run_details"
    ADD CONSTRAINT "payroll_run_details_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_run_details"
    ADD CONSTRAINT "payroll_run_details_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_run_items"
    ADD CONSTRAINT "payroll_run_items_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_run_items"
    ADD CONSTRAINT "payroll_run_items_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_runs"
    ADD CONSTRAINT "payroll_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payroll_settings"
    ADD CONSTRAINT "payroll_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."petty_cash_transactions"
    ADD CONSTRAINT "petty_cash_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_set_components"
    ADD CONSTRAINT "product_set_components_finished_good_id_fkey" FOREIGN KEY ("finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."product_set_components"
    ADD CONSTRAINT "product_set_components_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "public"."product_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_sets"
    ADD CONSTRAINT "product_sets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_sets"
    ADD CONSTRAINT "product_sets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_anomalies"
    ADD CONSTRAINT "production_anomalies_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_anomalies"
    ADD CONSTRAINT "production_anomalies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_anomalies"
    ADD CONSTRAINT "production_anomalies_dependency_id_fkey" FOREIGN KEY ("dependency_id") REFERENCES "public"."work_item_dependencies"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_anomalies"
    ADD CONSTRAINT "production_anomalies_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."project_products"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_anomalies"
    ADD CONSTRAINT "production_anomalies_production_check_id_fkey" FOREIGN KEY ("production_check_id") REFERENCES "public"."production_checks"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_anomalies"
    ADD CONSTRAINT "production_anomalies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_anomalies"
    ADD CONSTRAINT "production_anomalies_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_anomalies"
    ADD CONSTRAINT "production_anomalies_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_checks"
    ADD CONSTRAINT "production_checks_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_checks"
    ADD CONSTRAINT "production_checks_checker_user_id_fkey" FOREIGN KEY ("checker_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_checks"
    ADD CONSTRAINT "production_checks_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."production_order_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_manual_results"
    ADD CONSTRAINT "production_manual_results_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_manual_results"
    ADD CONSTRAINT "production_manual_results_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_manual_results"
    ADD CONSTRAINT "production_manual_results_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_manual_results"
    ADD CONSTRAINT "production_manual_results_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_manual_results"
    ADD CONSTRAINT "production_manual_results_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_manual_results"
    ADD CONSTRAINT "production_manual_results_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_order_items"
    ADD CONSTRAINT "production_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."production_orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_order_items"
    ADD CONSTRAINT "production_order_items_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_operator_worker_id_fkey" FOREIGN KEY ("operator_worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_supervisor_worker_id_fkey" FOREIGN KEY ("supervisor_worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_orders"
    ADD CONSTRAINT "production_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_wip_consumptions"
    ADD CONSTRAINT "production_wip_consumptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_wip_consumptions"
    ADD CONSTRAINT "production_wip_consumptions_dependency_id_fkey" FOREIGN KEY ("dependency_id") REFERENCES "public"."work_item_dependencies"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_wip_consumptions"
    ADD CONSTRAINT "production_wip_consumptions_predecessor_work_item_id_fkey" FOREIGN KEY ("predecessor_work_item_id") REFERENCES "public"."work_items"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_wip_consumptions"
    ADD CONSTRAINT "production_wip_consumptions_production_check_id_fkey" FOREIGN KEY ("production_check_id") REFERENCES "public"."production_checks"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_wip_consumptions"
    ADD CONSTRAINT "production_wip_consumptions_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."production_wip_consumptions"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."production_wip_consumptions"
    ADD CONSTRAINT "production_wip_consumptions_successor_work_item_id_fkey" FOREIGN KEY ("successor_work_item_id") REFERENCES "public"."work_items"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."project_products"
    ADD CONSTRAINT "project_products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_products"
    ADD CONSTRAINT "project_products_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."project_products"
    ADD CONSTRAINT "project_products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_repeat_source_project_fk" FOREIGN KEY ("repeat_source_project_id") REFERENCES "public"."projects"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_purchase_plan_line_id_fkey" FOREIGN KEY ("purchase_plan_line_id") REFERENCES "public"."purchase_plan_lines"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_purchase_plan_id_fkey" FOREIGN KEY ("purchase_plan_id") REFERENCES "public"."purchase_plans"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."vendors"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_plan_lines"
    ADD CONSTRAINT "purchase_plan_lines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_plan_lines"
    ADD CONSTRAINT "purchase_plan_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_plan_lines"
    ADD CONSTRAINT "purchase_plan_lines_purchase_plan_id_fkey" FOREIGN KEY ("purchase_plan_id") REFERENCES "public"."purchase_plans"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_plan_lines"
    ADD CONSTRAINT "purchase_plan_lines_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."vendors"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_plan_lines"
    ADD CONSTRAINT "purchase_plan_lines_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_plans"
    ADD CONSTRAINT "purchase_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_plans"
    ADD CONSTRAINT "purchase_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_plans"
    ADD CONSTRAINT "purchase_plans_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."purchase_plans"
    ADD CONSTRAINT "purchase_plans_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."qc_inspections"
    ADD CONSTRAINT "qc_inspections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."qc_inspections"
    ADD CONSTRAINT "qc_inspections_finished_good_id_fkey" FOREIGN KEY ("finished_good_id") REFERENCES "public"."finished_goods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."qc_inspections"
    ADD CONSTRAINT "qc_inspections_production_check_id_fkey" FOREIGN KEY ("production_check_id") REFERENCES "public"."production_checks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."qc_inspections"
    ADD CONSTRAINT "qc_inspections_stock_event_id_fkey" FOREIGN KEY ("stock_event_id") REFERENCES "public"."logistics_stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."qc_reworks"
    ADD CONSTRAINT "qc_reworks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."qc_reworks"
    ADD CONSTRAINT "qc_reworks_qc_inspection_id_fkey" FOREIGN KEY ("qc_inspection_id") REFERENCES "public"."qc_inspections"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."qc_reworks"
    ADD CONSTRAINT "qc_reworks_stock_event_id_fkey" FOREIGN KEY ("stock_event_id") REFERENCES "public"."logistics_stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ready_production_usage_lots"
    ADD CONSTRAINT "ready_production_usage_lots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ready_production_usage_lots"
    ADD CONSTRAINT "ready_production_usage_lots_material_lot_id_fkey" FOREIGN KEY ("material_lot_id") REFERENCES "public"."material_lots"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ready_production_usage_lots"
    ADD CONSTRAINT "ready_production_usage_lots_usage_id_fkey" FOREIGN KEY ("usage_id") REFERENCES "public"."ready_production_usages"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_bom_requirement_id_fkey" FOREIGN KEY ("bom_requirement_id") REFERENCES "public"."bom_requirements"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_cancellation_event_id_fkey" FOREIGN KEY ("cancellation_event_id") REFERENCES "public"."stock_events"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_cutting_component_id_fkey" FOREIGN KEY ("cutting_component_id") REFERENCES "public"."cutting_components"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_material_lot_id_fkey" FOREIGN KEY ("material_lot_id") REFERENCES "public"."material_lots"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_stock_event_id_fkey" FOREIGN KEY ("stock_event_id") REFERENCES "public"."stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ready_production_usages"
    ADD CONSTRAINT "ready_production_usages_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salary_submissions"
    ADD CONSTRAINT "salary_submissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."salary_submissions"
    ADD CONSTRAINT "salary_submissions_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."salary_submissions"
    ADD CONSTRAINT "salary_submissions_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."payroll_payouts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_bom_requirement_id_fkey" FOREIGN KEY ("bom_requirement_id") REFERENCES "public"."bom_requirements"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_cutting_component_id_fkey" FOREIGN KEY ("cutting_component_id") REFERENCES "public"."cutting_components"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_balances"
    ADD CONSTRAINT "stock_balances_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_events"
    ADD CONSTRAINT "stock_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_events"
    ADD CONSTRAINT "stock_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_events"
    ADD CONSTRAINT "stock_events_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_events"
    ADD CONSTRAINT "stock_events_reversal_of_event_id_fkey" FOREIGN KEY ("reversal_of_event_id") REFERENCES "public"."stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_events"
    ADD CONSTRAINT "stock_events_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_ledger_entries"
    ADD CONSTRAINT "stock_ledger_entries_bom_requirement_id_fkey" FOREIGN KEY ("bom_requirement_id") REFERENCES "public"."bom_requirements"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_ledger_entries"
    ADD CONSTRAINT "stock_ledger_entries_cutting_component_id_fkey" FOREIGN KEY ("cutting_component_id") REFERENCES "public"."cutting_components"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_ledger_entries"
    ADD CONSTRAINT "stock_ledger_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_ledger_entries"
    ADD CONSTRAINT "stock_ledger_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_ledger_entries"
    ADD CONSTRAINT "stock_ledger_entries_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_ledger_entries"
    ADD CONSTRAINT "stock_ledger_entries_material_lot_id_fkey" FOREIGN KEY ("material_lot_id") REFERENCES "public"."material_lots"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_ledger_entries"
    ADD CONSTRAINT "stock_ledger_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_ledger_entries"
    ADD CONSTRAINT "stock_ledger_entries_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_ledger_entries"
    ADD CONSTRAINT "stock_ledger_entries_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."system_data_backups"
    ADD CONSTRAINT "system_data_backups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_data_backups"
    ADD CONSTRAINT "system_data_backups_last_restored_by_fkey" FOREIGN KEY ("last_restored_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_test_run_entities"
    ADD CONSTRAINT "system_test_run_entities_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."system_test_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_test_runs"
    ADD CONSTRAINT "system_test_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_permission_overrides"
    ADD CONSTRAINT "user_permission_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_permission_overrides"
    ADD CONSTRAINT "user_permission_overrides_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_permission_overrides"
    ADD CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_worker_links"
    ADD CONSTRAINT "user_worker_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_worker_links"
    ADD CONSTRAINT "user_worker_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_worker_links"
    ADD CONSTRAINT "user_worker_links_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vendor_delivery_logs"
    ADD CONSTRAINT "vendor_delivery_logs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_down_payments"
    ADD CONSTRAINT "vendor_down_payments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_po_targets"
    ADD CONSTRAINT "vendor_po_targets_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warehouse_issue_lots"
    ADD CONSTRAINT "warehouse_issue_lots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warehouse_issue_lots"
    ADD CONSTRAINT "warehouse_issue_lots_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."warehouse_issues"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_issue_lots"
    ADD CONSTRAINT "warehouse_issue_lots_material_lot_id_fkey" FOREIGN KEY ("material_lot_id") REFERENCES "public"."material_lots"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_bom_requirement_id_fkey" FOREIGN KEY ("bom_requirement_id") REFERENCES "public"."bom_requirements"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_cutting_component_id_fkey" FOREIGN KEY ("cutting_component_id") REFERENCES "public"."cutting_components"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_project_id_product_id_fkey" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_recipient_worker_id_fkey" FOREIGN KEY ("recipient_worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."material_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "public"."material_request_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_stock_event_id_fkey" FOREIGN KEY ("stock_event_id") REFERENCES "public"."stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_issues"
    ADD CONSTRAINT "warehouse_issues_supervisor_worker_id_fkey" FOREIGN KEY ("supervisor_worker_id") REFERENCES "public"."workers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_receipts"
    ADD CONSTRAINT "warehouse_receipts_base_event_id_fkey" FOREIGN KEY ("base_event_id") REFERENCES "public"."stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_receipts"
    ADD CONSTRAINT "warehouse_receipts_cancellation_event_id_fkey" FOREIGN KEY ("cancellation_event_id") REFERENCES "public"."stock_events"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_receipts"
    ADD CONSTRAINT "warehouse_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warehouse_receipts"
    ADD CONSTRAINT "warehouse_receipts_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_receipts"
    ADD CONSTRAINT "warehouse_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_receipts"
    ADD CONSTRAINT "warehouse_receipts_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_receipts"
    ADD CONSTRAINT "warehouse_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."vendors"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouse_receipts"
    ADD CONSTRAINT "warehouse_receipts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warung_transaction_items"
    ADD CONSTRAINT "warung_transaction_items_cash_advance_id_fkey" FOREIGN KEY ("cash_advance_id") REFERENCES "public"."cash_advances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_item_dependencies"
    ADD CONSTRAINT "work_item_dependencies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_item_dependencies"
    ADD CONSTRAINT "work_item_dependencies_predecessor_work_item_id_fkey" FOREIGN KEY ("predecessor_work_item_id") REFERENCES "public"."work_items"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_item_dependencies"
    ADD CONSTRAINT "work_item_dependencies_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."project_products"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_item_dependencies"
    ADD CONSTRAINT "work_item_dependencies_successor_work_item_id_fkey" FOREIGN KEY ("successor_work_item_id") REFERENCES "public"."work_items"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_item_dependencies"
    ADD CONSTRAINT "work_item_dependencies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_items"
    ADD CONSTRAINT "work_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."work_items"
    ADD CONSTRAINT "work_items_product_matches_project_fk" FOREIGN KEY ("project_id", "product_id") REFERENCES "public"."project_products"("project_id", "id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_items"
    ADD CONSTRAINT "work_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."work_items"
    ADD CONSTRAINT "work_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Allow all bundle_recipes" ON "public"."bundle_recipes" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all embarkation_issues" ON "public"."embarkation_issues" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all embarkation_shipments" ON "public"."embarkation_shipments" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all embarkation_targets" ON "public"."embarkation_targets" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all embarkations" ON "public"."embarkations" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all finished_goods" ON "public"."finished_goods" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all for authenticated operator_payroll_items" ON "public"."operator_payroll_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all for authenticated operator_payroll_runs" ON "public"."operator_payroll_runs" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all for authenticated production_checks" ON "public"."production_checks" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all for authenticated production_order_items" ON "public"."production_order_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all for authenticated production_orders" ON "public"."production_orders" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all logistics_stock_balances" ON "public"."logistics_stock_balances" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all logistics_stock_ledger" ON "public"."logistics_stock_ledger" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all product_set_components" ON "public"."product_set_components" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all vendor_delivery_logs" ON "public"."vendor_delivery_logs" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all vendor_down_payments" ON "public"."vendor_down_payments" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all vendor_po_targets" ON "public"."vendor_po_targets" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all vendors" ON "public"."vendors" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated to manage production_order_items" ON "public"."production_order_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow delete attendance_records" ON "public"."attendance_records" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow delete cash_advances" ON "public"."cash_advances" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow delete product_sets" ON "public"."product_sets" FOR DELETE USING (true);



CREATE POLICY "Allow update cash_advances" ON "public"."cash_advances" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated access bundle_package_balances" ON "public"."bundle_package_balances" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated access bundle_package_recipes" ON "public"."bundle_package_recipes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated access bundle_packages" ON "public"."bundle_packages" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated access bundle_packing_log_items" ON "public"."bundle_packing_log_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated access bundle_packing_logs" ON "public"."bundle_packing_logs" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable delete for authenticated users" ON "public"."petty_cash_transactions" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Enable update for authenticated users" ON "public"."petty_cash_transactions" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Izinkan admin menghapus induk payroll" ON "public"."payroll_runs" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Izinkan admin menghapus item payroll" ON "public"."payroll_run_items" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Warung hanya dapat mengelola item transaksinya sendiri" ON "public"."warung_transaction_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cash_advances" "ca"
  WHERE (("ca"."id" = "warung_transaction_items"."cash_advance_id") AND (("ca"."warung_id" = "auth"."uid"()) OR (("auth"."jwt"() ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'mandor'::"text", 'manager'::"text"]))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cash_advances" "ca"
  WHERE (("ca"."id" = "warung_transaction_items"."cash_advance_id") AND (("ca"."warung_id" = "auth"."uid"()) OR (("auth"."jwt"() ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'mandor'::"text", 'manager'::"text"])))))));



CREATE POLICY "advance_payments_select" ON "public"."cash_advance_payments" FOR SELECT TO "authenticated" USING ("public"."has_permission"('kasbon.view'::"text"));



CREATE POLICY "advances_select" ON "public"."cash_advances" FOR SELECT TO "authenticated" USING (("public"."has_permission"('kasbon.view'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text") OR ("public"."has_permission"('warung.view'::"text") AND ("category" = 'KASBON_WARUNG'::"text")) OR ("worker_id" = "public"."smpt_current_worker_id"())));



CREATE POLICY "advances_write" ON "public"."cash_advances" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_permission"('kasbon.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text") OR ("public"."has_permission"('warung.write'::"text") AND ("category" = 'KASBON_WARUNG'::"text"))));



CREATE POLICY "allow_auth_all_stock_balances" ON "public"."stock_balances" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "allow_auth_all_stock_ledger_entries" ON "public"."stock_ledger_entries" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."attendance_import_batches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_import_batches_select" ON "public"."attendance_import_batches" FOR SELECT TO "authenticated" USING ("public"."has_permission"('absensi.view'::"text"));



ALTER TABLE "public"."attendance_import_rows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_import_rows_select" ON "public"."attendance_import_rows" FOR SELECT TO "authenticated" USING ("public"."has_permission"('absensi.view'::"text"));



ALTER TABLE "public"."attendance_month_closures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_select" ON "public"."attendance_records" FOR SELECT TO "authenticated" USING ("public"."has_permission"('absensi.view'::"text"));



CREATE POLICY "attendance_worker_self_select" ON "public"."attendance_records" FOR SELECT TO "authenticated" USING (("worker_id" = "public"."smpt_current_worker_id"()));



CREATE POLICY "attendance_write" ON "public"."attendance_records" TO "authenticated" USING (("public"."has_permission"('absensi.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text"))) WITH CHECK (("public"."has_permission"('absensi.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



ALTER TABLE "public"."audit_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_events_select" ON "public"."audit_events" FOR SELECT TO "authenticated" USING ((("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text") OR "public"."has_permission"('laporan.view'::"text")));



CREATE POLICY "bom_ops_select" ON "public"."bom_requirements" FOR SELECT TO "authenticated" USING (("public"."has_permission"('barang_keluar_gudang.view'::"text") OR "public"."has_permission"('permintaan_produksi.view'::"text") OR "public"."has_permission"('cutting.view'::"text") OR "public"."has_permission"('produksi.view'::"text")));



ALTER TABLE "public"."bom_requirements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bom_requirements_delete_master" ON "public"."bom_requirements" FOR DELETE TO "authenticated" USING ("public"."has_permission"('master_kebutuhan.write'::"text"));



CREATE POLICY "bom_requirements_insert_master" ON "public"."bom_requirements" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('master_kebutuhan.write'::"text"));



CREATE POLICY "bom_requirements_select_master" ON "public"."bom_requirements" FOR SELECT TO "authenticated" USING ("public"."has_permission"('master_kebutuhan.view'::"text"));



CREATE POLICY "bom_requirements_stok_gudang_reference_select" ON "public"."bom_requirements" FOR SELECT TO "authenticated" USING ("public"."has_permission"('stok_gudang.view'::"text"));



CREATE POLICY "bom_requirements_update_master" ON "public"."bom_requirements" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('master_kebutuhan.write'::"text")) WITH CHECK ("public"."has_permission"('master_kebutuhan.write'::"text"));



ALTER TABLE "public"."bundle_package_balances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bundle_package_recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bundle_packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bundle_packing_log_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bundle_packing_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bundle_recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_advance_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_advances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cutting_components" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cutting_components_select" ON "public"."cutting_components" FOR SELECT TO "authenticated" USING (("public"."has_permission"('cutting.view'::"text") OR "public"."has_permission"('stok_gudang.view'::"text") OR "public"."has_permission"('sablon.view'::"text") OR "public"."has_permission"('permintaan_produksi.view'::"text") OR "public"."has_permission"('produksi.view'::"text")));



ALTER TABLE "public"."cutting_daily_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cutting_material_usages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cutting_result_select" ON "public"."cutting_daily_results" FOR SELECT TO "authenticated" USING (("public"."has_permission"('cutting.view'::"text") OR "public"."has_permission"('stok_gudang.view'::"text") OR "public"."has_permission"('sablon.view'::"text") OR "public"."has_permission"('produksi.view'::"text")));



CREATE POLICY "cutting_usage_select" ON "public"."cutting_material_usages" FOR SELECT TO "authenticated" USING ("public"."has_permission"('cutting.view'::"text"));



ALTER TABLE "public"."embarkation_issues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "embarkation_issues_select" ON "public"."embarkation_issues" FOR SELECT TO "authenticated" USING ("public"."has_permission"('reject_embarkasi.view'::"text"));



CREATE POLICY "embarkation_issues_write" ON "public"."embarkation_issues" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('reject_embarkasi.write'::"text"));



ALTER TABLE "public"."embarkation_shipments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."embarkation_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."embarkations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "embarkations_admin_write" ON "public"."embarkations" TO "authenticated" USING ("public"."has_permission"('master_embarkasi.write'::"text")) WITH CHECK ("public"."has_permission"('master_embarkasi.write'::"text"));



CREATE POLICY "embarkations_select" ON "public"."embarkations" FOR SELECT TO "authenticated" USING (("public"."has_permission"('master_embarkasi.view'::"text") OR "public"."has_permission"('target_embarkasi.view'::"text") OR "public"."has_permission"('pengiriman_embarkasi.view'::"text") OR "public"."has_permission"('reject_embarkasi.view'::"text")));



CREATE POLICY "ext_receipts_select" ON "public"."external_finished_receipts" FOR SELECT TO "authenticated" USING (("public"."has_permission"('barang_luar.view'::"text") OR "public"."has_permission"('stok_barang_jadi.view'::"text")));



ALTER TABLE "public"."external_finished_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fg_bundling_insert" ON "public"."finished_goods_bundling" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "fg_bundling_items_insert" ON "public"."finished_goods_bundling_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "fg_bundling_items_select" ON "public"."finished_goods_bundling_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "fg_bundling_select" ON "public"."finished_goods_bundling" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "finance_select" ON "public"."finance_transactions" FOR SELECT TO "authenticated" USING (("public"."has_permission"('keuangan.view'::"text") OR "public"."has_permission"('laporan.view'::"text")));



ALTER TABLE "public"."finance_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_write" ON "public"."finance_transactions" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_permission"('keuangan.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



ALTER TABLE "public"."finished_goods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finished_goods_admin_write" ON "public"."finished_goods" TO "authenticated" USING ("public"."has_permission"('master_barang_jadi.write'::"text")) WITH CHECK ("public"."has_permission"('master_barang_jadi.write'::"text"));



ALTER TABLE "public"."finished_goods_bundling" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finished_goods_bundling_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finished_goods_laporan_select" ON "public"."finished_goods" FOR SELECT TO "authenticated" USING ("public"."has_permission"('laporan.view'::"text"));



CREATE POLICY "finished_goods_page_reference_select" ON "public"."finished_goods" FOR SELECT TO "authenticated" USING (("public"."has_permission"('master_set.view'::"text") OR "public"."has_permission"('transfer_barang_jadi.view'::"text") OR "public"."has_permission"('barang_luar.view'::"text") OR "public"."has_permission"('manufaktur.view'::"text")));



CREATE POLICY "finished_goods_select" ON "public"."finished_goods" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."finished_goods_transfers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "issues_select" ON "public"."warehouse_issues" FOR SELECT TO "authenticated" USING (("public"."has_permission"('barang_keluar_gudang.view'::"text") OR "public"."has_permission"('stok_gudang.view'::"text") OR "public"."has_permission"('log_bahan.view'::"text")));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_admin_write" ON "public"."locations" TO "authenticated" USING ("public"."has_permission"('master_lokasi.write'::"text")) WITH CHECK ("public"."has_permission"('master_lokasi.write'::"text"));



CREATE POLICY "locations_select" ON "public"."locations" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "logistics_balance_select" ON "public"."logistics_stock_balances" FOR SELECT TO "authenticated" USING (("public"."has_permission"('stok_barang_jadi.view'::"text") OR "public"."has_permission"('stok_set.view'::"text") OR "public"."has_permission"('transfer_barang_jadi.view'::"text") OR "public"."has_permission"('packing_set.view'::"text") OR "public"."has_permission"('pengiriman_embarkasi.view'::"text") OR "public"."has_permission"('mr_wu.view'::"text")));



CREATE POLICY "logistics_balances_laporan_select" ON "public"."logistics_stock_balances" FOR SELECT TO "authenticated" USING ("public"."has_permission"('laporan.view'::"text"));



CREATE POLICY "logistics_event_select" ON "public"."logistics_stock_events" FOR SELECT TO "authenticated" USING (("public"."has_permission"('stok_barang_jadi.view'::"text") OR "public"."has_permission"('stok_set.view'::"text") OR "public"."has_permission"('qc.view'::"text") OR "public"."has_permission"('pengiriman_embarkasi.view'::"text")));



CREATE POLICY "logistics_ledger_select" ON "public"."logistics_stock_ledger" FOR SELECT TO "authenticated" USING (("public"."has_permission"('stok_barang_jadi.view'::"text") OR "public"."has_permission"('stok_set.view'::"text") OR "public"."has_permission"('transfer_barang_jadi.view'::"text") OR "public"."has_permission"('packing_set.view'::"text") OR "public"."has_permission"('pengiriman_embarkasi.view'::"text")));



ALTER TABLE "public"."logistics_stock_balances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."logistics_stock_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."logistics_stock_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manufacturing_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."material_lots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "material_lots_select" ON "public"."material_lots" FOR SELECT TO "authenticated" USING (("public"."has_permission"('stok_gudang.view'::"text") OR "public"."has_permission"('barang_masuk_gudang.view'::"text") OR "public"."has_permission"('barang_keluar_gudang.view'::"text") OR "public"."has_permission"('log_bahan.view'::"text") OR "public"."has_permission"('cutting.view'::"text") OR "public"."has_permission"('produksi.view'::"text") OR "public"."has_permission"('laporan.view'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



ALTER TABLE "public"."material_request_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "material_request_items_stock_gudang_reference_select" ON "public"."material_request_items" FOR SELECT TO "authenticated" USING ("public"."has_permission"('stok_gudang.view'::"text"));



ALTER TABLE "public"."material_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "material_requests_stock_gudang_reference_select" ON "public"."material_requests" FOR SELECT TO "authenticated" USING ("public"."has_permission"('stok_gudang.view'::"text"));



ALTER TABLE "public"."material_suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "material_suppliers_procurement_select" ON "public"."material_suppliers" FOR SELECT TO "authenticated" USING (("public"."has_permission"('supplier.view'::"text") OR "public"."has_permission"('procurement.view'::"text")));



CREATE POLICY "material_suppliers_select" ON "public"."material_suppliers" FOR SELECT TO "authenticated" USING (("public"."has_permission"('master_vendor.view'::"text") OR "public"."has_permission"('master_bahan.view'::"text") OR "public"."has_permission"('master_kebutuhan.view'::"text")));



CREATE POLICY "material_suppliers_supplier_manage" ON "public"."material_suppliers" TO "authenticated" USING ("public"."has_permission"('supplier.manage'::"text")) WITH CHECK ("public"."has_permission"('supplier.manage'::"text"));



CREATE POLICY "material_suppliers_write" ON "public"."material_suppliers" TO "authenticated" USING (("public"."has_permission"('master_vendor.write'::"text") OR "public"."has_permission"('master_bahan.write'::"text"))) WITH CHECK (("public"."has_permission"('master_vendor.write'::"text") OR "public"."has_permission"('master_bahan.write'::"text")));



ALTER TABLE "public"."materials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "materials_insert_master" ON "public"."materials" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('master_bahan.write'::"text"));



CREATE POLICY "materials_manufacturing_reference_select" ON "public"."materials" FOR SELECT TO "authenticated" USING ("public"."has_permission"('manufaktur.view'::"text"));



CREATE POLICY "materials_ops_select" ON "public"."materials" FOR SELECT TO "authenticated" USING (("public"."has_permission"('barang_masuk_gudang.view'::"text") OR "public"."has_permission"('barang_keluar_gudang.view'::"text") OR "public"."has_permission"('stok_gudang.view'::"text") OR "public"."has_permission"('log_bahan.view'::"text") OR "public"."has_permission"('cutting.view'::"text") OR "public"."has_permission"('produksi.view'::"text")));



CREATE POLICY "materials_select_master" ON "public"."materials" FOR SELECT TO "authenticated" USING ("public"."has_permission"('master_bahan.view'::"text"));



CREATE POLICY "materials_supplier_select" ON "public"."materials" FOR SELECT TO "authenticated" USING (("public"."has_permission"('supplier.view'::"text") OR "public"."has_permission"('procurement.view'::"text") OR "public"."has_permission"('procurement.receive'::"text") OR "public"."has_permission"('procurement.export'::"text")));



CREATE POLICY "materials_update_master" ON "public"."materials" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('master_bahan.write'::"text")) WITH CHECK ("public"."has_permission"('master_bahan.write'::"text"));



CREATE POLICY "mfg_select" ON "public"."manufacturing_transactions" FOR SELECT TO "authenticated" USING ("public"."has_permission"('manufaktur.view'::"text"));



CREATE POLICY "month_closures_select" ON "public"."attendance_month_closures" FOR SELECT TO "authenticated" USING (("public"."has_permission"('payroll.view'::"text") OR "public"."has_permission"('absensi.view'::"text")));



CREATE POLICY "op_payroll_items_select" ON "public"."operator_payroll_items" FOR SELECT TO "authenticated" USING (("public"."has_permission"('payroll.operator.view'::"text") OR "public"."has_permission"('payroll.view'::"text")));



CREATE POLICY "op_payroll_runs_select" ON "public"."operator_payroll_runs" FOR SELECT TO "authenticated" USING (("public"."has_permission"('payroll.operator.view'::"text") OR "public"."has_permission"('payroll.view'::"text")));



CREATE POLICY "operator_items_worker_self_select" ON "public"."operator_payroll_items" FOR SELECT TO "authenticated" USING (("worker_id" = "public"."smpt_current_worker_id"()));



ALTER TABLE "public"."operator_payroll_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operator_payroll_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operator_runs_worker_self_select" ON "public"."operator_payroll_runs" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "operator_payroll_items"."run_id"
   FROM "public"."operator_payroll_items"
  WHERE ("operator_payroll_items"."worker_id" = "public"."smpt_current_worker_id"()))));



ALTER TABLE "public"."packing_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "packing_select" ON "public"."packing_runs" FOR SELECT TO "authenticated" USING (("public"."has_permission"('packing_set.view'::"text") OR "public"."has_permission"('stok_set.view'::"text")));



ALTER TABLE "public"."payroll_attendance_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_details_select" ON "public"."payroll_run_details" FOR SELECT TO "authenticated" USING ("public"."has_permission"('payroll.view'::"text"));



CREATE POLICY "payroll_items_select" ON "public"."payroll_run_items" FOR SELECT TO "authenticated" USING ("public"."has_permission"('payroll.view'::"text"));



CREATE POLICY "payroll_items_update" ON "public"."payroll_run_items" FOR UPDATE TO "authenticated" USING (("public"."has_permission"('payroll.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text"))) WITH CHECK (("public"."has_permission"('payroll.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



CREATE POLICY "payroll_items_worker_self_select" ON "public"."payroll_run_items" FOR SELECT TO "authenticated" USING (("worker_id" = "public"."smpt_current_worker_id"()));



ALTER TABLE "public"."payroll_payout_adjustments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_payout_adjustments_select" ON "public"."payroll_payout_adjustments" FOR SELECT TO "authenticated" USING ("public"."has_permission"('payroll.view'::"text"));



ALTER TABLE "public"."payroll_payout_deductions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_payout_deductions_select" ON "public"."payroll_payout_deductions" FOR SELECT TO "authenticated" USING ("public"."has_permission"('payroll.view'::"text"));



ALTER TABLE "public"."payroll_payout_details" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_payout_details_select" ON "public"."payroll_payout_details" FOR SELECT TO "authenticated" USING ("public"."has_permission"('payroll.view'::"text"));



ALTER TABLE "public"."payroll_payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_payouts_select" ON "public"."payroll_payouts" FOR SELECT TO "authenticated" USING ("public"."has_permission"('payroll.view'::"text"));



CREATE POLICY "payroll_reviews_select" ON "public"."payroll_attendance_reviews" FOR SELECT TO "authenticated" USING (("public"."has_permission"('payroll.view'::"text") OR "public"."has_permission"('absensi.view'::"text")));



ALTER TABLE "public"."payroll_run_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_run_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payroll_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_runs_select" ON "public"."payroll_runs" FOR SELECT TO "authenticated" USING ("public"."has_permission"('payroll.view'::"text"));



CREATE POLICY "payroll_runs_update" ON "public"."payroll_runs" FOR UPDATE TO "authenticated" USING (("public"."has_permission"('payroll.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text"))) WITH CHECK (("public"."has_permission"('payroll.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



CREATE POLICY "payroll_runs_worker_self_select" ON "public"."payroll_runs" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "payroll_run_items"."payroll_run_id"
   FROM "public"."payroll_run_items"
  WHERE ("payroll_run_items"."worker_id" = "public"."smpt_current_worker_id"()))));



ALTER TABLE "public"."payroll_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_settings_select" ON "public"."payroll_settings" FOR SELECT TO "authenticated" USING (("public"."has_permission"('payroll.view'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



CREATE POLICY "payroll_settings_write" ON "public"."payroll_settings" TO "authenticated" USING (("public"."has_permission"('payroll.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text"))) WITH CHECK (("public"."has_permission"('payroll.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



CREATE POLICY "permission_overrides_select_self_or_admin" ON "public"."user_permission_overrides" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("public"."current_user_role"() = 'ADMIN'::"text")));



ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_authenticated_read" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "petty_cash_laporan_select" ON "public"."petty_cash_transactions" FOR SELECT TO "authenticated" USING ("public"."has_permission"('laporan.view'::"text"));



ALTER TABLE "public"."petty_cash_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "petty_select" ON "public"."petty_cash_transactions" FOR SELECT TO "authenticated" USING ("public"."has_permission"('kas_kecil.view'::"text"));



CREATE POLICY "petty_write" ON "public"."petty_cash_transactions" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_permission"('kas_kecil.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



ALTER TABLE "public"."product_set_components" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_sets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_sets_laporan_select" ON "public"."product_sets" FOR SELECT TO "authenticated" USING ("public"."has_permission"('laporan.view'::"text"));



ALTER TABLE "public"."production_anomalies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_anomalies_select" ON "public"."production_anomalies" FOR SELECT TO "authenticated" USING (("public"."has_permission"('hasil_produksi.view'::"text") OR "public"."has_permission"('laporan.view'::"text") OR "public"."has_permission"('spk.view'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



ALTER TABLE "public"."production_checks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_checks_laporan_select" ON "public"."production_checks" FOR SELECT TO "authenticated" USING ("public"."has_permission"('laporan.view'::"text"));



CREATE POLICY "production_checks_select" ON "public"."production_checks" FOR SELECT TO "authenticated" USING (("public"."has_permission"('hasil_produksi.view'::"text") OR "public"."has_permission"('spk.view'::"text") OR "public"."has_permission"('produksi.view'::"text") OR "public"."has_permission"('qc.view'::"text") OR ("public"."has_permission"('borongan.view'::"text") AND ("lower"("checker_email") = "lower"(COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text")))) OR (EXISTS ( SELECT 1
   FROM ("public"."production_order_items" "i"
     JOIN "public"."production_orders" "o" ON (("o"."id" = "i"."order_id")))
  WHERE (("i"."id" = "production_checks"."order_item_id") AND "public"."has_permission"('pekerjaan_saya.view'::"text") AND ("o"."operator_worker_id" = "public"."smpt_current_worker_id"()))))));



ALTER TABLE "public"."production_manual_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_manual_results_select" ON "public"."production_manual_results" FOR SELECT TO "authenticated" USING (("public"."has_permission"('hasil_produksi.view'::"text") OR "public"."has_permission"('payroll.view'::"text") OR "public"."has_permission"('payroll.operator.view'::"text")));



ALTER TABLE "public"."production_order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_order_items_laporan_select" ON "public"."production_order_items" FOR SELECT TO "authenticated" USING ("public"."has_permission"('laporan.view'::"text"));



CREATE POLICY "production_order_items_select" ON "public"."production_order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."production_orders" "o"
  WHERE (("o"."id" = "production_order_items"."order_id") AND ("public"."has_permission"('spk.view'::"text") OR "public"."has_permission"('produksi.view'::"text") OR "public"."has_permission"('hasil_produksi.view'::"text") OR "public"."has_permission"('qc.view'::"text") OR ("public"."has_permission"('borongan.view'::"text") AND ("lower"("o"."checker_email") = "lower"(COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text")))) OR ("public"."has_permission"('pekerjaan_saya.view'::"text") AND ("o"."operator_worker_id" = "public"."smpt_current_worker_id"())))))));



ALTER TABLE "public"."production_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_orders_laporan_select" ON "public"."production_orders" FOR SELECT TO "authenticated" USING ("public"."has_permission"('laporan.view'::"text"));



CREATE POLICY "production_orders_select" ON "public"."production_orders" FOR SELECT TO "authenticated" USING (("public"."has_permission"('spk.view'::"text") OR "public"."has_permission"('produksi.view'::"text") OR "public"."has_permission"('hasil_produksi.view'::"text") OR "public"."has_permission"('qc.view'::"text") OR ("public"."has_permission"('borongan.view'::"text") AND ("lower"("checker_email") = "lower"(COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text")))) OR ("public"."has_permission"('pekerjaan_saya.view'::"text") AND ("operator_worker_id" = "public"."smpt_current_worker_id"()))));



ALTER TABLE "public"."production_wip_consumptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_wip_consumptions_select" ON "public"."production_wip_consumptions" FOR SELECT TO "authenticated" USING (("public"."has_permission"('spk.view'::"text") OR "public"."has_permission"('produksi.view'::"text") OR "public"."has_permission"('hasil_produksi.view'::"text") OR "public"."has_permission"('borongan.view'::"text") OR "public"."has_permission"('laporan.view'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_self_or_admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("public"."current_user_role"() = 'ADMIN'::"text")));



ALTER TABLE "public"."project_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_products_insert_master" ON "public"."project_products" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('master_produk_proyek.write'::"text"));



CREATE POLICY "project_products_master_proyek_reference_select" ON "public"."project_products" FOR SELECT TO "authenticated" USING ("public"."has_permission"('master_proyek.view'::"text"));



CREATE POLICY "project_products_ops_select" ON "public"."project_products" FOR SELECT TO "authenticated" USING (("public"."has_permission"('barang_keluar_gudang.view'::"text") OR "public"."has_permission"('permintaan_produksi.view'::"text") OR "public"."has_permission"('cutting.view'::"text") OR "public"."has_permission"('produksi.view'::"text") OR "public"."has_permission"('stok_gudang.view'::"text") OR "public"."has_permission"('sablon.view'::"text")));



CREATE POLICY "project_products_page_reference_select" ON "public"."project_products" FOR SELECT TO "authenticated" USING (("public"."has_permission"('manufaktur.view'::"text") OR "public"."has_permission"('hasil_produksi.view'::"text") OR "public"."has_permission"('master_barang_jadi.view'::"text") OR "public"."has_permission"('master_item.view'::"text")));



CREATE POLICY "project_products_procurement_select" ON "public"."project_products" FOR SELECT TO "authenticated" USING (("public"."has_permission"('procurement.view'::"text") OR "public"."has_permission"('procurement.create'::"text")));



CREATE POLICY "project_products_select_master" ON "public"."project_products" FOR SELECT TO "authenticated" USING ("public"."has_permission"('master_produk_proyek.view'::"text"));



CREATE POLICY "project_products_spk_reference_select" ON "public"."project_products" FOR SELECT TO "authenticated" USING ("public"."has_permission"('spk.view'::"text"));



CREATE POLICY "project_products_update_master" ON "public"."project_products" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('master_produk_proyek.write'::"text")) WITH CHECK ("public"."has_permission"('master_produk_proyek.write'::"text"));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete_master" ON "public"."projects" FOR DELETE TO "authenticated" USING ("public"."has_permission"('master_proyek.write'::"text"));



CREATE POLICY "projects_insert_master" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('master_proyek.write'::"text"));



CREATE POLICY "projects_ops_select" ON "public"."projects" FOR SELECT TO "authenticated" USING (("public"."has_permission"('stok_gudang.view'::"text") OR "public"."has_permission"('barang_keluar_gudang.view'::"text") OR "public"."has_permission"('permintaan_produksi.view'::"text") OR "public"."has_permission"('cutting.view'::"text") OR "public"."has_permission"('sablon.view'::"text") OR "public"."has_permission"('produksi.view'::"text")));



CREATE POLICY "projects_page_reference_select" ON "public"."projects" FOR SELECT TO "authenticated" USING (("public"."has_permission"('master_set.view'::"text") OR "public"."has_permission"('manufaktur.view'::"text") OR "public"."has_permission"('hasil_produksi.view'::"text") OR "public"."has_permission"('master_barang_jadi.view'::"text") OR "public"."has_permission"('log_bahan.view'::"text") OR "public"."has_permission"('master_item.view'::"text")));



CREATE POLICY "projects_procurement_select" ON "public"."projects" FOR SELECT TO "authenticated" USING (("public"."has_permission"('procurement.view'::"text") OR "public"."has_permission"('procurement.create'::"text")));



CREATE POLICY "projects_select_master" ON "public"."projects" FOR SELECT TO "authenticated" USING ("public"."has_permission"('master_proyek.view'::"text"));



CREATE POLICY "projects_spk_reference_select" ON "public"."projects" FOR SELECT TO "authenticated" USING ("public"."has_permission"('spk.view'::"text"));



CREATE POLICY "projects_update_master" ON "public"."projects" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('master_proyek.write'::"text")) WITH CHECK ("public"."has_permission"('master_proyek.write'::"text"));



ALTER TABLE "public"."purchase_order_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_order_lines_select" ON "public"."purchase_order_lines" FOR SELECT TO "authenticated" USING (("public"."has_permission"('procurement.view'::"text") OR "public"."has_permission"('procurement.receive'::"text") OR "public"."has_permission"('procurement.export'::"text")));



ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_orders_select" ON "public"."purchase_orders" FOR SELECT TO "authenticated" USING (("public"."has_permission"('procurement.view'::"text") OR "public"."has_permission"('procurement.receive'::"text") OR "public"."has_permission"('procurement.export'::"text")));



ALTER TABLE "public"."purchase_plan_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_plan_lines_select" ON "public"."purchase_plan_lines" FOR SELECT TO "authenticated" USING (("public"."has_permission"('procurement.view'::"text") OR "public"."has_permission"('procurement.export'::"text")));



ALTER TABLE "public"."purchase_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_plans_select" ON "public"."purchase_plans" FOR SELECT TO "authenticated" USING (("public"."has_permission"('procurement.view'::"text") OR "public"."has_permission"('procurement.export'::"text")));



ALTER TABLE "public"."qc_inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qc_reworks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qc_select" ON "public"."qc_inspections" FOR SELECT TO "authenticated" USING ("public"."has_permission"('qc.view'::"text"));



ALTER TABLE "public"."ready_production_usage_lots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ready_production_usage_lots_select" ON "public"."ready_production_usage_lots" FOR SELECT TO "authenticated" USING (("public"."has_permission"('produksi.view'::"text") OR "public"."has_permission"('hasil_produksi.view'::"text") OR "public"."has_permission"('laporan.view'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



ALTER TABLE "public"."ready_production_usages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ready_usage_select" ON "public"."ready_production_usages" FOR SELECT TO "authenticated" USING ("public"."has_permission"('produksi.view'::"text"));



CREATE POLICY "receipts_select" ON "public"."warehouse_receipts" FOR SELECT TO "authenticated" USING (("public"."has_permission"('barang_masuk_gudang.view'::"text") OR "public"."has_permission"('stok_gudang.view'::"text")));



CREATE POLICY "request_items_select" ON "public"."material_request_items" FOR SELECT TO "authenticated" USING (("public"."has_permission"('permintaan_produksi.view'::"text") OR "public"."has_permission"('barang_keluar_gudang.view'::"text")));



CREATE POLICY "requests_select" ON "public"."material_requests" FOR SELECT TO "authenticated" USING (("public"."has_permission"('permintaan_produksi.view'::"text") OR "public"."has_permission"('barang_keluar_gudang.view'::"text")));



CREATE POLICY "rework_select" ON "public"."qc_reworks" FOR SELECT TO "authenticated" USING ("public"."has_permission"('qc.view'::"text"));



ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_permissions_authenticated_read" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_authenticated_read" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."salary_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "salary_submissions_select" ON "public"."salary_submissions" FOR SELECT TO "authenticated" USING ("public"."has_permission"('payroll.view'::"text"));



CREATE POLICY "set_components_select" ON "public"."product_set_components" FOR SELECT TO "authenticated" USING (("public"."has_permission"('master_set.view'::"text") OR "public"."has_permission"('packing_set.view'::"text") OR "public"."has_permission"('stok_set.view'::"text")));



CREATE POLICY "set_components_write" ON "public"."product_set_components" TO "authenticated" USING ("public"."has_permission"('master_set.write'::"text")) WITH CHECK ("public"."has_permission"('master_set.write'::"text"));



CREATE POLICY "sets_select" ON "public"."product_sets" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "sets_write" ON "public"."product_sets" TO "authenticated" USING ("public"."has_permission"('master_set.write'::"text")) WITH CHECK ("public"."has_permission"('master_set.write'::"text"));



CREATE POLICY "shipments_select" ON "public"."embarkation_shipments" FOR SELECT TO "authenticated" USING (("public"."has_permission"('pengiriman_embarkasi.view'::"text") OR "public"."has_permission"('reject_embarkasi.view'::"text")));



ALTER TABLE "public"."smpt_keepalive_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_balances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_balances_request_select" ON "public"."stock_balances" FOR SELECT TO "authenticated" USING ("public"."has_permission"('permintaan_produksi.view'::"text"));



CREATE POLICY "stock_balances_select" ON "public"."stock_balances" FOR SELECT TO "authenticated" USING (("public"."has_permission"('stok_gudang.view'::"text") OR "public"."has_permission"('log_bahan.view'::"text") OR "public"."has_permission"('barang_keluar_gudang.view'::"text") OR "public"."has_permission"('cutting.view'::"text") OR "public"."has_permission"('sablon.view'::"text") OR "public"."has_permission"('produksi.view'::"text")));



ALTER TABLE "public"."stock_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_events_select" ON "public"."stock_events" FOR SELECT TO "authenticated" USING (("public"."has_permission"('stok_gudang.view'::"text") OR "public"."has_permission"('log_bahan.view'::"text") OR "public"."has_permission"('barang_masuk_gudang.view'::"text") OR "public"."has_permission"('barang_keluar_gudang.view'::"text") OR "public"."has_permission"('cutting.view'::"text") OR "public"."has_permission"('sablon.view'::"text") OR "public"."has_permission"('produksi.view'::"text")));



ALTER TABLE "public"."stock_ledger_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_ledger_select" ON "public"."stock_ledger_entries" FOR SELECT TO "authenticated" USING (("public"."has_permission"('stok_gudang.view'::"text") OR "public"."has_permission"('log_bahan.view'::"text") OR "public"."has_permission"('barang_masuk_gudang.view'::"text") OR "public"."has_permission"('barang_keluar_gudang.view'::"text") OR "public"."has_permission"('cutting.view'::"text") OR "public"."has_permission"('sablon.view'::"text") OR "public"."has_permission"('produksi.view'::"text")));



ALTER TABLE "public"."stock_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_locations_select" ON "public"."stock_locations" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."system_data_backups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_data_backups_admin_select" ON "public"."system_data_backups" FOR SELECT TO "authenticated" USING ("public"."has_permission"('setup_test.admin'::"text"));



ALTER TABLE "public"."system_test_run_entities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_test_run_entities_admin_select" ON "public"."system_test_run_entities" FOR SELECT TO "authenticated" USING ("public"."has_permission"('setup_test.admin'::"text"));



ALTER TABLE "public"."system_test_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_test_runs_admin_select" ON "public"."system_test_runs" FOR SELECT TO "authenticated" USING ("public"."has_permission"('setup_test.admin'::"text"));



CREATE POLICY "targets_admin_write" ON "public"."embarkation_targets" TO "authenticated" USING ("public"."has_permission"('target_embarkasi.write'::"text")) WITH CHECK ("public"."has_permission"('target_embarkasi.write'::"text"));



CREATE POLICY "targets_select" ON "public"."embarkation_targets" FOR SELECT TO "authenticated" USING (("public"."has_permission"('target_embarkasi.view'::"text") OR "public"."has_permission"('pengiriman_embarkasi.view'::"text") OR "public"."has_permission"('reject_embarkasi.view'::"text")));



CREATE POLICY "transfers_select" ON "public"."finished_goods_transfers" FOR SELECT TO "authenticated" USING (("public"."has_permission"('transfer_barang_jadi.view'::"text") OR "public"."has_permission"('stok_barang_jadi.view'::"text") OR "public"."has_permission"('mr_wu.view'::"text")));



CREATE POLICY "user_overrides_admin_all" ON "public"."user_permission_overrides" TO "authenticated" USING ((("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text") OR "public"."has_permission"('access_control.write'::"text"))) WITH CHECK ((("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text") OR "public"."has_permission"('access_control.write'::"text")));



ALTER TABLE "public"."user_permission_overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_permission_overrides_admin" ON "public"."user_permission_overrides" TO "authenticated" USING (("public"."has_permission"('access_control.write'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



ALTER TABLE "public"."user_worker_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_worker_links_select" ON "public"."user_worker_links" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text") OR "public"."has_permission"('spk.view'::"text")));



ALTER TABLE "public"."vendor_delivery_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendor_down_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendor_po_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendors_admin_write" ON "public"."vendors" TO "authenticated" USING ("public"."has_permission"('master_vendor.write'::"text")) WITH CHECK ("public"."has_permission"('master_vendor.write'::"text"));



CREATE POLICY "vendors_select" ON "public"."vendors" FOR SELECT TO "authenticated" USING (("public"."has_permission"('master_vendor.view'::"text") OR "public"."has_permission"('barang_luar.view'::"text") OR "public"."has_permission"('manufaktur.view'::"text")));



CREATE POLICY "vendors_supplier_manage" ON "public"."vendors" TO "authenticated" USING ("public"."has_permission"('supplier.manage'::"text")) WITH CHECK ("public"."has_permission"('supplier.manage'::"text"));



CREATE POLICY "vendors_supplier_select" ON "public"."vendors" FOR SELECT TO "authenticated" USING (("public"."has_permission"('supplier.view'::"text") OR "public"."has_permission"('procurement.view'::"text") OR "public"."has_permission"('procurement.receive'::"text") OR "public"."has_permission"('procurement.export'::"text")));



ALTER TABLE "public"."warehouse_issue_lots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warehouse_issue_lots_select" ON "public"."warehouse_issue_lots" FOR SELECT TO "authenticated" USING (("public"."has_permission"('barang_keluar_gudang.view'::"text") OR "public"."has_permission"('stok_gudang.view'::"text") OR "public"."has_permission"('log_bahan.view'::"text") OR "public"."has_permission"('laporan.view'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



ALTER TABLE "public"."warehouse_issues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warehouse_issues_produksi_reference_select" ON "public"."warehouse_issues" FOR SELECT TO "authenticated" USING ("public"."has_permission"('produksi.view'::"text"));



ALTER TABLE "public"."warehouse_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warung_transaction_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_item_dependencies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_item_dependencies_select" ON "public"."work_item_dependencies" FOR SELECT TO "authenticated" USING (("public"."has_permission"('master_item.view'::"text") OR "public"."has_permission"('spk.view'::"text") OR "public"."has_permission"('produksi.view'::"text") OR "public"."has_permission"('hasil_produksi.view'::"text") OR "public"."has_permission"('borongan.view'::"text") OR "public"."has_permission"('laporan.view'::"text") OR ("upper"(COALESCE("public"."current_user_role"(), ''::"text")) = 'ADMIN'::"text")));



ALTER TABLE "public"."work_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_items_finished_goods_reference_select" ON "public"."work_items" FOR SELECT TO "authenticated" USING ("public"."has_permission"('master_barang_jadi.view'::"text"));



CREATE POLICY "work_items_hasil_produksi_reference_select" ON "public"."work_items" FOR SELECT TO "authenticated" USING ("public"."has_permission"('hasil_produksi.view'::"text"));



CREATE POLICY "work_items_insert_master" ON "public"."work_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_permission"('master_item.write'::"text") AND ("public"."current_user_role"() = 'ADMIN'::"text")));



CREATE POLICY "work_items_produksi_reference_select" ON "public"."work_items" FOR SELECT TO "authenticated" USING ("public"."has_permission"('produksi.view'::"text"));



CREATE POLICY "work_items_select_master" ON "public"."work_items" FOR SELECT TO "authenticated" USING ("public"."has_permission"('master_item.view'::"text"));



CREATE POLICY "work_items_spk_reference_select" ON "public"."work_items" FOR SELECT TO "authenticated" USING ("public"."has_permission"('spk.view'::"text"));



CREATE POLICY "work_items_update_master" ON "public"."work_items" FOR UPDATE TO "authenticated" USING (("public"."has_permission"('master_item.write'::"text") AND ("public"."current_user_role"() = 'ADMIN'::"text"))) WITH CHECK (("public"."has_permission"('master_item.write'::"text") AND ("public"."current_user_role"() = 'ADMIN'::"text")));



ALTER TABLE "public"."workers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workers_hasil_produksi_reference_select" ON "public"."workers" FOR SELECT TO "authenticated" USING ("public"."has_permission"('hasil_produksi.view'::"text"));



CREATE POLICY "workers_insert" ON "public"."workers" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('master_pekerja.write'::"text"));



CREATE POLICY "workers_laporan_select" ON "public"."workers" FOR SELECT TO "authenticated" USING ("public"."has_permission"('laporan.view'::"text"));



CREATE POLICY "workers_page_reference_select" ON "public"."workers" FOR SELECT TO "authenticated" USING (("public"."has_permission"('absensi.view'::"text") OR "public"."has_permission"('kasbon.view'::"text") OR "public"."has_permission"('access_control.view'::"text") OR "public"."has_permission"('stok_gudang.view'::"text")));



CREATE POLICY "workers_select" ON "public"."workers" FOR SELECT TO "authenticated" USING (("public"."has_permission"('master_pekerja.view'::"text") OR "public"."has_permission"('barang_keluar_gudang.view'::"text") OR "public"."has_permission"('permintaan_produksi.view'::"text")));



CREATE POLICY "workers_spk_reference_select" ON "public"."workers" FOR SELECT TO "authenticated" USING ("public"."has_permission"('spk.view'::"text"));



CREATE POLICY "workers_update" ON "public"."workers" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('master_pekerja.write'::"text")) WITH CHECK ("public"."has_permission"('master_pekerja.write'::"text"));



CREATE POLICY "workers_warung_reference_select" ON "public"."workers" FOR SELECT TO "authenticated" USING (("public"."has_permission"('warung.view'::"text") OR ("id" = "public"."smpt_current_worker_id"())));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."add_material_request_item"("p_request_id" bigint, "p_source_type" "text", "p_reference_id" bigint, "p_quantity" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_material_request_item"("p_request_id" bigint, "p_source_type" "text", "p_reference_id" bigint, "p_quantity" numeric, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."add_production_order_item"("p_order_id" bigint, "p_work_item_id" bigint, "p_assigned_qty" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_production_order_item"("p_order_id" bigint, "p_work_item_id" bigint, "p_assigned_qty" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_checker_result"("p_check_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_checker_result"("p_check_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_cutting_material_usage"("p_usage_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_cutting_material_usage"("p_usage_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_cutting_result"("p_result_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_cutting_result"("p_result_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_embarkation_shipment"("p_shipment_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_embarkation_shipment"("p_shipment_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_external_finished_receipt"("p_receipt_id" bigint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_external_finished_receipt"("p_receipt_id" bigint, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_manual_production_result"("p_result_id" bigint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_manual_production_result"("p_result_id" bigint, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_manufacturing_transaction"("p_id" bigint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_manufacturing_transaction"("p_id" bigint, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_material_request"("p_request_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_material_request"("p_request_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_production_order"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_production_order"("p_order_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_quality_control"("p_qc_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_quality_control"("p_qc_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_ready_production_lot_usage"("p_usage_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_ready_production_lot_usage"("p_usage_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_warehouse_receipt"("p_receipt_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_warehouse_receipt"("p_receipt_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."commit_secure_attendance_import"("p_source_file" "text", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."commit_secure_attendance_import"("p_source_file" "text", "p_rows" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_qc_rework"("p_rework_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_qc_rework"("p_rework_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."confirm_transfer_receipt"("p_transfer_id" bigint, "p_received_qty" numeric, "p_reject_qty" numeric, "p_damaged_qty" numeric, "p_notes" "text", "p_photo_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_transfer_receipt"("p_transfer_id" bigint, "p_received_qty" numeric, "p_reject_qty" numeric, "p_damaged_qty" numeric, "p_notes" "text", "p_photo_url" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."consume_material_lot"("p_usage_date" "date", "p_material_lot_id" bigint, "p_quantity" numeric, "p_unit" "text", "p_process" "text", "p_work_item_id" bigint, "p_officer" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_material_lot"("p_usage_date" "date", "p_material_lot_id" bigint, "p_quantity" numeric, "p_unit" "text", "p_process" "text", "p_work_item_id" bigint, "p_officer" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_embarkation_shipment"("p_target_id" bigint, "p_date" "date", "p_source_location_id" bigint, "p_quantity" numeric, "p_document_no" "text", "p_driver" "text", "p_vehicle" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_embarkation_shipment"("p_target_id" bigint, "p_date" "date", "p_source_location_id" bigint, "p_quantity" numeric, "p_document_no" "text", "p_driver" "text", "p_vehicle" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_material_lot"("p_receipt_id" bigint, "p_roll_number" "text", "p_original_quantity" numeric, "p_original_unit" "text", "p_supplier_lot_no" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_material_lot"("p_receipt_id" bigint, "p_roll_number" "text", "p_original_quantity" numeric, "p_original_unit" "text", "p_supplier_lot_no" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_material_request_header"("p_request_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_supervisor_worker_id" bigint, "p_purpose" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_material_request_header"("p_request_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_supervisor_worker_id" bigint, "p_purpose" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_production_order"("p_order_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_operator_worker_id" bigint, "p_checker_email" "text", "p_supervisor_worker_id" bigint, "p_due_date" "date", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_production_order"("p_order_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_operator_worker_id" bigint, "p_checker_email" "text", "p_supervisor_worker_id" bigint, "p_due_date" "date", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_qc_rework"("p_qc_id" bigint, "p_quantity" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_qc_rework"("p_qc_id" bigint, "p_quantity" numeric, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_warehouse_receipt"("p_receipt_date" "date", "p_material_id" bigint, "p_quantity" numeric, "p_input_unit" "text", "p_conversion_factor" numeric, "p_supplier" "text", "p_document_no" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_warehouse_receipt"("p_receipt_date" "date", "p_material_id" bigint, "p_quantity" numeric, "p_input_unit" "text", "p_conversion_factor" numeric, "p_supplier" "text", "p_document_no" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."current_user_permissions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_permissions"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."current_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."deactivate_work_item_dependency"("p_dependency_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_master_worker"("p_worker_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_master_worker"("p_worker_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."direct_warehouse_issue_material"("p_issue_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_purpose" "text", "p_quantity" numeric, "p_unit" "text", "p_conversion_factor" numeric, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."direct_warehouse_issue_material"("p_issue_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_purpose" "text", "p_quantity" numeric, "p_unit" "text", "p_conversion_factor" numeric, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."edit_external_finished_receipt"("p_receipt_id" bigint, "p_document_no" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edit_external_finished_receipt"("p_receipt_id" bigint, "p_document_no" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."edit_manufacturing_transaction"("p_id" bigint, "p_document_no" "text", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edit_manufacturing_transaction"("p_id" bigint, "p_document_no" "text", "p_description" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."finalize_attendance_month"("p_month_start" "date", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_attendance_month"("p_month_start" "date", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."finalize_general_payroll"("p_type" "text", "p_start" "date", "p_end" "date", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_general_payroll"("p_type" "text", "p_start" "date", "p_end" "date", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_general_payroll"("p_type" "text", "p_start" "date", "p_end" "date", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_operator_payroll"("p_start" "date", "p_end" "date", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_operator_payroll"("p_start" "date", "p_end" "date", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."finalize_payroll_payout"("p_type" "text", "p_start" "date", "p_end" "date", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_payroll_payout"("p_type" "text", "p_start" "date", "p_end" "date", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."fulfill_material_request_item"("p_request_item_id" bigint, "p_issue_date" "date", "p_quantity" numeric, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_conversion_factor" numeric, "p_wip_source_state" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fulfill_material_request_item"("p_request_item_id" bigint, "p_issue_date" "date", "p_quantity" numeric, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_conversion_factor" numeric, "p_wip_source_state" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."fulfill_material_request_with_lot"("p_issue_date" "date", "p_request_item_id" bigint, "p_material_lot_id" bigint, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fulfill_material_request_with_lot"("p_issue_date" "date", "p_request_item_id" bigint, "p_material_lot_id" bigint, "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_public_shipment_tracking"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_shipment_tracking"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_shipment_tracking"("p_token" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_worker_financial_summary"("p_worker_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_worker_financial_summary"("p_worker_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."has_permission"("p_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("p_permission" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."inspect_auth_user"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inspect_auth_user"("p_email" "text") TO "anon";



REVOKE ALL ON FUNCTION "public"."issue_material_lot_whole"("p_issue_date" "date", "p_material_lot_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_purpose" "text", "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_material_lot_whole"("p_issue_date" "date", "p_material_lot_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_purpose" "text", "p_recipient_worker_id" bigint, "p_recipient_name" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."link_worker_account"("p_email" "text", "p_worker_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_worker_account"("p_email" "text", "p_worker_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mark_payroll_payout_paid"("p_payout_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_payroll_payout_paid"("p_payout_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."master_reference_materials"("p_include_inactive" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."master_reference_materials"("p_include_inactive" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."master_reference_materials_v2"("p_include_inactive" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."master_reference_materials_v2"("p_include_inactive" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."master_reference_products"("p_project_id" bigint, "p_include_inactive" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."master_reference_products"("p_project_id" bigint, "p_include_inactive" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."master_reference_projects"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."master_reference_projects"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."move_wip_stock"("p_transaction_date" "date", "p_cutting_component_id" bigint, "p_product_id" bigint, "p_quantity" numeric, "p_action" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_wip_stock"("p_transaction_date" "date", "p_cutting_component_id" bigint, "p_product_id" bigint, "p_quantity" numeric, "p_action" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."pack_product_set"("p_date" "date", "p_set_id" bigint, "p_location_id" bigint, "p_set_qty" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pack_product_set"("p_date" "date", "p_set_id" bigint, "p_location_id" bigint, "p_set_qty" numeric, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."pay_cash_advance"("p_advance_id" bigint, "p_date" "date", "p_amount" numeric, "p_source" "text", "p_reference" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_cash_advance"("p_advance_id" bigint, "p_date" "date", "p_amount" numeric, "p_source" "text", "p_reference" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."preview_secure_attendance_import"("p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."preview_secure_attendance_import"("p_rows" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."process_bundle_package_packing"("p_date" "date", "p_package_id" bigint, "p_location_id" bigint, "p_bundle_qty" numeric, "p_notes" "text", "p_components" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_bundle_package_packing"("p_date" "date", "p_package_id" bigint, "p_location_id" bigint, "p_bundle_qty" numeric, "p_notes" "text", "p_components" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_production_order"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_production_order"("p_order_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."receive_embarkation_shipment"("p_shipment_id" bigint, "p_received" numeric, "p_reject" numeric, "p_damaged" numeric, "p_missing" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."receive_embarkation_shipment"("p_shipment_id" bigint, "p_received" numeric, "p_reject" numeric, "p_damaged" numeric, "p_missing" numeric, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."receive_external_finished_good"("p_date" "date", "p_finished_good_id" bigint, "p_vendor_id" bigint, "p_location_id" bigint, "p_quantity" numeric, "p_document_no" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."receive_external_finished_good"("p_date" "date", "p_finished_good_id" bigint, "p_vendor_id" bigint, "p_location_id" bigint, "p_quantity" numeric, "p_document_no" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_checker_result"("p_order_item_id" bigint, "p_check_date" "date", "p_good_qty" numeric, "p_reject_qty" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_checker_result"("p_order_item_id" bigint, "p_check_date" "date", "p_good_qty" numeric, "p_reject_qty" numeric, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_cutting_material_usage"("p_usage_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_quantity" numeric, "p_officer" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_cutting_material_usage"("p_usage_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_bom_requirement_id" bigint, "p_quantity" numeric, "p_officer" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_cutting_result"("p_result_date" "date", "p_cutting_component_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric, "p_officer" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_cutting_result"("p_result_date" "date", "p_cutting_component_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric, "p_officer" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_manual_production_result"("p_result_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_work_item_id" bigint, "p_worker_id" bigint, "p_qty" numeric, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_manual_production_result"("p_result_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_work_item_id" bigint, "p_worker_id" bigint, "p_qty" numeric, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_manufacturing_transaction"("p_flow_type" "text", "p_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_material_id" bigint, "p_finished_good_id" bigint, "p_vendor_id" bigint, "p_quantity" numeric, "p_unit" "text", "p_document_no" "text", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_manufacturing_transaction"("p_flow_type" "text", "p_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_material_id" bigint, "p_finished_good_id" bigint, "p_vendor_id" bigint, "p_quantity" numeric, "p_unit" "text", "p_document_no" "text", "p_description" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_quality_control"("p_production_check_id" bigint, "p_inspection_date" "date", "p_good_qty" numeric, "p_reject_qty" numeric, "p_rework_qty" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_quality_control"("p_production_check_id" bigint, "p_inspection_date" "date", "p_good_qty" numeric, "p_reject_qty" numeric, "p_rework_qty" numeric, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_ready_production_usage"("p_usage_date" "date", "p_item_kind" "text", "p_reference_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_quantity" numeric, "p_officer" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_ready_production_usage"("p_usage_date" "date", "p_item_kind" "text", "p_reference_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_quantity" numeric, "p_officer" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_warung_debt"("p_worker_id" bigint, "p_amount" numeric, "p_warung_name" "text", "p_date" "date", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_warung_debt"("p_worker_id" bigint, "p_amount" numeric, "p_warung_name" "text", "p_date" "date", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."remove_material_request_item"("p_item_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_material_request_item"("p_item_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."remove_production_order_item"("p_order_id" bigint, "p_order_item_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_production_order_item"("p_order_id" bigint, "p_order_item_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."review_payroll_attendance"("p_attendance_id" bigint, "p_day_class" "text", "p_overtime_review_status" "text", "p_overtime_approved_minutes" integer, "p_meal_class" "text", "p_bonus_ot_review_status" "text", "p_is_holiday" boolean, "p_holiday_review_status" "text", "p_holiday_manual_amount" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_payroll_attendance"("p_attendance_id" bigint, "p_day_class" "text", "p_overtime_review_status" "text", "p_overtime_approved_minutes" integer, "p_meal_class" "text", "p_bonus_ot_review_status" "text", "p_is_holiday" boolean, "p_holiday_review_status" "text", "p_holiday_manual_amount" numeric, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_bom_requirement"("p_requirement_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_material_id" bigint, "p_component_type" "text", "p_component_name" "text", "p_unit" "text", "p_qty_per_unit" numeric, "p_unit_price" numeric, "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_bom_requirement"("p_requirement_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_material_id" bigint, "p_component_type" "text", "p_component_name" "text", "p_unit" "text", "p_qty_per_unit" numeric, "p_unit_price" numeric, "p_status" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_bom_requirement_v2"("p_requirement_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_material_id" bigint, "p_component_type" "text", "p_component_name" "text", "p_unit" "text", "p_qty_per_unit" numeric, "p_unit_price" numeric, "p_status" "text", "p_fulfillment_source" "text", "p_calculation_method" "text", "p_net_usage_per_product" numeric, "p_allowance_percent" numeric, "p_waste_percent" numeric, "p_final_requirement" numeric, "p_calculation_input_snapshot" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_bom_requirement_v2"("p_requirement_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_material_id" bigint, "p_component_type" "text", "p_component_name" "text", "p_unit" "text", "p_qty_per_unit" numeric, "p_unit_price" numeric, "p_status" "text", "p_fulfillment_source" "text", "p_calculation_method" "text", "p_net_usage_per_product" numeric, "p_allowance_percent" numeric, "p_waste_percent" numeric, "p_final_requirement" numeric, "p_calculation_input_snapshot" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_cutting_component"("p_component_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_name" "text", "p_qty_per_product" numeric, "p_unit" "text", "p_color" "text", "p_notes" "text", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_cutting_component"("p_component_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_name" "text", "p_qty_per_product" numeric, "p_unit" "text", "p_color" "text", "p_notes" "text", "p_status" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_material_supplier"("p_material_id" bigint, "p_supplier_id" bigint, "p_supplier_material_code" "text", "p_supplier_material_name" "text", "p_supplier_unit" "text", "p_conversion_factor" numeric, "p_last_price" numeric, "p_preferred" boolean, "p_moq" numeric, "p_estimated_lead_time_days" integer, "p_default_purchase_unit" "text", "p_notes" "text", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_material_supplier"("p_material_id" bigint, "p_supplier_id" bigint, "p_supplier_material_code" "text", "p_supplier_material_name" "text", "p_supplier_unit" "text", "p_conversion_factor" numeric, "p_last_price" numeric, "p_preferred" boolean, "p_moq" numeric, "p_estimated_lead_time_days" integer, "p_default_purchase_unit" "text", "p_notes" "text", "p_status" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_payroll_shift_settings"("p_settings" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_payroll_shift_settings"("p_settings" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_work_item"("p_item_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_name" "text", "p_unit" "text", "p_qty_per_product" integer, "p_operator_price" bigint, "p_proposed_price" bigint, "p_status" "text", "p_output_final" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_work_item"("p_item_id" bigint, "p_project_id" bigint, "p_product_id" bigint, "p_name" "text", "p_unit" "text", "p_qty_per_product" integer, "p_operator_price" bigint, "p_proposed_price" bigint, "p_status" "text", "p_output_final" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."send_embarkation_shipment"("p_shipment_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_embarkation_shipment"("p_shipment_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_material_lot_tracking_mode"("p_material_id" bigint, "p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_material_lot_tracking_mode"("p_material_id" bigint, "p_mode" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_work_item_flow"("p_work_item_id" bigint, "p_flow_mode" "text", "p_flow_order" integer, "p_validation_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_work_item_flow"("p_work_item_id" bigint, "p_flow_mode" "text", "p_flow_order" integer, "p_validation_mode" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_work_item_payroll_profile"("p_work_item_id" bigint, "p_executor_scope" "text", "p_submission_category" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_work_item_payroll_profile"("p_work_item_id" bigint, "p_executor_scope" "text", "p_submission_category" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."set_work_item_routing_meta"("p_work_item_id" bigint, "p_display_order" integer, "p_validation_mode" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_work_item_status"("p_item_id" bigint, "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_work_item_status"("p_item_id" bigint, "p_status" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_admin_delete_user"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_admin_delete_user"("p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_admin_role_options"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_admin_role_options"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_admin_save_user_access"("p_user_id" "uuid", "p_role_code" "text", "p_worker_id" bigint, "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_admin_save_user_access"("p_user_id" "uuid", "p_role_code" "text", "p_worker_id" bigint, "p_is_active" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_admin_update_user_profile"("p_user_id" "uuid", "p_display_name" "text", "p_role_code" "text", "p_worker_id" bigint, "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_admin_update_user_profile"("p_user_id" "uuid", "p_display_name" "text", "p_role_code" "text", "p_worker_id" bigint, "p_is_active" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_admin_user_directory"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_admin_user_directory"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_apply_logistics_stock"("p_event_id" bigint, "p_item_kind" "text", "p_finished_good_id" bigint, "p_set_id" bigint, "p_location_id" bigint, "p_delta" numeric, "p_unit" "text", "p_kind" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_apply_logistics_stock"("p_event_id" bigint, "p_item_kind" "text", "p_finished_good_id" bigint, "p_set_id" bigint, "p_location_id" bigint, "p_delta" numeric, "p_unit" "text", "p_kind" "text", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."smpt_apply_stock_delta"("p_event_id" bigint, "p_item_kind" "text", "p_material_id" bigint, "p_component_id" bigint, "p_location_code" "text", "p_project_id" bigint, "p_product_id" bigint, "p_bom_id" bigint, "p_delta" numeric, "p_movement_kind" "text", "p_notes" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."smpt_apply_stock_delta_lot"("p_event_id" bigint, "p_item_kind" "text", "p_material_id" bigint, "p_component_id" bigint, "p_location_code" "text", "p_project_id" bigint, "p_product_id" bigint, "p_bom_id" bigint, "p_delta" numeric, "p_movement_kind" "text", "p_notes" "text", "p_material_lot_id" bigint, "p_original_quantity_delta" numeric, "p_original_unit" "text", "p_work_item_id" bigint) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."smpt_cancel_po_receipt"("p_receipt_id" bigint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_cancel_po_receipt"("p_receipt_id" bigint, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_cancel_purchase_order"("p_purchase_order_id" bigint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_cancel_purchase_order"("p_purchase_order_id" bigint, "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_capture_test_entity"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."smpt_common_unit_family"("p_unit" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_common_unit_family"("p_unit" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_common_unit_scale"("p_unit" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_common_unit_scale"("p_unit" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_create_data_backup"("p_label" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_create_data_backup"("p_label" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_create_draft_purchase_order"("p_purchase_plan_id" bigint, "p_supplier_id" bigint, "p_order_date" "date", "p_expected_date" "date", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_create_draft_purchase_order"("p_purchase_plan_id" bigint, "p_supplier_id" bigint, "p_order_date" "date", "p_expected_date" "date", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_create_purchase_plan"("p_project_id" bigint, "p_product_id" bigint, "p_plan_date" "date", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_create_purchase_plan"("p_project_id" bigint, "p_product_id" bigint, "p_plan_date" "date", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_create_repeat_order"("p_source_project_id" bigint, "p_project_code" "text", "p_name" "text", "p_product_category" "text", "p_customer_name" "text", "p_contract_value" numeric, "p_start_date" "date", "p_end_date" "date", "p_status" "text", "p_repeat_note" "text", "p_product_targets" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_create_repeat_order"("p_source_project_id" bigint, "p_project_code" "text", "p_name" "text", "p_product_category" "text", "p_customer_name" "text", "p_contract_value" numeric, "p_start_date" "date", "p_end_date" "date", "p_status" "text", "p_repeat_note" "text", "p_product_targets" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_create_stock_event"("p_type" "text", "p_date" "date", "p_project_id" bigint, "p_product_id" bigint, "p_reference_type" "text", "p_reference_code" "text", "p_reversal" bigint, "p_notes" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."smpt_current_worker_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_current_worker_id"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_delete_table_set"("p_tables" "text"[]) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."smpt_expand_reset_tables"("p_seed" "text"[]) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."smpt_final_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_final_health"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."smpt_force_confirm_user"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."smpt_force_confirm_user"("p_email" "text") TO "anon";



REVOKE ALL ON FUNCTION "public"."smpt_get_active_workers_for_reference"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_get_active_workers_for_reference"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_get_checker_route_status"("p_order_item_ids" bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_get_checker_route_status"("p_order_item_ids" bigint[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_get_equivalent_progress"("p_project_id" bigint, "p_product_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_get_equivalent_progress"("p_project_id" bigint, "p_product_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_get_my_worker_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_get_my_worker_profile"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."smpt_get_route_capacity"("p_product_id" bigint, "p_successor_work_item_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_get_spk_item_capacities"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_get_spk_item_capacities"("p_order_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_gudang_pending_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_gudang_pending_count"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_gudang_pending_inbox"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_gudang_pending_inbox"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_issue_purchase_order"("p_purchase_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_issue_purchase_order"("p_purchase_order_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_maintenance_schema_fingerprint"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."smpt_maintenance_tables"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."smpt_manager_dashboard_detail"("p_section" "text", "p_from" "date", "p_to" "date", "p_project_id" bigint, "p_product_id" bigint, "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_manager_dashboard_detail"("p_section" "text", "p_from" "date", "p_to" "date", "p_project_id" bigint, "p_product_id" bigint, "p_limit" integer, "p_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_manager_dashboard_summary"("p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_manager_dashboard_summary"("p_from" "date", "p_to" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_master_item_equivalent_progress"("p_product_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_master_item_equivalent_progress"("p_product_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_new_logistics_event"("p_event_type" "text", "p_reference_type" "text", "p_reference_id" bigint, "p_reference_code" "text", "p_event_date" "date", "p_notes" "text", "p_reversal_of" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_new_logistics_event"("p_event_type" "text", "p_reference_type" "text", "p_reference_id" bigint, "p_reference_code" "text", "p_event_date" "date", "p_notes" "text", "p_reversal_of" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."smpt_payroll_cfg_num"("p_config" "jsonb", "p_key" "text", "p_default" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_payroll_cfg_num"("p_config" "jsonb", "p_key" "text", "p_default" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_payroll_cfg_text"("p_config" "jsonb", "p_key" "text", "p_default" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_payroll_cfg_text"("p_config" "jsonb", "p_key" "text", "p_default" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_payroll_config_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_payroll_config_snapshot"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_payroll_row_calc"("p_attendance_id" bigint, "p_daily_wage" numeric, "p_monthly_salary" numeric, "p_pay_system" "text", "p_config" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_payroll_row_calc"("p_attendance_id" bigint, "p_daily_wage" numeric, "p_monthly_salary" numeric, "p_pay_system" "text", "p_config" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_payroll_weekly_component"("p_attendance_id" bigint, "p_daily" numeric, "p_monthly" numeric, "p_system" "text", "p_config" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_payroll_weekly_component"("p_attendance_id" bigint, "p_daily" numeric, "p_monthly" numeric, "p_system" "text", "p_config" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_preview_checker_route"("p_order_item_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_preview_checker_route"("p_order_item_id" bigint, "p_good_qty" numeric, "p_reject_qty" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_receive_purchase_order_line"("p_purchase_order_line_id" bigint, "p_receipt_date" "date", "p_quantity" numeric, "p_input_unit" "text", "p_conversion_factor" numeric, "p_document_no" "text", "p_roll_number" "text", "p_supplier_lot_no" "text", "p_notes" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_receive_purchase_order_line"("p_purchase_order_line_id" bigint, "p_receipt_date" "date", "p_quantity" numeric, "p_input_unit" "text", "p_conversion_factor" numeric, "p_document_no" "text", "p_roll_number" "text", "p_supplier_lot_no" "text", "p_notes" "text", "p_idempotency_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_reset_business_data"("p_groups" "text"[], "p_confirmation" "text", "p_backup_before" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_reset_business_data"("p_groups" "text"[], "p_confirmation" "text", "p_backup_before" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_reset_dummy_run"("p_run_id" bigint, "p_confirmation" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_reset_dummy_run"("p_run_id" bigint, "p_confirmation" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_resolve_conversion_factor"("p_from_unit" "text", "p_to_unit" "text", "p_manual_factor" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_resolve_conversion_factor"("p_from_unit" "text", "p_to_unit" "text", "p_manual_factor" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_restore_data_backup"("p_backup_id" bigint, "p_confirmation" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_restore_data_backup"("p_backup_id" bigint, "p_confirmation" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_run_dummy_full"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_run_dummy_full"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_run_manual_borongan_test"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_run_manual_borongan_test"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_run_repeat_order_test"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_run_repeat_order_test"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_run_system_diagnostic"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_run_system_diagnostic"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_spk_checker_options"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_spk_checker_options"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_spk_item_capacity"("p_order_id" bigint, "p_work_item_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_spk_item_capacity"("p_order_id" bigint, "p_work_item_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_sync_auto_linear_dependencies"("p_product_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_sync_auto_linear_dependencies"("p_product_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_sync_payroll_run_advances"("p_run_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_sync_payroll_run_advances"("p_run_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."smpt_sync_payroll_run_advances"("p_run_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."smpt_unit_key"("p_unit" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_unit_key"("p_unit" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_update_draft_purchase_order_line"("p_line_id" bigint, "p_ordered_quantity" numeric, "p_purchase_unit" "text", "p_conversion_factor" numeric, "p_unit_price" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_update_draft_purchase_order_line"("p_line_id" bigint, "p_ordered_quantity" numeric, "p_purchase_unit" "text", "p_conversion_factor" numeric, "p_unit_price" numeric, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_update_purchase_plan_line"("p_line_id" bigint, "p_confirmed_incoming" numeric, "p_planned_quantity" numeric, "p_supplier_id" bigint, "p_unit_price" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_update_purchase_plan_line"("p_line_id" bigint, "p_confirmed_incoming" numeric, "p_planned_quantity" numeric, "p_supplier_id" bigint, "p_unit_price" numeric, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."smpt_user_has_permission"("p_user_id" "uuid", "p_permission" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."smpt_work_item_snapshot"("p_work_item_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."smpt_work_item_snapshot"("p_work_item_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."submit_material_request"("p_request_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_material_request"("p_request_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."transfer_finished_good"("p_date" "date", "p_finished_good_id" bigint, "p_source_location_id" bigint, "p_destination_location_id" bigint, "p_quantity" numeric, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_finished_good"("p_date" "date", "p_finished_good_id" bigint, "p_source_location_id" bigint, "p_destination_location_id" bigint, "p_quantity" numeric, "p_notes" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."update_payroll_item_manual"("p_item_id" bigint, "p_base_amount" numeric, "p_meal_amount" numeric, "p_overtime_amount" numeric, "p_manual_overtime_amount" numeric, "p_overtime_bonus" numeric, "p_holiday_bonus" numeric, "p_kasbon_perusahaan_amount" numeric, "p_kasbon_warung_amount" numeric, "p_deduction_amount" numeric, "p_overtime_minutes" integer, "p_manual_overtime_hours" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_payroll_item_manual"("p_item_id" bigint, "p_base_amount" numeric, "p_meal_amount" numeric, "p_overtime_amount" numeric, "p_manual_overtime_amount" numeric, "p_overtime_bonus" numeric, "p_holiday_bonus" numeric, "p_kasbon_perusahaan_amount" numeric, "p_kasbon_warung_amount" numeric, "p_deduction_amount" numeric, "p_overtime_minutes" integer, "p_manual_overtime_hours" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_shipment_surat_jalan_photo"("p_shipment_id" bigint, "p_photo_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_shipment_surat_jalan_photo"("p_shipment_id" bigint, "p_photo_url" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_warehouse_receipt"("p_receipt_id" bigint, "p_receipt_date" "date", "p_quantity" numeric, "p_input_unit" "text", "p_conversion_factor" numeric, "p_supplier" "text", "p_document_no" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_warehouse_receipt"("p_receipt_id" bigint, "p_receipt_date" "date", "p_quantity" numeric, "p_input_unit" "text", "p_conversion_factor" numeric, "p_supplier" "text", "p_document_no" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."upsert_special_work_item_dependency"("p_product_id" bigint, "p_predecessor_work_item_id" bigint, "p_successor_work_item_id" bigint, "p_dependency_type" "text", "p_validation_mode" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_special_work_item_dependency"("p_product_id" bigint, "p_predecessor_work_item_id" bigint, "p_successor_work_item_id" bigint, "p_dependency_type" "text", "p_validation_mode" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."upsert_work_item_dependency"("p_product_id" bigint, "p_predecessor_work_item_id" bigint, "p_successor_work_item_id" bigint, "p_dependency_type" "text", "p_validation_mode" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_work_item_dependency"("p_product_id" bigint, "p_predecessor_work_item_id" bigint, "p_successor_work_item_id" bigint, "p_dependency_type" "text", "p_validation_mode" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."verify_attendance"("p_attendance_id" bigint, "p_day_class" "text", "p_overtime_minutes" integer, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_attendance"("p_attendance_id" bigint, "p_day_class" "text", "p_overtime_minutes" integer, "p_notes" "text") TO "authenticated";


















GRANT ALL ON SEQUENCE "public"."smpt_att_import_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_att_import_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_att_import_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."attendance_import_batches" TO "anon";
GRANT ALL ON TABLE "public"."attendance_import_batches" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."attendance_import_batches" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."attendance_import_batches_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."attendance_import_batches_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."attendance_import_batches_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."attendance_import_rows" TO "anon";
GRANT ALL ON TABLE "public"."attendance_import_rows" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."attendance_import_rows" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."attendance_import_rows_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."attendance_import_rows_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."attendance_import_rows_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."attendance_month_closures" TO "anon";
GRANT ALL ON TABLE "public"."attendance_month_closures" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_month_closures" TO "service_role";



GRANT ALL ON SEQUENCE "public"."attendance_month_closures_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."attendance_month_closures_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."attendance_month_closures_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_att_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_att_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_att_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."attendance_records" TO "anon";
GRANT ALL ON TABLE "public"."attendance_records" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_records" TO "service_role";



GRANT ALL ON SEQUENCE "public"."attendance_records_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."attendance_records_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."attendance_records_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_audit_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_audit_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_audit_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_events" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_events_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_bom_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_bom_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_bom_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bom_requirements" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."bom_requirements" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."smpt_material_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_material_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_material_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."materials" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."materials" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."smpt_product_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_product_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_product_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_products" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."project_products" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."projects" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."projects" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bom_requirements_calculated" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bom_requirements_calculated" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bom_requirements_calculated" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bom_requirements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bom_requirements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bom_requirements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bundle_package_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."bundle_package_balances" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bundle_package_balances_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bundle_package_balances_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bundle_package_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."bundle_package_recipes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bundle_package_recipes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bundle_package_recipes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bundle_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."bundle_packages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bundle_packages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bundle_packages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bundle_packing_log_items" TO "authenticated";
GRANT ALL ON TABLE "public"."bundle_packing_log_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bundle_packing_log_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bundle_packing_log_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bundle_packing_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."bundle_packing_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bundle_packing_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bundle_packing_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bundle_recipes" TO "anon";
GRANT ALL ON TABLE "public"."bundle_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."bundle_recipes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bundle_recipes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bundle_recipes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bundle_recipes_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cash_advance_payments" TO "anon";
GRANT ALL ON TABLE "public"."cash_advance_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_advance_payments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cash_advance_payments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cash_advance_payments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cash_advance_payments_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_advance_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_advance_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_advance_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cash_advances" TO "anon";
GRANT ALL ON TABLE "public"."cash_advances" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_advances" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cash_advances_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cash_advances_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cash_advances_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_cut_component_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_cut_component_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_cut_component_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cutting_components" TO "service_role";
GRANT SELECT ON TABLE "public"."cutting_components" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."cutting_components_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cutting_components_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cutting_components_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cutting_daily_results" TO "service_role";
GRANT SELECT ON TABLE "public"."cutting_daily_results" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."cutting_daily_results_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cutting_daily_results_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cutting_daily_results_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cutting_material_usages" TO "service_role";
GRANT SELECT ON TABLE "public"."cutting_material_usages" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."cutting_material_usages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cutting_material_usages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cutting_material_usages_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_issue_problem_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_issue_problem_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_issue_problem_code_seq" TO "service_role";



GRANT ALL ON TABLE "public"."embarkation_issues" TO "anon";
GRANT ALL ON TABLE "public"."embarkation_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."embarkation_issues" TO "service_role";



GRANT ALL ON SEQUENCE "public"."embarkation_issues_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."embarkation_issues_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."embarkation_issues_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_shipment_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_shipment_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_shipment_code_seq" TO "service_role";



GRANT ALL ON TABLE "public"."embarkation_shipments" TO "anon";
GRANT ALL ON TABLE "public"."embarkation_shipments" TO "authenticated";
GRANT ALL ON TABLE "public"."embarkation_shipments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."embarkation_shipments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."embarkation_shipments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."embarkation_shipments_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_target_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_target_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_target_code_seq" TO "service_role";



GRANT ALL ON TABLE "public"."embarkation_targets" TO "anon";
GRANT ALL ON TABLE "public"."embarkation_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."embarkation_targets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."embarkation_targets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."embarkation_targets_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."embarkation_targets_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_embarkation_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_embarkation_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_embarkation_code_seq" TO "service_role";



GRANT ALL ON TABLE "public"."embarkations" TO "anon";
GRANT ALL ON TABLE "public"."embarkations" TO "authenticated";
GRANT ALL ON TABLE "public"."embarkations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."embarkations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."embarkations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."embarkations_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_external_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_external_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_external_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."external_finished_receipts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."external_finished_receipts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."external_finished_receipts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."external_finished_receipts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."external_finished_receipts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."external_finished_receipts_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_finance_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_finance_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_finance_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finance_transactions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finance_transactions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finance_transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."finance_transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."finance_transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."finance_transactions_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_finished_good_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_finished_good_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_finished_good_code_seq" TO "service_role";



GRANT ALL ON TABLE "public"."finished_goods" TO "anon";
GRANT ALL ON TABLE "public"."finished_goods" TO "authenticated";
GRANT ALL ON TABLE "public"."finished_goods" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finished_goods_bundling" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finished_goods_bundling" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finished_goods_bundling" TO "service_role";



GRANT ALL ON SEQUENCE "public"."finished_goods_bundling_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."finished_goods_bundling_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."finished_goods_bundling_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finished_goods_bundling_items" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finished_goods_bundling_items" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finished_goods_bundling_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."finished_goods_bundling_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."finished_goods_bundling_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."finished_goods_bundling_items_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."finished_goods_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."finished_goods_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."finished_goods_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_transfer_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_transfer_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_transfer_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finished_goods_transfers" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finished_goods_transfers" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."finished_goods_transfers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."finished_goods_transfers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."finished_goods_transfers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."finished_goods_transfers_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_location_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_location_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_location_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."locations" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."locations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."locations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."locations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."locations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."logistics_stock_balances" TO "anon";
GRANT ALL ON TABLE "public"."logistics_stock_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."logistics_stock_balances" TO "service_role";



GRANT ALL ON SEQUENCE "public"."logistics_stock_balances_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."logistics_stock_balances_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."logistics_stock_balances_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_log_stock_event_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_log_stock_event_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_log_stock_event_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."logistics_stock_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."logistics_stock_events" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."logistics_stock_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."logistics_stock_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."logistics_stock_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."logistics_stock_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."logistics_stock_ledger" TO "anon";
GRANT ALL ON TABLE "public"."logistics_stock_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."logistics_stock_ledger" TO "service_role";



GRANT ALL ON SEQUENCE "public"."logistics_stock_ledger_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."logistics_stock_ledger_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."logistics_stock_ledger_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_mfg_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_mfg_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_mfg_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."manufacturing_transactions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."manufacturing_transactions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."manufacturing_transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."manufacturing_transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."manufacturing_transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."manufacturing_transactions_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_material_lot_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_material_lot_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_material_lot_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."material_lots" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."material_lots" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."material_lots" TO "service_role";



GRANT ALL ON SEQUENCE "public"."material_lots_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."material_lots_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."material_lots_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."material_request_items" TO "service_role";
GRANT SELECT ON TABLE "public"."material_request_items" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."material_request_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."material_request_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."material_request_items_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."material_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."material_requests" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."material_requests_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."material_requests_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."material_requests_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."material_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."material_suppliers" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."material_suppliers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."material_suppliers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."material_suppliers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."material_suppliers_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."materials_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."materials_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."materials_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."operator_payroll_items" TO "anon";
GRANT ALL ON TABLE "public"."operator_payroll_items" TO "authenticated";
GRANT ALL ON TABLE "public"."operator_payroll_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."operator_payroll_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."operator_payroll_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."operator_payroll_items_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_operator_payroll_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_operator_payroll_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_operator_payroll_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."operator_payroll_runs" TO "anon";
GRANT ALL ON TABLE "public"."operator_payroll_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."operator_payroll_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."operator_payroll_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."operator_payroll_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."operator_payroll_runs_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_pack_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_pack_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_pack_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."packing_runs" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."packing_runs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."packing_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."packing_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."packing_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."packing_runs_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_attendance_reviews" TO "anon";
GRANT ALL ON TABLE "public"."payroll_attendance_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_attendance_reviews" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payroll_attendance_reviews_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payroll_attendance_reviews_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payroll_attendance_reviews_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_payout_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."payroll_payout_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_payout_adjustments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payroll_payout_adjustments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payroll_payout_adjustments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payroll_payout_adjustments_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_payout_deductions" TO "anon";
GRANT ALL ON TABLE "public"."payroll_payout_deductions" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_payout_deductions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payroll_payout_deductions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payroll_payout_deductions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payroll_payout_deductions_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_payout_details" TO "anon";
GRANT ALL ON TABLE "public"."payroll_payout_details" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_payout_details" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payroll_payout_details_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payroll_payout_details_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payroll_payout_details_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_payout_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_payout_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_payout_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_payouts" TO "anon";
GRANT ALL ON TABLE "public"."payroll_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_payouts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payroll_payouts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payroll_payouts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payroll_payouts_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_run_details" TO "anon";
GRANT ALL ON TABLE "public"."payroll_run_details" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_run_details" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payroll_run_details_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payroll_run_details_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payroll_run_details_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_run_items" TO "anon";
GRANT ALL ON TABLE "public"."payroll_run_items" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_run_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payroll_run_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payroll_run_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payroll_run_items_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_payroll_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_payroll_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_payroll_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_runs" TO "anon";
GRANT ALL ON TABLE "public"."payroll_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payroll_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payroll_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payroll_runs_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_settings" TO "anon";
GRANT ALL ON TABLE "public"."payroll_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_settings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."permissions" TO "service_role";
GRANT SELECT ON TABLE "public"."permissions" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."permissions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."permissions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."permissions_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_petty_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_petty_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_petty_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."petty_cash_transactions" TO "anon";
GRANT ALL ON TABLE "public"."petty_cash_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."petty_cash_transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."petty_cash_transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."petty_cash_transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."petty_cash_transactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_set_components" TO "anon";
GRANT ALL ON TABLE "public"."product_set_components" TO "authenticated";
GRANT ALL ON TABLE "public"."product_set_components" TO "service_role";



GRANT ALL ON SEQUENCE "public"."product_set_components_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."product_set_components_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."product_set_components_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_set_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_set_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_set_code_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_sets" TO "anon";
GRANT ALL ON TABLE "public"."product_sets" TO "authenticated";
GRANT ALL ON TABLE "public"."product_sets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."product_sets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."product_sets_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."product_sets_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_production_anomaly_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_production_anomaly_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_production_anomaly_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."production_anomalies" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."production_anomalies" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."production_anomalies" TO "service_role";



GRANT ALL ON SEQUENCE "public"."production_anomalies_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."production_anomalies_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."production_anomalies_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_check_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_check_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_check_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."production_checks" TO "anon";
GRANT ALL ON TABLE "public"."production_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."production_checks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."production_checks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."production_checks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."production_checks_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_manual_result_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_manual_result_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_manual_result_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."production_manual_results" TO "anon";
GRANT ALL ON TABLE "public"."production_manual_results" TO "authenticated";
GRANT ALL ON TABLE "public"."production_manual_results" TO "service_role";



GRANT ALL ON SEQUENCE "public"."production_manual_results_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."production_manual_results_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."production_manual_results_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."production_order_items" TO "anon";
GRANT ALL ON TABLE "public"."production_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."production_order_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."production_order_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."production_order_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."production_order_items_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_spk_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_spk_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_spk_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."production_orders" TO "anon";
GRANT ALL ON TABLE "public"."production_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."production_orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."production_orders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."production_orders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."production_orders_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."production_wip_consumptions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."production_wip_consumptions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."production_wip_consumptions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."production_wip_consumptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."production_wip_consumptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."production_wip_consumptions_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."project_products_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."project_products_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."project_products_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."projects_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."projects_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."projects_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_order_lines" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_order_lines" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_order_lines" TO "service_role";



GRANT ALL ON SEQUENCE "public"."purchase_order_lines_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."purchase_order_lines_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."purchase_order_lines_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_orders" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."purchase_orders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."purchase_orders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."purchase_orders_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_plan_lines" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_plan_lines" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_plan_lines" TO "service_role";



GRANT ALL ON SEQUENCE "public"."purchase_plan_lines_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."purchase_plan_lines_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."purchase_plan_lines_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_purchase_plan_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_purchase_plan_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_purchase_plan_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_plans" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_plans" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_plans" TO "service_role";



GRANT ALL ON SEQUENCE "public"."purchase_plans_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."purchase_plans_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."purchase_plans_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_qc_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_qc_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_qc_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."qc_inspections" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."qc_inspections" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."qc_inspections" TO "service_role";



GRANT ALL ON SEQUENCE "public"."qc_inspections_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."qc_inspections_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."qc_inspections_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_rework_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_rework_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_rework_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."qc_reworks" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."qc_reworks" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."qc_reworks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."qc_reworks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."qc_reworks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."qc_reworks_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ready_production_usage_lots" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ready_production_usage_lots" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ready_production_usage_lots" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ready_production_usage_lots_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ready_production_usage_lots_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ready_production_usage_lots_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."ready_production_usages" TO "service_role";
GRANT SELECT ON TABLE "public"."ready_production_usages" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."ready_production_usages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ready_production_usages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ready_production_usages_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."role_permissions" TO "service_role";
GRANT SELECT ON TABLE "public"."role_permissions" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."roles" TO "service_role";
GRANT SELECT ON TABLE "public"."roles" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_salary_submission_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_salary_submission_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_salary_submission_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."salary_submissions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."salary_submissions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."salary_submissions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."salary_submissions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."salary_submissions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."salary_submissions_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_cut_result_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_cut_result_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_cut_result_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_cut_usage_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_cut_usage_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_cut_usage_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_data_backup_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_data_backup_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_data_backup_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_issue_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_issue_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_issue_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."smpt_keepalive_log" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."smpt_keepalive_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."smpt_keepalive_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_keepalive_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_keepalive_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_keepalive_log_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."smpt_keepalive_status" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."smpt_keepalive_status" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."smpt_keepalive_status" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_purchase_order_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_purchase_order_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_purchase_order_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_ready_usage_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_ready_usage_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_ready_usage_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_receipt_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_receipt_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_receipt_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_request_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_request_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_request_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_request_item_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_request_item_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_request_item_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_stock_event_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_stock_event_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_stock_event_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_system_test_run_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_system_test_run_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_system_test_run_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_vendor_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_vendor_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_vendor_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_work_item_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_work_item_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_work_item_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."smpt_worker_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."smpt_worker_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."smpt_worker_code_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stock_balances" TO "service_role";
GRANT ALL ON TABLE "public"."stock_balances" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."stock_balances_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stock_balances_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stock_balances_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stock_events" TO "service_role";
GRANT SELECT ON TABLE "public"."stock_events" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."stock_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stock_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stock_events_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stock_ledger_entries" TO "service_role";
GRANT ALL ON TABLE "public"."stock_ledger_entries" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."stock_ledger_entries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stock_ledger_entries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stock_ledger_entries_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stock_locations" TO "service_role";
GRANT SELECT ON TABLE "public"."stock_locations" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."stock_locations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stock_locations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stock_locations_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_data_backups" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_data_backups" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_data_backups" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_data_backups_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_data_backups_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_data_backups_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_test_run_entities" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_test_run_entities" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_test_run_entities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_test_run_entities_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_test_run_entities_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_test_run_entities_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_test_runs" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_test_runs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_test_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_test_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_test_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_test_runs_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_permission_overrides" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_permission_overrides" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."user_permission_overrides_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_permission_overrides_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_permission_overrides_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_worker_links" TO "anon";
GRANT ALL ON TABLE "public"."user_worker_links" TO "authenticated";
GRANT ALL ON TABLE "public"."user_worker_links" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."workers" TO "anon";
GRANT ALL ON TABLE "public"."workers" TO "authenticated";
GRANT ALL ON TABLE "public"."workers" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_cash_advance_balance" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_cash_advance_balance" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_cash_advance_balance" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_finance_activity" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_finance_activity" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_finance_activity" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_finished_stock" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_finished_stock" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_finished_stock" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_material_actual_consumption" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_material_actual_consumption" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_material_actual_consumption" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."warehouse_receipts" TO "service_role";
GRANT SELECT ON TABLE "public"."warehouse_receipts" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_material_lot_status" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_material_lot_status" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_material_lot_status" TO "service_role";



GRANT ALL ON TABLE "public"."vendors" TO "anon";
GRANT ALL ON TABLE "public"."vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."vendors" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_procurement_plan_lines" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_procurement_plan_lines" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_procurement_plan_lines" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_production_progress" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_production_progress" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_production_progress" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_purchase_order_open_lines" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_purchase_order_open_lines" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_purchase_order_open_lines" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_purchase_orders" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_purchase_orders" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."work_items" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."work_items" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_equivalent_progress" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_equivalent_progress" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_equivalent_progress" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."work_item_dependencies" TO "anon";
GRANT ALL ON TABLE "public"."work_item_dependencies" TO "authenticated";
GRANT ALL ON TABLE "public"."work_item_dependencies" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_routing_progress_anomalies" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_routing_progress_anomalies" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_routing_progress_anomalies" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_dependency_capacity" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_dependency_capacity" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_dependency_capacity" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_flow_overview" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_flow_overview" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_flow_overview" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_wip_available" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_wip_available" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_work_item_wip_available" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_delivery_logs" TO "anon";
GRANT ALL ON TABLE "public"."vendor_delivery_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_delivery_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendor_delivery_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendor_delivery_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendor_delivery_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_down_payments" TO "anon";
GRANT ALL ON TABLE "public"."vendor_down_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_down_payments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendor_down_payments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendor_down_payments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendor_down_payments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_po_targets" TO "anon";
GRANT ALL ON TABLE "public"."vendor_po_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_po_targets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendor_po_targets_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendor_po_targets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendor_po_targets_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendors_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendors_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendors_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."warehouse_issue_lots" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."warehouse_issue_lots" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."warehouse_issue_lots" TO "service_role";



GRANT ALL ON SEQUENCE "public"."warehouse_issue_lots_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."warehouse_issue_lots_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."warehouse_issue_lots_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."warehouse_issues" TO "service_role";
GRANT SELECT ON TABLE "public"."warehouse_issues" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."warehouse_issues_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."warehouse_issues_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."warehouse_issues_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."warehouse_receipts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."warehouse_receipts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."warehouse_receipts_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."warung_transaction_items" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."warung_transaction_items" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."warung_transaction_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."work_item_dependencies_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."work_item_dependencies_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."work_item_dependencies_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."work_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."work_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."work_items_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."workers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."workers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."workers_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";



































