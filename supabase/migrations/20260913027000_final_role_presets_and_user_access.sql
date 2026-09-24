-- ============================================================
-- SMPT V2 - FINAL ROLE PRESETS + USER ACCESS HARDENING
-- New migration only. Do not edit previously pushed migrations.
--
-- Locked model:
-- ADMIN       = full system / administration
-- MANAGER     = broad read-only monitoring + report/export
-- SUPERVISOR  = production/SPK/QC operational authority
-- GUDANG      = inventory/warehouse/logistics authority
-- PEKERJA     = own work / own data only
-- USER        = flexible base role, extra access via user override
-- CHECKER     = legacy compatibility only
-- ============================================================

-- Permissions used by the existing V2 manufacturing runtime. These are not
-- new concepts; ON CONFLICT only makes the runtime catalog self-consistent.
insert into public.permissions(code, description) values
  ('manufaktur.titipan.write', 'Mencatat transaksi bahan titipan / non-aset.'),
  ('manufaktur.barang_luar.write', 'Mencatat hasil produksi/barang jadi eksternal.'),
  ('manufaktur.pengiriman.write', 'Mencatat pengiriman pada flow produksi eksternal.')
on conflict (code) do update set description = excluded.description;

-- Replace role defaults only. Per-user ALLOW/DENY overrides are deliberately
-- untouched, so exceptions remain separate from role presets.
delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and upper(coalesce(
    nullif(to_jsonb(r)->>'code',''),
    nullif(to_jsonb(r)->>'name',''),
    nullif(to_jsonb(r)->>'role',''),
    ''
  )) in ('ADMIN','MANAGER','SUPERVISOR','GUDANG','PEKERJA','USER','CHECKER');

-- ADMIN = all permissions currently registered in the catalog.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where upper(coalesce(
  nullif(to_jsonb(r)->>'code',''),
  nullif(to_jsonb(r)->>'name',''),
  nullif(to_jsonb(r)->>'role',''),
  ''
)) = 'ADMIN'
on conflict do nothing;

-- All other role presets are explicit and least-privilege. Permission codes
-- not present in the current catalog are simply ignored for compatibility.
with preset(role_code, permission_code) as (
  values
    -- MANAGER: broad monitoring, no write/operate/receive/fulfill/rework.
    ('MANAGER','dashboard.view'),
    ('MANAGER','master_proyek.view'),
    ('MANAGER','master_produk_proyek.view'),
    ('MANAGER','master_item.view'),
    ('MANAGER','master_kebutuhan.view'),
    ('MANAGER','master_bahan.view'),
    ('MANAGER','master_pekerja.view'),
    ('MANAGER','master_barang_jadi.view'),
    ('MANAGER','master_lokasi.view'),
    ('MANAGER','master_vendor.view'),
    ('MANAGER','master_embarkasi.view'),
    ('MANAGER','barang_masuk_gudang.view'),
    ('MANAGER','barang_keluar_gudang.view'),
    ('MANAGER','stok_gudang.view'),
    ('MANAGER','log_bahan.view'),
    ('MANAGER','cutting.view'),
    ('MANAGER','sablon.view'),
    ('MANAGER','permintaan_produksi.view'),
    ('MANAGER','spk.view'),
    ('MANAGER','produksi.view'),
    ('MANAGER','borongan.view'),
    ('MANAGER','hasil_produksi.view'),
    ('MANAGER','manufaktur.view'),
    ('MANAGER','manufaktur.internal.view'),
    ('MANAGER','manufaktur.titipan.view'),
    ('MANAGER','manufaktur.barang_luar.view'),
    ('MANAGER','manufaktur.pengiriman.view'),
    ('MANAGER','qc.view'),
    ('MANAGER','stok_barang_jadi.view'),
    ('MANAGER','transfer_barang_jadi.view'),
    ('MANAGER','barang_luar.view'),
    ('MANAGER','master_set.view'),
    ('MANAGER','packing_set.view'),
    ('MANAGER','stok_set.view'),
    ('MANAGER','target_embarkasi.view'),
    ('MANAGER','pengiriman_embarkasi.view'),
    ('MANAGER','reject_embarkasi.view'),
    ('MANAGER','absensi.view'),
    ('MANAGER','payroll.view'),
    ('MANAGER','payroll.operator.view'),
    ('MANAGER','kasbon.view'),
    ('MANAGER','kas_kecil.view'),
    ('MANAGER','keuangan.view'),
    ('MANAGER','laporan.view'),

    -- SUPERVISOR: production/SPK/assignment/QC/rework; no admin/finance/payroll.
    ('SUPERVISOR','dashboard.view'),
    ('SUPERVISOR','master_produk_proyek.view'),
    ('SUPERVISOR','master_item.view'),
    ('SUPERVISOR','cutting.view'),
    ('SUPERVISOR','cutting.write'),
    ('SUPERVISOR','sablon.view'),
    ('SUPERVISOR','sablon.write'),
    ('SUPERVISOR','permintaan_produksi.view'),
    ('SUPERVISOR','permintaan_produksi.write'),
    ('SUPERVISOR','spk.view'),
    ('SUPERVISOR','spk.write'),
    ('SUPERVISOR','produksi.view'),
    ('SUPERVISOR','produksi.write'),
    ('SUPERVISOR','borongan.view'),
    ('SUPERVISOR','hasil_produksi.view'),
    ('SUPERVISOR','manufaktur.view'),
    ('SUPERVISOR','manufaktur.internal.view'),
    ('SUPERVISOR','manufaktur.titipan.view'),
    ('SUPERVISOR','manufaktur.barang_luar.view'),
    ('SUPERVISOR','manufaktur.pengiriman.view'),
    ('SUPERVISOR','qc.view'),
    ('SUPERVISOR','qc.operate'),
    ('SUPERVISOR','qc.rework'),

    -- GUDANG: physical custody and logistics. Log Bahan stays monitoring-only.
    ('GUDANG','dashboard.view'),
    ('GUDANG','master_bahan.view'),
    ('GUDANG','master_barang_jadi.view'),
    ('GUDANG','master_lokasi.view'),
    ('GUDANG','master_vendor.view'),
    ('GUDANG','master_embarkasi.view'),
    ('GUDANG','barang_masuk_gudang.view'),
    ('GUDANG','barang_masuk_gudang.write'),
    ('GUDANG','barang_keluar_gudang.view'),
    ('GUDANG','barang_keluar_gudang.write'),
    ('GUDANG','stok_gudang.view'),
    ('GUDANG','stok_gudang.write'),
    ('GUDANG','log_bahan.view'),
    ('GUDANG','cutting.view'),
    ('GUDANG','sablon.view'),
    ('GUDANG','permintaan_produksi.view'),
    ('GUDANG','permintaan_produksi.fulfill'),
    ('GUDANG','manufaktur.view'),
    ('GUDANG','manufaktur.titipan.view'),
    ('GUDANG','manufaktur.titipan.write'),
    ('GUDANG','manufaktur.barang_luar.view'),
    ('GUDANG','manufaktur.barang_luar.write'),
    ('GUDANG','manufaktur.pengiriman.view'),
    ('GUDANG','manufaktur.pengiriman.write'),
    ('GUDANG','stok_barang_jadi.view'),
    ('GUDANG','stok_barang_jadi.write'),
    ('GUDANG','transfer_barang_jadi.view'),
    ('GUDANG','transfer_barang_jadi.write'),
    ('GUDANG','barang_luar.view'),
    ('GUDANG','barang_luar.receive'),
    ('GUDANG','master_set.view'),
    ('GUDANG','packing_set.view'),
    ('GUDANG','packing_set.write'),
    ('GUDANG','stok_set.view'),
    ('GUDANG','target_embarkasi.view'),
    ('GUDANG','pengiriman_embarkasi.view'),
    ('GUDANG','pengiriman_embarkasi.operate'),
    ('GUDANG','reject_embarkasi.view'),
    ('GUDANG','reject_embarkasi.write'),

    -- PEKERJA: only own-work surface; row/resource scoping remains server-side.
    ('PEKERJA','dashboard.view'),
    ('PEKERJA','pekerjaan_saya.view'),

    -- USER: intentionally minimal; add exceptions through user overrides.
    ('USER','dashboard.view'),

    -- CHECKER legacy compatibility only.
    ('CHECKER','dashboard.view'),
    ('CHECKER','borongan.view'),
    ('CHECKER','borongan.operate')
)
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from preset x
join public.roles r
  on upper(coalesce(
    nullif(to_jsonb(r)->>'code',''),
    nullif(to_jsonb(r)->>'name',''),
    nullif(to_jsonb(r)->>'role',''),
    ''
  )) = x.role_code
join public.permissions p on p.code = x.permission_code
on conflict do nothing;

-- User Management is ADMIN-only at the RPC boundary.
create or replace function public.smpt_admin_role_options()
returns table(role_id bigint, role_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id::bigint,
    upper(coalesce(
      nullif(to_jsonb(r)->>'code',''),
      nullif(to_jsonb(r)->>'name',''),
      nullif(to_jsonb(r)->>'role',''),
      'ROLE-' || r.id::text
    ))::text as role_code
  from public.roles r
  where upper(coalesce(public.current_user_role(),'')) = 'ADMIN'
  order by r.id;
$$;

revoke all on function public.smpt_admin_role_options() from public;
grant execute on function public.smpt_admin_role_options() to authenticated;

create or replace function public.smpt_admin_user_directory()
returns table(
  user_id uuid,
  email text,
  display_name text,
  role_code text,
  is_active boolean,
  worker_id bigint,
  worker_name text,
  worker_code text,
  worker_position text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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

revoke all on function public.smpt_admin_user_directory() from public;
grant execute on function public.smpt_admin_user_directory() to authenticated;

create or replace function public.smpt_admin_save_user_access(
  p_user_id uuid,
  p_role_code text,
  p_worker_id bigint default null,
  p_is_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.smpt_admin_save_user_access(uuid,text,bigint,boolean) from public;
grant execute on function public.smpt_admin_save_user_access(uuid,text,bigint,boolean) to authenticated;

notify pgrst, 'reload schema';
