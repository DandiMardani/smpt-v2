-- Migration: 20260926070000_fix_sunday_and_weekday_overtime_rules.sql
-- Penyesuaian aturan lembur dan uang makan resmi:
-- 1. Hari Minggu: Masuk 08:00-17:00 = 8 jam lembur + Uang Makan Minggu Rp 50.000 (tidak ada bonus 17.500).
-- 2. Hari Biasa: Lembur >= 4 jam (cth: pulang jam 21:00) = Jam Lembur + Uang Makan Lembur Rp 17.500 (Bulanan) / Rp 5.000 (Harian).
-- 3. Karyawan Bulanan: Gaji pokok bulanan tetap mencakup hari kerja biasa, uang makan reguler harian tidak dihitung ganda.

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
  v_sunday_meal_setting numeric;
  v_holiday_bonus_setting numeric;
  v_kasbon_perusahaan numeric := 0;
  v_kasbon_warung numeric := 0;
  v_total_item_deduction numeric := 0;
  v_net numeric := 0;
  v_existing_run bigint;
begin
  if auth.uid() is not null and not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
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
      coalesce(sum(case when a.day_class = 'FULL_DAY' and a.attendance_status = 'HADIR' and extract(dow from a.attendance_date) <> 0 then 1 else 0 end), 0),
      coalesce(sum(case when a.day_class = 'HALF_DAY' and a.attendance_status = 'HADIR' and extract(dow from a.attendance_date) <> 0 then 1 else 0 end), 0),
      coalesce(sum(a.overtime_minutes), 0),
      -- Bonus 4 jam HANYA berlaku untuk hari biasa (Senin-Sabtu), BUKAN hari Minggu
      coalesce(sum(case when extract(dow from a.attendance_date) <> 0 and a.overtime_minutes >= 240 then 1 else 0 end), 0),
      -- Hari Minggu hadir / lembur
      coalesce(sum(case when extract(dow from a.attendance_date) = 0 and (a.attendance_status = 'HADIR' or a.overtime_minutes > 0) then 1 else 0 end), 0)
    into v_full, v_half, v_ot, v_count_4h, v_sunday_count
    from public.attendance_records a
    where a.worker_id = r.id
      and a.attendance_date between p_start and p_end
      and a.verification_status = 'TERVERIFIKASI';

    if v_type = 'MINGGUAN' then
      -- A. Gaji Pokok Harian (Hari biasa)
      v_base := round((v_full * coalesce(r.daily_wage, 0) + v_half * coalesce(r.daily_wage, 0) * 0.5)::numeric, 2);
      v_meal := 0;

      -- B. Upah Lembur Harian: Jam Lembur * (Gaji Pokok / 8)
      v_ot_amt := round(((v_ot / 60.0) * coalesce(r.daily_wage, 0) / greatest(coalesce(v_div, 8), 0.0001))::numeric, 2);

      -- C. Bonus Lembur >= 4 Jam Hari Biasa (Rp 5.000 per hari)
      v_bonus := v_count_4h * coalesce(v_bonus4, 5000);

      -- D. Bonus Kehadiran Minggu (Rp 20.000 per kehadiran Minggu)
      v_holiday := v_sunday_count * coalesce(v_holiday_bonus_setting, 20000);
    else
      -- A. Gaji Pokok Bulanan Tetap
      v_base := coalesce(r.monthly_salary, 0);

      -- B. Uang Makan Hari Minggu (Rp 50.000 per kehadiran/lembur Minggu)
      v_meal := v_sunday_count * coalesce(v_sunday_meal_setting, 50000);

      -- C. Upah Lembur Bulanan: Jam Lembur * (Gaji Bulanan / 190)
      v_ot_amt := round(((v_ot / 60.0) * coalesce(r.monthly_salary, 0) / greatest(coalesce(v_div, 190), 0.0001))::numeric, 2);

      -- D. Uang Makan Lembur Hari Biasa >= 4 Jam (Rp 17.500 per hari)
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
grant execute on function public.finalize_general_payroll(text, date, date, text) to authenticated, postgres, service_role;

notify pgrst, 'reload schema';
