-- ============================================================
-- SMPT V2 - ADD ROLE CUTTING (OPERATOR PEMOTONGAN BAHAN)
-- ============================================================

-- 1. Insert role CUTTING if not exists
insert into public.roles (name, code)
select 'Operator Cutting', 'CUTTING'
where not exists (
  select 1 from public.roles where upper(coalesce(code, name)) = 'CUTTING'
);

-- 2. Ensure permissions exist and link to CUTTING role
with preset(role_code, permission_code) as (
  values
    ('CUTTING', 'dashboard.view'),
    ('CUTTING', 'cutting.view'),
    ('CUTTING', 'cutting.write'),
    ('CUTTING', 'stok_gudang.view')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from preset x
join public.roles r on upper(coalesce(r.code, r.name)) = x.role_code
join public.permissions p on p.code = x.permission_code
on conflict do nothing;

notify pgrst, 'reload schema';
