-- ============================================================================
-- SMPT V2: MANAGEMENT USER (EDIT USERNAME & HAPUS AKUN)
--          + RLS PERMISSIONS PEKERJA BULANAN & WARUNG MITRA
-- ============================================================================

-- 1. Fungsi untuk memperbarui data user profil (termasuk username / display_name)
create or replace function public.smpt_admin_update_user_profile(
  p_user_id uuid,
  p_display_name text,
  p_role_code text,
  p_worker_id bigint,
  p_is_active boolean
) returns void
language plpgsql security definer set search_path='' as $$
declare
  v_role_id bigint;
  v_role_code text := upper(btrim(coalesce(p_role_code, 'USER')));
  v_old_role_code text;
begin
  if not public.has_permission('access_control.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin kelola user.' using errcode='42501';
  end if;

  select
    r.id::bigint,
    upper(coalesce(
      nullif(to_jsonb(old_r)->>'code',''),
      nullif(to_jsonb(old_r)->>'name',''),
      nullif(to_jsonb(old_r)->>'role',''),
      'USER'
    ))::text
  into v_role_id, v_old_role_code
  from public.roles r
  left join public.profiles old_p on old_p.id = p_user_id
  left join public.roles old_r on old_r.id = old_p.role_id
  where upper(coalesce(
    nullif(to_jsonb(r)->>'code',''),
    nullif(to_jsonb(r)->>'name',''),
    nullif(to_jsonb(r)->>'role',''),
    ''
  )) = v_role_code
  limit 1;

  if v_role_id is null then raise exception 'Role % tidak ditemukan.', v_role_code; end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id) then raise exception 'Akun Auth tidak ditemukan.'; end if;

  if p_user_id = auth.uid() and (v_role_code <> 'ADMIN' or not coalesce(p_is_active, true)) then
    raise exception 'Akun ADMIN yang sedang aktif tidak boleh menurunkan role atau menonaktifkan dirinya sendiri.';
  end if;

  if v_role_code = 'PEKERJA' and p_worker_id is null then
    raise exception 'Role PEKERJA wajib dihubungkan ke Master Pekerja.';
  end if;

  -- Update profiles table
  update public.profiles set
    display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
    role_id = v_role_id,
    is_active = coalesce(p_is_active, true),
    updated_at = now()
  where id = p_user_id;

  -- Update worker links
  if p_worker_id is null then
    update public.user_worker_links
    set active = false, updated_at = now()
    where user_id = p_user_id and active = true;
  else
    perform 1 from public.workers where id = p_worker_id and status = 'AKTIF';
    if not found then raise exception 'Pekerja tidak ditemukan atau NONAKTIF.'; end if;

    if exists (
      select 1 from public.user_worker_links uw
      where uw.worker_id = p_worker_id
        and uw.active = true
        and uw.user_id <> p_user_id
    ) then
      raise exception 'Pekerja ini sudah terhubung ke akun aktif lain.';
    end if;

    insert into public.user_worker_links (user_id, worker_id, active, created_by)
    values (p_user_id, p_worker_id, true, auth.uid())
    on conflict (user_id) do update
      set worker_id = excluded.worker_id,
          active = true,
          updated_at = now();
  end if;
end;
$$;
revoke all on function public.smpt_admin_update_user_profile(uuid, text, text, bigint, boolean) from public;
grant execute on function public.smpt_admin_update_user_profile(uuid, text, text, bigint, boolean) to authenticated;

-- 2. Fungsi untuk menghapus akun user secara permanen
create or replace function public.smpt_admin_delete_user(p_user_id uuid)
returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not public.has_permission('access_control.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin hapus user.' using errcode='42501';
  end if;

  if p_user_id is null then
    raise exception 'User ID tidak valid.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif digunakan.';
  end if;

  -- 1. Hapus link pekerja
  delete from public.user_worker_links where user_id = p_user_id;

  -- 2. Hapus profile user
  delete from public.profiles where id = p_user_id;

  -- 3. Hapus akun auth
  delete from auth.users where id = p_user_id;

  return true;
end;
$$;
revoke all on function public.smpt_admin_delete_user(uuid) from public;
grant execute on function public.smpt_admin_delete_user(uuid) to authenticated;

-- 3. Policy RLS agar Pemilik Warung & Pekerja bisa membaca tabel workers
drop policy if exists workers_warung_reference_select on public.workers;
create policy workers_warung_reference_select on public.workers
for select to authenticated using (
  public.has_permission('warung.view')
  or id = public.smpt_current_worker_id()
);

-- 4. Policy RLS agar Pekerja bisa membaca absensi miliknya sendiri
drop policy if exists attendance_worker_self_select on public.attendance_records;
create policy attendance_worker_self_select on public.attendance_records
for select to authenticated using (
  worker_id = public.smpt_current_worker_id()
);

-- 5. Policy RLS agar Pekerja bisa membaca payroll item miliknya sendiri
drop policy if exists payroll_items_worker_self_select on public.payroll_run_items;
create policy payroll_items_worker_self_select on public.payroll_run_items
for select to authenticated using (
  worker_id = public.smpt_current_worker_id()
);

-- 6. Policy RLS agar Pekerja bisa membaca payroll runs (periode gajian)
drop policy if exists payroll_runs_worker_self_select on public.payroll_runs;
create policy payroll_runs_worker_self_select on public.payroll_runs
for select to authenticated using (
  id in (select run_id from public.payroll_run_items where worker_id = public.smpt_current_worker_id())
);

-- 7. RPC untuk mendapatkan daftar pekerja aktif (bisa diakses authenticated untuk referensi dropdown warung & payroll)
create or replace function public.smpt_get_active_workers_for_reference()
returns table (
  id bigint,
  worker_code text,
  name text,
  pay_system text,
  department text,
  status text
)
language sql security definer set search_path='' as $$
  select id, worker_code, name, pay_system, department, status
  from public.workers
  where status = 'AKTIF'
  order by name asc;
$$;
revoke all on function public.smpt_get_active_workers_for_reference() from public;
grant execute on function public.smpt_get_active_workers_for_reference() to authenticated;

-- 8. RPC untuk data finansial dan profil pekerja yang sedang login
create or replace function public.smpt_get_my_worker_profile()
returns table (
  id bigint,
  name text,
  worker_code text,
  pay_system text,
  daily_wage numeric,
  monthly_salary numeric,
  department text
)
language sql security definer set search_path='' as $$
  select w.id, w.name, w.worker_code, w.pay_system, w.daily_wage, w.monthly_salary, w.department
  from public.workers w
  where w.id = public.smpt_current_worker_id()
  limit 1;
$$;
revoke all on function public.smpt_get_my_worker_profile() from public;
grant execute on function public.smpt_get_my_worker_profile() to authenticated;

notify pgrst, 'reload schema';
