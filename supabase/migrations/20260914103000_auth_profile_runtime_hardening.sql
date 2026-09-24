-- SMPT V2 runtime hardening: Auth/Profile/Role recovery
-- New migration only. Historical migrations remain untouched.

-- Ensure role resolver is strict about both profile and role activation.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.code::text
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid()
    and p.is_active = true
    and r.is_active = true
  limit 1;
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

-- Recreate the signup trigger defensively. New accounts always receive USER,
-- never a browser-provided role.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

drop trigger if exists smpt_create_profile_on_signup on auth.users;
create trigger smpt_create_profile_on_signup
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Repair orphaned Auth users only. Existing profile role/is_active values are never changed.
-- Least privilege is USER. Bootstrap recovery to ADMIN is allowed only when:
--   1) there is no active ADMIN profile at all, and
--   2) the missing profile belongs to the oldest Auth user.
do $$
declare
  v_user_role_id bigint;
  v_admin_role_id bigint;
  v_active_admin_count bigint;
  v_oldest_auth_user uuid;
begin
  select id into v_user_role_id from public.roles where code='USER' and is_active=true limit 1;
  select id into v_admin_role_id from public.roles where code='ADMIN' and is_active=true limit 1;

  if v_user_role_id is null then
    raise exception 'Role USER aktif wajib tersedia.';
  end if;

  select count(*) into v_active_admin_count
  from public.profiles p
  join public.roles r on r.id=p.role_id
  where p.is_active=true and r.is_active=true and r.code='ADMIN';

  select u.id into v_oldest_auth_user
  from auth.users u
  order by u.created_at asc, u.id asc
  limit 1;

  insert into public.profiles(id, role_id, display_name, email, is_active)
  select
    u.id,
    case
      when v_active_admin_count = 0
       and v_admin_role_id is not null
       and u.id = v_oldest_auth_user
      then v_admin_role_id
      else v_user_role_id
    end,
    coalesce(
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      split_part(u.email, '@', 1),
      'User'
    ),
    u.email,
    true
  from auth.users u
  left join public.profiles p on p.id=u.id
  where p.id is null
  on conflict(id) do nothing;
end;
$$;

notify pgrst, 'reload schema';
