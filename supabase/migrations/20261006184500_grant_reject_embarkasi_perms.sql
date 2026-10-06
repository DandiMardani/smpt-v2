-- Grant reject embarkasi permissions to ADMIN_EMBARKASI
do $$
declare
  v_role_id bigint;
  v_perm_id bigint;
  v_perm_code text;
  v_perms text[] := array['reject_embarkasi.view', 'reject_embarkasi.write'];
begin
  select id into v_role_id from public.roles where code = 'ADMIN_EMBARKASI' limit 1;

  if v_role_id is not null then
    foreach v_perm_code in array v_perms loop
      select id into v_perm_id from public.permissions where code = v_perm_code limit 1;
      if v_perm_id is not null then
        insert into public.role_permissions (role_id, permission_id)
        values (v_role_id, v_perm_id)
        on conflict do nothing;
      end if;
    end loop;
  end if;
end;
$$;
