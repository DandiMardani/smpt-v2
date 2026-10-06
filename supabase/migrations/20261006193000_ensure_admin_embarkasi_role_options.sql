-- Migration: Ensure ADMIN_EMBARKASI is in roles and smpt_admin_role_options
-- Timestamp: 20261006193000

-- 1. Ensure Role ADMIN_EMBARKASI exists in public.roles
insert into public.roles (code, name, description, is_active)
values (
  'ADMIN_EMBARKASI',
  'Admin Pengiriman Embarkasi',
  'Akses operasional distribusi koper haji: menerbitkan surat jalan, mengatur armada truk, pelacakan pengiriman, dan upload konfirmasi fisik asrama.',
  true
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true;

-- 2. Ensure permissions granted to ADMIN_EMBARKASI
do $$
declare
  v_role_id bigint;
  v_perm_code text;
  v_perm_id bigint;
  v_perms text[] := array[
    'dashboard.view',
    'pengiriman_embarkasi.view',
    'pengiriman_embarkasi.operate',
    'reject_embarkasi.view',
    'reject_embarkasi.write',
    'target_embarkasi.view',
    'stok_set.view',
    'stok_barang_jadi.view'
  ];
begin
  select id into v_role_id from public.roles where code = 'ADMIN_EMBARKASI' limit 1;

  if v_role_id is not null then
    foreach v_perm_code in array v_perms loop
      select id into v_perm_id from public.permissions where code = v_perm_code limit 1;
      if v_perm_id is not null then
        insert into public.role_permissions (role_id, permission_id)
        values (v_role_id, v_perm_id)
        on conflict do nothing;
      end if;
    end loop;
  end if;
end;
$$;

-- 3. Update smpt_admin_role_options to always return all active roles
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

revoke all on function public.smpt_admin_role_options() from public;
grant execute on function public.smpt_admin_role_options() to authenticated;

notify pgrst, 'reload schema';
