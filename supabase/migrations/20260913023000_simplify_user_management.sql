-- SMPT V2 - Simplify ADMIN user management.
-- Adds ADMIN-only directory + role assignment RPCs.
-- Does not expose service_role and does not create auth users directly.

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
    )) as role_code
  from public.roles r
  where upper(coalesce(public.current_user_role(),'')) = 'ADMIN'
     or public.has_permission('access_control.write')
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
  if upper(coalesce(public.current_user_role(),'')) <> 'ADMIN'
     and not public.has_permission('access_control.write') then
    raise exception 'Hanya ADMIN yang dapat melihat Manajemen User.' using errcode='42501';
  end if;

  return query
  select
    u.id,
    coalesce(u.email,''),
    p.display_name,
    upper(coalesce(
      nullif(to_jsonb(r)->>'code',''),
      nullif(to_jsonb(r)->>'name',''),
      nullif(to_jsonb(r)->>'role',''),
      'USER'
    )),
    coalesce(p.is_active,true),
    uw.worker_id,
    w.name,
    w.worker_code,
    w.position
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
begin
  if upper(coalesce(public.current_user_role(),'')) <> 'ADMIN'
     and not public.has_permission('access_control.write') then
    raise exception 'Hanya ADMIN yang dapat mengubah akses user.' using errcode='42501';
  end if;

  if p_user_id is null then raise exception 'User wajib dipilih.'; end if;
  if v_role_code = '' then raise exception 'Role wajib dipilih.'; end if;

  select r.id::bigint into v_role_id
  from public.roles r
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

  if p_user_id=auth.uid() and (v_role_code <> 'ADMIN' or not coalesce(p_is_active,false)) then
    raise exception 'Akun ADMIN yang sedang dipakai tidak boleh menurunkan role atau menonaktifkan dirinya sendiri.';
  end if;

  update public.profiles
  set role_id=v_role_id,
      is_active=coalesce(p_is_active,true)
  where id=p_user_id;

  if p_worker_id is null then
    update public.user_worker_links set active=false, updated_at=now() where user_id=p_user_id and active=true;
  else
    perform 1 from public.workers where id=p_worker_id and status='AKTIF';
    if not found then raise exception 'Pekerja tidak ditemukan atau NONAKTIF.'; end if;

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
