-- ============================================================================
-- Migration: 20261030150000_upsert_payroll_runs_on_conflict.sql
-- Deskripsi: Mengubah logika query insert pada tabel payroll_runs menjadi operasi UPSERT
--           dengan klausa ON CONFLICT (payroll_type, period_start, period_end) DO UPDATE SET ...
--           agar jika payroll untuk periode tersebut sudah ada, sistem mengupdate nilai totalnya
--           (total_gross, total_deduction, total_net) tanpa crash melanggar unique constraint.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_general_payroll(
  p_type text,
  p_start date,
  p_end date,
  p_notes text default null
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
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
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_permission('payroll.write') AND upper(coalesce(public.current_user_role(),''))<>'ADMIN' THEN
    RAISE EXCEPTION 'Tidak memiliki izin Payroll.' USING errcode='42501';
  END IF;

  IF v_type NOT IN ('MINGGUAN', 'BULANAN') THEN
    RAISE EXCEPTION 'Jenis Payroll harus MINGGUAN atau BULANAN.';
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'Periode Payroll tidak valid (% s/d %).', p_start, p_end;
  END IF;

  -- 1. Operasi UPSERT pada payroll_runs
  -- Menggunakan ON CONFLICT (payroll_type, period_start, period_end) DO UPDATE SET ...
  -- Jika periode sudah ada, lakukan update nilai total dan metadata, bukan insert baru yang menyebabkan crash.
  INSERT INTO public.payroll_runs(
    payroll_type, period_start, period_end, status, notes, finalized_at,
    total_gross, total_deduction, total_net
  ) VALUES (
    v_type, p_start, p_end, 'FINAL', p_notes, now(),
    0, 0, 0
  )
  ON CONFLICT (payroll_type, period_start, period_end) WHERE status <> 'DIBATALKAN'
  DO UPDATE SET
    total_gross = excluded.total_gross,
    total_deduction = excluded.total_deduction,
    total_net = excluded.total_net,
    notes = coalesce(excluded.notes, public.payroll_runs.notes),
    status = 'FINAL',
    finalized_at = now()
  RETURNING id INTO v_run;

  -- 2. Bersihkan rincian pekerja lama untuk run ini agar dihitung ulang secara bersih
  DELETE FROM public.payroll_run_items WHERE payroll_run_id = v_run;

  -- Ambil parameter pengaturan dinamis
  SELECT coalesce(value_numeric, 50000) INTO v_sunday_meal_setting FROM public.payroll_settings WHERE key='BULANAN_SUNDAY_MEAL';
  SELECT coalesce(value_numeric, 20000) INTO v_holiday_bonus_setting FROM public.payroll_settings WHERE key='HARIAN_HOLIDAY_BONUS_FULL';

  IF v_type = 'MINGGUAN' THEN
    SELECT coalesce(value_numeric, 8) INTO v_div FROM public.payroll_settings WHERE key='OT_DIVISOR_HARIAN';
    SELECT coalesce(value_numeric, 5000) INTO v_bonus4 FROM public.payroll_settings WHERE key='OT_BONUS_HARIAN_4H';
  ELSE
    SELECT coalesce(value_numeric, 190) INTO v_div FROM public.payroll_settings WHERE key='OT_DIVISOR_BULANAN';
    SELECT coalesce(value_numeric, 17500) INTO v_bonus4 FROM public.payroll_settings WHERE key='OT_BONUS_BULANAN_4H';
  END IF;

  -- Loop setiap pekerja aktif sesuai tipe sistem upah
  FOR r IN
    SELECT * FROM public.workers w
    WHERE w.status = 'AKTIF'
      AND upper(coalesce(w.pay_system, '')) = CASE WHEN v_type = 'MINGGUAN' THEN 'HARIAN' ELSE 'BULANAN' END
    ORDER BY w.name
  LOOP
    -- 1. Hitung Kehadiran Terverifikasi
    IF v_type = 'MINGGUAN' THEN
      SELECT
        coalesce(sum(CASE WHEN a.day_class = 'FULL_DAY' AND a.attendance_status = 'HADIR' THEN 1 ELSE 0 END), 0),
        coalesce(sum(CASE WHEN a.day_class = 'HALF_DAY' AND a.attendance_status = 'HADIR' THEN 1 ELSE 0 END), 0),
        coalesce(sum(
          CASE
            WHEN extract(dow FROM a.attendance_date) = 0 AND (a.actual_out IS NULL OR a.actual_out <= time '17:00:00') AND a.overtime_minutes = 480 THEN 0
            WHEN extract(dow FROM a.attendance_date) = 0 AND a.overtime_minutes >= 480 THEN (a.overtime_minutes - 480)
            ELSE a.overtime_minutes
          END
        ), 0),
        coalesce(sum(
          CASE
            WHEN extract(dow FROM a.attendance_date) <> 0 AND a.overtime_minutes >= 240 THEN 1
            WHEN extract(dow FROM a.attendance_date) = 0 AND (
              (a.overtime_minutes >= 240 AND a.overtime_minutes < 480) OR
              (a.overtime_minutes >= 720) OR
              (a.actual_out IS NOT NULL AND a.actual_out >= time '21:00:00')
            ) THEN 1
            ELSE 0
          END
        ), 0),
        coalesce(sum(CASE WHEN extract(dow FROM a.attendance_date) = 0 AND (a.attendance_status = 'HADIR' OR a.overtime_minutes > 0) THEN 1 ELSE 0 END), 0)
      INTO v_full, v_half, v_ot, v_count_4h, v_sunday_count
      FROM public.attendance_records a
      WHERE a.worker_id = r.id
        AND a.attendance_date BETWEEN p_start AND p_end
        AND a.verification_status = 'TERVERIFIKASI';

      v_base := round((v_full * coalesce(r.daily_wage, 0) + v_half * coalesce(r.daily_wage, 0) * 0.5)::numeric, 2);
      v_meal := 0;
      v_ot_amt := round(((v_ot / 60.0) * coalesce(r.daily_wage, 0) / greatest(coalesce(v_div, 8), 0.0001))::numeric, 2);
      v_bonus := v_count_4h * coalesce(v_bonus4, 5000);
      v_holiday := v_sunday_count * coalesce(v_holiday_bonus_setting, 20000);
    ELSE
      SELECT
        coalesce(sum(CASE WHEN a.day_class = 'FULL_DAY' AND a.attendance_status = 'HADIR' THEN 1 ELSE 0 END), 0),
        coalesce(sum(CASE WHEN a.day_class = 'HALF_DAY' AND a.attendance_status = 'HADIR' THEN 1 ELSE 0 END), 0),
        coalesce(sum(a.overtime_minutes), 0),
        coalesce(sum(
          CASE
            WHEN extract(dow FROM a.attendance_date) <> 0 AND a.overtime_minutes >= 240 THEN 1
            WHEN extract(dow FROM a.attendance_date) = 0 AND (
              a.overtime_minutes >= 720 OR
              (a.actual_out IS NOT NULL AND a.actual_out >= time '21:00:00')
            ) THEN 1
            ELSE 0
          END
        ), 0),
        coalesce(sum(CASE WHEN extract(dow FROM a.attendance_date) = 0 AND (a.attendance_status = 'HADIR' OR a.overtime_minutes > 0) THEN 1 ELSE 0 END), 0)
      INTO v_full, v_half, v_ot, v_count_4h, v_sunday_count
      FROM public.attendance_records a
      WHERE a.worker_id = r.id
        AND a.attendance_date BETWEEN p_start AND p_end
        AND a.verification_status = 'TERVERIFIKASI';

      v_base := coalesce(r.monthly_salary, 0);
      v_meal := v_sunday_count * coalesce(v_sunday_meal_setting, 50000);
      v_ot_amt := round(((v_ot / 60.0) * coalesce(r.monthly_salary, 0) / greatest(coalesce(v_div, 190), 0.0001))::numeric, 2);
      v_bonus := v_count_4h * coalesce(v_bonus4, 17500);
      v_holiday := 0;
    END IF;

    v_gross := round((v_base + v_meal + v_ot_amt + v_bonus + v_holiday)::numeric, 2);

    -- 2. Ambil Potongan Kasbon Perusahaan & Warung Luar
    SELECT coalesce(sum(least(CASE WHEN installment_amount > 0 THEN installment_amount ELSE (amount - paid_amount) END, amount - paid_amount)), 0)
    INTO v_kasbon_perusahaan
    FROM public.cash_advances
    WHERE worker_id = r.id AND status = 'AKTIF' AND category = 'KASBON_PERUSAHAAN';

    SELECT coalesce(sum(amount - paid_amount), 0)
    INTO v_kasbon_warung
    FROM public.cash_advances
    WHERE worker_id = r.id AND status = 'AKTIF' AND category = 'KASBON_WARUNG';

    v_total_item_deduction := v_kasbon_perusahaan + v_kasbon_warung;
    v_net := greatest(0, v_gross - v_total_item_deduction);

    INSERT INTO public.payroll_run_items(
      payroll_run_id, worker_id, worker_name_snapshot, pay_system_snapshot,
      daily_wage_snapshot, monthly_salary_snapshot, full_days, half_days, overtime_minutes,
      base_amount, meal_amount, overtime_amount, overtime_bonus, holiday_bonus, holiday_manual_amount,
      kasbon_perusahaan_amount, kasbon_warung_amount, deduction_amount, net_amount
    ) VALUES (
      v_run, r.id, r.name, coalesce(r.pay_system, CASE WHEN v_type = 'MINGGUAN' THEN 'HARIAN' ELSE 'BULANAN' END),
      coalesce(r.daily_wage, 0), coalesce(r.monthly_salary, 0), v_full, v_half, v_ot,
      v_base, v_meal, v_ot_amt, v_bonus, v_holiday, 0,
      v_kasbon_perusahaan, v_kasbon_warung, v_total_item_deduction, v_net
    );

    v_total_gross := v_total_gross + v_gross;
    v_total_deduction := v_total_deduction + v_total_item_deduction;
    v_total_net := v_total_net + v_net;
  END LOOP;

  -- 3. Update ringkasan total run
  UPDATE public.payroll_runs SET
    total_gross = v_total_gross,
    total_deduction = v_total_deduction,
    total_net = v_total_net
  WHERE id = v_run;

  RETURN v_run;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_general_payroll(text, date, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_general_payroll(text, date, date, text) TO authenticated, postgres, service_role;
