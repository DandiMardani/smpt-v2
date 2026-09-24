-- SMPT V2 hotfix: expose the parameterless ADMIN user directory RPC to PostgREST.
-- Previous migration 20260913023000 already introduced this function.
-- This migration intentionally recreates the zero-argument signature and reloads
-- the PostgREST schema cache. Do not edit the already-applied 023000 migration.

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

-- Recreate the companion zero-argument role option RPC too, so both RPCs are
-- represented consistently in the same refreshed schema cache.
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

-- Supabase/PostgREST keeps a schema cache for RPC signatures. Force it to
-- re-read the functions immediately after this migration is applied.
notify pgrst, 'reload schema';
