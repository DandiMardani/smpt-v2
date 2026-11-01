-- Migration: Secure cancel_manufacturing_transaction with fail-closed permission guards
-- Timestamp: 20261031150000

revoke all on function public.cancel_manufacturing_transaction(bigint, text) from public;
revoke all on function public.cancel_manufacturing_transaction(bigint, text) from anon;

create or replace function public.cancel_manufacturing_transaction(
  p_id bigint,
  p_reason text default null
) returns void
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_m public.manufacturing_transactions%rowtype;
  v_loc bigint;
  v_unit text;
  v_event bigint;
  v_perm text;
begin
  -- 1. Fail-closed permission check di awal fungsi, SEBELUM membaca, mengunci, atau mengubah data/stok
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or coalesce(auth.role(), '') <> 'authenticated' then
      raise exception 'Akses ditolak: sesi tidak valid atau belum terautentikasi.' using errcode = '42501';
    end if;

    if not (
      coalesce(public.has_permission('manufaktur.titipan.write'), false) or
      coalesce(public.has_permission('manufaktur.barang_luar.write'), false) or
      coalesce(public.has_permission('manufaktur.pengiriman.write'), false) or
      upper(coalesce(public.current_user_role(), '')) = 'ADMIN'
    ) then
      raise exception 'Tidak memiliki izin membatalkan transaksi manufaktur.' using errcode = '42501';
    end if;
  end if;

  -- 2. Kunci dan baca data transaksi manufaktur
  select * into v_m 
  from public.manufacturing_transactions 
  where id = p_id 
  for update;

  if not found then
    raise exception 'Transaksi manufaktur tidak ditemukan.';
  end if;

  if v_m.status = 'DIBATALKAN' then
    raise exception 'Transaksi sudah dibatalkan sebelumnya.';
  end if;

  -- 3. Validasi izin spesifik sesuai flow_type transaksi
  if coalesce(auth.role(), '') <> 'service_role' and upper(coalesce(public.current_user_role(), '')) <> 'ADMIN' then
    v_perm := case v_m.flow_type
      when 'TITIPAN' then 'manufaktur.titipan.write'
      when 'BARANG_LUAR' then 'manufaktur.barang_luar.write'
      when 'PENGIRIMAN' then 'manufaktur.pengiriman.write'
      else null
    end;

    if v_perm is null or not coalesce(public.has_permission(v_perm), false) then
      raise exception 'Tidak memiliki izin membatalkan transaksi manufaktur alur %.', v_m.flow_type using errcode = '42501';
    end if;
  end if;

  -- 4. Jika alur BARANG_LUAR dengan stok masuk, reverse stoknya secara atomik
  if v_m.flow_type = 'BARANG_LUAR' and v_m.finished_good_id is not null and v_m.quantity > 0 then
    -- Pembatalan wajib gagal jika transaksi tidak memiliki logistics_event_id asal
    if v_m.logistics_event_id is null then
      raise exception 'Transaksi manufaktur barang luar tidak memiliki riwayat event stok asal untuk dibatalkan.' using errcode = 'P0002';
    end if;

    -- Ambil lokasi dan unit_snapshot yang terbukti tepat dari ledger event inbound asal
    select location_id, unit_snapshot
    into v_loc, v_unit
    from public.logistics_stock_ledger
    where event_id = v_m.logistics_event_id
      and item_kind = 'FINISHED_GOOD'
      and finished_good_id = v_m.finished_good_id
    limit 1;

    -- Fail-closed: pembatalan gagal jika ledger event asal tidak membuktikan lokasi stok yang tepat.
    -- Dilarang menggunakan fallback lokasi tebakan (seperti PUSAT atau ID hardcoded).
    if v_loc is null then
      raise exception 'Lokasi gudang asal tidak ditemukan pada ledger event stok untuk pembalikan manufaktur.' using errcode = 'P0002';
    end if;

    if v_unit is null or btrim(v_unit) = '' then
      select coalesce(unit, 'PCS') into v_unit
      from public.finished_goods
      where id = v_m.finished_good_id;
    end if;

    v_event := public.smpt_new_logistics_event(
      'CANCEL_MANUFACTURING_BARANG_LUAR',
      'MANUFAKTUR',
      v_m.id,
      v_m.manufacturing_code,
      current_date,
      coalesce(p_reason, 'Pembatalan Manufaktur Barang Luar'),
      v_m.logistics_event_id
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

  -- 5. Update status transaksi manufaktur menjadi DIBATALKAN
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
revoke all on function public.cancel_manufacturing_transaction(bigint, text) from anon;
grant execute on function public.cancel_manufacturing_transaction(bigint, text) to authenticated;
grant execute on function public.cancel_manufacturing_transaction(bigint, text) to service_role;
