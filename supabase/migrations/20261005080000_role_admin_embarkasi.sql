-- Migration: Role and Account for Admin Pengiriman Embarkasi
-- Timestamp: 20261005080000

-- 1. Create Role ADMIN_EMBARKASI
insert into public.roles (code, name, description, is_active)
values (
  'ADMIN_EMBARKASI',
  'Admin Pengiriman Embarkasi',
  'Akses operasional distribusi koper haji: menerbitkan surat jalan, mengatur armada truk, pelacakan pengiriman, dan upload konfirmasi fisik asrama.',
  true
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true;

-- 2. Grant permissions to ADMIN_EMBARKASI
do $$
declare
  v_role_id bigint;
  v_perm_code text;
  v_perm_id bigint;
  v_perms text[] := array[
    'dashboard.view',
    'pengiriman_embarkasi.view',
    'pengiriman_embarkasi.operate',
    'target_embarkasi.view',
    'stok_set.view',
    'stok_barang_jadi.view'
  ];
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

-- 3. Seed User admin.embarkasi@smpt.com (password: Embarkasi123)
do $$
declare
  v_user_id uuid;
  v_role_id bigint;
begin
  select id into v_role_id from public.roles where code = 'ADMIN_EMBARKASI' limit 1;

  -- Delete existing if any
  delete from auth.identities where identity_data->>'email' = 'admin.embarkasi@smpt.com';
  delete from public.profiles where lower(email) = 'admin.embarkasi@smpt.com';
  delete from auth.users where lower(email) = 'admin.embarkasi@smpt.com';

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
    'admin.embarkasi@smpt.com',
    extensions.crypt('Embarkasi123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Admin Pengiriman Embarkasi","full_name":"Admin Pengiriman Embarkasi"}'::jsonb,
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
    json_build_object('sub', v_user_id::text, 'email', 'admin.embarkasi@smpt.com')::jsonb,
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  if v_role_id is not null then
    insert into public.profiles (id, role_id, display_name, email, is_active)
    values (v_user_id, v_role_id, 'Admin Pengiriman Embarkasi', 'admin.embarkasi@smpt.com', true)
    on conflict (id) do update
    set role_id = v_role_id,
        is_active = true,
        display_name = 'Admin Pengiriman Embarkasi';
  end if;
end;
$$;

notify pgrst, 'reload schema';
