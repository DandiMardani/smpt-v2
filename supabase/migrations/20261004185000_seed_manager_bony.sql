-- Create or update manager Bony on dev database
do $$
declare
  v_user_id uuid;
  v_manager_role_id bigint;
begin
  -- Get manager role id
  select id into v_manager_role_id from public.roles where code = 'MANAGER' and is_active = true limit 1;
  if v_manager_role_id is null then
    select id into v_manager_role_id from public.roles where code = 'MANAGER' limit 1;
  end if;

  -- Check if user already exists
  select id into v_user_id from auth.users where lower(email) = 'bony@gmail.com' limit 1;

  if v_user_id is null then
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
      'bony@gmail.com',
      extensions.crypt('Bony1234', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Bony","full_name":"Bony"}'::jsonb,
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
      json_build_object('sub', v_user_id::text, 'email', 'bony@gmail.com')::jsonb,
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    )
    on conflict do nothing;

  else
    -- Update existing user password
    update auth.users
    set encrypted_password = extensions.crypt('Bony1234', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = v_user_id;
  end if;

  -- Upsert profile with MANAGER role
  if v_manager_role_id is not null then
    insert into public.profiles (id, role_id, display_name, email, is_active)
    values (v_user_id, v_manager_role_id, 'Bony', 'bony@gmail.com', true)
    on conflict (id) do update
    set role_id = v_manager_role_id,
        is_active = true,
        display_name = 'Bony';
  end if;
end;
$$;
