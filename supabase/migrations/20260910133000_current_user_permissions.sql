-- ============================================================
-- SMPT V2
-- STEP 7G: expose the effective permission set for current user
--
-- The authoritative permission decision remains public.has_permission().
-- This helper returns only permission codes the authenticated user
-- is effectively allowed to use after role + per-user overrides.
-- ============================================================

create or replace function public.current_user_permissions()
returns table(permission_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code
  from public.permissions p
  where public.has_permission(p.code)
  order by p.code;
$$;

revoke all
on function public.current_user_permissions()
from public;

grant execute
on function public.current_user_permissions()
to authenticated;
