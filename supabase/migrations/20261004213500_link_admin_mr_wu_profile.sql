-- Link profile for admin.mrwu@smpt.com with role ADMIN_MR_WU
do $$
declare
  v_role_id bigint;
  v_user_id uuid;
begin
  select id into v_role_id from public.roles where code = 'ADMIN_MR_WU' limit 1;
  select id into v_user_id from auth.users where lower(email) = 'admin.mrwu@smpt.com' limit 1;

  if v_user_id is not null and v_role_id is not null then
    -- Confirm user email so login works immediately
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = v_user_id;

    -- Upsert profile
    insert into public.profiles (id, role_id, display_name, email, is_active)
    values (v_user_id, v_role_id, 'Admin MR WU', 'admin.mrwu@smpt.com', true)
    on conflict (id) do update
    set role_id = v_role_id,
        is_active = true,
        display_name = 'Admin MR WU';
  end if;
end;
$$;

notify pgrst, 'reload schema';
