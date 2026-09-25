-- ============================================================================
-- SMPT V2: FIX FINALISASI PAYROLL MINGGUAN & BULANAN,
--          RUMUS LEMBUR PABRIK, BONUS MINGGU, DAN SETTING SHIFT
-- ============================================================================

-- 1. Pastikan permission dan grant pada payroll_settings terbuka untuk admin & authenticated
grant select, insert, update on public.payroll_settings to authenticated;
grant select, insert, update on public.payroll_settings to service_role;

drop policy if exists payroll_settings_select on public.payroll_settings;
create policy payroll_settings_select on public.payroll_settings for select to authenticated
using (public.has_permission('payroll.view') or upper(coalesce(public.current_user_role(),''))='ADMIN');

drop policy if exists payroll_settings_write on public.payroll_settings;
create policy payroll_settings_write on public.payroll_settings for all to authenticated
using (public.has_permission('payroll.write') or upper(coalesce(public.current_user_role(),''))='ADMIN')
with check (public.has_permission('payroll.write') or upper(coalesce(public.current_user_role(),''))='ADMIN');

-- 2. Seed / Update Nilai Default Pengaturan Shift & Lembur
insert into public.payroll_settings(key, value_numeric, value_text, description) values
  ('SHIFT_WEEKDAY_IN', null, '08:00', 'Jam masuk normal Senin-Jumat'),
  ('SHIFT_WEEKDAY_OUT', null, '17:00', 'Jam pulang normal Senin-Jumat (lembur jika lewat jam ini)'),
  ('SHIFT_SATURDAY_OUT', null, '15:00', 'Jam pulang normal Sabtu (lembur jika lewat jam ini)'),
  ('SHIFT_SUNDAY_IN', null, '08:00', 'Jam masuk kerja hari Minggu'),
  ('SHIFT_SUNDAY_OUT', null, '17:00', 'Jam pulang kerja hari Minggu (8 jam kerja lembur)'),
  ('OT_DIVISOR_HARIAN', 8, null, 'Pembagi upah lembur per jam pekerja HARIAN (Gaji Harian / 8)'),
  ('OT_BONUS_HARIAN_4H', 5000, null, 'Bonus lembur minimal 4 jam per hari untuk HARIAN'),
  ('HARIAN_HOLIDAY_BONUS_FULL', 20000, null, 'Tambahan uang hadir hari Minggu/libur HARIAN (Full Day)'),
  ('HARIAN_HOLIDAY_BONUS_HALF', 10000, null, 'Tambahan uang hadir hari Minggu/libur HARIAN (Half Day)'),
  ('OT_DIVISOR_BULANAN', 190, null, 'Pembagi upah lembur per jam karyawan BULANAN (Gaji Bulanan / 190)'),
  ('OT_BONUS_BULANAN_4H', 17500, null, 'Bonus lembur minimal 4 jam per hari untuk BULANAN'),
  ('MEAL_FULL', 50000, null, 'Uang makan BULANAN per hari Full Day'),
  ('MEAL_HALF', 25000, null, 'Uang makan BULANAN per hari Half Day'),
  ('BULANAN_SUNDAY_MEAL', 50000, null, 'Uang makan tambahan hari Minggu untuk karyawan BULANAN'),
  ('FRIDAY_OVERTIME_NEXT_WEEK', null, 'TRUE', 'Lembur Jumat malam (>17:00) pekerja harian dialihkan ke slip minggu berikutnya')
on conflict (key) do update set
  value_numeric = coalesce(excluded.value_numeric, public.payroll_settings.value_numeric),
  value_text = coalesce(excluded.value_text, public.payroll_settings.value_text),
  description = coalesce(excluded.description, public.payroll_settings.description);

-- 3. RPC untuk menyimpan pengaturan jam kerja & tarif lembur langsung dari UI
create or replace function public.save_payroll_shift_settings(p_settings jsonb)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  k text;
  v text;
  v_num numeric;
begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin mengubah pengaturan Payroll.' using errcode='42501';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Data pengaturan tidak valid.';
  end if;

  for k, v in select key, value#>>'{}' from jsonb_each(p_settings) loop
    if v ~ '^-?[0-9]+(\.[0-9]+)?$' then
      v_num := v::numeric;
      insert into public.payroll_settings(key, value_numeric, value_text, updated_by, updated_at)
      values(k, v_num, v, auth.uid(), now())
      on conflict(key) do update set
        value_numeric = excluded.value_numeric,
        value_text = excluded.value_text,
        updated_by = auth.uid(),
        updated_at = now();
    else
      insert into public.payroll_settings(key, value_numeric, value_text, updated_by, updated_at)
      values(k, null, v, auth.uid(), now())
      on conflict(key) do update set
        value_numeric = null,
        value_text = excluded.value_text,
        updated_by = auth.uid(),
        updated_at = now();
    end if;
  end loop;

  return jsonb_build_object('success', true, 'message', 'Pengaturan berhasil disimpan.');
end $$;
revoke all on function public.save_payroll_shift_settings(jsonb) from public;
grant execute on function public.save_payroll_shift_settings(jsonb) to authenticated;

-- 4. PERBAIKAN TOTAL: finalize_general_payroll
-- Mendukung MINGGUAN / HARIAN maupun BULANAN tanpa eror exception!
create or replace function public.finalize_general_payroll(
  p_type text,
  p_start date,
  p_end date,
  p_notes text default null
) returns bigint
language plpgsql security definer set search_path='' as $$
declare
  v_type text := upper(btrim(coalesce(p_type, '')));
  v_run bigint;
  r record;
  v_full numeric;
  v_half numeric;
  v_ot int;
  v_count_4h int;
  v_sunday_count int;
  v_base numeric;
  v_meal numeric;
  v_ot_amt numeric;
  v_bonus numeric;
  v_holiday numeric;
  v_gross numeric;
  v_total_gross numeric := 0;
  v_total_deduction numeric := 0;
  v_total_net numeric := 0;
  v_div numeric;
  v_bonus4 numeric;
  v_meal_full numeric;
  v_meal_half numeric;
  v_holiday_bonus_setting numeric;
  v_sunday_meal_setting numeric;
  v_kasbon_perusahaan numeric := 0;
  v_kasbon_warung numeric := 0;
  v_total_item_deduction numeric := 0;
  v_net numeric := 0;
  v_existing_run bigint;
begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin Payroll.' using errcode='42501';
  end if;

  if v_type not in ('MINGGUAN', 'BULANAN') then
    raise exception 'Jenis Payroll harus MINGGUAN atau BULANAN.';
  end if;

  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Periode Payroll tidak valid (% s/d %).', p_start, p_end;
  end if;

  -- Jika payroll untuk periode ini sudah ada, bersihkan run lama agar bisa re-finalisasi otomatis
  select id into v_existing_run from public.payroll_runs
  where payroll_type = v_type and period_start = p_start and period_end = p_end and status <> 'DIBATALKAN'
  order by id desc limit 1;

  if v_existing_run is not null then
    delete from public.payroll_run_items where payroll_run_id = v_existing_run;
    delete from public.payroll_runs where id = v_existing_run;
  end if;

  insert into public.payroll_runs(
    payroll_type, period_start, period_end, status, notes, finalized_at
  ) values (
    v_type, p_start, p_end, 'FINAL', p_notes, now()
  ) returning id into v_run;

  -- Ambil parameter pengaturan dinamis
  select coalesce(value_numeric, 50000) into v_meal_full from public.payroll_settings where key='MEAL_FULL';
  select coalesce(value_numeric, 25000) into v_meal_half from public.payroll_settings where key='MEAL_HALF';
  select coalesce(value_numeric, 50000) into v_sunday_meal_setting from public.payroll_settings where key='BULANAN_SUNDAY_MEAL';
  select coalesce(value_numeric, 20000) into v_holiday_bonus_setting from public.payroll_settings where key='HARIAN_HOLIDAY_BONUS_FULL';

  if v_type = 'MINGGUAN' then
    select coalesce(value_numeric, 8) into v_div from public.payroll_settings where key='OT_DIVISOR_HARIAN';
    select coalesce(value_numeric, 5000) into v_bonus4 from public.payroll_settings where key='OT_BONUS_HARIAN_4H';
  else
    select coalesce(value_numeric, 190) into v_div from public.payroll_settings where key='OT_DIVISOR_BULANAN';
    select coalesce(value_numeric, 17500) into v_bonus4 from public.payroll_settings where key='OT_BONUS_BULANAN_4H';
  end if;

  -- Loop setiap pekerja aktif sesuai tipe sistem upah (MINGGUAN -> HARIAN; BULANAN -> BULANAN)
  for r in
    select * from public.workers w
    where w.status = 'AKTIF'
      and upper(coalesce(w.pay_system, '')) = case when v_type = 'MINGGUAN' then 'HARIAN' else 'BULANAN' end
    order by w.name
  loop
    -- 1. Hitung Kehadiran Terverifikasi
    select
      coalesce(sum(case when a.day_class = 'FULL_DAY' and a.attendance_status = 'HADIR' then 1 else 0 end), 0),
      coalesce(sum(case when a.day_class = 'HALF_DAY' and a.attendance_status = 'HADIR' then 1 else 0 end), 0),
      coalesce(sum(a.overtime_minutes), 0),
      coalesce(sum(case when a.overtime_minutes >= 240 then 1 else 0 end), 0),
      coalesce(sum(case when extract(dow from a.attendance_date) = 0 and a.attendance_status = 'HADIR' then 1 else 0 end), 0)
    into v_full, v_half, v_ot, v_count_4h, v_sunday_count
    from public.attendance_records a
    where a.worker_id = r.id
      and a.attendance_date between p_start and p_end
      and a.verification_status = 'TERVERIFIKASI';

    if v_type = 'MINGGUAN' then
      -- A. Gaji Pokok Harian
      v_base := round((v_full * coalesce(r.daily_wage, 0) + v_half * coalesce(r.daily_wage, 0) * 0.5)::numeric, 2);
      v_meal := 0;

      -- B. Upah Lembur Harian: Jam Lembur * (Gaji Pokok / 8)
      v_ot_amt := round(((v_ot / 60.0) * coalesce(r.daily_wage, 0) / greatest(coalesce(v_div, 8), 0.0001))::numeric, 2);

      -- C. Bonus Lembur >= 4 Jam (Rp 5.000 per hari)
      v_bonus := v_count_4h * coalesce(v_bonus4, 5000);

      -- D. Bonus Kehadiran Minggu (Rp 20.000 per kehadiran Minggu)
      v_holiday := v_sunday_count * coalesce(v_holiday_bonus_setting, 20000);
    else
      -- A. Gaji Pokok Bulanan
      v_base := coalesce(r.monthly_salary, 0);

      -- B. Uang Makan Bulanan: Full Day (Rp 50rb) + Half Day (Rp 25rb) + Tambahan Minggu jika ada
      v_meal := round((v_full * coalesce(v_meal_full, 50000) + v_half * coalesce(v_meal_half, 25000))::numeric, 2);
      if v_sunday_count > 0 then
        v_meal := v_meal + (v_sunday_count * coalesce(v_sunday_meal_setting, 50000));
      end if;

      -- C. Upah Lembur Bulanan: Jam Lembur * (Gaji Bulanan / 190)
      v_ot_amt := round(((v_ot / 60.0) * coalesce(r.monthly_salary, 0) / greatest(coalesce(v_div, 190), 0.0001))::numeric, 2);

      -- D. Bonus Lembur >= 4 Jam (Rp 17.500 per hari)
      v_bonus := v_count_4h * coalesce(v_bonus4, 17500);

      v_holiday := 0;
    end if;

    v_gross := round((v_base + v_meal + v_ot_amt + v_bonus + v_holiday)::numeric, 2);

    -- 2. Ambil Potongan Kasbon Perusahaan & Warung Luar
    -- Cicilan Kasbon Perusahaan aktif
    select coalesce(sum(least(case when installment_amount > 0 then installment_amount else (amount - paid_amount) end, amount - paid_amount)), 0)
    into v_kasbon_perusahaan
    from public.cash_advances
    where worker_id = r.id and status = 'AKTIF' and category = 'KASBON_PERUSAHAAN';

    -- Hutang Warung Luar
    select coalesce(sum(amount - paid_amount), 0)
    into v_kasbon_warung
    from public.cash_advances
    where worker_id = r.id and status = 'AKTIF' and category = 'KASBON_WARUNG';

    v_total_item_deduction := v_kasbon_perusahaan + v_kasbon_warung;
    v_net := greatest(0, v_gross - v_total_item_deduction);

    insert into public.payroll_run_items(
      payroll_run_id, worker_id, worker_name_snapshot, pay_system_snapshot,
      daily_wage_snapshot, monthly_salary_snapshot, full_days, half_days, overtime_minutes,
      base_amount, meal_amount, overtime_amount, overtime_bonus, holiday_bonus, holiday_manual_amount,
      kasbon_perusahaan_amount, kasbon_warung_amount, deduction_amount, net_amount
    ) values (
      v_run, r.id, r.name, coalesce(r.pay_system, 'HARIAN'),
      coalesce(r.daily_wage, 0), coalesce(r.monthly_salary, 0), v_full, v_half, v_ot,
      v_base, v_meal, v_ot_amt, v_bonus, v_holiday, 0,
      v_kasbon_perusahaan, v_kasbon_warung, v_total_item_deduction, v_net
    );

    v_total_gross := v_total_gross + v_gross;
    v_total_deduction := v_total_deduction + v_total_item_deduction;
    v_total_net := v_total_net + v_net;
  end loop;

  update public.payroll_runs
  set total_gross = v_total_gross,
      total_deduction = v_total_deduction,
      total_net = v_total_net
  where id = v_run;

  return v_run;
end $$;
revoke all on function public.finalize_general_payroll(text, date, date, text) from public;
grant execute on function public.finalize_general_payroll(text, date, date, text) to authenticated;

notify pgrst, 'reload schema';
