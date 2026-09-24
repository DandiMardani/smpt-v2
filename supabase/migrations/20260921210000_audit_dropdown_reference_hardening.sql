-- SMPT V2 - audit hardening for dropdown references, cross-project integrity,
-- and SPK checker selection. New migration only; historical migrations untouched.

-- ============================================================================
-- 1) Reference SELECT policies
-- A user who can open an operational page must be able to read the narrow
-- master/reference rows needed to render its dropdowns. Write policies unchanged.
-- ============================================================================

drop policy if exists projects_page_reference_select on public.projects;
create policy projects_page_reference_select on public.projects
for select to authenticated using (
  public.has_permission('master_set.view')
  or public.has_permission('manufaktur.view')
  or public.has_permission('hasil_produksi.view')
  or public.has_permission('master_barang_jadi.view')
  or public.has_permission('log_bahan.view')
  or public.has_permission('master_item.view')
);

drop policy if exists project_products_page_reference_select on public.project_products;
create policy project_products_page_reference_select on public.project_products
for select to authenticated using (
  public.has_permission('manufaktur.view')
  or public.has_permission('hasil_produksi.view')
  or public.has_permission('master_barang_jadi.view')
  or public.has_permission('master_item.view')
);

drop policy if exists workers_page_reference_select on public.workers;
create policy workers_page_reference_select on public.workers
for select to authenticated using (
  public.has_permission('absensi.view')
  or public.has_permission('kasbon.view')
  or public.has_permission('access_control.view')
  or public.has_permission('stok_gudang.view')
);

drop policy if exists materials_manufacturing_reference_select on public.materials;
create policy materials_manufacturing_reference_select on public.materials
for select to authenticated using (public.has_permission('manufaktur.view'));

drop policy if exists finished_goods_page_reference_select on public.finished_goods;
create policy finished_goods_page_reference_select on public.finished_goods
for select to authenticated using (
  public.has_permission('master_set.view')
  or public.has_permission('transfer_barang_jadi.view')
  or public.has_permission('barang_luar.view')
  or public.has_permission('manufaktur.view')
);

drop policy if exists work_items_finished_goods_reference_select on public.work_items;
create policy work_items_finished_goods_reference_select on public.work_items
for select to authenticated using (public.has_permission('master_barang_jadi.view'));

drop policy if exists material_requests_stock_gudang_reference_select on public.material_requests;
create policy material_requests_stock_gudang_reference_select on public.material_requests
for select to authenticated using (public.has_permission('stok_gudang.view'));

drop policy if exists material_request_items_stock_gudang_reference_select on public.material_request_items;
create policy material_request_items_stock_gudang_reference_select on public.material_request_items
for select to authenticated using (public.has_permission('stok_gudang.view'));

grant select on public.projects, public.project_products, public.workers, public.materials,
  public.finished_goods, public.work_items, public.material_requests, public.material_request_items
  to authenticated;

-- ============================================================================
-- 2) Effective permission helper for a target user.
-- Mirrors the current resolver: ADMIN full access; otherwise exact override >
-- module wildcard > global wildcard > base role permission.
-- ============================================================================
create or replace function public.smpt_user_has_permission(p_user_id uuid, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
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
revoke all on function public.smpt_user_has_permission(uuid,text) from public;

create or replace function public.smpt_spk_checker_options()
returns table(user_id uuid,email text,display_name text,role_code text)
language plpgsql
stable
security definer
set search_path=''
as $$
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
revoke all on function public.smpt_spk_checker_options() from public;
grant execute on function public.smpt_spk_checker_options() to authenticated;

-- ============================================================================
-- 3) SPK creation: checker must be an active account with checker permission.
-- Also keep project/product/operator/supervisor relations valid at source.
-- ============================================================================
create or replace function public.create_production_order(
  p_order_date date,p_project_id bigint,p_product_id bigint,p_operator_worker_id bigint,
  p_checker_email text,p_supervisor_worker_id bigint default null,p_due_date date default null,p_notes text default null
) returns bigint
language plpgsql security definer set search_path=''
as $$
declare v_id bigint;v_checker_id uuid;
begin
  if not public.has_permission('spk.write') then raise exception 'Tidak memiliki izin membuat SPK.' using errcode='42501'; end if;

  perform 1 from public.projects where id=p_project_id and upper(coalesce(status,'')) not in ('SELESAI','NONAKTIF','BATAL','DIBATALKAN');
  if not found then raise exception 'Proyek tidak ditemukan atau sudah tidak aktif.'; end if;

  perform 1 from public.project_products where id=p_product_id and project_id=p_project_id and status='AKTIF';
  if not found then raise exception 'Produk/Tas tidak sesuai proyek atau NONAKTIF.'; end if;

  perform 1 from public.workers where id=p_operator_worker_id and status='AKTIF' and (upper(coalesce(position,'')) like '%OPERATOR%' or upper(coalesce(position,'')) like '%JAHIT%');
  if not found then raise exception 'Operator Jahit tidak ditemukan atau NONAKTIF.'; end if;

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
revoke all on function public.create_production_order(date,bigint,bigint,bigint,text,bigint,date,text) from public;
grant execute on function public.create_production_order(date,bigint,bigint,bigint,text,bigint,date,text) to authenticated;

-- ============================================================================
-- 4) Cross-project integrity for Barang Jadi and SET.
-- ============================================================================
create or replace function public.smpt_validate_finished_good_relations()
returns trigger language plpgsql set search_path='' as $$
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

drop trigger if exists finished_goods_validate_relations on public.finished_goods;
create trigger finished_goods_validate_relations
before insert or update of project_id,product_id,final_work_item_id on public.finished_goods
for each row execute function public.smpt_validate_finished_good_relations();

create or replace function public.smpt_validate_set_component_project()
returns trigger language plpgsql set search_path='' as $$
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

drop trigger if exists product_set_components_validate_project on public.product_set_components;
create trigger product_set_components_validate_project
before insert or update of set_id,finished_good_id on public.product_set_components
for each row execute function public.smpt_validate_set_component_project();

-- ============================================================================
-- 5) Manufacturing transaction validation. No second flow/table is introduced.
-- ============================================================================
create or replace function public.record_manufacturing_transaction(
  p_flow_type text,p_date date,p_project_id bigint,p_product_id bigint,p_material_id bigint,p_finished_good_id bigint,p_vendor_id bigint,p_quantity numeric,p_unit text,p_document_no text,p_description text
) returns bigint
language plpgsql security definer set search_path=''
as $$
declare
  v_flow text:=upper(btrim(coalesce(p_flow_type,'')));v_perm text;v_id bigint;v_code text;v_event bigint;v_loc bigint;
  v_fg_unit text;v_fg_project bigint;v_fg_product bigint;v_project bigint:=p_project_id;v_product bigint:=p_product_id;v_unit text:=nullif(btrim(coalesce(p_unit,'')),'');
begin
  if v_flow not in ('TITIPAN','BARANG_LUAR','PENGIRIMAN') then raise exception 'Flow Manufaktur tidak valid.'; end if;
  v_perm:=case v_flow when 'TITIPAN' then 'manufaktur.titipan.write' when 'BARANG_LUAR' then 'manufaktur.barang_luar.write' else 'manufaktur.pengiriman.write' end;
  if not public.has_permission(v_perm) then raise exception 'Tidak memiliki izin Manufaktur.' using errcode='42501';end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Qty harus lebih dari 0.'; end if;

  if v_project is not null then
    perform 1 from public.projects where id=v_project and upper(coalesce(status,'')) not in ('SELESAI','NONAKTIF','BATAL','DIBATALKAN');
    if not found then raise exception 'Proyek tidak ditemukan atau sudah tidak aktif.'; end if;
  end if;

  if v_product is not null then
    if v_project is null then raise exception 'Proyek wajib dipilih bila Produk/Tas dipilih.'; end if;
    perform 1 from public.project_products where id=v_product and project_id=v_project and status='AKTIF';
    if not found then raise exception 'Produk/Tas tidak sesuai Proyek atau NONAKTIF.'; end if;
  end if;

  if p_material_id is not null then
    perform 1 from public.materials where id=p_material_id and status='AKTIF';
    if not found then raise exception 'Bahan tidak ditemukan atau NONAKTIF.'; end if;
    if v_unit is null then select standard_unit into v_unit from public.materials where id=p_material_id; end if;
  end if;

  if p_finished_good_id is not null then
    select project_id,product_id,unit into v_fg_project,v_fg_product,v_fg_unit from public.finished_goods where id=p_finished_good_id and status='AKTIF';
    if v_fg_project is null then raise exception 'Barang Jadi tidak ditemukan atau NONAKTIF.'; end if;
    if v_project is null then v_project:=v_fg_project; elsif v_project<>v_fg_project then raise exception 'Barang Jadi tidak sesuai Proyek.'; end if;
    if v_product is null then v_product:=v_fg_product; elsif v_fg_product is not null and v_product<>v_fg_product then raise exception 'Barang Jadi tidak sesuai Produk/Tas.'; end if;
    if v_unit is null then v_unit:=v_fg_unit; end if;
  end if;

  if p_vendor_id is not null then
    perform 1 from public.vendors where id=p_vendor_id and status='AKTIF';
    if not found then raise exception 'Vendor tidak ditemukan atau NONAKTIF.'; end if;
  end if;

  if v_flow='BARANG_LUAR' and p_finished_good_id is null then raise exception 'Barang Jadi wajib dipilih untuk BARANG_LUAR.'; end if;

  insert into public.manufacturing_transactions(transaction_date,flow_type,project_id,product_id,material_id,finished_good_id,vendor_id,quantity,unit,document_no,description)
  values(coalesce(p_date,current_date),v_flow,v_project,v_product,p_material_id,p_finished_good_id,p_vendor_id,round(p_quantity::numeric,4),v_unit,p_document_no,p_description)
  returning id,manufacturing_code into v_id,v_code;

  if v_flow='BARANG_LUAR' then
    select id into v_loc from public.locations where name='PUSAT' limit 1;
    if v_loc is null then raise exception 'Lokasi PUSAT tidak ditemukan.'; end if;
    v_event:=public.smpt_new_logistics_event('MANUFAKTUR BARANG LUAR','MANUFAKTUR',v_id,v_code,coalesce(p_date,current_date),p_description,null);
    perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',p_finished_good_id,null,v_loc,p_quantity,coalesce(v_fg_unit,v_unit,'PCS'),'MANUFAKTUR MASUK',p_description);
    update public.manufacturing_transactions set logistics_event_id=v_event where id=v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.record_manufacturing_transaction(text,date,bigint,bigint,bigint,bigint,bigint,numeric,text,text,text) from public;
grant execute on function public.record_manufacturing_transaction(text,date,bigint,bigint,bigint,bigint,bigint,numeric,text,text,text) to authenticated;

notify pgrst, 'reload schema';

-- ==========================================================================
-- 6) Report/read-only reference visibility discovered by the full audit.
-- These are additive SELECT policies only; mutation authority is unchanged.
-- ==========================================================================

drop policy if exists work_items_produksi_reference_select on public.work_items;
create policy work_items_produksi_reference_select on public.work_items
for select to authenticated using (public.has_permission('produksi.view'));

drop policy if exists warehouse_issues_produksi_reference_select on public.warehouse_issues;
create policy warehouse_issues_produksi_reference_select on public.warehouse_issues
for select to authenticated using (public.has_permission('produksi.view'));

drop policy if exists production_orders_laporan_select on public.production_orders;
create policy production_orders_laporan_select on public.production_orders
for select to authenticated using (public.has_permission('laporan.view'));

drop policy if exists production_order_items_laporan_select on public.production_order_items;
create policy production_order_items_laporan_select on public.production_order_items
for select to authenticated using (public.has_permission('laporan.view'));

drop policy if exists production_checks_laporan_select on public.production_checks;
create policy production_checks_laporan_select on public.production_checks
for select to authenticated using (public.has_permission('laporan.view'));

drop policy if exists workers_laporan_select on public.workers;
create policy workers_laporan_select on public.workers
for select to authenticated using (public.has_permission('laporan.view'));

drop policy if exists petty_cash_laporan_select on public.petty_cash_transactions;
create policy petty_cash_laporan_select on public.petty_cash_transactions
for select to authenticated using (public.has_permission('laporan.view'));

drop policy if exists logistics_balances_laporan_select on public.logistics_stock_balances;
create policy logistics_balances_laporan_select on public.logistics_stock_balances
for select to authenticated using (public.has_permission('laporan.view'));

drop policy if exists finished_goods_laporan_select on public.finished_goods;
create policy finished_goods_laporan_select on public.finished_goods
for select to authenticated using (public.has_permission('laporan.view'));

drop policy if exists product_sets_laporan_select on public.product_sets;
create policy product_sets_laporan_select on public.product_sets
for select to authenticated using (public.has_permission('laporan.view'));

grant select on public.production_orders, public.production_order_items, public.production_checks,
  public.workers, public.petty_cash_transactions, public.logistics_stock_balances,
  public.finished_goods, public.product_sets, public.warehouse_issues, public.work_items
  to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- 7) Final audit fixes discovered during the second pass.
-- ============================================================================

-- Gudang Roll/Lot reads BOM rows as a reference for issue/assignment. Without
-- this SELECT-only policy a granular GUDANG user can open the page but see an
-- empty BOM dropdown even though the BOM exists.
drop policy if exists bom_requirements_stok_gudang_reference_select on public.bom_requirements;
create policy bom_requirements_stok_gudang_reference_select on public.bom_requirements
for select to authenticated using (public.has_permission('stok_gudang.view'));

grant select on public.bom_requirements to authenticated;

-- Hasil Produksi export reads v_work_item_equivalent_progress. The view is
-- security-invoker and work_items is an INNER source, so hasil_produksi.view
-- must be able to read work item labels or the export becomes empty.
drop policy if exists work_items_hasil_produksi_reference_select on public.work_items;
create policy work_items_hasil_produksi_reference_select on public.work_items
for select to authenticated using (public.has_permission('hasil_produksi.view'));

grant select on public.work_items to authenticated;

-- Master Item Routing needs aggregate progress, but master_item.view should not
-- receive raw SPK/check rows only to make a security-invoker view work. Expose a
-- narrow security-definer aggregate instead.
create or replace function public.smpt_master_item_equivalent_progress(p_product_id bigint)
returns table(
  work_item_id bigint,
  qty_sah numeric,
  equivalent_product numeric,
  equivalent_today numeric,
  target_raw_qty numeric,
  remaining_equivalent numeric,
  over_equivalent numeric,
  progress_percent numeric
)
language plpgsql
stable
security definer
set search_path=''
as $$
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

revoke all on function public.smpt_master_item_equivalent_progress(bigint) from public;
grant execute on function public.smpt_master_item_equivalent_progress(bigint) to authenticated;

notify pgrst, 'reload schema';
