-- Seed Admin MR WU account exactly like Bony
do $$
declare
  v_user_id uuid;
  v_role_id bigint;
begin
  select id into v_role_id from public.roles where code = 'ADMIN_MR_WU' limit 1;

  -- Delete existing unconfirmed signup if any
  delete from auth.identities where identity_data->>'email' = 'admin.mrwu@smpt.com';
  delete from public.profiles where lower(email) = 'admin.mrwu@smpt.com';
  delete from auth.users where lower(email) = 'admin.mrwu@smpt.com';

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    'admin.mrwu@smpt.com',
    extensions.crypt('Mrwu1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Admin MR WU","full_name":"Admin MR WU"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    json_build_object('sub', v_user_id::text, 'email', 'admin.mrwu@smpt.com')::jsonb,
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  if v_role_id is not null then
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
