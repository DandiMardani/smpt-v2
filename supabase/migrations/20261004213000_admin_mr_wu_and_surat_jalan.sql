-- Migration: Admin MR WU Role, Surat Jalan Photo, and Confirmation Support
-- Description:
-- 1. Create role ADMIN_MR_WU
-- 2. Add columns to finished_goods_transfers (document_no, driver_name, vehicle_no, delivery_status, received_qty, reject_qty, damaged_qty, received_at, received_by, received_notes, surat_jalan_photo_url)
-- 3. Add column to embarkation_shipments (surat_jalan_photo_url)
-- 4. Create storage bucket 'shipment-documents'
-- 5. RPC confirm_transfer_receipt & update_shipment_surat_jalan_photo
-- 6. Seed user admin.mrwu@smpt.com (password: Mrwu1234)

-- 1. Create Role
insert into public.roles (code, name, description, is_active)
values (
  'ADMIN_MR_WU',
  'Admin Mitra MR WU',
  'Akses portal mitra MR WU: monitoring stok 3 gudang MR WU dan konfirmasi penerimaan pengiriman beserta foto bukti surat jalan.',
  true
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true;

-- 2. Permissions for MR WU
insert into public.permissions (code, description)
values
  ('mr_wu.view', 'Melihat portal, stok 3 gudang dan transfer mitra MR WU'),
  ('mr_wu.confirm', 'Konfirmasi penerimaan barang dan upload foto surat jalan MR WU')
on conflict (code) do update
set description = excluded.description;

-- Grant permissions to ADMIN_MR_WU role
do $$
declare
  v_role_id bigint;
  v_p_dash bigint;
  v_p_wu_v bigint;
  v_p_wu_c bigint;
  v_p_trf_v bigint;
begin
  select id into v_role_id from public.roles where code = 'ADMIN_MR_WU' limit 1;
  select id into v_p_dash from public.permissions where code = 'dashboard.view' limit 1;
  select id into v_p_wu_v from public.permissions where code = 'mr_wu.view' limit 1;
  select id into v_p_wu_c from public.permissions where code = 'mr_wu.confirm' limit 1;
  select id into v_p_trf_v from public.permissions where code = 'transfer_barang_jadi.view' limit 1;

  if v_role_id is not null then
    insert into public.role_permissions (role_id, permission_id)
    values
      (v_role_id, v_p_dash),
      (v_role_id, v_p_wu_v),
      (v_role_id, v_p_wu_c),
      (v_role_id, v_p_trf_v)
    on conflict do nothing;
  end if;

  -- Also grant mr_wu permissions to ADMIN and MANAGER
  for v_role_id in select id from public.roles where code in ('ADMIN', 'MANAGER') loop
    insert into public.role_permissions (role_id, permission_id)
    values (v_role_id, v_p_wu_v), (v_role_id, v_p_wu_c)
    on conflict do nothing;
  end loop;
end;
$$;

-- 3. Add columns to finished_goods_transfers
alter table public.finished_goods_transfers
  add column if not exists document_no text,
  add column if not exists driver_name text,
  add column if not exists vehicle_no text,
  add column if not exists delivery_status text not null default 'DITERIMA',
  add column if not exists received_qty numeric,
  add column if not exists reject_qty numeric default 0,
  add column if not exists damaged_qty numeric default 0,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users(id),
  add column if not exists received_notes text,
  add column if not exists surat_jalan_photo_url text;

-- Update existing transfers to populate received_qty from quantity if null
update public.finished_goods_transfers
set received_qty = quantity,
    delivery_status = 'DITERIMA',
    received_at = coalesce(received_at, created_at)
where received_qty is null;

-- Populate document_no from notes if matching pattern
update public.finished_goods_transfers
set document_no = substring(notes from '([A-Z0-9\-]+)\s*·')
where document_no is null and notes ~ '^[A-Z0-9\-]+\s*·';

-- 4. Add column to embarkation_shipments
alter table public.embarkation_shipments
  add column if not exists surat_jalan_photo_url text;

-- 5. Storage bucket for shipment documents
insert into storage.buckets (id, name, public)
values ('shipment-documents', 'shipment-documents', true)
on conflict (id) do update set public = true;

drop policy if exists "Authenticated users can upload shipment documents" on storage.objects;
create policy "Authenticated users can upload shipment documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'shipment-documents');

drop policy if exists "Authenticated users can update shipment documents" on storage.objects;
create policy "Authenticated users can update shipment documents"
on storage.objects for update to authenticated
using (bucket_id = 'shipment-documents');

drop policy if exists "Anyone can read shipment documents" on storage.objects;
create policy "Anyone can read shipment documents"
on storage.objects for select to public
using (bucket_id = 'shipment-documents');

-- 6. RPC functions
create or replace function public.confirm_transfer_receipt(
  p_transfer_id bigint,
  p_received_qty numeric,
  p_reject_qty numeric default 0,
  p_damaged_qty numeric default 0,
  p_notes text default null,
  p_photo_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.finished_goods_transfers%rowtype;
begin
  select * into v_t from public.finished_goods_transfers where id = p_transfer_id for update;
  if not found then
    raise exception 'Data transfer tidak ditemukan.';
  end if;

  update public.finished_goods_transfers
  set delivery_status = 'DITERIMA',
      received_qty = coalesce(p_received_qty, quantity),
      reject_qty = coalesce(p_reject_qty, 0),
      damaged_qty = coalesce(p_damaged_qty, 0),
      received_at = now(),
      received_by = auth.uid(),
      received_notes = p_notes,
      surat_jalan_photo_url = coalesce(p_photo_url, surat_jalan_photo_url)
  where id = p_transfer_id;

  return json_build_object('success', true, 'id', p_transfer_id);
end;
$$;
revoke all on function public.confirm_transfer_receipt(bigint, numeric, numeric, numeric, text, text) from public;
grant execute on function public.confirm_transfer_receipt(bigint, numeric, numeric, numeric, text, text) to authenticated;

create or replace function public.update_shipment_surat_jalan_photo(
  p_shipment_id bigint,
  p_photo_url text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.embarkation_shipments
  set surat_jalan_photo_url = p_photo_url,
      updated_at = now()
  where id = p_shipment_id;

  return json_build_object('success', true, 'id', p_shipment_id);
end;
$$;
revoke all on function public.update_shipment_surat_jalan_photo(bigint, text) from public;
grant execute on function public.update_shipment_surat_jalan_photo(bigint, text) to authenticated;

-- 7. Seed Admin MR WU user account
do $$
declare
  v_user_id uuid;
  v_role_id bigint;
begin
  select id into v_role_id from public.roles where code = 'ADMIN_MR_WU' limit 1;

  select id into v_user_id from auth.users where lower(email) = 'admin.mrwu@smpt.com' limit 1;

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
    )
    on conflict do nothing;

  else
    update auth.users
    set encrypted_password = extensions.crypt('Mrwu1234', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = v_user_id;
  end if;

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
