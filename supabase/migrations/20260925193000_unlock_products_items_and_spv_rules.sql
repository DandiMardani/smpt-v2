-- ============================================================================
-- SMPT V2: UNLOCK PRODUCTS/ITEMS MOVE, SPV PERMISSION RESTRICTION, & SPK LOCKING
-- ============================================================================

-- 1. DROP IMMUTABLE PARENT TRIGGERS (Allows moving products and items if wrongly assigned)
drop trigger if exists project_products_parent_immutable on public.project_products;
drop trigger if exists work_items_parent_immutable on public.work_items;

create or replace function public.prevent_project_product_parent_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  return new;
end;
$$;

create or replace function public.prevent_work_item_parent_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  return new;
end;
$$;

-- 2. UPDATE FOREIGN KEY CONSTRAINTS WITH CASCADE UPDATE
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cutting_components') then
    alter table public.cutting_components
      drop constraint if exists cutting_components_project_id_product_id_fkey,
      add constraint cutting_components_project_id_product_id_fkey
      foreign key (project_id, product_id) references public.project_products(project_id, id)
      on update cascade on delete restrict;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'stock_events') then
    alter table public.stock_events
      drop constraint if exists stock_events_project_id_product_id_fkey,
      add constraint stock_events_project_id_product_id_fkey
      foreign key (project_id, product_id) references public.project_products(project_id, id)
      on update cascade on delete restrict;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'stock_balances') then
    alter table public.stock_balances
      drop constraint if exists stock_balances_project_id_product_id_fkey,
      add constraint stock_balances_project_id_product_id_fkey
      foreign key (project_id, product_id) references public.project_products(project_id, id)
      on update cascade on delete restrict;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'stock_ledger_entries') then
    alter table public.stock_ledger_entries
      drop constraint if exists stock_ledger_entries_project_id_product_id_fkey,
      add constraint stock_ledger_entries_project_id_product_id_fkey
      foreign key (project_id, product_id) references public.project_products(project_id, id)
      on update cascade on delete restrict;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cutting_orders') then
    alter table public.cutting_orders
      drop constraint if exists cutting_orders_project_id_product_id_fkey,
      add constraint cutting_orders_project_id_product_id_fkey
      foreign key (project_id, product_id) references public.project_products(project_id, id)
      on update cascade on delete restrict;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'repeat_order_items') then
    alter table public.repeat_order_items
      drop constraint if exists repeat_order_items_project_id_product_id_fkey,
      add constraint repeat_order_items_project_id_product_id_fkey
      foreign key (project_id, product_id) references public.project_products(project_id, id)
      on update cascade on delete restrict;
  end if;
end $$;

-- 3. PERBAIKI SAVE_WORK_ITEM (Bebaskan perubahan Proyek/Produk & hilangkan batasan role ADMIN kaku)
create or replace function public.save_work_item(
  p_item_id bigint,
  p_project_id bigint,
  p_product_id bigint,
  p_name text,
  p_unit text,
  p_qty_per_product integer,
  p_operator_price bigint,
  p_proposed_price bigint,
  p_status text,
  p_output_final boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.save_work_item(bigint, bigint, bigint, text, text, integer, bigint, bigint, text, boolean) from public;
grant execute on function public.save_work_item(bigint, bigint, bigint, text, text, integer, bigint, bigint, text, boolean) to authenticated;


-- 4. BATASI ROLE SUPERVISOR: HANYA BOLEH INPUT SPK & PERMINTAAN BARANG
-- Hapus izin write selain spk.write dan permintaan_produksi.write untuk SUPERVISOR
delete from public.role_permissions
where role_id in (select id from public.roles where upper(coalesce(code, name)) = 'SUPERVISOR')
  and permission_id in (
    select id from public.permissions
    where code not in ('spk.write', 'permintaan_produksi.write')
      and (code like '%.write' or code like '%.rework' or code like '%.operate')
  );


-- 5. PENGATURAN EDIT SPK OLEH SPV & PENGUNCIAN JIKA SUDAH DI-CHECK OLEH CHECKER
create or replace function public.add_production_order_item(
  p_order_id bigint,
  p_work_item_id bigint,
  p_assigned_qty numeric
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
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
revoke all on function public.add_production_order_item(bigint,bigint,numeric) from public;
grant execute on function public.add_production_order_item(bigint,bigint,numeric) to authenticated;


-- PENGUNCIAN HAPUS ITEM SPK: JIKA SUDAH DIPERIKSA CHECKER MAKA DITOLAK
create or replace function public.remove_production_order_item(
  p_order_id bigint,
  p_order_item_id bigint
)
returns void
language plpgsql
security definer
set search_path=''
as $$
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
revoke all on function public.remove_production_order_item(bigint,bigint) from public;
grant execute on function public.remove_production_order_item(bigint,bigint) to authenticated;

notify pgrst, 'reload schema';
