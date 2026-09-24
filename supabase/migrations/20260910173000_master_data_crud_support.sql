-- ============================================================
-- SMPT V2 - STEP 8B
-- Master Data CRUD support
-- Source-of-truth behavior: SMPT V1 final source
-- ============================================================

-- 1) Register write permissions used by V1 backend.
-- ADMIN keeps wildcard access. MANAGER remains read-only.
insert into public.permissions (code, description)
values
  ('master_proyek.write', 'Tambah, ubah, dan hapus Master Proyek.'),
  ('master_produk_proyek.write', 'Tambah dan ubah Produk/Tas per proyek.'),
  ('master_bahan.write', 'Tambah dan ubah Master Bahan.'),
  ('master_item.write', 'Ubah Master Item Pekerjaan. V1 membatasi perubahan ini ke ADMIN.'),
  ('master_kebutuhan.write', 'Tambah, ubah, dan hapus Master Kebutuhan/BOM.')
on conflict (code) do update
set description = excluded.description;

-- 2) Tighten Master Item writes to match final V1 behavior:
--    write permission + ADMIN role are both required.
drop policy if exists work_items_insert_master on public.work_items;
drop policy if exists work_items_update_master on public.work_items;

create policy work_items_insert_master
on public.work_items
for insert
to authenticated
with check (
  public.has_permission('master_item.write')
  and public.current_user_role() = 'ADMIN'
);

create policy work_items_update_master
on public.work_items
for update
to authenticated
using (
  public.has_permission('master_item.write')
  and public.current_user_role() = 'ADMIN'
)
with check (
  public.has_permission('master_item.write')
  and public.current_user_role() = 'ADMIN'
);

-- ============================================================
-- 3) Narrow reference RPCs
-- These expose only fields needed by dependent Master pages.
-- They avoid granting broad direct SELECT access to parent tables.
-- ============================================================

create or replace function public.master_reference_projects()
returns table (
  id bigint,
  project_code text,
  name text,
  product_category text,
  customer_name text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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

create or replace function public.master_reference_products(
  p_project_id bigint default null,
  p_include_inactive boolean default true
)
returns table (
  id bigint,
  product_code text,
  project_id bigint,
  name text,
  target_production numeric,
  unit text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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

create or replace function public.master_reference_materials(
  p_include_inactive boolean default true
)
returns table (
  id bigint,
  material_code text,
  name text,
  standard_unit text,
  category text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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

-- ============================================================
-- 4) Atomic Work Item save
-- V1 behavior preserved:
-- - only ADMIN can mutate Master Item
-- - project/product parent cannot be moved on edit
-- - one Output Final per Produk/Tas
-- - setting one Output Final automatically clears the previous one
-- - NONAKTIF item cannot remain Output Final
-- ============================================================

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

  if public.current_user_role() <> 'ADMIN'
     or not public.has_permission('master_item.write') then
    raise exception 'Perubahan Master Item Pekerjaan hanya boleh dilakukan oleh Admin.' using errcode = '42501';
  end if;

  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_unit := btrim(coalesce(p_unit, ''));
  v_status := upper(btrim(coalesce(p_status, 'AKTIF')));
  v_output_final := coalesce(p_output_final, false);

  if p_project_id is null then
    raise exception 'Proyek wajib dipilih.';
  end if;

  if p_product_id is null then
    raise exception 'Produk/Tas wajib dipilih.';
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
    raise exception 'Produk/Tas tidak ditemukan pada proyek yang dipilih.';
  end if;

  if v_status <> 'AKTIF' then
    v_output_final := false;
  end if;

  -- Serialize Output Final changes per Produk/Tas.
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

    if v_existing.project_id <> p_project_id then
      raise exception 'Item tidak dapat dipindahkan ke proyek lain.';
    end if;

    if v_existing.product_id is not null
       and v_existing.product_id <> p_product_id then
      raise exception 'Item tidak dapat dipindahkan ke Produk/Tas lain.';
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

create or replace function public.set_work_item_status(
  p_item_id bigint,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

-- ============================================================
-- 5) Atomic BOM save
-- - V2 UI requires Produk/Tas for every new operational BOM row
-- - BAHAN name/unit are derived from Master Bahan
-- - JASA/BIAYA never hold material_id
-- ============================================================

create or replace function public.save_bom_requirement(
  p_requirement_id bigint,
  p_project_id bigint,
  p_product_id bigint,
  p_material_id bigint,
  p_component_type text,
  p_component_name text,
  p_unit text,
  p_qty_per_unit numeric,
  p_unit_price numeric,
  p_status text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
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

-- ============================================================
-- 6) Function privileges
-- ============================================================

revoke all on function public.master_reference_projects() from public;
revoke all on function public.master_reference_products(bigint, boolean) from public;
revoke all on function public.master_reference_materials(boolean) from public;
revoke all on function public.save_work_item(bigint, bigint, bigint, text, text, integer, bigint, bigint, text, boolean) from public;
revoke all on function public.set_work_item_status(bigint, text) from public;
revoke all on function public.save_bom_requirement(bigint, bigint, bigint, bigint, text, text, text, numeric, numeric, text) from public;

grant execute on function public.master_reference_projects() to authenticated;
grant execute on function public.master_reference_products(bigint, boolean) to authenticated;
grant execute on function public.master_reference_materials(boolean) to authenticated;
grant execute on function public.save_work_item(bigint, bigint, bigint, text, text, integer, bigint, bigint, text, boolean) to authenticated;
grant execute on function public.set_work_item_status(bigint, text) to authenticated;
grant execute on function public.save_bom_requirement(bigint, bigint, bigint, bigint, text, text, text, numeric, numeric, text) to authenticated;
