-- ============================================================
-- SMPT V2
-- Migration: Initial Auth / Roles / Permissions foundation
--
-- Source of truth:
-- SMPT V1 final AccessControl.js
--
-- Existing V1 roles preserved:
-- ADMIN, MANAGER, CHECKER, USER, PEKERJA, SUPERVISOR, GUDANG
-- ============================================================


-- ============================================================
-- 1. ROLES
-- ============================================================

create table public.roles (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint roles_code_uppercase
    check (code = upper(trim(code)))
);


insert into public.roles (code, name, description)
values
  (
    'ADMIN',
    'Administrator',
    'Akses penuh aplikasi SMPT.'
  ),
  (
    'MANAGER',
    'Manager',
    'Monitoring lintas divisi. Base permission V1 bersifat read-only.'
  ),
  (
    'CHECKER',
    'Checker',
    'Checker hasil pekerjaan/operator sesuai assignment.'
  ),
  (
    'USER',
    'User',
    'Role dasar fleksibel. Hak modul tambahan diberikan melalui permission override.'
  ),
  (
    'PEKERJA',
    'Pekerja',
    'Operator/pekerja yang melihat pekerjaan yang ditugaskan kepadanya.'
  ),
  (
    'SUPERVISOR',
    'Supervisor',
    'Mengatur pekerjaan produksi dan operasional yang menjadi tanggung jawab supervisor.'
  ),
  (
    'GUDANG',
    'Gudang',
    'Operasional gudang, material, WIP, barang jadi, dan perpindahan terkait.'
  )
on conflict (code) do nothing;


-- ============================================================
-- 2. PERMISSIONS
-- ============================================================

create table public.permissions (
  id bigint generated always as identity primary key,
  code text not null unique,
  description text,
  created_at timestamptz not null default now(),

  constraint permissions_code_lowercase
    check (code = lower(trim(code)))
);


insert into public.permissions (code)
values
  ('dashboard.view'),

  ('master_proyek.view'),
  ('master_item.view'),
  ('master_kebutuhan.view'),
  ('master_produk_proyek.view'),
  ('master_bahan.view'),
  ('master_pekerja.view'),
  ('master_barang_jadi.view'),
  ('master_lokasi.view'),
  ('master_vendor.view'),
  ('master_embarkasi.view'),

  ('barang_masuk_gudang.view'),
  ('barang_masuk_gudang.write'),

  ('barang_keluar_gudang.view'),
  ('barang_keluar_gudang.write'),

  ('stok_gudang.view'),
  ('stok_gudang.write'),

  ('log_bahan.view'),
  ('log_bahan.write'),

  ('cutting.view'),
  ('cutting.write'),

  ('sablon.view'),
  ('sablon.write'),

  ('permintaan_produksi.view'),
  ('permintaan_produksi.write'),
  ('permintaan_produksi.fulfill'),

  ('spk.view'),
  ('spk.write'),

  ('produksi.view'),
  ('produksi.write'),

  ('borongan.view'),
  ('borongan.operate'),

  ('pekerjaan_saya.view'),

  ('hasil_produksi.view'),

  ('manufaktur.view'),
  ('manufaktur.internal.view'),
  ('manufaktur.titipan.view'),
  ('manufaktur.titipan.write'),
  ('manufaktur.barang_luar.view'),
  ('manufaktur.barang_luar.write'),
  ('manufaktur.pengiriman.view'),
  ('manufaktur.pengiriman.write'),

  ('qc.view'),
  ('qc.operate'),
  ('qc.rework'),

  ('stok_barang_jadi.view'),
  ('stok_barang_jadi.write'),

  ('transfer_barang_jadi.view'),
  ('transfer_barang_jadi.write'),

  ('barang_luar.view'),
  ('barang_luar.receive'),

  ('master_set.view'),
  ('master_set.write'),

  ('packing_set.view'),
  ('packing_set.write'),

  ('stok_set.view'),

  ('target_embarkasi.view'),

  ('pengiriman_embarkasi.view'),
  ('pengiriman_embarkasi.operate'),

  ('reject_embarkasi.view'),
  ('reject_embarkasi.write'),

  ('absensi.view'),

  ('payroll.view'),
  ('payroll.operator.view'),

  ('kasbon.view'),
  ('kas_kecil.view'),

  ('keuangan.view'),
  ('laporan.view'),

  ('access_control.view'),
  ('setup_test.admin')
on conflict (code) do nothing;


-- ============================================================
-- 3. ROLE -> PERMISSION
-- ============================================================

create table public.role_permissions (
  role_id bigint not null
    references public.roles(id)
    on delete cascade,

  permission_id bigint not null
    references public.permissions(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  primary key (role_id, permission_id)
);


-- ADMIN tidak perlu dimasukkan satu per satu.
-- Permission resolver mempertahankan perilaku V1:
-- ADMIN = wildcard "*".

with grants(role_code, permission_codes) as (
  values

  (
    'MANAGER'::text,
    array[
      'dashboard.view',

      'master_proyek.view',
      'master_item.view',
      'master_kebutuhan.view',
      'master_produk_proyek.view',
      'master_bahan.view',
      'master_pekerja.view',
      'master_barang_jadi.view',
      'master_lokasi.view',
      'master_vendor.view',
      'master_embarkasi.view',

      'barang_masuk_gudang.view',
      'barang_keluar_gudang.view',
      'stok_gudang.view',
      'log_bahan.view',

      'cutting.view',
      'sablon.view',
      'permintaan_produksi.view',
      'spk.view',
      'produksi.view',
      'borongan.view',
      'hasil_produksi.view',

      'manufaktur.view',
      'manufaktur.internal.view',
      'manufaktur.titipan.view',
      'manufaktur.barang_luar.view',
      'manufaktur.pengiriman.view',

      'qc.view',

      'stok_barang_jadi.view',
      'transfer_barang_jadi.view',
      'barang_luar.view',
      'master_set.view',
      'packing_set.view',
      'stok_set.view',
      'target_embarkasi.view',
      'pengiriman_embarkasi.view',
      'reject_embarkasi.view',

      'absensi.view',
      'payroll.view',
      'payroll.operator.view',
      'kasbon.view',
      'kas_kecil.view',
      'keuangan.view',
      'laporan.view'
    ]::text[]
  ),

  (
    'CHECKER',
    array[
      'dashboard.view',
      'borongan.view',
      'borongan.operate'
    ]::text[]
  ),

  (
    'USER',
    array[
      'dashboard.view'
    ]::text[]
  ),

  (
    'PEKERJA',
    array[
      'dashboard.view',
      'pekerjaan_saya.view'
    ]::text[]
  ),

  (
    'SUPERVISOR',
    array[
      'dashboard.view',
      'master_produk_proyek.view',

      'cutting.view',
      'cutting.write',

      'sablon.view',
      'sablon.write',

      'permintaan_produksi.view',
      'permintaan_produksi.write',

      'spk.view',
      'spk.write',

      'produksi.view',
      'produksi.write',

      'hasil_produksi.view',

      'manufaktur.view',
      'manufaktur.internal.view',
      'manufaktur.titipan.view',
      'manufaktur.barang_luar.view',
      'manufaktur.pengiriman.view',

      'qc.view',
      'qc.rework'
    ]::text[]
  ),

  (
    'GUDANG',
    array[
      'dashboard.view',

      'barang_masuk_gudang.view',
      'barang_masuk_gudang.write',

      'barang_keluar_gudang.view',
      'barang_keluar_gudang.write',

      'stok_gudang.view',
      'stok_gudang.write',

      'log_bahan.view',
      'log_bahan.write',

      'manufaktur.view',
      'manufaktur.internal.view',

      'manufaktur.titipan.view',
      'manufaktur.titipan.write',

      'manufaktur.barang_luar.view',
      'manufaktur.barang_luar.write',

      'manufaktur.pengiriman.view',
      'manufaktur.pengiriman.write',

      'cutting.view',

      'sablon.view',
      'sablon.write',

      'permintaan_produksi.view',
      'permintaan_produksi.fulfill',

      'stok_barang_jadi.view',
      'stok_barang_jadi.write',

      'transfer_barang_jadi.view',
      'transfer_barang_jadi.write',

      'barang_luar.view',
      'barang_luar.receive',

      'master_set.view',
      'master_set.write',

      'packing_set.view',
      'packing_set.write',

      'stok_set.view',

      'target_embarkasi.view',

      'pengiriman_embarkasi.view',
      'pengiriman_embarkasi.operate',

      'reject_embarkasi.view',
      'reject_embarkasi.write'
    ]::text[]
  )
)

insert into public.role_permissions (
  role_id,
  permission_id
)

select
  r.id,
  p.id

from grants g

cross join lateral unnest(g.permission_codes)
  as permission_code

join public.roles r
  on r.code = g.role_code

join public.permissions p
  on p.code = permission_code

on conflict do nothing;


-- ============================================================
-- 4. USER PROFILE
-- ============================================================

create table public.profiles (
  id uuid primary key
    references auth.users(id)
    on delete cascade,

  role_id bigint not null
    references public.roles(id),

  legacy_username text unique,

  display_name text,

  email text,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint profiles_legacy_username_normalized
    check (
      legacy_username is null
      or legacy_username = lower(trim(legacy_username))
    )
);


create index profiles_role_id_idx
  on public.profiles(role_id);


-- ============================================================
-- 5. USER PERMISSION OVERRIDE
--
-- V1 supports:
-- ALLOW / DENY
-- exact permission
-- "*"
-- module wildcard, e.g. "cutting.*"
-- ============================================================

create table public.user_permission_overrides (
  id bigint generated always as identity primary key,

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  permission_pattern text not null,

  effect text not null,

  is_active boolean not null default true,

  note text,

  created_by uuid
    references auth.users(id)
    on delete set null,

  updated_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint user_permission_overrides_effect_check
    check (effect in ('ALLOW', 'DENY')),

  constraint user_permission_overrides_pattern_normalized
    check (
      permission_pattern = lower(trim(permission_pattern))
    ),

  constraint user_permission_overrides_user_pattern_unique
    unique (user_id, permission_pattern)
);


create index user_permission_overrides_lookup_idx
  on public.user_permission_overrides(
    user_id,
    is_active,
    permission_pattern
  );


-- ============================================================
-- 6. UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();


create trigger user_permission_overrides_set_updated_at
before update on public.user_permission_overrides
for each row
execute function public.set_updated_at();


-- ============================================================
-- 7. AUTO CREATE PROFILE WHEN SUPABASE AUTH USER IS CREATED
--
-- Semua user baru default USER.
-- Role tidak pernah dipercaya dari browser / signup metadata.
-- ============================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_role_id bigint;
begin

  select id
  into v_user_role_id
  from public.roles
  where code = 'USER'
  limit 1;

  if v_user_role_id is null then
    raise exception 'Default role USER tidak ditemukan.';
  end if;

  insert into public.profiles (
    id,
    role_id,
    display_name,
    email
  )
  values (
    new.id,
    v_user_role_id,

    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1),
      'User'
    ),

    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


drop trigger if exists smpt_create_profile_on_signup
on auth.users;


create trigger smpt_create_profile_on_signup
after insert on auth.users
for each row
execute function public.handle_new_auth_user();


-- Backfill jika sudah ada Auth user sebelum migration ini dibuat.

insert into public.profiles (
  id,
  role_id,
  display_name,
  email
)

select
  u.id,
  r.id,

  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    split_part(u.email, '@', 1),
    'User'
  ),

  u.email

from auth.users u

cross join public.roles r

where r.code = 'USER'

on conflict (id) do nothing;


-- ============================================================
-- 8. CURRENT USER ROLE
-- ============================================================

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$

  select r.code

  from public.profiles p

  join public.roles r
    on r.id = p.role_id

  where p.id = auth.uid()
    and p.is_active = true

  limit 1;

$$;


-- ============================================================
-- 9. PERMISSION RESOLVER
--
-- Behaviour intentionally mirrors V1:
--
-- 1. Per-user override is checked first.
-- 2. Exact override beats wildcard.
-- 3. "module.*" supported.
-- 4. "*" supported.
-- 5. ADMIN gets wildcard access.
-- 6. Unknown/inactive user fails closed.
-- ============================================================

create or replace function public.has_permission(
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_requested text;
  v_role_code text;
  v_override_effect text;
begin

  v_user_id := auth.uid();

  v_requested :=
    lower(
      trim(
        coalesce(p_permission, '')
      )
    );

  if v_user_id is null
     or v_requested = '' then
    return false;
  end if;


  select r.code
  into v_role_code

  from public.profiles p

  join public.roles r
    on r.id = p.role_id

  where p.id = v_user_id
    and p.is_active = true
    and r.is_active = true

  limit 1;


  if v_role_code is null then
    return false;
  end if;


  -- ----------------------------------------------------------
  -- USER OVERRIDE
  -- Exact permission > module wildcard > global wildcard
  -- ----------------------------------------------------------

  select o.effect
  into v_override_effect

  from public.user_permission_overrides o

  where o.user_id = v_user_id
    and o.is_active = true

    and (
      o.permission_pattern = v_requested

      or o.permission_pattern = '*'

      or (
        right(o.permission_pattern, 2) = '.*'

        and left(
          v_requested,
          char_length(o.permission_pattern) - 1
        ) =
        left(
          o.permission_pattern,
          char_length(o.permission_pattern) - 1
        )
      )
    )

  order by

    case

      when o.permission_pattern = v_requested
        then 3

      when o.permission_pattern = '*'
        then 1

      else 2

    end desc,

    char_length(o.permission_pattern) desc,

    o.id asc

  limit 1;


  if found then
    return v_override_effect = 'ALLOW';
  end if;


  -- Preserve V1 ADMIN wildcard.
  if v_role_code = 'ADMIN' then
    return true;
  end if;


  -- Base role permission.
  return exists (

    select 1

    from public.role_permissions rp

    join public.roles r
      on r.id = rp.role_id

    join public.permissions p
      on p.id = rp.permission_id

    where r.code = v_role_code
      and r.is_active = true
      and p.code = v_requested

  );

end;
$$;


-- ============================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================

alter table public.roles
enable row level security;

alter table public.permissions
enable row level security;

alter table public.role_permissions
enable row level security;

alter table public.profiles
enable row level security;

alter table public.user_permission_overrides
enable row level security;


-- ------------------------------------------------------------
-- Roles
-- ------------------------------------------------------------

create policy roles_authenticated_read
on public.roles
for select
to authenticated
using (true);


-- ------------------------------------------------------------
-- Permissions
-- ------------------------------------------------------------

create policy permissions_authenticated_read
on public.permissions
for select
to authenticated
using (true);


-- ------------------------------------------------------------
-- Role permissions
-- ------------------------------------------------------------

create policy role_permissions_authenticated_read
on public.role_permissions
for select
to authenticated
using (true);


-- ------------------------------------------------------------
-- Profile
--
-- User hanya boleh membaca profil sendiri.
-- ADMIN dapat membaca seluruh profile.
-- ------------------------------------------------------------

create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.current_user_role() = 'ADMIN'
);


-- ------------------------------------------------------------
-- Permission overrides
--
-- User boleh melihat override miliknya sendiri.
-- ADMIN dapat melihat seluruh override.
--
-- Mutation akan dilakukan melalui trusted server-side layer,
-- bukan langsung bebas dari browser.
-- ------------------------------------------------------------

create policy permission_overrides_select_self_or_admin
on public.user_permission_overrides
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() = 'ADMIN'
);


-- ============================================================
-- 11. PRIVILEGES
--
-- Anonymous user tidak mendapat akses tabel IAM.
-- Authenticated user hanya mendapat SELECT sesuai RLS.
-- Mutation admin nanti dilakukan server-side secara eksplisit.
-- ============================================================

revoke all
on table
  public.roles,
  public.permissions,
  public.role_permissions,
  public.profiles,
  public.user_permission_overrides
from anon;


revoke all
on table
  public.roles,
  public.permissions,
  public.role_permissions,
  public.profiles,
  public.user_permission_overrides
from authenticated;


grant select
on table
  public.roles,
  public.permissions,
  public.role_permissions,
  public.profiles,
  public.user_permission_overrides
to authenticated;


-- ============================================================
-- 12. FUNCTION SECURITY
-- ============================================================

revoke all
on function public.current_user_role()
from public;


revoke all
on function public.has_permission(text)
from public;


grant execute
on function public.current_user_role()
to authenticated;


grant execute
on function public.has_permission(text)
to authenticated;