-- SMPT V2 hotfix: make smpt_admin_user_directory() RETURN QUERY types
-- exactly match the declared RETURNS TABLE signature.
-- Do not edit previously applied migrations 20260913023000 / 20260913024000.

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

notify pgrst, 'reload schema';
