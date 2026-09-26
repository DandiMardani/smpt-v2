-- Migration: 20260926080000_fix_harian_sunday_rules_and_grant_payroll_permissions.sql
-- 1. Izin UPDATE dan Policy RLS untuk payroll_runs & payroll_run_items
-- 2. Stored Procedure (RPC) update_payroll_item_manual (Security Definer)
-- 3. Koreksi aturan lembur Minggu Karyawan Harian & Bulanan
-- 4. Koreksi data lembur Minggu pada absensi harian yang sudah lewat jam 17:00

-- Grant perizinan UPDATE ke authenticated role
grant select, insert, update on public.payroll_runs to authenticated;
grant select, insert, update on public.payroll_run_items to authenticated;

-- Policy RLS Update
drop policy if exists "payroll_runs_update" on public.payroll_runs;
create policy "payroll_runs_update" on public.payroll_runs
  for update to authenticated
  using (public.has_permission('payroll.write') or upper(coalesce(public.current_user_role(),'')) = 'ADMIN')
  with check (public.has_permission('payroll.write') or upper(coalesce(public.current_user_role(),'')) = 'ADMIN');

drop policy if exists "payroll_items_update" on public.payroll_run_items;
create policy "payroll_items_update" on public.payroll_run_items
  for update to authenticated
  using (public.has_permission('payroll.write') or upper(coalesce(public.current_user_role(),'')) = 'ADMIN')
  with check (public.has_permission('payroll.write') or upper(coalesce(public.current_user_role(),'')) = 'ADMIN');

-- RPC Khusus untuk Admin mengedit item payroll (Aman, Atomic, dan Bypass RLS)
create or replace function public.update_payroll_item_manual(
  p_item_id bigint,
  p_base_amount numeric default null,
  p_meal_amount numeric default null,
  p_overtime_amount numeric default null,
  p_manual_overtime_amount numeric default null,
  p_overtime_bonus numeric default null,
  p_holiday_bonus numeric default null,
  p_kasbon_perusahaan_amount numeric default null,
  p_kasbon_warung_amount numeric default null,
  p_deduction_amount numeric default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item record;
  v_run_id bigint;
  v_base numeric;
  v_meal numeric;
  v_ot numeric;
  v_manual_ot numeric;
  v_bonus numeric;
  v_holiday numeric;
  v_kasbon_p numeric;
  v_kasbon_w numeric;
  v_deduction numeric;
  v_gross numeric;
  v_net numeric;
  v_run_gross numeric := 0;
  v_run_deduction numeric := 0;
  v_run_net numeric := 0;
begin
  if auth.uid() is not null and not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),'')) <> 'ADMIN' then
    raise exception 'Tidak memiliki izin Payroll.' using errcode = '42501';
  end if;

  select * into v_item from public.payroll_run_items where id = p_item_id;
  if not found then
    raise exception 'Item payroll dengan ID % tidak ditemukan.', p_item_id;
  end if;
  v_run_id := v_item.payroll_run_id;

  v_base := coalesce(p_base_amount, v_item.base_amount, 0);
  v_meal := coalesce(p_meal_amount, v_item.meal_amount, 0);
  v_ot := coalesce(p_overtime_amount, v_item.overtime_amount, 0);
  v_manual_ot := coalesce(p_manual_overtime_amount, v_item.manual_overtime_amount, 0);
  v_bonus := coalesce(p_overtime_bonus, v_item.overtime_bonus, 0);
  v_holiday := coalesce(p_holiday_bonus, v_item.holiday_bonus, 0);
  v_kasbon_p := coalesce(p_kasbon_perusahaan_amount, v_item.kasbon_perusahaan_amount, 0);
  v_kasbon_w := coalesce(p_kasbon_warung_amount, v_item.kasbon_warung_amount, 0);
  v_deduction := coalesce(p_deduction_amount, v_kasbon_p + v_kasbon_w);

  v_gross := round((v_base + v_meal + v_ot + v_manual_ot + v_bonus + v_holiday)::numeric, 2);
  v_net := greatest(0, round((v_gross - v_deduction)::numeric, 2));

  update public.payroll_run_items set
    base_amount = v_base,
    meal_amount = v_meal,
    overtime_amount = v_ot,
    manual_overtime_amount = v_manual_ot,
    overtime_bonus = v_bonus,
    holiday_bonus = v_holiday,
    kasbon_perusahaan_amount = v_kasbon_p,
    kasbon_warung_amount = v_kasbon_w,
    deduction_amount = v_deduction,
    net_amount = v_net
  where id = p_item_id;

  -- Sinkronkan total run di payroll_runs
  select
    coalesce(sum(base_amount + meal_amount + overtime_amount + manual_overtime_amount + overtime_bonus + holiday_bonus), 0),
    coalesce(sum(deduction_amount), 0),
    coalesce(sum(net_amount), 0)
  into v_run_gross, v_run_deduction, v_run_net
  from public.payroll_run_items
  where payroll_run_id = v_run_id;

  update public.payroll_runs set
    total_gross = v_run_gross,
    total_deduction = v_run_deduction,
    total_net = v_run_net
  where id = v_run_id;

  return jsonb_build_object(
    'item_id', p_item_id,
    'gross', v_gross,
    'net', v_net,
    'run_gross', v_run_gross,
    'run_net', v_run_net
  );
end;
$$;

-- Perbaiki data absensi hari Minggu 2026-09-20 untuk pekerja HARIAN:
-- Jika pulang <= 17:00 (atau null), set overtime_minutes = 0 karena 08:00 - 17:00 adalah jam shift normal Minggu
update public.attendance_records a
set overtime_minutes = 0
from public.workers w
where a.worker_id = w.id
  and extract(dow from a.attendance_date) = 0
  and upper(coalesce(w.pay_system, '')) = 'HARIAN'
  and (a.actual_out is null or a.actual_out <= time '17:00:00');

-- Update fungsi finalize_general_payroll dengan ketentuan Harian & Bulanan resmi
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

  -- Loop setiap pekerja aktif sesuai tipe sistem upah
  for r in
    select * from public.workers w
    where w.status = 'AKTIF'
      and upper(coalesce(w.pay_system, '')) = case when v_type = 'MINGGUAN' then 'HARIAN' else 'BULANAN' end
    order by w.name
  loop
    -- 1. Hitung Kehadiran Terverifikasi
    if v_type = 'MINGGUAN' then
      -- HARIAN:
      -- Kehadiran FULL_DAY mencakup Senin-Sabtu dan Minggu
      -- Hari Minggu: jam 08:00 - 17:00 adalah jam shift standar (1 hari upah harian) + Tambahan Hadir Minggu Rp 20.000
      -- Lembur Minggu HANYA berlaku jika pulang lewat jam 17:00
      -- Bonus 4 jam Rp 5.000 berlaku jika lembur hari biasa >= 4 jam ATAU lembur Minggu lewat jam 17:00 >= 4 jam
      select
        coalesce(sum(case when a.day_class = 'FULL_DAY' and a.attendance_status = 'HADIR' then 1 else 0 end), 0),
        coalesce(sum(case when a.day_class = 'HALF_DAY' and a.attendance_status = 'HADIR' then 1 else 0 end), 0),
        coalesce(sum(
          case
            when extract(dow from a.attendance_date) = 0 and (a.actual_out is null or a.actual_out <= time '17:00:00') and a.overtime_minutes = 480 then 0
            when extract(dow from a.attendance_date) = 0 and a.overtime_minutes >= 480 then (a.overtime_minutes - 480)
            else a.overtime_minutes
          end
        ), 0),
        coalesce(sum(
          case
            when extract(dow from a.attendance_date) <> 0 and a.overtime_minutes >= 240 then 1
            when extract(dow from a.attendance_date) = 0 and (
              (a.overtime_minutes >= 240 and a.overtime_minutes < 480) or
              (a.overtime_minutes >= 720) or
              (a.actual_out is not null and a.actual_out >= time '21:00:00')
            ) then 1
            else 0
          end
        ), 0),
        coalesce(sum(case when extract(dow from a.attendance_date) = 0 and (a.attendance_status = 'HADIR' or a.overtime_minutes > 0) then 1 else 0 end), 0)
      into v_full, v_half, v_ot, v_count_4h, v_sunday_count
      from public.attendance_records a
      where a.worker_id = r.id
        and a.attendance_date between p_start and p_end
        and a.verification_status = 'TERVERIFIKASI';

      -- A. Gaji Pokok Harian (mencakup hari biasa & hari Minggu hadir)
      v_base := round((v_full * coalesce(r.daily_wage, 0) + v_half * coalesce(r.daily_wage, 0) * 0.5)::numeric, 2);
      v_meal := 0;

      -- B. Upah Lembur Harian: Jam Lembur * (Gaji Harian / 8)
      v_ot_amt := round(((v_ot / 60.0) * coalesce(r.daily_wage, 0) / greatest(coalesce(v_div, 8), 0.0001))::numeric, 2);

      -- C. Bonus Lembur >= 4 Jam (Rp 5.000 per kejadian)
      v_bonus := v_count_4h * coalesce(v_bonus4, 5000);

      -- D. Insentif Tambahan Hadir Minggu (Rp 20.000 per kehadiran Minggu)
      v_holiday := v_sunday_count * coalesce(v_holiday_bonus_setting, 20000);

    else
      -- BULANAN:
      -- Gaji pokok bulanan tetap
      -- Hari Minggu: 8 jam lembur (08:00 - 17:00) + Uang Makan Minggu Rp 50.000
      -- Bonus 4 jam (Rp 17.500) HANYA untuk lembur hari biasa >= 4 jam ATAU lembur Minggu lewat jam 17:00 >= 4 jam
      select
        coalesce(sum(case when a.day_class = 'FULL_DAY' and a.attendance_status = 'HADIR' then 1 else 0 end), 0),
        coalesce(sum(case when a.day_class = 'HALF_DAY' and a.attendance_status = 'HADIR' then 1 else 0 end), 0),
        coalesce(sum(a.overtime_minutes), 0),
        coalesce(sum(
          case
            when extract(dow from a.attendance_date) <> 0 and a.overtime_minutes >= 240 then 1
            when extract(dow from a.attendance_date) = 0 and (
              a.overtime_minutes >= 720 or
              (a.actual_out is not null and a.actual_out >= time '21:00:00')
            ) then 1
            else 0
          end
        ), 0),
        coalesce(sum(case when extract(dow from a.attendance_date) = 0 and (a.attendance_status = 'HADIR' or a.overtime_minutes > 0) then 1 else 0 end), 0)
      into v_full, v_half, v_ot, v_count_4h, v_sunday_count
      from public.attendance_records a
      where a.worker_id = r.id
        and a.attendance_date between p_start and p_end
        and a.verification_status = 'TERVERIFIKASI';

      -- A. Gaji Pokok Bulanan Tetap
      v_base := coalesce(r.monthly_salary, 0);

      -- B. Uang Makan Hari Minggu (Rp 50.000 per kehadiran Minggu)
      v_meal := v_sunday_count * coalesce(v_sunday_meal_setting, 50000);

      -- C. Upah Lembur Bulanan: Jam Lembur * (Gaji Bulanan / 190)
      v_ot_amt := round(((v_ot / 60.0) * coalesce(r.monthly_salary, 0) / greatest(coalesce(v_div, 190), 0.0001))::numeric, 2);

      -- D. Uang Makan Lembur Hari Biasa / Malam Minggu >= 4 Jam (Rp 17.500)
      v_bonus := v_count_4h * coalesce(v_bonus4, 17500);

      v_holiday := 0;
    end if;

    v_gross := round((v_base + v_meal + v_ot_amt + v_bonus + v_holiday)::numeric, 2);

    -- 2. Ambil Potongan Kasbon Perusahaan & Warung Luar
    select coalesce(sum(least(case when installment_amount > 0 then installment_amount else (amount - paid_amount) end, amount - paid_amount)), 0)
    into v_kasbon_perusahaan
    from public.cash_advances
    where worker_id = r.id and status = 'AKTIF' and category = 'KASBON_PERUSAHAAN';

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
      v_run, r.id, r.name, coalesce(r.pay_system, case when v_type = 'MINGGUAN' then 'HARIAN' else 'BULANAN' end),
      coalesce(r.daily_wage, 0), coalesce(r.monthly_salary, 0), v_full, v_half, v_ot,
      v_base, v_meal, v_ot_amt, v_bonus, v_holiday, 0,
      v_kasbon_perusahaan, v_kasbon_warung, v_total_item_deduction, v_net
    );

    v_total_gross := v_total_gross + v_gross;
    v_total_deduction := v_total_deduction + v_total_item_deduction;
    v_total_net := v_total_net + v_net;
  end loop;

  update public.payroll_runs set
    total_gross = v_total_gross,
    total_deduction = v_total_deduction,
    total_net = v_total_net
  where id = v_run;

  return v_run;
end;
$$;
