-- Strict Permissions for ADMIN_MR_WU
-- Only keep dashboard.view, mr_wu.view, and mr_wu.confirm
delete from public.role_permissions
where role_id in (select id from public.roles where code = 'ADMIN_MR_WU')
  and permission_id in (select id from public.permissions where code = 'transfer_barang_jadi.view');
