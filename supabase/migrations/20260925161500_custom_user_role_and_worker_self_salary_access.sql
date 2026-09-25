-- ============================================================================
-- SMPT V2: CUSTOM ROLE PERMISSIONS & WORKER SELF SALARY ACCESS
-- ============================================================================

-- 1. Perbarui fungsi has_permission agar:
--    a) Jika user terhubung ke Master Pekerja (user_worker_links), otomatis izinkan pekerjaan_saya.*
--    b) Tetap menghormati user_permission_overrides dan role_permissions
create or replace function public.has_permission(p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
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
revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- 2. Refresh permission RPC
create or replace function public.current_user_permissions()
returns table(permission_code text)
language sql
stable
security definer
set search_path = ''
as $$
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
revoke all on function public.current_user_permissions() from public;
grant execute on function public.current_user_permissions() to authenticated;

-- 3. Policy RLS agar ADMIN dapat mengelola user_permission_overrides
drop policy if exists user_overrides_admin_all on public.user_permission_overrides;
create policy user_overrides_admin_all on public.user_permission_overrides
for all to authenticated
using (
  upper(coalesce(public.current_user_role(), '')) = 'ADMIN'
  or public.has_permission('access_control.write')
)
with check (
  upper(coalesce(public.current_user_role(), '')) = 'ADMIN'
  or public.has_permission('access_control.write')
);

grant select, insert, update, delete on public.user_permission_overrides to authenticated;

notify pgrst, 'reload schema';
