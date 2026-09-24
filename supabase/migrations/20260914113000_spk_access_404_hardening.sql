-- SMPT V2 - SPK access / false-404 hardening
-- New migration only. Historical migrations remain untouched.
-- Locked model: ADMIN = full system; MANAGER = read-only; SUPERVISOR = SPK authority.

-- Ensure the SPK catalog permissions exist.
insert into public.permissions(code, description) values
  ('spk.view', 'Melihat Surat Perintah Kerja.'),
  ('spk.write', 'Membuat dan mengelola Surat Perintah Kerja.')
on conflict (code) do nothing;

-- Repair role presets idempotently without touching USER overrides.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'spk.view'
where upper(coalesce(r.code,'')) in ('ADMIN','MANAGER','SUPERVISOR')
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'spk.write'
where upper(coalesce(r.code,'')) in ('ADMIN','SUPERVISOR')
on conflict do nothing;

-- ADMIN is explicitly locked as full-system. User override DENY must not
-- accidentally turn an ADMIN-only production page into a false 404.
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

  -- Locked behavior: ADMIN always has full system access.
  if v_role_code = 'ADMIN' then
    return true;
  end if;

  -- Exact user override > module wildcard > global wildcard for non-ADMIN roles.
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
    return upper(coalesce(v_override_effect,'')) = 'ALLOW';
  end if;

  return exists (
    select 1
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where upper(r.code) = v_role_code
      and r.is_active = true
      and lower(p.code) = v_requested
  );
end;
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

-- Refresh permission RPC result after resolver repair.
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
  order by p.code::text;
$$;

revoke all on function public.current_user_permissions() from public;
grant execute on function public.current_user_permissions() to authenticated;

notify pgrst, 'reload schema';
