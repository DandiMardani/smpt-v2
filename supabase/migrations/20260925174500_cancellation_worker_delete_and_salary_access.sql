-- ============================================================================
-- SMPT V2: CANCELLATION, EDITING, WORKER DELETION & SALARY ACCESS
-- ============================================================================

-- 1. Berikan role CUTTING hak akses untuk melihat Slip Gaji & Pekerjaan Saya
insert into public.role_permissions (role_id, permission_id)
select 8, p.id
from public.permissions p
where p.code in ('pekerjaan_saya.view', 'payroll.view', 'payroll.operator.view')
on conflict do nothing;

-- 2. Batalkan & Edit Penerimaan Barang Luar (external_finished_receipts) dengan Reversal Stok
create or replace function public.cancel_external_finished_receipt(
  p_receipt_id bigint,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
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
revoke all on function public.cancel_external_finished_receipt(bigint, text) from public;
grant execute on function public.cancel_external_finished_receipt(bigint, text) to authenticated;

create or replace function public.edit_external_finished_receipt(
  p_receipt_id bigint,
  p_document_no text,
  p_notes text
) returns void
language plpgsql security definer set search_path = ''
as $$
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
revoke all on function public.edit_external_finished_receipt(bigint, text, text) from public;
grant execute on function public.edit_external_finished_receipt(bigint, text, text) to authenticated;

-- 3. Batalkan & Edit Transaksi Manufaktur & Titipan (manufacturing_transactions)
create or replace function public.cancel_manufacturing_transaction(
  p_id bigint,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
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
revoke all on function public.cancel_manufacturing_transaction(bigint, text) from public;
grant execute on function public.cancel_manufacturing_transaction(bigint, text) to authenticated;

create or replace function public.edit_manufacturing_transaction(
  p_id bigint,
  p_document_no text,
  p_description text
) returns void
language plpgsql security definer set search_path = ''
as $$
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
revoke all on function public.edit_manufacturing_transaction(bigint, text, text) from public;
grant execute on function public.edit_manufacturing_transaction(bigint, text, text) to authenticated;

-- 4. Hapus / Nonaktifkan Pekerja (Master Pekerja)
create or replace function public.delete_master_worker(
  p_worker_id bigint
) returns text
language plpgsql security definer set search_path = ''
as $$
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
revoke all on function public.delete_master_worker(bigint) from public;
grant execute on function public.delete_master_worker(bigint) to authenticated;

notify pgrst, 'reload schema';
