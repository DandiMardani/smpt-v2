-- ============================================================================
-- SCOPED ADDITIVE PRODUCTION SYNC SCRIPT: PAYROLL, SPK, ATTENDANCE & WORKERS
-- Tanggal: 2026-10-30T04:41:40.286Z
--
-- TARGET MODUL:
-- 1. SPK (Surat Perintah Kerja, Item Penugasan, QC / Pemeriksaan Hasil)
-- 2. PAYROLL (Payroll Bulanan, Borongan / Operator Payroll, Kasbon Warung & Cicilan)
-- 3. ATTENDANCE (Absensi, Shift, Rekap Lembur, Mesin Absen / Import Batch)
-- 4. WORKERS (Master Pekerja, KTP, Anak/Tanggungan, Kredensial Akun Borongan)
--
-- ATURAN KEAMANAN DATA LIVE:
-- 1. HANYA 'CREATE TABLE IF NOT EXISTS' untuk tabel modul target.
-- 2. HANYA 'ALTER TABLE ... ADD COLUMN IF NOT EXISTS' untuk kolom baru/lama.
-- 3. HANYA 'CREATE INDEX IF NOT EXISTS' dan 'CREATE SEQUENCE IF NOT EXISTS'.
-- 4. DILARANG KERAS: DROP, DELETE, TRUNCATE, atau ALTER COLUMN TYPE.
-- 5. Tabel di luar modul target (Gudang, Embarkasi, Cutting, Procurement) TIDAK disertakan.
-- ============================================================================

-- Aktifkan ekstensi pendukung
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. SEQUENCE KODE OTOMATIS MODUL TERKAIT
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.smpt_advance_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_att_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_att_import_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_check_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_manual_result_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_operator_payroll_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_payout_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_payroll_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_spk_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_work_item_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_worker_code_seq;

-- ============================================================================
-- 2. MASTER TABEL MODUL TARGET (CREATE TABLE IF NOT EXISTS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.attendance_import_batches (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.attendance_import_rows (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.attendance_month_closures (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.cash_advance_payments (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.cash_advances (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.operator_payroll_items (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.operator_payroll_runs (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.payroll_attendance_reviews (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.payroll_payout_adjustments (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.payroll_payout_deductions (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.payroll_payout_details (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.payroll_payouts (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.payroll_run_details (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.payroll_run_items (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  key text primary key
);
CREATE TABLE IF NOT EXISTS public.production_checks (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.production_manual_results (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.production_order_items (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.production_orders (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.user_worker_links (
  user_id uuid primary key references auth.users(id) on delete cascade
);
CREATE TABLE IF NOT EXISTS public.work_item_dependencies (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.work_items (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.workers (
  id bigint generated always as identity primary key
);

-- ============================================================================
-- 3. SINKRONISASI KOLOM MODUL TARGET (ALTER TABLE ... ADD COLUMN IF NOT EXISTS)
-- ============================================================================

-- Tabel: attendance_import_batches (10 kolom)
ALTER TABLE public.attendance_import_batches ADD COLUMN IF NOT EXISTS duplicate_count integer not null default 0 check(duplicate_count>=0);
ALTER TABLE public.attendance_import_batches ADD COLUMN IF NOT EXISTS import_code text not null default ('ABI-'||lpad(nextval('public.smpt_att_import_code_seq')::text,7,'0'));
ALTER TABLE public.attendance_import_batches ADD COLUMN IF NOT EXISTS imported_at timestamptz not null default now();
ALTER TABLE public.attendance_import_batches ADD COLUMN IF NOT EXISTS imported_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.attendance_import_batches ADD COLUMN IF NOT EXISTS matched_count integer not null default 0 check(matched_count>=0);
ALTER TABLE public.attendance_import_batches ADD COLUMN IF NOT EXISTS problem_count integer not null default 0 check(problem_count>=0);
ALTER TABLE public.attendance_import_batches ADD COLUMN IF NOT EXISTS row_count integer not null default 0 check(row_count>=0);
ALTER TABLE public.attendance_import_batches ADD COLUMN IF NOT EXISTS source_file text not null;
ALTER TABLE public.attendance_import_batches ADD COLUMN IF NOT EXISTS status text not null default 'COMMITTED' check(status in ('COMMITTED','DIBATALKAN'));
ALTER TABLE public.attendance_import_batches ADD COLUMN IF NOT EXISTS verified_protected_count integer not null default 0 check(verified_protected_count>=0);

-- Tabel: attendance_import_rows (24 kolom)
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS activity text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS actual_in time;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS actual_out time;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS attendance_date date not null;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS batch_id bigint not null references public.attendance_import_batches(id) on delete restrict;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS day_name text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS department_raw text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS early_leave_text text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS effective_text text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS employee_code text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS employee_name_raw text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS finger_id text not null;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS late_text text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS overtime_text text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS position_raw text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS problem text not null;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS row_hash text not null;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS schedule_text text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS sheet_name text;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS sheet_row integer;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS source_row_no integer;
ALTER TABLE public.attendance_import_rows ADD COLUMN IF NOT EXISTS worker_id bigint references public.workers(id) on delete restrict;

-- Tabel: attendance_month_closures (5 kolom)
ALTER TABLE public.attendance_month_closures ADD COLUMN IF NOT EXISTS finalized_at timestamptz not null default now();
ALTER TABLE public.attendance_month_closures ADD COLUMN IF NOT EXISTS finalized_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.attendance_month_closures ADD COLUMN IF NOT EXISTS month_start date not null;
ALTER TABLE public.attendance_month_closures ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.attendance_month_closures ADD COLUMN IF NOT EXISTS status text not null default 'FINAL' check(status in ('FINAL','DIBATALKAN'));

-- Tabel: attendance_records (21 kolom)
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS actual_in time;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS actual_out time;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS attendance_code text not null default ('ABS-'||lpad(nextval('public.smpt_att_code_seq')::text,8,'0'));
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS attendance_date date not null;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS attendance_status text not null default 'HADIR' check(attendance_status in ('HADIR','IZIN','SAKIT','CUTI','ALPHA','LIBUR','DINAS_LUAR'));
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS day_class text check(day_class is null or day_class in ('FULL_DAY','HALF_DAY'));
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS manual_overtime_hours numeric(18,2) not null default 0;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS overtime_minutes integer not null default 0 check(overtime_minutes>=0);
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS schedule_in time;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS schedule_out time;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS source text not null default 'MANUAL' check(source in ('MANUAL','FINGERPRINT_IMPORT'));
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS source_file text;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS source_import_row_id bigint references public.attendance_import_rows(id) on delete set null;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS verification_status text not null default 'DRAFT' check(verification_status in ('DRAFT','TERVERIFIKASI'));
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS verified_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;

-- Tabel: cash_advance_payments (8 kolom)
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS advance_id bigint not null references public.cash_advances(id) on delete restrict;
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS amount numeric(18,2) not null check(amount>0);
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS payment_date date not null default current_date;
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS source text not null default 'MANUAL';

-- Tabel: cash_advances (14 kolom)
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS advance_code text not null default ('KSB-'||lpad(nextval('public.smpt_advance_code_seq')::text,6,'0'));
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS advance_date date not null default current_date;
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS amount numeric(18,2) not null check(amount>0);
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS category text not null default 'KASBON_PERUSAHAAN';
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS installment_amount numeric(18,2) not null default 0;
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS installment_count integer not null default 1;
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS installments_paid integer not null default 0;
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS paid_amount numeric(18,2) not null default 0 check(paid_amount>=0);
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','LUNAS','DIBATALKAN'));
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS warung_name text default null;
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;

-- Tabel: operator_payroll_items (11 kolom)
ALTER TABLE public.operator_payroll_items ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.operator_payroll_items ADD COLUMN IF NOT EXISTS operator_price_snapshot numeric(18,2) not null;
ALTER TABLE public.operator_payroll_items ADD COLUMN IF NOT EXISTS operator_value numeric(18,2) not null;
ALTER TABLE public.operator_payroll_items ADD COLUMN IF NOT EXISTS qty_approved numeric(18,4) not null;
ALTER TABLE public.operator_payroll_items ADD COLUMN IF NOT EXISTS run_id bigint not null references public.operator_payroll_runs(id) on delete restrict;
ALTER TABLE public.operator_payroll_items ADD COLUMN IF NOT EXISTS submission_price_snapshot numeric(18,2) not null;
ALTER TABLE public.operator_payroll_items ADD COLUMN IF NOT EXISTS submission_value numeric(18,2) not null;
ALTER TABLE public.operator_payroll_items ADD COLUMN IF NOT EXISTS work_item_id bigint not null references public.work_items(id) on delete restrict;
ALTER TABLE public.operator_payroll_items ADD COLUMN IF NOT EXISTS work_item_name_snapshot text not null;
ALTER TABLE public.operator_payroll_items ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;
ALTER TABLE public.operator_payroll_items ADD COLUMN IF NOT EXISTS worker_name_snapshot text not null;

-- Tabel: operator_payroll_runs (9 kolom)
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS payroll_code text not null default ('OPR-'||lpad(nextval('public.smpt_operator_payroll_seq')::text,6,'0'));
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS period_end date not null;
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS period_start date not null;
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS status text not null default 'FINAL' check(status in ('FINAL','DIBATALKAN'));
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS total_operator_value numeric(18,2) not null default 0;
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS total_submission_value numeric(18,2) not null default 0;

-- Tabel: payroll_attendance_reviews (15 kolom)
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS attendance_id bigint not null references public.attendance_records(id) on delete restrict;
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS bonus_ot_review_status text check(bonus_ot_review_status is null or bonus_ot_review_status in ('DISETUJUI','DITOLAK'));
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS day_class text check(day_class is null or day_class in ('FULL_DAY','HALF_DAY'));
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS holiday_manual_amount numeric(18,2) not null default 0 check(holiday_manual_amount>=0);
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS holiday_review_status text check(holiday_review_status is null or holiday_review_status in ('TANPA_TAMBAHAN','NOMINAL_MANUAL'));
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS is_holiday boolean not null default false;
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS meal_class text check(meal_class is null or meal_class in ('FULL','HALF','ZERO'));
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS overtime_approved_minutes integer not null default 0 check(overtime_approved_minutes>=0);
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS overtime_candidate_snapshot integer not null default 0 check(overtime_candidate_snapshot>=0);
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS overtime_review_status text check(overtime_review_status is null or overtime_review_status in ('DISETUJUI','DITOLAK'));
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS reviewed_at timestamptz not null default now();
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS reviewed_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.payroll_attendance_reviews ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Tabel: payroll_payout_adjustments (8 kolom)
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS actual_amount numeric(18,2) not null;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS adjustment_amount numeric(18,2) not null;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS provisional_amount numeric(18,2) not null;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS source_friday date not null;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS source_payout_detail_id bigint not null references public.payroll_payout_details(id) on delete restrict;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS target_payout_id bigint not null references public.payroll_payouts(id) on delete restrict;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;

-- Tabel: payroll_payout_deductions (6 kolom)
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS amount numeric(18,2) not null check(amount>0);
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS cash_advance_id bigint not null references public.cash_advances(id) on delete restrict;
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS cash_advance_payment_id bigint references public.cash_advance_payments(id) on delete restrict;
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS payout_id bigint not null references public.payroll_payouts(id) on delete restrict;
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;

-- Tabel: payroll_payout_details (24 kolom)
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS adjustment_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS daily_wage_snapshot numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS deduction_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS department_snapshot text;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS friday_attendance_id bigint references public.attendance_records(id) on delete restrict;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS friday_date date;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS friday_provisional_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS full_days numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS half_days numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS holiday_bonus numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS identity_no_snapshot text;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS meal_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS monthly_salary_snapshot numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS overtime_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS overtime_bonus numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS overtime_minutes integer not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS pay_system_snapshot text not null;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS payout_id bigint not null references public.payroll_payouts(id) on delete restrict;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS source_hash text not null;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS total_paid numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS wage_salary_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;
ALTER TABLE public.payroll_payout_details ADD COLUMN IF NOT EXISTS worker_name_snapshot text not null;

-- Tabel: payroll_payouts (19 kolom)
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS config_snapshot jsonb not null default '{}'::jsonb;
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS finalized_at timestamptz not null default now();
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS finalized_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS month_key text not null;
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS paid_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS payment_status text not null default 'BELUM_DIBAYAR' check(payment_status in ('BELUM_DIBAYAR','SUDAH_DIBAYAR'));
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS payout_code text not null default ('PYO-'||lpad(nextval('public.smpt_payout_code_seq')::text,7,'0'));
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS payout_type text not null check(payout_type in ('MINGGUAN','BULANAN'));
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS period_end date not null;
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS period_start date not null;
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS snapshot_hash text not null;
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS status text not null default 'FINAL' check(status in ('FINAL','DIBATALKAN'));
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS total_adjustment numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS total_deduction numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS total_gross numeric(18,2) not null default 0;
ALTER TABLE public.payroll_payouts ADD COLUMN IF NOT EXISTS total_net numeric(18,2) not null default 0;

-- Tabel: payroll_run_details (19 kolom)
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS attendance_date date not null;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS attendance_id bigint not null references public.attendance_records(id) on delete restrict;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS attendance_status text not null;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS base_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS day_class text;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS holiday_bonus numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS holiday_manual_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS is_holiday boolean not null default false;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS meal_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS meal_class text;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS overtime_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS overtime_approved_minutes integer not null default 0;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS overtime_bonus numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS overtime_candidate_minutes integer not null default 0;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS payroll_run_id bigint not null references public.payroll_runs(id) on delete restrict;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS row_total numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS source_hash text not null;
ALTER TABLE public.payroll_run_details ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;

-- Tabel: payroll_run_items (23 kolom)
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS base_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS daily_wage_snapshot numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS deduction_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS full_days numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS half_days numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS holiday_bonus numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS holiday_manual_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS kasbon_perusahaan_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS kasbon_warung_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS manual_overtime_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS manual_overtime_hours numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS meal_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS monthly_salary_snapshot numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS net_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS overtime_amount numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS overtime_bonus numeric(18,2) not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS overtime_minutes integer not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS pay_system_snapshot text not null;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS payroll_run_id bigint not null references public.payroll_runs(id) on delete restrict;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS pending_count integer not null default 0;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS worker_name_snapshot text not null;

-- Tabel: payroll_runs (14 kolom)
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS config_snapshot jsonb not null default '{}'::jsonb;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS payroll_code text not null default ('PAY-'||lpad(nextval('public.smpt_payroll_code_seq')::text,6,'0'));
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS payroll_type text not null check(payroll_type in ('MINGGUAN','BULANAN'));
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS period_end date not null;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS period_start date not null;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS snapshot_hash text;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS status text not null default 'FINAL' check(status in ('DRAFT','FINAL','DIBATALKAN'));
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS total_deduction numeric(18,2) not null default 0;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS total_gross numeric(18,2) not null default 0;
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS total_net numeric(18,2) not null default 0;

-- Tabel: payroll_settings (5 kolom)
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS updated_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS value_numeric numeric(18,4);
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS value_text text;

-- Tabel: production_checks (8 kolom)
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS cancelled_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS good_qty numeric(18,4) not null default 0 check(good_qty>=0);
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS order_item_id bigint not null references public.production_order_items(id) on delete restrict;
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS reject_qty numeric(18,4) not null default 0 check(reject_qty>=0);
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));

-- Tabel: production_manual_results (29 kolom)
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS cancelled_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS cancelled_by_email_snapshot text;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS created_by_email_snapshot text not null;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS operator_price_snapshot numeric(18,2) not null default 0 check(operator_price_snapshot>=0);
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS operator_value numeric(18,2) not null default 0 check(operator_value>=0);
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS product_code_snapshot text not null;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS product_id bigint not null;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS product_name_snapshot text not null;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS project_code_snapshot text not null;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on update restrict on delete restrict;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS project_name_snapshot text not null;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS qty_good numeric(18,4) not null check(qty_good>0);
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS reason text not null check(btrim(reason)<>'');
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS result_code text not null default ('MHR-'||lpad(nextval('public.smpt_manual_result_code_seq')::text,7,'0'));
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS result_date date not null default current_date;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS submission_price_snapshot numeric(18,2) not null default 0 check(submission_price_snapshot>=0);
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS submission_value numeric(18,2) not null default 0 check(submission_value>=0);
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS work_item_code_snapshot text not null;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS work_item_id bigint not null references public.work_items(id) on update restrict on delete restrict;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS work_item_name_snapshot text not null;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS worker_code_snapshot text not null;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on update restrict on delete restrict;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS worker_name_snapshot text not null;
ALTER TABLE public.production_manual_results ADD COLUMN IF NOT EXISTS worker_pay_system_snapshot text not null;

-- Tabel: production_order_items (12 kolom)
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS assigned_qty numeric(18,4) not null check(assigned_qty>0);
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS is_final_output_snapshot boolean not null default false;
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS operator_price_snapshot numeric(18,2) not null default 0 check(operator_price_snapshot>=0);
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS order_id bigint not null references public.production_orders(id) on delete restrict;
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS qty_per_product_snapshot numeric(18,4) not null check(qty_per_product_snapshot>0);
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','SELESAI','DIBATALKAN'));
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS submission_price_snapshot numeric(18,2) not null default 0 check(submission_price_snapshot>=0);
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS unit_snapshot text not null;
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS work_item_id bigint not null references public.work_items(id) on delete restrict;
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS work_item_name_snapshot text not null;

-- Tabel: production_orders (16 kolom)
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS operator_worker_id bigint not null references public.workers(id) on delete restrict;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS order_date date not null default current_date;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS product_id bigint not null;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on delete restrict;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS spk_code text not null default ('SPK-'||lpad(nextval('public.smpt_spk_code_seq')::text,6,'0'));
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS status text not null default 'DRAFT' check(status in ('DRAFT','AKTIF','SELESAI','DIBATALKAN'));
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS supervisor_worker_id bigint references public.workers(id) on delete restrict;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS updated_by uuid references auth.users(id) on delete set null default auth.uid();

-- Tabel: user_worker_links (5 kolom)
ALTER TABLE public.user_worker_links ADD COLUMN IF NOT EXISTS active boolean not null default true;
ALTER TABLE public.user_worker_links ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.user_worker_links ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.user_worker_links ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.user_worker_links ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;

-- Tabel: work_item_dependencies (14 kolom)
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS dependency_type text not null default 'SEQUENTIAL' check (dependency_type in ('SEQUENTIAL','JOIN','OPTIONAL'));
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS enforce_from timestamptz not null default now();
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS opening_consumed_equivalent numeric(18,4) not null default 0 check (opening_consumed_equivalent>=0);
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS predecessor_work_item_id bigint not null references public.work_items(id) on update restrict on delete restrict;
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS product_id bigint not null references public.project_products(id) on update restrict on delete restrict;
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS source_mode text not null default 'MANUAL_SPECIAL' check (source_mode in ('AUTO_LINEAR','MANUAL_SPECIAL'));
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check (status in ('AKTIF','NONAKTIF'));
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS successor_work_item_id bigint not null references public.work_items(id) on update restrict on delete restrict;
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.work_item_dependencies ADD COLUMN IF NOT EXISTS validation_mode text not null default 'WARNING' check (validation_mode in ('WARNING','HARD'));

-- Tabel: work_items (21 kolom)
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS display_order integer not null default 0;
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS executor_scope text not null default 'OPERATOR_BORONGAN' check(executor_scope in ('OPERATOR_BORONGAN','PEKERJA_HARIAN','KEDUANYA'));
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS flow_mode text not null default 'MANDIRI' check (flow_mode in ('MANDIRI','BERANTAI','KHUSUS'));
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS flow_order integer check (flow_order is null or flow_order > 0);
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS item_code text not null default ( 'ITM-' || lpad(nextval('public.smpt_work_item_code_seq')::text, 5, '0') );
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS legacy_unassigned_product boolean not null default false;
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS operator_price bigint not null default 0;
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS output_final boolean not null default false;
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on update restrict on delete restrict;
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS proposed_price bigint not null default 0;
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS qty_per_product integer not null;
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS routing_validation_mode text not null default 'WARNING' check (routing_validation_mode in ('WARNING','HARD'));
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF';
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS submission_category text not null default 'BORONGAN' check(submission_category in ('BORONGAN','TIDAK_ADA'));
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS unit text not null;
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.work_items ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: workers (24 kolom)
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS bank_account_name text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS bank_account_no text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS children_count integer not null default 0 check (children_count >= 0);
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS daily_wage numeric(18,2) not null default 0 check (daily_wage>=0);
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS entry_date date;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS exit_date date;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS finger_id text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS identity_no text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS ktp_photo_url text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS monthly_salary numeric(18,2) not null default 0 check (monthly_salary>=0);
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS pay_system text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS position text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check (status in ('AKTIF','NONAKTIF'));
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS worker_code text not null default ('PKR-'||lpad(nextval('public.smpt_worker_code_seq')::text,6,'0'));

-- ============================================================================
-- 4. INDEX PENDUKUNG PERFORMA & INTEGRITAS MODUL TARGET
-- ============================================================================
CREATE INDEX IF NOT EXISTS work_items_product_status_idx ON public.work_items (project_id, product_id, status);
CREATE INDEX IF NOT EXISTS workers_active_department_idx ON public.workers (status,department,position);
CREATE INDEX IF NOT EXISTS production_orders_status_idx ON public.production_orders (status,order_date desc,id desc);
CREATE INDEX IF NOT EXISTS production_orders_operator_idx ON public.production_orders (operator_worker_id,status,order_date desc);
CREATE INDEX IF NOT EXISTS production_order_items_work_idx ON public.production_order_items (work_item_id,status);
CREATE INDEX IF NOT EXISTS production_checks_item_idx ON public.production_checks (order_item_id,status,check_date desc,id desc);
CREATE INDEX IF NOT EXISTS production_checks_checker_idx ON public.production_checks (checker_user_id,check_date desc);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON public.attendance_records (attendance_date desc,worker_id);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_period_uq ON public.payroll_runs (payroll_type,period_start,period_end) where status<>'DIBATALKAN';
CREATE UNIQUE INDEX IF NOT EXISTS operator_payroll_runs_period_uq ON public.operator_payroll_runs (period_start,period_end) where status<>'DIBATALKAN';
CREATE INDEX IF NOT EXISTS production_checks_date_idx ON public.production_checks (check_date desc,status,order_item_id);
CREATE INDEX IF NOT EXISTS attendance_worker_period_idx ON public.attendance_records (worker_id,attendance_date desc,verification_status);
CREATE INDEX IF NOT EXISTS cash_advance_worker_idx ON public.cash_advances (worker_id,status,advance_date desc);
CREATE INDEX IF NOT EXISTS attendance_import_rows_worker_date_idx ON public.attendance_import_rows (worker_id,attendance_date desc,id desc);
CREATE INDEX IF NOT EXISTS attendance_import_rows_batch_idx ON public.attendance_import_rows (batch_id,id);
CREATE INDEX IF NOT EXISTS work_items_product_route_idx ON public.work_items (product_id, display_order, id) where product_id is not null;
CREATE INDEX IF NOT EXISTS work_item_dependencies_successor_idx ON public.work_item_dependencies (product_id, successor_work_item_id, status, id);
CREATE INDEX IF NOT EXISTS work_item_dependencies_predecessor_idx ON public.work_item_dependencies (product_id, predecessor_work_item_id, status, id);
CREATE INDEX IF NOT EXISTS production_orders_scope_status_idx ON public.production_orders (project_id,product_id,status,order_date desc,id desc);
CREATE INDEX IF NOT EXISTS production_order_items_work_status_idx ON public.production_order_items (work_item_id,status,order_id,id);
CREATE INDEX IF NOT EXISTS production_checks_item_date_active_idx ON public.production_checks (order_item_id,check_date desc,id desc) where status='AKTIF';
CREATE UNIQUE INDEX IF NOT EXISTS work_items_active_linear_order_uidx ON public.work_items (product_id, flow_order) where product_id is not null and status='AKTIF' and flow_mode='BERANTAI' and flow_order is not null;
CREATE INDEX IF NOT EXISTS work_items_flow_idx ON public.work_items (product_id, flow_mode, flow_order, id) where product_id is not null and status='AKTIF';
CREATE INDEX IF NOT EXISTS work_item_dependencies_source_idx ON public.work_item_dependencies (product_id, source_mode, status, id);
CREATE INDEX IF NOT EXISTS work_items_manager_progress_idx ON public.work_items (product_id,status,output_final,id) where product_id is not null;
CREATE INDEX IF NOT EXISTS production_orders_manager_idx ON public.production_orders (project_id,product_id,status,due_date,id);
CREATE INDEX IF NOT EXISTS production_order_items_work_item_idx ON public.production_order_items (work_item_id,order_id,status,id);
CREATE INDEX IF NOT EXISTS production_orders_product_status_idx ON public.production_orders (product_id,status,id);
CREATE INDEX IF NOT EXISTS work_items_manual_result_profile_idx ON public.work_items (project_id,product_id,status,executor_scope,submission_category,id);
CREATE INDEX IF NOT EXISTS production_manual_results_scope_idx ON public.production_manual_results (project_id,product_id,work_item_id,status,result_date desc,id desc);
CREATE INDEX IF NOT EXISTS production_manual_results_worker_idx ON public.production_manual_results (worker_id,status,result_date desc,id desc);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) & PERMISSION GRANTS
-- ============================================================================
ALTER TABLE public.attendance_import_batches ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_import_batches TO authenticated, service_role;
ALTER TABLE public.attendance_import_rows ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_import_rows TO authenticated, service_role;
ALTER TABLE public.attendance_month_closures ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_month_closures TO authenticated, service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated, service_role;
ALTER TABLE public.cash_advance_payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_advance_payments TO authenticated, service_role;
ALTER TABLE public.cash_advances ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_advances TO authenticated, service_role;
ALTER TABLE public.operator_payroll_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_payroll_items TO authenticated, service_role;
ALTER TABLE public.operator_payroll_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_payroll_runs TO authenticated, service_role;
ALTER TABLE public.payroll_attendance_reviews ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_attendance_reviews TO authenticated, service_role;
ALTER TABLE public.payroll_payout_adjustments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_payout_adjustments TO authenticated, service_role;
ALTER TABLE public.payroll_payout_deductions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_payout_deductions TO authenticated, service_role;
ALTER TABLE public.payroll_payout_details ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_payout_details TO authenticated, service_role;
ALTER TABLE public.payroll_payouts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_payouts TO authenticated, service_role;
ALTER TABLE public.payroll_run_details ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_run_details TO authenticated, service_role;
ALTER TABLE public.payroll_run_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_run_items TO authenticated, service_role;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated, service_role;
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_settings TO authenticated, service_role;
ALTER TABLE public.production_checks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_checks TO authenticated, service_role;
ALTER TABLE public.production_manual_results ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_manual_results TO authenticated, service_role;
ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_order_items TO authenticated, service_role;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated, service_role;
ALTER TABLE public.user_worker_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_worker_links TO authenticated, service_role;
ALTER TABLE public.work_item_dependencies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_item_dependencies TO authenticated, service_role;
ALTER TABLE public.work_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_items TO authenticated, service_role;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ============================================================================
-- SELESAI: SYNC SCRIPT PAYROLL, SPK, ATTENDANCE & WORKERS BERHASIL DISIAPKAN
-- ============================================================================
