-- ============================================================================
-- Migration: 20261103141500_sync_payroll_runs_sequence_and_safe_code_generation.sql
-- Deskripsi: 
-- 1. Menyinkronkan ulang (sync) sequence smpt_payroll_code_seq dan payroll_runs_id_seq
--    ke nilai maksimum yang ada di tabel saat ini (+1 untuk nextval).
-- 2. Membangun trigger proteksi atomic unik (smpt_ensure_payroll_code) agar saat
--    generate payroll_code tidak pernah bentrok / melanggar unique constraint.
-- 3. Memperbarui fungsi RPC finalize_general_payroll agar pengecekan dan pembuatan
--    batch payroll berjalan secara aman dan atomic.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SINKRONISASI SEQUENCE TERTINGGAL (PAYROLL RUNS & OPERATOR PAYROLL)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_max_pay_code bigint;
  v_max_pay_id bigint;
  v_max_opr_code bigint;
  v_max_opr_id bigint;
BEGIN
  -- A. Sinkronisasi tabel payroll_runs
  SELECT coalesce(max(nullif(regexp_replace(payroll_code, '[^0-9]', '', 'g'), '')::bigint), 0)
  INTO v_max_pay_code
  FROM public.payroll_runs;

  IF v_max_pay_code > 0 THEN
    PERFORM setval('public.smpt_payroll_code_seq', v_max_pay_code, true);
  END IF;

  SELECT coalesce(max(id), 0)
  INTO v_max_pay_id
  FROM public.payroll_runs;

  IF v_max_pay_id > 0 THEN
    PERFORM setval('public.payroll_runs_id_seq', v_max_pay_id, true);
  END IF;

  -- B. Sinkronisasi tabel operator_payroll_runs
  SELECT coalesce(max(nullif(regexp_replace(payroll_code, '[^0-9]', '', 'g'), '')::bigint), 0)
  INTO v_max_opr_code
  FROM public.operator_payroll_runs;

  IF v_max_opr_code > 0 THEN
    PERFORM setval('public.smpt_operator_payroll_seq', v_max_opr_code, true);
  END IF;

  SELECT coalesce(max(id), 0)
  INTO v_max_opr_id
  FROM public.operator_payroll_runs;

  IF v_max_opr_id > 0 THEN
    PERFORM setval('public.operator_payroll_runs_id_seq', v_max_opr_id, true);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. TRIGGER SEBELUM INSERT UNTUK MENJAMIN KODE SELALU UNIK DAN TIDAK COLLIDE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.smpt_ensure_payroll_runs_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_num bigint;
  v_candidate text;
  v_code_num bigint;
  v_max_num bigint;
BEGIN
  -- Jika kode belum ada, kosong, atau sudah pernah digunakan di tabel:
  IF NEW.payroll_code IS NULL OR btrim(NEW.payroll_code) = '' OR EXISTS (
    SELECT 1 FROM public.payroll_runs WHERE payroll_code = NEW.payroll_code
  ) THEN
    LOOP
      v_next_num := nextval('public.smpt_payroll_code_seq');
      v_candidate := 'PAY-' || lpad(v_next_num::text, 6, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.payroll_runs WHERE payroll_code = v_candidate
      );
    END LOOP;
    NEW.payroll_code := v_candidate;
  ELSE
    -- Jika kode manual diberikan, pastikan sequence ikut dimajukan jika nilainya lebih tinggi
    BEGIN
      v_code_num := nullif(regexp_replace(NEW.payroll_code, '[^0-9]', '', 'g'), '')::bigint;
      IF v_code_num IS NOT NULL THEN
        SELECT coalesce(max(nullif(regexp_replace(payroll_code, '[^0-9]', '', 'g'), '')::bigint), 0)
        INTO v_max_num
        FROM public.payroll_runs;

        IF v_code_num > v_max_num THEN
          PERFORM setval('public.smpt_payroll_code_seq', v_code_num, true);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Abaikan error konversi regex string
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_payroll_runs_code ON public.payroll_runs;
CREATE TRIGGER trg_ensure_payroll_runs_code
  BEFORE INSERT ON public.payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.smpt_ensure_payroll_runs_code();

-- Proteksi serupa untuk operator_payroll_runs
CREATE OR REPLACE FUNCTION public.smpt_ensure_operator_payroll_runs_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_num bigint;
  v_candidate text;
  v_code_num bigint;
  v_max_num bigint;
BEGIN
  IF NEW.payroll_code IS NULL OR btrim(NEW.payroll_code) = '' OR EXISTS (
    SELECT 1 FROM public.operator_payroll_runs WHERE payroll_code = NEW.payroll_code
  ) THEN
    LOOP
      v_next_num := nextval('public.smpt_operator_payroll_seq');
      v_candidate := 'OPR-' || lpad(v_next_num::text, 6, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.operator_payroll_runs WHERE payroll_code = v_candidate
      );
    END LOOP;
    NEW.payroll_code := v_candidate;
  ELSE
    BEGIN
      v_code_num := nullif(regexp_replace(NEW.payroll_code, '[^0-9]', '', 'g'), '')::bigint;
      IF v_code_num IS NOT NULL THEN
        SELECT coalesce(max(nullif(regexp_replace(payroll_code, '[^0-9]', '', 'g'), '')::bigint), 0)
        INTO v_max_num
        FROM public.operator_payroll_runs;

        IF v_code_num > v_max_num THEN
          PERFORM setval('public.smpt_operator_payroll_seq', v_code_num, true);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Abaikan error konversi regex string
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_operator_payroll_runs_code ON public.operator_payroll_runs;
CREATE TRIGGER trg_ensure_operator_payroll_runs_code
  BEFORE INSERT ON public.operator_payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.smpt_ensure_operator_payroll_runs_code();

-- ----------------------------------------------------------------------------
-- 3. PERBAIKAN RPC FINALIZE GENERAL PAYROLL AGAR AMAN & ATOMIC
-- ----------------------------------------------------------------------------
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

  -- 1. Cek apakah sudah ada batch aktif untuk tipe dan rentang tanggal yang sama
  SELECT id INTO v_run
  FROM public.payroll_runs
  WHERE payroll_type = v_type
    AND period_start = p_start
    AND period_end = p_end
    AND status <> 'DIBATALKAN'
  ORDER BY id DESC
  LIMIT 1;

  IF v_run IS NOT NULL THEN
    -- Jika batch sudah ada, update metadata dan gunakan ID yang sama (hindari duplikasi/bocoran sequence)
    UPDATE public.payroll_runs SET
      notes = coalesce(p_notes, notes),
      status = 'FINAL',
      finalized_at = now()
    WHERE id = v_run;
  ELSE
    -- Jika batch baru, insert dengan proteksi trigger safe code generation
    INSERT INTO public.payroll_runs(
      payroll_type, period_start, period_end, status, notes, finalized_at,
      total_gross, total_deduction, total_net
    ) VALUES (
      v_type, p_start, p_end, 'FINAL', p_notes, now(),
      0, 0, 0
    )
    RETURNING id INTO v_run;
  END IF;

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
    -- Hitung Kehadiran Terverifikasi
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

    -- Ambil Potongan Kasbon Perusahaan & Warung Luar
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

-- Izin Eksekusi
REVOKE ALL ON FUNCTION public.finalize_general_payroll(text, date, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_general_payroll(text, date, date, text) TO authenticated, postgres, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.smpt_payroll_code_seq TO authenticated, postgres, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.smpt_operator_payroll_seq TO authenticated, postgres, service_role;

