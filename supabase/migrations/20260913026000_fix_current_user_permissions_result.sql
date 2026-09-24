-- SMPT V2 hotfix
-- Make current_user_permissions() return an explicit TEXT column so
-- PostgREST/Supabase sees an exact match with RETURNS TABLE(permission_code text).
-- Does not change permission mappings, RBAC decisions, RLS, or historical migrations.

create or replace function public.current_user_permissions()
returns table(permission_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code::text as permission_code
  from public.permissions p
  where public.has_permission(p.code::text)
  order by p.code::text;
$$;

revoke all
on function public.current_user_permissions()
from public;

grant execute
on function public.current_user_permissions()
to authenticated;

notify pgrst, 'reload schema';
