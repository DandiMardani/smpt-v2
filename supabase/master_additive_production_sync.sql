-- ============================================================================
-- MASTER ADDITIVE PRODUCTION SYNC SCRIPT (SMPT-DEV -> SMPT-V2 PROD)
-- Tanggal Dibuat: 2026-10-30T04:41:28.880Z
--
-- ATURAN KEAMANAN DATABASE LIVE:
-- 1. HANYA 'CREATE TABLE IF NOT EXISTS' untuk tabel baru.
-- 2. HANYA 'ALTER TABLE ... ADD COLUMN IF NOT EXISTS' untuk kolom baru.
-- 3. HANYA 'CREATE INDEX IF NOT EXISTS' dan 'CREATE SEQUENCE IF NOT EXISTS'.
-- 4. DILARANG KERAS: DROP TABLE, DROP COLUMN, TRUNCATE, DELETE, ALTER COLUMN TYPE.
-- 5. Idempotent & Non-Destructive: Aman dieksekusi berkali-kali tanpa merusak data.
-- ============================================================================

-- Aktifkan ekstensi yang diperlukan
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- BAGIAN 1: SEQUENCE PENDUKUNG (CREATE SEQUENCE IF NOT EXISTS)
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.smpt_advance_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_att_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_att_import_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_audit_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_bom_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_check_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_cut_component_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_cut_result_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_cut_usage_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_data_backup_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_embarkation_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_external_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_finance_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_finished_good_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_issue_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_issue_problem_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_location_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_log_stock_event_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_manual_result_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_material_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_material_lot_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_mfg_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_operator_payroll_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_pack_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_payout_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_payroll_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_petty_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_product_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_production_anomaly_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_purchase_order_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_purchase_plan_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_qc_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_ready_usage_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_receipt_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_request_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_request_item_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_rework_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_salary_submission_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_set_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_shipment_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_spk_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_stock_event_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_system_test_run_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_target_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_transfer_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_vendor_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_work_item_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.smpt_worker_code_seq;

-- ============================================================================
-- BAGIAN 2: MASTER TABEL (CREATE TABLE IF NOT EXISTS)
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
CREATE TABLE IF NOT EXISTS public.audit_events (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.bom_requirements (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.bundle_package_balances (
  id bigserial primary key
);
CREATE TABLE IF NOT EXISTS public.bundle_package_packing_items (
  id bigserial primary key
);
CREATE TABLE IF NOT EXISTS public.bundle_package_packings (
  id bigserial primary key
);
CREATE TABLE IF NOT EXISTS public.bundle_package_recipes (
  id bigserial primary key
);
CREATE TABLE IF NOT EXISTS public.bundle_packages (
  id bigserial primary key
);
CREATE TABLE IF NOT EXISTS public.bundle_recipes (
  id BIGSERIAL PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS public.cash_advance_payments (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.cash_advances (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.cutting_components (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.cutting_daily_results (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.cutting_material_usages (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.embarkation_issues (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.embarkation_shipments (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.embarkation_targets (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.embarkations (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.external_finished_receipts (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.finished_goods (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.finished_goods_bundling (
  id bigserial primary key
);
CREATE TABLE IF NOT EXISTS public.finished_goods_bundling_items (
  id bigserial primary key
);
CREATE TABLE IF NOT EXISTS public.finished_goods_transfers (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.locations (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.logistics_stock_balances (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.logistics_stock_events (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.logistics_stock_ledger (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.manufacturing_transactions (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.material_lots (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.material_request_items (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.material_requests (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.material_suppliers (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.materials (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.operator_payroll_items (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.operator_payroll_runs (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.packing_runs (
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
CREATE TABLE IF NOT EXISTS public.permissions (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.petty_cash_transactions (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.product_set_components (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.product_sets (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.production_anomalies (
  id bigint generated always as identity primary key
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
CREATE TABLE IF NOT EXISTS public.production_wip_consumptions (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);
CREATE TABLE IF NOT EXISTS public.project_products (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.projects (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.purchase_plan_lines (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.purchase_plans (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.qc_inspections (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.qc_reworks (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.ready_production_usage_lots (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.ready_production_usages (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id bigint not null references public.roles(id) on delete cascade,
  permission_id bigint not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);
CREATE TABLE IF NOT EXISTS public.roles (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.salary_submissions (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.smpt_keepalive_log (
  id BIGSERIAL PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS public.stock_balances (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.stock_events (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.stock_ledger_entries (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.stock_locations (
  id smallint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.system_data_backups (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.system_test_run_entities (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.system_test_runs (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.user_worker_links (
  user_id uuid primary key references auth.users(id) on delete cascade
);
CREATE TABLE IF NOT EXISTS public.vendor_delivery_logs (
  id BIGSERIAL PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS public.vendor_down_payments (
  id BIGSERIAL PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS public.vendor_po_targets (
  id BIGSERIAL PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS public.vendors (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.warehouse_issue_lots (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.warehouse_issues (
  id bigint generated always as identity primary key
);
CREATE TABLE IF NOT EXISTS public.warehouse_receipts (
  id bigint generated always as identity primary key
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
-- BAGIAN 3: SINKRONISASI KOLOM (ALTER TABLE ... ADD COLUMN IF NOT EXISTS)
-- ============================================================================

-- Tabel: attendance_import_batches
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

-- Tabel: attendance_import_rows
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

-- Tabel: attendance_month_closures
ALTER TABLE public.attendance_month_closures ADD COLUMN IF NOT EXISTS finalized_at timestamptz not null default now();
ALTER TABLE public.attendance_month_closures ADD COLUMN IF NOT EXISTS finalized_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.attendance_month_closures ADD COLUMN IF NOT EXISTS month_start date not null;
ALTER TABLE public.attendance_month_closures ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.attendance_month_closures ADD COLUMN IF NOT EXISTS status text not null default 'FINAL' check(status in ('FINAL','DIBATALKAN'));

-- Tabel: attendance_records
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

-- Tabel: audit_events
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS action text not null;
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS actor_user_id uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS audit_code text not null default ('AUD-'||lpad(nextval('public.smpt_audit_code_seq')::text,9,'0'));
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS new_data jsonb;
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS occurred_at timestamptz not null default now();
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS old_data jsonb;
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS record_id text;
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS table_name text not null;

-- Tabel: bom_requirements
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS allowance_percent numeric(9,4);
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS allowance_qty numeric(18,4);
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS calculated_at timestamptz;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS calculated_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS calculation_input_snapshot jsonb;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS calculation_method text;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS component_name text not null;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS component_type text not null default 'BAHAN';
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS final_requirement numeric(18,4);
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS fulfillment_source text;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS legacy_project_level boolean not null default false;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS legacy_total_requirement numeric(18,4);
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS material_id bigint references public.materials(id) on update restrict on delete restrict;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS net_requirement numeric(18,4);
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS net_usage_per_product numeric(18,6);
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on update restrict on delete restrict;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS qty_per_unit numeric(18,4) not null default 0;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS requirement_code text not null default ( 'KBT-' || lpad(nextval('public.smpt_bom_code_seq')::text, 4, '0') );
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF';
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS unit text not null;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS unit_price numeric(18,2) not null default 0;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS waste_percent numeric(9,4);
ALTER TABLE public.bom_requirements ADD COLUMN IF NOT EXISTS waste_qty numeric(18,4);

-- Tabel: bundle_package_balances
ALTER TABLE public.bundle_package_balances ADD COLUMN IF NOT EXISTS location_id bigint not null default 1 references public.locations(id) on delete cascade;
ALTER TABLE public.bundle_package_balances ADD COLUMN IF NOT EXISTS package_id bigint not null references public.bundle_packages(id) on delete cascade;
ALTER TABLE public.bundle_package_balances ADD COLUMN IF NOT EXISTS quantity numeric not null default 0;
ALTER TABLE public.bundle_package_balances ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Tabel: bundle_package_packing_items
ALTER TABLE public.bundle_package_packing_items ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.bundle_package_packing_items ADD COLUMN IF NOT EXISTS finished_good_id bigint not null references public.finished_goods(id);
ALTER TABLE public.bundle_package_packing_items ADD COLUMN IF NOT EXISTS packing_id bigint not null references public.bundle_package_packings(id) on delete cascade;
ALTER TABLE public.bundle_package_packing_items ADD COLUMN IF NOT EXISTS qty_per_bundle numeric not null default 1 check (qty_per_bundle > 0);
ALTER TABLE public.bundle_package_packing_items ADD COLUMN IF NOT EXISTS total_qty numeric not null check (total_qty > 0);

-- Tabel: bundle_package_packings
ALTER TABLE public.bundle_package_packings ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.bundle_package_packings ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id);
ALTER TABLE public.bundle_package_packings ADD COLUMN IF NOT EXISTS location_id bigint not null default 1 references public.locations(id);
ALTER TABLE public.bundle_package_packings ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.bundle_package_packings ADD COLUMN IF NOT EXISTS package_id bigint not null references public.bundle_packages(id);
ALTER TABLE public.bundle_package_packings ADD COLUMN IF NOT EXISTS packing_code text not null;
ALTER TABLE public.bundle_package_packings ADD COLUMN IF NOT EXISTS packing_date date not null default current_date;
ALTER TABLE public.bundle_package_packings ADD COLUMN IF NOT EXISTS quantity numeric not null check (quantity > 0);

-- Tabel: bundle_package_recipes
ALTER TABLE public.bundle_package_recipes ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.bundle_package_recipes ADD COLUMN IF NOT EXISTS finished_good_id bigint not null references public.finished_goods(id) on delete cascade;
ALTER TABLE public.bundle_package_recipes ADD COLUMN IF NOT EXISTS package_id bigint not null references public.bundle_packages(id) on delete cascade;
ALTER TABLE public.bundle_package_recipes ADD COLUMN IF NOT EXISTS qty_per_bundle numeric not null default 1 check (qty_per_bundle > 0);

-- Tabel: bundle_packages
ALTER TABLE public.bundle_packages ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.bundle_packages ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.bundle_packages ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.bundle_packages ADD COLUMN IF NOT EXISTS package_code text not null;
ALTER TABLE public.bundle_packages ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF';
ALTER TABLE public.bundle_packages ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Tabel: bundle_recipes
ALTER TABLE public.bundle_recipes ADD COLUMN IF NOT EXISTS bundle_finished_good_id bigint not null references public.finished_goods(id) on delete cascade;
ALTER TABLE public.bundle_recipes ADD COLUMN IF NOT EXISTS component_finished_good_id bigint not null references public.finished_goods(id) on delete cascade;
ALTER TABLE public.bundle_recipes ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.bundle_recipes ADD COLUMN IF NOT EXISTS qty_per_bundle numeric not null default 1 check (qty_per_bundle > 0);

-- Tabel: cash_advance_payments
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS advance_id bigint not null references public.cash_advances(id) on delete restrict;
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS amount numeric(18,2) not null check(amount>0);
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS payment_date date not null default current_date;
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.cash_advance_payments ADD COLUMN IF NOT EXISTS source text not null default 'MANUAL';

-- Tabel: cash_advances
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

-- Tabel: cutting_components
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS color text not null default '';
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS component_code text not null default ('CKM-'||lpad(nextval('public.smpt_cut_component_code_seq')::text,6,'0'));
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS legacy_project_level boolean not null default false;
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on update restrict on delete restrict;
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS qty_per_product numeric(18,4) not null check (qty_per_product>0);
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check (status in ('AKTIF','NONAKTIF'));
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS unit text not null;
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.cutting_components ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: cutting_daily_results
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS cancellation_event_id bigint references public.stock_events(id) on delete restrict;
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS cutting_component_id bigint not null references public.cutting_components(id) on delete restrict;
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS good_qty numeric(18,4) not null default 0 check(good_qty>=0);
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS officer text not null;
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on delete restrict;
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS reject_qty numeric(18,4) not null default 0 check(reject_qty>=0);
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS result_code text not null;
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS result_date date not null;
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS stock_event_id bigint references public.stock_events(id) on delete restrict;
ALTER TABLE public.cutting_daily_results ADD COLUMN IF NOT EXISTS unit_snapshot text not null;

-- Tabel: cutting_material_usages
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS bom_requirement_id bigint not null references public.bom_requirements(id) on delete restrict;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS cancellation_event_id bigint references public.stock_events(id) on delete restrict;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS conversion_factor numeric(20,10);
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS input_quantity numeric(18,4);
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS input_unit text;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS material_id bigint not null references public.materials(id) on delete restrict;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS material_lot_id bigint references public.material_lots(id) on update restrict on delete restrict;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS officer text not null;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on delete restrict;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null check(quantity>0);
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS stock_event_id bigint not null references public.stock_events(id) on delete restrict;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS unit_snapshot text not null;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS usage_code text not null;
ALTER TABLE public.cutting_material_usages ADD COLUMN IF NOT EXISTS usage_date date not null;

-- Tabel: embarkation_issues
ALTER TABLE public.embarkation_issues ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.embarkation_issues ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.embarkation_issues ADD COLUMN IF NOT EXISTS description text not null;
ALTER TABLE public.embarkation_issues ADD COLUMN IF NOT EXISTS issue_code text not null default ('EMI-'||lpad(nextval('public.smpt_issue_problem_code_seq')::text,6,'0'));
ALTER TABLE public.embarkation_issues ADD COLUMN IF NOT EXISTS issue_type text not null check(issue_type in ('REJECT','RUSAK','KURANG','LAINNYA'));
ALTER TABLE public.embarkation_issues ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null default 0 check(quantity>=0);
ALTER TABLE public.embarkation_issues ADD COLUMN IF NOT EXISTS resolution text;
ALTER TABLE public.embarkation_issues ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.embarkation_issues ADD COLUMN IF NOT EXISTS shipment_id bigint not null references public.embarkation_shipments(id) on delete restrict;
ALTER TABLE public.embarkation_issues ADD COLUMN IF NOT EXISTS status text not null default 'OPEN' check(status in ('OPEN','SELESAI','DIBATALKAN'));

-- Tabel: embarkation_shipments
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS damaged_qty numeric(18,4) not null default 0 check(damaged_qty>=0);
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS document_no text;
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS driver_name text;
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS missing_qty numeric(18,4) not null default 0 check(missing_qty>=0);
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS public_token uuid not null default gen_random_uuid();
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null check(quantity>0);
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS received_qty numeric(18,4) not null default 0 check(received_qty>=0);
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS reject_qty numeric(18,4) not null default 0 check(reject_qty>=0);
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS return_event_id bigint references public.logistics_stock_events(id) on delete restrict;
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS sent_event_id bigint references public.logistics_stock_events(id) on delete restrict;
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS shipment_code text not null default ('SHP-'||lpad(nextval('public.smpt_shipment_code_seq')::text,6,'0'));
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS shipment_date date not null default current_date;
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS source_location_id bigint not null references public.locations(id) on delete restrict;
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS status text not null default 'DISIAPKAN' check(status in ('DISIAPKAN','DIKIRIM','DITERIMA','DIBATALKAN'));
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS surat_jalan_photo_url text;
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS target_id bigint not null references public.embarkation_targets(id) on delete restrict;
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.embarkation_shipments ADD COLUMN IF NOT EXISTS vehicle_no text;

-- Tabel: embarkation_targets
ALTER TABLE public.embarkation_targets ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.embarkation_targets ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.embarkation_targets ADD COLUMN IF NOT EXISTS embarkation_id bigint not null references public.embarkations(id) on delete restrict;
ALTER TABLE public.embarkation_targets ADD COLUMN IF NOT EXISTS finished_good_id bigint references public.finished_goods(id) on delete restrict;
ALTER TABLE public.embarkation_targets ADD COLUMN IF NOT EXISTS item_kind text not null check(item_kind in ('FINISHED_GOOD','SET'));
ALTER TABLE public.embarkation_targets ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.embarkation_targets ADD COLUMN IF NOT EXISTS set_id bigint references public.product_sets(id) on delete restrict;
ALTER TABLE public.embarkation_targets ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF'));
ALTER TABLE public.embarkation_targets ADD COLUMN IF NOT EXISTS target_code text not null default ('TGT-'||lpad(nextval('public.smpt_target_code_seq')::text,6,'0'));
ALTER TABLE public.embarkation_targets ADD COLUMN IF NOT EXISTS target_qty numeric(18,4) not null check(target_qty>=0);
ALTER TABLE public.embarkation_targets ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Tabel: embarkations
ALTER TABLE public.embarkations ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.embarkations ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.embarkations ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.embarkations ADD COLUMN IF NOT EXISTS embarkation_code text not null default ('EMB-'||lpad(nextval('public.smpt_embarkation_code_seq')::text,5,'0'));
ALTER TABLE public.embarkations ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.embarkations ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.embarkations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.embarkations ADD COLUMN IF NOT EXISTS pic_name text;
ALTER TABLE public.embarkations ADD COLUMN IF NOT EXISTS short_code text;
ALTER TABLE public.embarkations ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF'));
ALTER TABLE public.embarkations ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Tabel: external_finished_receipts
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS document_no text;
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS finished_good_id bigint not null references public.finished_goods(id) on delete restrict;
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS location_id bigint not null references public.locations(id) on delete restrict;
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null check(quantity>0);
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS receipt_code text not null default ('EXT-'||lpad(nextval('public.smpt_external_code_seq')::text,6,'0'));
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS receipt_date date not null default current_date;
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS stock_event_id bigint not null references public.logistics_stock_events(id) on delete restrict;
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS vendor_id bigint references public.vendors(id) on delete restrict;

-- Tabel: finance_transactions
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS amount numeric(18,2) not null check(amount>0);
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS category text not null;
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS description text not null;
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS direction text not null check(direction in ('MASUK','KELUAR'));
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS document_no text;
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS reference_id bigint;
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS reference_type text;
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS transaction_code text not null default ('FIN-'||lpad(nextval('public.smpt_finance_code_seq')::text,7,'0'));
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS transaction_date date not null default current_date;

-- Tabel: finished_goods
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS category text not null;
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS final_work_item_id bigint references public.work_items(id) on delete restrict;
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS finished_good_code text not null default ('BJ-'||lpad(nextval('public.smpt_finished_good_code_seq')::text,6,'0'));
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on delete restrict;
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS source text not null default 'INTERNAL' check(source in ('INTERNAL','LUAR','INTERNAL + LUAR'));
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF'));
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS unit text not null default 'PCS';
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.finished_goods ADD COLUMN IF NOT EXISTS updated_by uuid references auth.users(id) on delete set null default auth.uid();

-- Tabel: finished_goods_bundling
ALTER TABLE public.finished_goods_bundling ADD COLUMN IF NOT EXISTS bundle_finished_good_id bigint not null references public.finished_goods(id);
ALTER TABLE public.finished_goods_bundling ADD COLUMN IF NOT EXISTS bundle_name text not null default 'Bundle Isian Koper Haji';
ALTER TABLE public.finished_goods_bundling ADD COLUMN IF NOT EXISTS bundling_code text not null;
ALTER TABLE public.finished_goods_bundling ADD COLUMN IF NOT EXISTS bundling_date date not null default current_date;
ALTER TABLE public.finished_goods_bundling ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.finished_goods_bundling ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id);
ALTER TABLE public.finished_goods_bundling ADD COLUMN IF NOT EXISTS location_id bigint not null default 1 references public.locations(id);
ALTER TABLE public.finished_goods_bundling ADD COLUMN IF NOT EXISTS notes text;

-- Tabel: finished_goods_bundling_items
ALTER TABLE public.finished_goods_bundling_items ADD COLUMN IF NOT EXISTS bundling_id bigint not null references public.finished_goods_bundling(id) on delete cascade;
ALTER TABLE public.finished_goods_bundling_items ADD COLUMN IF NOT EXISTS component_finished_good_id bigint not null references public.finished_goods(id);
ALTER TABLE public.finished_goods_bundling_items ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.finished_goods_bundling_items ADD COLUMN IF NOT EXISTS qty_per_bundle numeric not null default 1 check (qty_per_bundle > 0);
ALTER TABLE public.finished_goods_bundling_items ADD COLUMN IF NOT EXISTS total_qty numeric not null check (total_qty > 0);

-- Tabel: finished_goods_transfers
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS damaged_qty numeric default 0;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS delivery_status text not null default 'DITERIMA';
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS destination_location_id bigint not null references public.locations(id) on delete restrict;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS document_no text;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS driver_name text;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS finished_good_id bigint not null references public.finished_goods(id) on delete restrict;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null check(quantity>0);
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS received_by uuid;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS received_notes text;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS received_qty numeric;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS reject_qty numeric default 0;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS source_location_id bigint not null references public.locations(id) on delete restrict;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS stock_event_id bigint not null references public.logistics_stock_events(id) on delete restrict;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS surat_jalan_photo_url text;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS transfer_code text not null default ('TRF-'||lpad(nextval('public.smpt_transfer_code_seq')::text,6,'0'));
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS transfer_date date not null default current_date;
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS vehicle_no text;

-- Tabel: locations
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS location_code text not null default ('LOK-'||lpad(nextval('public.smpt_location_code_seq')::text,5,'0'));
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS location_type text not null default 'GUDANG';
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS pic_name text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF'));
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Tabel: logistics_stock_balances
ALTER TABLE public.logistics_stock_balances ADD COLUMN IF NOT EXISTS finished_good_id bigint references public.finished_goods(id) on delete restrict;
ALTER TABLE public.logistics_stock_balances ADD COLUMN IF NOT EXISTS item_kind text not null check(item_kind in ('FINISHED_GOOD','SET'));
ALTER TABLE public.logistics_stock_balances ADD COLUMN IF NOT EXISTS location_id bigint not null references public.locations(id) on delete restrict;
ALTER TABLE public.logistics_stock_balances ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null default 0 check(quantity>=0);
ALTER TABLE public.logistics_stock_balances ADD COLUMN IF NOT EXISTS set_id bigint references public.product_sets(id) on delete restrict;
ALTER TABLE public.logistics_stock_balances ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Tabel: logistics_stock_events
ALTER TABLE public.logistics_stock_events ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.logistics_stock_events ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.logistics_stock_events ADD COLUMN IF NOT EXISTS event_code text not null default ('LSE-'||lpad(nextval('public.smpt_log_stock_event_seq')::text,8,'0'));
ALTER TABLE public.logistics_stock_events ADD COLUMN IF NOT EXISTS event_date date not null default current_date;
ALTER TABLE public.logistics_stock_events ADD COLUMN IF NOT EXISTS event_type text not null;
ALTER TABLE public.logistics_stock_events ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.logistics_stock_events ADD COLUMN IF NOT EXISTS reference_code text;
ALTER TABLE public.logistics_stock_events ADD COLUMN IF NOT EXISTS reference_id bigint;
ALTER TABLE public.logistics_stock_events ADD COLUMN IF NOT EXISTS reference_type text not null;
ALTER TABLE public.logistics_stock_events ADD COLUMN IF NOT EXISTS reversal_of_event_id bigint references public.logistics_stock_events(id) on delete restrict;

-- Tabel: logistics_stock_ledger
ALTER TABLE public.logistics_stock_ledger ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.logistics_stock_ledger ADD COLUMN IF NOT EXISTS event_id bigint not null references public.logistics_stock_events(id) on delete restrict;
ALTER TABLE public.logistics_stock_ledger ADD COLUMN IF NOT EXISTS finished_good_id bigint references public.finished_goods(id) on delete restrict;
ALTER TABLE public.logistics_stock_ledger ADD COLUMN IF NOT EXISTS item_kind text not null check(item_kind in ('FINISHED_GOOD','SET'));
ALTER TABLE public.logistics_stock_ledger ADD COLUMN IF NOT EXISTS location_id bigint not null references public.locations(id) on delete restrict;
ALTER TABLE public.logistics_stock_ledger ADD COLUMN IF NOT EXISTS movement_kind text not null;
ALTER TABLE public.logistics_stock_ledger ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.logistics_stock_ledger ADD COLUMN IF NOT EXISTS quantity_delta numeric(18,4) not null check(quantity_delta<>0);
ALTER TABLE public.logistics_stock_ledger ADD COLUMN IF NOT EXISTS set_id bigint references public.product_sets(id) on delete restrict;
ALTER TABLE public.logistics_stock_ledger ADD COLUMN IF NOT EXISTS unit_snapshot text not null;

-- Tabel: manufacturing_transactions
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS document_no text;
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS finished_good_id bigint references public.finished_goods(id) on delete restrict;
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS flow_type text not null check(flow_type in ('INTERNAL','TITIPAN','BARANG_LUAR','PENGIRIMAN'));
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS logistics_event_id bigint references public.logistics_stock_events(id) on delete restrict;
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS manufacturing_code text not null default ('MFG-'||lpad(nextval('public.smpt_mfg_code_seq')::text,7,'0'));
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS material_id bigint references public.materials(id) on delete restrict;
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS project_id bigint references public.projects(id) on delete restrict;
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null default 0 check(quantity>=0);
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS raw_stock_event_id bigint references public.stock_events(id) on delete restrict;
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS transaction_date date not null default current_date;
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.manufacturing_transactions ADD COLUMN IF NOT EXISTS vendor_id bigint references public.vendors(id) on delete restrict;

-- Tabel: material_lots
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS conversion_factor numeric(20,10) not null check (conversion_factor>0);
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS current_bom_requirement_id bigint references public.bom_requirements(id) on update restrict on delete restrict;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS current_location_id smallint not null references public.stock_locations(id) on update restrict on delete restrict;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS current_product_id bigint;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS current_project_id bigint references public.projects(id) on update restrict on delete restrict;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS lot_code text not null default ('LOT-'||lpad(nextval('public.smpt_material_lot_code_seq')::text,8,'0'));
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS material_id bigint not null references public.materials(id) on update restrict on delete restrict;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS normalized_quantity numeric(18,4) not null check (normalized_quantity>0);
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS normalized_unit text not null;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS original_quantity numeric(18,4) not null check (original_quantity>0);
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS original_unit text not null;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS receipt_id bigint references public.warehouse_receipts(id) on update restrict on delete restrict;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS remaining_normalized_quantity numeric(18,4) not null check (remaining_normalized_quantity>=0);
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS roll_number text not null;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS status text not null default 'AVAILABLE' check (status in ('AVAILABLE','PARTIAL','DEPLETED','QUARANTINE','CLOSED'));
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS supplier_lot_no text;
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.material_lots ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: material_request_items
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS bom_requirement_id bigint references public.bom_requirements(id) on delete restrict;
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS color_snapshot text not null default '';
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS cutting_component_id bigint references public.cutting_components(id) on delete restrict;
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS detail_code text not null;
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS fulfilled_qty numeric(18,4) not null default 0 check (fulfilled_qty>=0 and fulfilled_qty<=requested_qty);
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS item_name_snapshot text not null;
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS material_id bigint references public.materials(id) on delete restrict;
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS request_id bigint not null references public.material_requests(id) on delete restrict;
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS requested_qty numeric(18,4) not null check (requested_qty>0);
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS source_type text not null check (source_type in ('BAHAN BAKU','HASIL CUTTING'));
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check (status in ('AKTIF','DIPENUHI','DIBATALKAN'));
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS unit_snapshot text not null;
ALTER TABLE public.material_request_items ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Tabel: material_requests
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on delete restrict;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS purpose text not null check (purpose in ('CUTTING','SABLON','PRODUKSI'));
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS request_code text not null;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS request_date date not null;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS status text not null default 'DRAFT' check (status in ('DRAFT','MENUNGGU GUDANG','SEBAGIAN','SELESAI','DIBATALKAN'));
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS supervisor_worker_id bigint not null references public.workers(id) on delete restrict;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: material_suppliers
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS conversion_factor numeric(20,10) not null default 1 check(conversion_factor>0);
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS default_purchase_unit text;
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS estimated_lead_time_days integer check(estimated_lead_time_days is null or estimated_lead_time_days>=0);
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS last_price numeric(18,2) check(last_price is null or last_price>=0);
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS material_id bigint not null references public.materials(id) on update restrict on delete restrict;
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS moq numeric(18,4) check(moq is null or moq>=0);
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS preferred boolean not null default false;
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF'));
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS supplier_id bigint not null references public.vendors(id) on update restrict on delete restrict;
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS supplier_material_code text;
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS supplier_material_name text;
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS supplier_unit text;
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.material_suppliers ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: materials
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS calculation_type text;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS category text not null;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS lot_tracking_mode text not null default 'NONE' check (lot_tracking_mode in ('NONE','LOT','ROLL'));
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS material_code text not null default ( 'BHN-' || lpad(nextval('public.smpt_material_code_seq')::text, 4, '0') );
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS standard_unit text not null;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF';
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: operator_payroll_items
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

-- Tabel: operator_payroll_runs
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS payroll_code text not null default ('OPR-'||lpad(nextval('public.smpt_operator_payroll_seq')::text,6,'0'));
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS period_end date not null;
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS period_start date not null;
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS status text not null default 'FINAL' check(status in ('FINAL','DIBATALKAN'));
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS total_operator_value numeric(18,2) not null default 0;
ALTER TABLE public.operator_payroll_runs ADD COLUMN IF NOT EXISTS total_submission_value numeric(18,2) not null default 0;

-- Tabel: packing_runs
ALTER TABLE public.packing_runs ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.packing_runs ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.packing_runs ADD COLUMN IF NOT EXISTS location_id bigint not null references public.locations(id) on delete restrict;
ALTER TABLE public.packing_runs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.packing_runs ADD COLUMN IF NOT EXISTS packing_code text not null default ('PCK-'||lpad(nextval('public.smpt_pack_code_seq')::text,6,'0'));
ALTER TABLE public.packing_runs ADD COLUMN IF NOT EXISTS packing_date date not null default current_date;
ALTER TABLE public.packing_runs ADD COLUMN IF NOT EXISTS set_id bigint not null references public.product_sets(id) on delete restrict;
ALTER TABLE public.packing_runs ADD COLUMN IF NOT EXISTS set_qty numeric(18,4) not null check(set_qty>0);
ALTER TABLE public.packing_runs ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.packing_runs ADD COLUMN IF NOT EXISTS stock_event_id bigint not null references public.logistics_stock_events(id) on delete restrict;

-- Tabel: payroll_attendance_reviews
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

-- Tabel: payroll_payout_adjustments
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS actual_amount numeric(18,2) not null;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS adjustment_amount numeric(18,2) not null;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS provisional_amount numeric(18,2) not null;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS source_friday date not null;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS source_payout_detail_id bigint not null references public.payroll_payout_details(id) on delete restrict;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS target_payout_id bigint not null references public.payroll_payouts(id) on delete restrict;
ALTER TABLE public.payroll_payout_adjustments ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;

-- Tabel: payroll_payout_deductions
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS amount numeric(18,2) not null check(amount>0);
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS cash_advance_id bigint not null references public.cash_advances(id) on delete restrict;
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS cash_advance_payment_id bigint references public.cash_advance_payments(id) on delete restrict;
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS payout_id bigint not null references public.payroll_payouts(id) on delete restrict;
ALTER TABLE public.payroll_payout_deductions ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;

-- Tabel: payroll_payout_details
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

-- Tabel: payroll_payouts
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

-- Tabel: payroll_run_details
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

-- Tabel: payroll_run_items
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

-- Tabel: payroll_runs
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

-- Tabel: payroll_settings
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS updated_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS value_numeric numeric(18,4);
ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS value_text text;

-- Tabel: permissions
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS code text not null;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS description text;

-- Tabel: petty_cash_transactions
ALTER TABLE public.petty_cash_transactions ADD COLUMN IF NOT EXISTS amount numeric(18,2) not null check(amount>0);
ALTER TABLE public.petty_cash_transactions ADD COLUMN IF NOT EXISTS category text not null;
ALTER TABLE public.petty_cash_transactions ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.petty_cash_transactions ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.petty_cash_transactions ADD COLUMN IF NOT EXISTS description text not null;
ALTER TABLE public.petty_cash_transactions ADD COLUMN IF NOT EXISTS direction text not null check(direction in ('MASUK','KELUAR'));
ALTER TABLE public.petty_cash_transactions ADD COLUMN IF NOT EXISTS document_no text;
ALTER TABLE public.petty_cash_transactions ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.petty_cash_transactions ADD COLUMN IF NOT EXISTS transaction_code text not null default ('KK-'||lpad(nextval('public.smpt_petty_code_seq')::text,7,'0'));
ALTER TABLE public.petty_cash_transactions ADD COLUMN IF NOT EXISTS transaction_date date not null default current_date;

-- Tabel: product_set_components
ALTER TABLE public.product_set_components ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.product_set_components ADD COLUMN IF NOT EXISTS finished_good_id bigint not null references public.finished_goods(id) on delete restrict;
ALTER TABLE public.product_set_components ADD COLUMN IF NOT EXISTS qty_per_set numeric(18,4) not null check(qty_per_set>0);
ALTER TABLE public.product_set_components ADD COLUMN IF NOT EXISTS set_id bigint not null references public.product_sets(id) on delete restrict;

-- Tabel: product_sets
ALTER TABLE public.product_sets ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.product_sets ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.product_sets ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.product_sets ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.product_sets ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on delete restrict;
ALTER TABLE public.product_sets ADD COLUMN IF NOT EXISTS set_code text not null default ('SET-'||lpad(nextval('public.smpt_set_code_seq')::text,5,'0'));
ALTER TABLE public.product_sets ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF'));
ALTER TABLE public.product_sets ADD COLUMN IF NOT EXISTS unit text not null default 'SET';
ALTER TABLE public.product_sets ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Tabel: production_anomalies
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS acknowledged_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS anomaly_code text not null default ('ANM-'||lpad(nextval('public.smpt_production_anomaly_code_seq')::text,7,'0'));
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS anomaly_type text not null;
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS attempted_equivalent numeric(18,4);
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS available_equivalent numeric(18,4);
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS dependency_id bigint references public.work_item_dependencies(id) on update restrict on delete restrict;
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS details jsonb not null default '{}'::jsonb;
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS detected_at timestamptz not null default now();
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS excess_equivalent numeric(18,4);
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS product_id bigint references public.project_products(id) on update restrict on delete restrict;
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS production_check_id bigint references public.production_checks(id) on update restrict on delete restrict;
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS project_id bigint references public.projects(id) on update restrict on delete restrict;
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS resolved_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS severity text not null default 'WARNING' check (severity in ('WARNING','HARD'));
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS source_kind text not null default 'RUNTIME';
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED'));
ALTER TABLE public.production_anomalies ADD COLUMN IF NOT EXISTS work_item_id bigint references public.work_items(id) on update restrict on delete restrict;

-- Tabel: production_checks
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS cancelled_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS good_qty numeric(18,4) not null default 0 check(good_qty>=0);
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS order_item_id bigint not null references public.production_order_items(id) on delete restrict;
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS reject_qty numeric(18,4) not null default 0 check(reject_qty>=0);
ALTER TABLE public.production_checks ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));

-- Tabel: production_manual_results
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

-- Tabel: production_order_items
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

-- Tabel: production_orders
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

-- Tabel: production_wip_consumptions
ALTER TABLE public.production_wip_consumptions ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.production_wip_consumptions ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.production_wip_consumptions ADD COLUMN IF NOT EXISTS dependency_id bigint not null references public.work_item_dependencies(id) on update restrict on delete restrict;
ALTER TABLE public.production_wip_consumptions ADD COLUMN IF NOT EXISTS equivalent_quantity numeric(18,4) not null check (equivalent_quantity > 0);
ALTER TABLE public.production_wip_consumptions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.production_wip_consumptions ADD COLUMN IF NOT EXISTS predecessor_work_item_id bigint not null references public.work_items(id) on update restrict on delete restrict;
ALTER TABLE public.production_wip_consumptions ADD COLUMN IF NOT EXISTS production_check_id bigint not null references public.production_checks(id) on update restrict on delete restrict;
ALTER TABLE public.production_wip_consumptions ADD COLUMN IF NOT EXISTS reversal_of_id bigint references public.production_wip_consumptions(id) on update restrict on delete restrict;
ALTER TABLE public.production_wip_consumptions ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
ALTER TABLE public.production_wip_consumptions ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check (status in ('AKTIF','DIBALIK'));
ALTER TABLE public.production_wip_consumptions ADD COLUMN IF NOT EXISTS successor_work_item_id bigint not null references public.work_items(id) on update restrict on delete restrict;

-- Tabel: profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean not null default true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS legacy_username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_id bigint not null references public.roles(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Tabel: project_products
ALTER TABLE public.project_products ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.project_products ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.project_products ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.project_products ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.project_products ADD COLUMN IF NOT EXISTS product_code text not null default ( 'PRDK-' || lpad(nextval('public.smpt_product_code_seq')::text, 6, '0') );
ALTER TABLE public.project_products ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on update restrict on delete restrict;
ALTER TABLE public.project_products ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF';
ALTER TABLE public.project_products ADD COLUMN IF NOT EXISTS target_production numeric(18,4) not null;
ALTER TABLE public.project_products ADD COLUMN IF NOT EXISTS unit text not null default 'pcs';
ALTER TABLE public.project_products ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.project_products ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract_value numeric(18,2) not null default 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS legacy_target_production numeric(18,4) not null default 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS product_category text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_code text not null;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS repeat_order_note text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS repeat_source_project_id bigint;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status text not null default 'Pending';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: purchase_order_lines
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS conversion_factor numeric(20,10) not null default 1 check(conversion_factor>0);
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS material_id bigint not null references public.materials(id) on update restrict on delete restrict;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS ordered_quantity numeric(18,4) not null check(ordered_quantity>0);
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS ordered_stock_quantity numeric(18,4) not null check(ordered_stock_quantity>0);
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS purchase_order_id bigint not null references public.purchase_orders(id) on update restrict on delete restrict;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS purchase_plan_line_id bigint references public.purchase_plan_lines(id) on update restrict on delete restrict;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS purchase_unit text not null;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS received_stock_quantity numeric(18,4) not null default 0 check(received_stock_quantity>=0);
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS status text not null default 'OPEN' check(status in ('OPEN','PARTIAL','RECEIVED','CANCELLED'));
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS stock_unit text not null;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS supplier_material_code text;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS unit_price numeric(18,2) not null default 0 check(unit_price>=0);
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: purchase_orders
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS cancelled_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS currency text not null default 'IDR';
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS expected_date date;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS issued_at timestamptz;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS issued_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS order_date date not null default current_date;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS po_number text not null;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS purchase_plan_id bigint references public.purchase_plans(id) on update restrict on delete restrict;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS status text not null default 'DRAFT' check(status in ('DRAFT','ISSUED','PARTIAL','RECEIVED','CANCELLED'));
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS supplier_id bigint not null references public.vendors(id) on update restrict on delete restrict;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: purchase_plan_lines
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS confirmed_incoming numeric(18,4) not null default 0 check(confirmed_incoming>=0);
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS final_requirement numeric(18,4) not null check(final_requirement>=0);
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS material_id bigint not null references public.materials(id) on update restrict on delete restrict;
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS net_procurement_need numeric(18,4) not null default 0 check(net_procurement_need>=0);
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS open_po_quantity numeric(18,4) not null default 0 check(open_po_quantity>=0);
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS planned_quantity numeric(18,4) not null default 0 check(planned_quantity>=0);
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS purchase_plan_id bigint not null references public.purchase_plans(id) on update restrict on delete restrict;
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS source_requirement_count integer not null default 0 check(source_requirement_count>=0);
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS supplier_id bigint references public.vendors(id) on update restrict on delete restrict;
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS unit_price numeric(18,2) check(unit_price is null or unit_price>=0);
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS unit_snapshot text not null;
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.purchase_plan_lines ADD COLUMN IF NOT EXISTS usable_stock numeric(18,4) not null default 0 check(usable_stock>=0);

-- Tabel: purchase_plans
ALTER TABLE public.purchase_plans ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.purchase_plans ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.purchase_plans ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.purchase_plans ADD COLUMN IF NOT EXISTS plan_code text not null default ('PPLAN-'||lpad(nextval('public.smpt_purchase_plan_code_seq')::text,7,'0'));
ALTER TABLE public.purchase_plans ADD COLUMN IF NOT EXISTS plan_date date not null default current_date;
ALTER TABLE public.purchase_plans ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.purchase_plans ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on update restrict on delete restrict;
ALTER TABLE public.purchase_plans ADD COLUMN IF NOT EXISTS status text not null default 'DRAFT' check(status in ('DRAFT','CONVERTED','CANCELLED'));
ALTER TABLE public.purchase_plans ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.purchase_plans ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: qc_inspections
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS finished_good_id bigint not null references public.finished_goods(id) on delete restrict;
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS good_qty numeric(18,4) not null check(good_qty>=0);
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS inspected_qty numeric(18,4) not null check(inspected_qty>0);
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS inspection_date date not null default current_date;
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS production_check_id bigint not null references public.production_checks(id) on delete restrict;
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS qc_code text not null default ('QC-'||lpad(nextval('public.smpt_qc_code_seq')::text,7,'0'));
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS reject_qty numeric(18,4) not null check(reject_qty>=0);
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS rework_qty numeric(18,4) not null check(rework_qty>=0);
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.qc_inspections ADD COLUMN IF NOT EXISTS stock_event_id bigint not null references public.logistics_stock_events(id) on delete restrict;

-- Tabel: qc_reworks
ALTER TABLE public.qc_reworks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.qc_reworks ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.qc_reworks ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.qc_reworks ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.qc_reworks ADD COLUMN IF NOT EXISTS qc_inspection_id bigint not null references public.qc_inspections(id) on delete restrict;
ALTER TABLE public.qc_reworks ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null check(quantity>0);
ALTER TABLE public.qc_reworks ADD COLUMN IF NOT EXISTS result_good_qty numeric(18,4) not null default 0 check(result_good_qty>=0);
ALTER TABLE public.qc_reworks ADD COLUMN IF NOT EXISTS result_reject_qty numeric(18,4) not null default 0 check(result_reject_qty>=0);
ALTER TABLE public.qc_reworks ADD COLUMN IF NOT EXISTS rework_code text not null default ('RWK-'||lpad(nextval('public.smpt_rework_code_seq')::text,6,'0'));
ALTER TABLE public.qc_reworks ADD COLUMN IF NOT EXISTS status text not null default 'OPEN' check(status in ('OPEN','SELESAI','DIBATALKAN'));
ALTER TABLE public.qc_reworks ADD COLUMN IF NOT EXISTS stock_event_id bigint references public.logistics_stock_events(id) on delete restrict;

-- Tabel: ready_production_usage_lots
ALTER TABLE public.ready_production_usage_lots ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.ready_production_usage_lots ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.ready_production_usage_lots ADD COLUMN IF NOT EXISTS material_lot_id bigint not null references public.material_lots(id) on update restrict on delete restrict;
ALTER TABLE public.ready_production_usage_lots ADD COLUMN IF NOT EXISTS normalized_unit text not null;
ALTER TABLE public.ready_production_usage_lots ADD COLUMN IF NOT EXISTS quantity_normalized numeric(18,4) not null check (quantity_normalized>0);
ALTER TABLE public.ready_production_usage_lots ADD COLUMN IF NOT EXISTS usage_id bigint not null references public.ready_production_usages(id) on update restrict on delete restrict;

-- Tabel: ready_production_usages
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS bom_requirement_id bigint references public.bom_requirements(id) on delete restrict;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS cancellation_event_id bigint references public.stock_events(id) on update restrict on delete restrict;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS cancelled_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS conversion_factor numeric(20,10);
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS cutting_component_id bigint references public.cutting_components(id) on delete restrict;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS input_quantity numeric(18,4);
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS input_unit text;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS item_kind text not null check(item_kind in ('MATERIAL','CUTTING_COMPONENT'));
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS material_id bigint references public.materials(id) on delete restrict;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS material_lot_id bigint references public.material_lots(id) on update restrict on delete restrict;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS officer text not null;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS process_code text not null default 'PRODUKSI';
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on delete restrict;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null check(quantity>0);
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS stock_event_id bigint not null references public.stock_events(id) on delete restrict;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS unit_snapshot text not null;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS usage_code text not null;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS usage_date date not null;
ALTER TABLE public.ready_production_usages ADD COLUMN IF NOT EXISTS work_item_id bigint references public.work_items(id) on update restrict on delete restrict;

-- Tabel: role_permissions
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();

-- Tabel: roles
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS code text not null;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS is_active boolean not null default true;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS name text not null;

-- Tabel: salary_submissions
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS paid_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS payout_id bigint not null references public.payroll_payouts(id) on delete restrict;
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS snapshot_hash text not null;
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS status text not null default 'SIAP_DIAJUKAN' check(status in ('SIAP_DIAJUKAN','DIBAYAR','DIBATALKAN'));
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS submission_code text not null default ('PGJ-'||lpad(nextval('public.smpt_salary_submission_seq')::text,7,'0'));
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS total_deduction numeric(18,2) not null default 0;
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS total_gross numeric(18,2) not null default 0;
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS total_net numeric(18,2) not null default 0;
ALTER TABLE public.salary_submissions ADD COLUMN IF NOT EXISTS total_workers integer not null default 0;

-- Tabel: smpt_keepalive_log
ALTER TABLE public.smpt_keepalive_log ADD COLUMN IF NOT EXISTS all_ok BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.smpt_keepalive_log ADD COLUMN IF NOT EXISTS auth_ok BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.smpt_keepalive_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.smpt_keepalive_log ADD COLUMN IF NOT EXISTS db_ok BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.smpt_keepalive_log ADD COLUMN IF NOT EXISTS meta JSONB;
ALTER TABLE public.smpt_keepalive_log ADD COLUMN IF NOT EXISTS pinged_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Tabel: stock_balances
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS bom_requirement_id bigint references public.bom_requirements(id) on delete restrict;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS cutting_component_id bigint references public.cutting_components(id) on delete restrict;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS item_kind text not null check (item_kind in ('MATERIAL','CUTTING_COMPONENT'));
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS location_id smallint not null references public.stock_locations(id) on delete restrict;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS material_id bigint references public.materials(id) on delete restrict;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS project_id bigint references public.projects(id) on delete restrict;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null default 0 check (quantity>=0);
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();

-- Tabel: stock_events
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS event_code text not null default ('STX-'||lpad(nextval('public.smpt_stock_event_code_seq')::text,9,'0'));
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS event_date date not null;
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS event_type text not null;
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS project_id bigint references public.projects(id) on delete restrict;
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS reference_code text;
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS reference_type text;
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS reversal_of_event_id bigint references public.stock_events(id) on delete restrict;
ALTER TABLE public.stock_events ADD COLUMN IF NOT EXISTS work_item_id bigint references public.work_items(id) on update restrict on delete restrict;

-- Tabel: stock_ledger_entries
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS bom_requirement_id bigint references public.bom_requirements(id) on delete restrict;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS cutting_component_id bigint references public.cutting_components(id) on delete restrict;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS event_id bigint not null references public.stock_events(id) on delete restrict;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS item_kind text not null check (item_kind in ('MATERIAL','CUTTING_COMPONENT'));
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS location_id smallint not null references public.stock_locations(id) on delete restrict;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS material_id bigint references public.materials(id) on delete restrict;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS material_lot_id bigint references public.material_lots(id) on update restrict on delete restrict;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS movement_kind text not null;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS original_quantity_delta numeric(18,4);
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS original_unit_snapshot text;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS project_id bigint references public.projects(id) on delete restrict;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS quantity_delta numeric(18,4) not null check (quantity_delta<>0);
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS unit_snapshot text not null;
ALTER TABLE public.stock_ledger_entries ADD COLUMN IF NOT EXISTS work_item_id bigint references public.work_items(id) on update restrict on delete restrict;

-- Tabel: stock_locations
ALTER TABLE public.stock_locations ADD COLUMN IF NOT EXISTS code text not null;
ALTER TABLE public.stock_locations ADD COLUMN IF NOT EXISTS is_active boolean not null default true;
ALTER TABLE public.stock_locations ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.stock_locations ADD COLUMN IF NOT EXISTS physical_group text not null;

-- Tabel: system_data_backups
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS backup_code text not null;
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS byte_size bigint not null default 0;
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS last_restored_at timestamptz;
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS last_restored_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS schema_fingerprint text not null;
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS scope text not null default 'BUSINESS_DATA' check(scope in ('BUSINESS_DATA'));
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS snapshot jsonb not null;
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS status text not null default 'READY' check(status in ('READY','RESTORED','INVALID'));
ALTER TABLE public.system_data_backups ADD COLUMN IF NOT EXISTS table_counts jsonb not null default '{}'::jsonb;

-- Tabel: system_test_run_entities
ALTER TABLE public.system_test_run_entities ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.system_test_run_entities ADD COLUMN IF NOT EXISTS row_id bigint not null;
ALTER TABLE public.system_test_run_entities ADD COLUMN IF NOT EXISTS run_id bigint not null references public.system_test_runs(id) on delete cascade;
ALTER TABLE public.system_test_run_entities ADD COLUMN IF NOT EXISTS table_name text not null;

-- Tabel: system_test_runs
ALTER TABLE public.system_test_runs ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.system_test_runs ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.system_test_runs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE public.system_test_runs ADD COLUMN IF NOT EXISTS result jsonb not null default '{}'::jsonb;
ALTER TABLE public.system_test_runs ADD COLUMN IF NOT EXISTS run_code text not null;
ALTER TABLE public.system_test_runs ADD COLUMN IF NOT EXISTS run_type text not null check(run_type in ('DIAGNOSTIC','DUMMY_FULL','BACKUP','RESTORE','RESET'));
ALTER TABLE public.system_test_runs ADD COLUMN IF NOT EXISTS started_at timestamptz not null default now();
ALTER TABLE public.system_test_runs ADD COLUMN IF NOT EXISTS status text not null check(status in ('RUNNING','PASS','WARN','FAIL'));

-- Tabel: user_permission_overrides
ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS effect text not null;
ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS is_active boolean not null default true;
ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS permission_pattern text not null;
ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS updated_by uuid references auth.users(id) on delete set null;
ALTER TABLE public.user_permission_overrides ADD COLUMN IF NOT EXISTS user_id uuid not null references public.profiles(id) on delete cascade;

-- Tabel: user_worker_links
ALTER TABLE public.user_worker_links ADD COLUMN IF NOT EXISTS active boolean not null default true;
ALTER TABLE public.user_worker_links ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.user_worker_links ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.user_worker_links ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.user_worker_links ADD COLUMN IF NOT EXISTS worker_id bigint not null references public.workers(id) on delete restrict;

-- Tabel: vendor_delivery_logs
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS cash_paid numeric default 0;
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS category text default 'UMUM';
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS delivery_date date not null default current_date;
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS dp_cut numeric default 0;
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS item_description text default 'Kiriman Barang';
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS log_code text not null;
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS qty_18 numeric default 0;
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS qty_26 numeric default 0;
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS total_bill numeric default 0;
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS total_qty numeric default 0;
ALTER TABLE public.vendor_delivery_logs ADD COLUMN IF NOT EXISTS vendor_id bigint not null references public.vendors(id) on delete cascade;

-- Tabel: vendor_down_payments
ALTER TABLE public.vendor_down_payments ADD COLUMN IF NOT EXISTS amount numeric not null default 0;
ALTER TABLE public.vendor_down_payments ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.vendor_down_payments ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.vendor_down_payments ADD COLUMN IF NOT EXISTS payment_date date not null default current_date;
ALTER TABLE public.vendor_down_payments ADD COLUMN IF NOT EXISTS vendor_id bigint not null references public.vendors(id) on delete cascade;

-- Tabel: vendor_po_targets
ALTER TABLE public.vendor_po_targets ADD COLUMN IF NOT EXISTS category text not null default '-';
ALTER TABLE public.vendor_po_targets ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.vendor_po_targets ADD COLUMN IF NOT EXISTS item_name text not null;
ALTER TABLE public.vendor_po_targets ADD COLUMN IF NOT EXISTS price_per_unit numeric not null default 0;
ALTER TABLE public.vendor_po_targets ADD COLUMN IF NOT EXISTS size text default '-';
ALTER TABLE public.vendor_po_targets ADD COLUMN IF NOT EXISTS target_po numeric not null default 0;
ALTER TABLE public.vendor_po_targets ADD COLUMN IF NOT EXISTS vendor_id bigint not null references public.vendors(id) on delete cascade;

-- Tabel: vendors
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS bank_account_name text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS bank_account_no text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS created_by uuid references auth.users(id) on delete set null default auth.uid();
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS default_currency text not null default 'IDR';
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS internal_notes text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS lead_time_days integer;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS name text not null;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS pic_name text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS rating numeric(5,2);
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check(status in ('AKTIF','NONAKTIF'));
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS tax_no text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS vendor_code text not null default ('VND-'||lpad(nextval('public.smpt_vendor_code_seq')::text,5,'0'));
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS whatsapp text;

-- Tabel: warehouse_issue_lots
ALTER TABLE public.warehouse_issue_lots ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.warehouse_issue_lots ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.warehouse_issue_lots ADD COLUMN IF NOT EXISTS issue_id bigint not null references public.warehouse_issues(id) on update restrict on delete restrict;
ALTER TABLE public.warehouse_issue_lots ADD COLUMN IF NOT EXISTS material_lot_id bigint not null references public.material_lots(id) on update restrict on delete restrict;
ALTER TABLE public.warehouse_issue_lots ADD COLUMN IF NOT EXISTS normalized_unit text not null;
ALTER TABLE public.warehouse_issue_lots ADD COLUMN IF NOT EXISTS quantity_normalized numeric(18,4) not null check (quantity_normalized>0);
ALTER TABLE public.warehouse_issue_lots ADD COLUMN IF NOT EXISTS source_original_quantity numeric(18,4);
ALTER TABLE public.warehouse_issue_lots ADD COLUMN IF NOT EXISTS source_original_unit text;

-- Tabel: warehouse_issues
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS bom_requirement_id bigint references public.bom_requirements(id) on delete restrict;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS color_snapshot text not null default '';
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS conversion_factor numeric(20,10);
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS cutting_component_id bigint references public.cutting_components(id) on delete restrict;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS input_quantity numeric(18,4);
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS input_unit text;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS issue_code text not null;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS issue_date date not null;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS item_name_snapshot text not null;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS material_id bigint references public.materials(id) on delete restrict;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS product_id bigint;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS project_id bigint not null references public.projects(id) on delete restrict;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS purpose text not null check (purpose in ('CUTTING','SABLON','PRODUKSI'));
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null check (quantity>0);
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS recipient_name text not null;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS recipient_worker_id bigint references public.workers(id) on delete restrict;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS request_id bigint references public.material_requests(id) on delete restrict;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS request_item_id bigint references public.material_request_items(id) on delete restrict;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS source text not null check (source in ('PERMINTAAN','LANGSUNG'));
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS source_type text not null check (source_type in ('BAHAN BAKU','HASIL CUTTING'));
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS stock_event_id bigint not null references public.stock_events(id) on delete restrict;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS supervisor_worker_id bigint references public.workers(id) on delete restrict;
ALTER TABLE public.warehouse_issues ADD COLUMN IF NOT EXISTS unit_snapshot text not null;

-- Tabel: warehouse_receipts
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS base_event_id bigint not null references public.stock_events(id) on delete restrict;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS cancellation_event_id bigint references public.stock_events(id) on delete restrict;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS conversion_factor numeric(20,10);
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS created_at timestamptz not null default now();
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS created_by uuid default auth.uid() references auth.users(id) on delete set null;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS document_no text;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS input_quantity numeric(18,4);
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS input_unit text;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS material_id bigint not null references public.materials(id) on delete restrict;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS purchase_order_id bigint references public.purchase_orders(id) on update restrict on delete restrict;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS purchase_order_line_id bigint references public.purchase_order_lines(id) on update restrict on delete restrict;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS quantity numeric(18,4) not null check (quantity>0);
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS receipt_code text not null;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS receipt_date date not null;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS receipt_source text not null default 'NON_PO';
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS status text not null default 'AKTIF' check (status in ('AKTIF','DIBATALKAN'));
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS supplier text;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS supplier_id bigint references public.vendors(id) on update restrict on delete restrict;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS unit_snapshot text not null;
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.warehouse_receipts ADD COLUMN IF NOT EXISTS updated_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Tabel: work_item_dependencies
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

-- Tabel: work_items
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

-- Tabel: workers
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
-- BAGIAN 4: INDEX PENDUKUNG PERFORMA & INTEGRITAS (CREATE INDEX IF NOT EXISTS)
-- ============================================================================
CREATE INDEX IF NOT EXISTS profiles_role_id_idx ON public.profiles (role_id);
CREATE INDEX IF NOT EXISTS user_permission_overrides_lookup_idx ON public.user_permission_overrides (user_id, is_active, permission_pattern);
CREATE INDEX IF NOT EXISTS projects_status_idx ON public.projects (status);
CREATE INDEX IF NOT EXISTS project_products_project_status_idx ON public.project_products (project_id, status);
CREATE INDEX IF NOT EXISTS materials_category_status_idx ON public.materials (category, status);
CREATE INDEX IF NOT EXISTS work_items_product_status_idx ON public.work_items (project_id, product_id, status);
CREATE INDEX IF NOT EXISTS bom_requirements_project_product_status_idx ON public.bom_requirements (project_id, product_id, status);
CREATE INDEX IF NOT EXISTS bom_requirements_material_idx ON public.bom_requirements (material_id) where material_id is not null;
CREATE INDEX IF NOT EXISTS workers_active_department_idx ON public.workers (status,department,position);
CREATE INDEX IF NOT EXISTS cutting_components_scope_idx ON public.cutting_components (project_id,product_id,status);
CREATE INDEX IF NOT EXISTS stock_events_date_idx ON public.stock_events (event_date desc,id desc);
CREATE INDEX IF NOT EXISTS stock_events_reference_idx ON public.stock_events (reference_type,reference_code);
CREATE INDEX IF NOT EXISTS stock_balances_location_idx ON public.stock_balances (location_id,item_kind);
CREATE INDEX IF NOT EXISTS stock_balances_project_idx ON public.stock_balances (project_id,product_id,location_id);
CREATE INDEX IF NOT EXISTS stock_ledger_event_idx ON public.stock_ledger_entries (event_id);
CREATE INDEX IF NOT EXISTS stock_ledger_item_idx ON public.stock_ledger_entries (location_id,item_kind,created_at desc);
CREATE INDEX IF NOT EXISTS stock_ledger_project_idx ON public.stock_ledger_entries (project_id,product_id,created_at desc);
CREATE INDEX IF NOT EXISTS warehouse_receipts_date_idx ON public.warehouse_receipts (receipt_date desc,id desc);
CREATE INDEX IF NOT EXISTS material_requests_status_idx ON public.material_requests (status,request_date desc,id desc);
CREATE INDEX IF NOT EXISTS material_request_items_request_idx ON public.material_request_items (request_id,status);
CREATE INDEX IF NOT EXISTS warehouse_issues_date_idx ON public.warehouse_issues (issue_date desc,id desc);
CREATE INDEX IF NOT EXISTS cutting_usage_date_idx ON public.cutting_material_usages (project_id,usage_date desc,id desc);
CREATE INDEX IF NOT EXISTS cutting_result_date_idx ON public.cutting_daily_results (project_id,product_id,result_date desc,id desc);
CREATE INDEX IF NOT EXISTS ready_usage_date_idx ON public.ready_production_usages (project_id,product_id,usage_date desc,id desc);
CREATE INDEX IF NOT EXISTS production_orders_status_idx ON public.production_orders (status,order_date desc,id desc);
CREATE INDEX IF NOT EXISTS production_orders_operator_idx ON public.production_orders (operator_worker_id,status,order_date desc);
CREATE INDEX IF NOT EXISTS production_order_items_work_idx ON public.production_order_items (work_item_id,status);
CREATE INDEX IF NOT EXISTS production_checks_item_idx ON public.production_checks (order_item_id,status,check_date desc,id desc);
CREATE INDEX IF NOT EXISTS production_checks_checker_idx ON public.production_checks (checker_user_id,check_date desc);
CREATE UNIQUE INDEX IF NOT EXISTS finished_goods_final_item_uq ON public.finished_goods (final_work_item_id) where final_work_item_id is not null and status='AKTIF';
CREATE INDEX IF NOT EXISTS logistics_stock_ledger_item_idx ON public.logistics_stock_ledger (item_kind,finished_good_id,set_id,location_id,created_at desc,id desc);
CREATE INDEX IF NOT EXISTS qc_inspections_check_idx ON public.qc_inspections (production_check_id,status,inspection_date desc);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON public.attendance_records (attendance_date desc,worker_id);
CREATE INDEX IF NOT EXISTS audit_events_table_idx ON public.audit_events (table_name,occurred_at desc,id desc);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON public.audit_events (actor_user_id,occurred_at desc);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_period_uq ON public.payroll_runs (payroll_type,period_start,period_end) where status<>'DIBATALKAN';
CREATE UNIQUE INDEX IF NOT EXISTS operator_payroll_runs_period_uq ON public.operator_payroll_runs (period_start,period_end) where status<>'DIBATALKAN';
CREATE INDEX IF NOT EXISTS production_checks_date_idx ON public.production_checks (check_date desc,status,order_item_id);
CREATE INDEX IF NOT EXISTS qc_date_idx ON public.qc_inspections (inspection_date desc,status,finished_good_id);
CREATE INDEX IF NOT EXISTS finished_balances_loc_idx ON public.logistics_stock_balances (location_id,item_kind,quantity desc);
CREATE INDEX IF NOT EXISTS shipment_status_idx ON public.embarkation_shipments (status,shipment_date desc,id desc);
CREATE INDEX IF NOT EXISTS attendance_worker_period_idx ON public.attendance_records (worker_id,attendance_date desc,verification_status);
CREATE INDEX IF NOT EXISTS cash_advance_worker_idx ON public.cash_advances (worker_id,status,advance_date desc);
CREATE INDEX IF NOT EXISTS petty_date_idx ON public.petty_cash_transactions (transaction_date desc,status,id desc);
CREATE INDEX IF NOT EXISTS finance_date_idx ON public.finance_transactions (transaction_date desc,status,id desc);
CREATE INDEX IF NOT EXISTS mfg_date_idx ON public.manufacturing_transactions (transaction_date desc,flow_type,status,id desc);
CREATE INDEX IF NOT EXISTS attendance_import_rows_worker_date_idx ON public.attendance_import_rows (worker_id,attendance_date desc,id desc);
CREATE INDEX IF NOT EXISTS attendance_import_rows_batch_idx ON public.attendance_import_rows (batch_id,id);
CREATE INDEX IF NOT EXISTS work_items_product_route_idx ON public.work_items (product_id, display_order, id) where product_id is not null;
CREATE INDEX IF NOT EXISTS work_item_dependencies_successor_idx ON public.work_item_dependencies (product_id, successor_work_item_id, status, id);
CREATE INDEX IF NOT EXISTS work_item_dependencies_predecessor_idx ON public.work_item_dependencies (product_id, predecessor_work_item_id, status, id);
CREATE INDEX IF NOT EXISTS production_wip_pred_idx ON public.production_wip_consumptions (predecessor_work_item_id, status, created_at desc, id desc);
CREATE INDEX IF NOT EXISTS production_wip_succ_idx ON public.production_wip_consumptions (successor_work_item_id, status, created_at desc, id desc);
CREATE INDEX IF NOT EXISTS production_wip_check_idx ON public.production_wip_consumptions (production_check_id, status, id);
CREATE INDEX IF NOT EXISTS production_anomalies_open_idx ON public.production_anomalies (status, severity, detected_at desc, id desc);
CREATE INDEX IF NOT EXISTS production_anomalies_scope_idx ON public.production_anomalies (project_id, product_id, work_item_id, detected_at desc, id desc);
CREATE INDEX IF NOT EXISTS material_lots_available_idx ON public.material_lots (material_id,current_location_id,status,remaining_normalized_quantity desc,id);
CREATE INDEX IF NOT EXISTS material_lots_receipt_idx ON public.material_lots (receipt_id,id);
CREATE INDEX IF NOT EXISTS stock_ledger_material_lot_idx ON public.stock_ledger_entries (material_lot_id,created_at desc,id desc) where material_lot_id is not null;
CREATE INDEX IF NOT EXISTS stock_ledger_work_item_idx ON public.stock_ledger_entries (work_item_id,created_at desc,id desc) where work_item_id is not null;
CREATE INDEX IF NOT EXISTS ready_usage_scope_work_item_idx ON public.ready_production_usages (project_id,product_id,work_item_id,usage_date desc,id desc);
CREATE INDEX IF NOT EXISTS warehouse_issue_lots_lot_idx ON public.warehouse_issue_lots (material_lot_id,created_at desc,id desc);
CREATE INDEX IF NOT EXISTS ready_usage_lots_lot_idx ON public.ready_production_usage_lots (material_lot_id,created_at desc,id desc);
CREATE INDEX IF NOT EXISTS production_orders_scope_status_idx ON public.production_orders (project_id,product_id,status,order_date desc,id desc);
CREATE INDEX IF NOT EXISTS production_order_items_work_status_idx ON public.production_order_items (work_item_id,status,order_id,id);
CREATE INDEX IF NOT EXISTS production_checks_item_date_active_idx ON public.production_checks (order_item_id,check_date desc,id desc) where status='AKTIF';
CREATE INDEX IF NOT EXISTS warehouse_issues_scope_date_idx ON public.warehouse_issues (project_id,product_id,material_id,issue_date desc,id desc) where source_type='BAHAN BAKU';
CREATE INDEX IF NOT EXISTS material_lots_scope_location_idx ON public.material_lots (current_project_id,current_product_id,current_location_id,status,id);
CREATE INDEX IF NOT EXISTS production_wip_consumptions_dep_status_idx ON public.production_wip_consumptions (dependency_id,status,created_at desc,id desc);
CREATE INDEX IF NOT EXISTS material_lots_remaining_idx ON public.material_lots (current_location_id,material_id,status,remaining_normalized_quantity desc,id) where status in ('AVAILABLE','PARTIAL') and remaining_normalized_quantity>0;
CREATE INDEX IF NOT EXISTS production_anomalies_check_idx ON public.production_anomalies (production_check_id,status,id) where production_check_id is not null;
CREATE UNIQUE INDEX IF NOT EXISTS work_items_active_linear_order_uidx ON public.work_items (product_id, flow_order) where product_id is not null and status='AKTIF' and flow_mode='BERANTAI' and flow_order is not null;
CREATE INDEX IF NOT EXISTS work_items_flow_idx ON public.work_items (product_id, flow_mode, flow_order, id) where product_id is not null and status='AKTIF';
CREATE INDEX IF NOT EXISTS work_item_dependencies_source_idx ON public.work_item_dependencies (product_id, source_mode, status, id);
CREATE INDEX IF NOT EXISTS work_items_manager_progress_idx ON public.work_items (product_id,status,output_final,id) where product_id is not null;
CREATE INDEX IF NOT EXISTS production_orders_manager_idx ON public.production_orders (project_id,product_id,status,due_date,id);
CREATE INDEX IF NOT EXISTS production_order_items_work_item_idx ON public.production_order_items (work_item_id,order_id,status,id);
CREATE INDEX IF NOT EXISTS warehouse_receipts_material_date_idx ON public.warehouse_receipts (material_id,receipt_date desc,id desc) where status='AKTIF';
CREATE INDEX IF NOT EXISTS ready_usage_manager_idx ON public.ready_production_usages (project_id,product_id,material_id,usage_date desc,id desc) where status='AKTIF' and item_kind='MATERIAL';
CREATE INDEX IF NOT EXISTS production_anomalies_manager_idx ON public.production_anomalies (status,severity,detected_at desc,id desc);
CREATE INDEX IF NOT EXISTS material_suppliers_supplier_idx ON public.material_suppliers (supplier_id,status,preferred desc);
CREATE INDEX IF NOT EXISTS material_suppliers_material_idx ON public.material_suppliers (material_id,status,preferred desc);
CREATE UNIQUE INDEX IF NOT EXISTS material_suppliers_one_preferred_uq ON public.material_suppliers (material_id) where preferred=true and status='AKTIF';
CREATE INDEX IF NOT EXISTS bom_fulfillment_source_idx ON public.bom_requirements (fulfillment_source,status,project_id,product_id) where component_type='BAHAN';
CREATE INDEX IF NOT EXISTS purchase_plans_scope_status_idx ON public.purchase_plans (project_id,product_id,status,plan_date desc,id desc);
CREATE INDEX IF NOT EXISTS purchase_plan_lines_plan_idx ON public.purchase_plan_lines (purchase_plan_id,id);
CREATE INDEX IF NOT EXISTS purchase_plan_lines_supplier_idx ON public.purchase_plan_lines (supplier_id,purchase_plan_id) where supplier_id is not null;
CREATE INDEX IF NOT EXISTS purchase_orders_status_date_idx ON public.purchase_orders (status,order_date desc,id desc);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_status_idx ON public.purchase_orders (supplier_id,status,order_date desc,id desc);
CREATE INDEX IF NOT EXISTS purchase_orders_plan_idx ON public.purchase_orders (purchase_plan_id,status,id) where purchase_plan_id is not null;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_lines_po_material_uq ON public.purchase_order_lines (purchase_order_id,material_id) where status<>'CANCELLED';
CREATE INDEX IF NOT EXISTS purchase_order_lines_material_status_idx ON public.purchase_order_lines (material_id,status,purchase_order_id);
CREATE INDEX IF NOT EXISTS purchase_order_lines_plan_line_idx ON public.purchase_order_lines (purchase_plan_line_id,status) where purchase_plan_line_id is not null;
CREATE INDEX IF NOT EXISTS warehouse_receipts_po_line_idx ON public.warehouse_receipts (purchase_order_line_id,receipt_date desc,id desc) where purchase_order_line_id is not null;
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_receipts_idempotency_uq ON public.warehouse_receipts (idempotency_key) where idempotency_key is not null;
CREATE INDEX IF NOT EXISTS warehouse_receipts_supplier_idx ON public.warehouse_receipts (supplier_id,receipt_date desc,id desc) where supplier_id is not null;
CREATE INDEX IF NOT EXISTS system_test_runs_type_date_idx ON public.system_test_runs (run_type,started_at desc,id desc);
CREATE INDEX IF NOT EXISTS system_data_backups_date_idx ON public.system_data_backups (created_at desc,id desc);
CREATE INDEX IF NOT EXISTS system_test_run_entities_run_idx ON public.system_test_run_entities (run_id,table_name,row_id);
CREATE INDEX IF NOT EXISTS production_orders_product_status_idx ON public.production_orders (product_id,status,id);
CREATE INDEX IF NOT EXISTS projects_repeat_source_idx ON public.projects (repeat_source_project_id) where repeat_source_project_id is not null;
CREATE INDEX IF NOT EXISTS work_items_manual_result_profile_idx ON public.work_items (project_id,product_id,status,executor_scope,submission_category,id);
CREATE INDEX IF NOT EXISTS production_manual_results_scope_idx ON public.production_manual_results (project_id,product_id,work_item_id,status,result_date desc,id desc);
CREATE INDEX IF NOT EXISTS production_manual_results_worker_idx ON public.production_manual_results (worker_id,status,result_date desc,id desc);
CREATE INDEX IF NOT EXISTS projects_product_category_idx ON public.projects (product_category);
CREATE INDEX IF NOT EXISTS fg_bundling_date_idx ON public.finished_goods_bundling (bundling_date desc);
CREATE INDEX IF NOT EXISTS fg_bundling_loc_idx ON public.finished_goods_bundling (location_id);
CREATE INDEX IF NOT EXISTS fg_bundling_items_bnd_idx ON public.finished_goods_bundling_items (bundling_id);
CREATE INDEX IF NOT EXISTS bundle_packages_status_idx ON public.bundle_packages (status);
CREATE INDEX IF NOT EXISTS bundle_package_recipes_pkg_idx ON public.bundle_package_recipes (package_id);
CREATE INDEX IF NOT EXISTS bundle_package_balances_pkg_loc_idx ON public.bundle_package_balances (package_id, location_id);
CREATE INDEX IF NOT EXISTS bundle_package_packings_date_idx ON public.bundle_package_packings (packing_date desc);
CREATE INDEX IF NOT EXISTS bundle_package_packings_pkg_idx ON public.bundle_package_packings (package_id);
CREATE INDEX IF NOT EXISTS bundle_package_packing_items_pck_idx ON public.bundle_package_packing_items (packing_id);
CREATE INDEX IF NOT EXISTS smpt_keepalive_log_pinged_at_idx ON public.smpt_keepalive_log (pinged_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bundle_recipes_uniq_idx ON public.bundle_recipes (bundle_finished_good_id, component_finished_good_id);

-- ============================================================================
-- BAGIAN 5: ENABLE ROW LEVEL SECURITY & PERMISSION GRANTS
-- ============================================================================
ALTER TABLE public.attendance_import_batches ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_import_batches TO authenticated, service_role;
ALTER TABLE public.attendance_import_rows ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_import_rows TO authenticated, service_role;
ALTER TABLE public.attendance_month_closures ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_month_closures TO authenticated, service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated, service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_events TO authenticated, service_role;
ALTER TABLE public.bom_requirements ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bom_requirements TO authenticated, service_role;
ALTER TABLE public.bundle_package_balances ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_package_balances TO authenticated, service_role;
ALTER TABLE public.bundle_package_packing_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_package_packing_items TO authenticated, service_role;
ALTER TABLE public.bundle_package_packings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_package_packings TO authenticated, service_role;
ALTER TABLE public.bundle_package_recipes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_package_recipes TO authenticated, service_role;
ALTER TABLE public.bundle_packages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_packages TO authenticated, service_role;
ALTER TABLE public.bundle_recipes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_recipes TO authenticated, service_role;
ALTER TABLE public.cash_advance_payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_advance_payments TO authenticated, service_role;
ALTER TABLE public.cash_advances ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_advances TO authenticated, service_role;
ALTER TABLE public.cutting_components ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cutting_components TO authenticated, service_role;
ALTER TABLE public.cutting_daily_results ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cutting_daily_results TO authenticated, service_role;
ALTER TABLE public.cutting_material_usages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cutting_material_usages TO authenticated, service_role;
ALTER TABLE public.embarkation_issues ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.embarkation_issues TO authenticated, service_role;
ALTER TABLE public.embarkation_shipments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.embarkation_shipments TO authenticated, service_role;
ALTER TABLE public.embarkation_targets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.embarkation_targets TO authenticated, service_role;
ALTER TABLE public.embarkations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.embarkations TO authenticated, service_role;
ALTER TABLE public.external_finished_receipts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_finished_receipts TO authenticated, service_role;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_transactions TO authenticated, service_role;
ALTER TABLE public.finished_goods ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finished_goods TO authenticated, service_role;
ALTER TABLE public.finished_goods_bundling ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finished_goods_bundling TO authenticated, service_role;
ALTER TABLE public.finished_goods_bundling_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finished_goods_bundling_items TO authenticated, service_role;
ALTER TABLE public.finished_goods_transfers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finished_goods_transfers TO authenticated, service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated, service_role;
ALTER TABLE public.logistics_stock_balances ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_stock_balances TO authenticated, service_role;
ALTER TABLE public.logistics_stock_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_stock_events TO authenticated, service_role;
ALTER TABLE public.logistics_stock_ledger ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_stock_ledger TO authenticated, service_role;
ALTER TABLE public.manufacturing_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manufacturing_transactions TO authenticated, service_role;
ALTER TABLE public.material_lots ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_lots TO authenticated, service_role;
ALTER TABLE public.material_request_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_request_items TO authenticated, service_role;
ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_requests TO authenticated, service_role;
ALTER TABLE public.material_suppliers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_suppliers TO authenticated, service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated, service_role;
ALTER TABLE public.operator_payroll_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_payroll_items TO authenticated, service_role;
ALTER TABLE public.operator_payroll_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_payroll_runs TO authenticated, service_role;
ALTER TABLE public.packing_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_runs TO authenticated, service_role;
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
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permissions TO authenticated, service_role;
ALTER TABLE public.petty_cash_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.petty_cash_transactions TO authenticated, service_role;
ALTER TABLE public.product_set_components ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_set_components TO authenticated, service_role;
ALTER TABLE public.product_sets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_sets TO authenticated, service_role;
ALTER TABLE public.production_anomalies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_anomalies TO authenticated, service_role;
ALTER TABLE public.production_checks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_checks TO authenticated, service_role;
ALTER TABLE public.production_manual_results ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_manual_results TO authenticated, service_role;
ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_order_items TO authenticated, service_role;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated, service_role;
ALTER TABLE public.production_wip_consumptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_wip_consumptions TO authenticated, service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated, service_role;
ALTER TABLE public.project_products ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_products TO authenticated, service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated, service_role;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated, service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated, service_role;
ALTER TABLE public.purchase_plan_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_plan_lines TO authenticated, service_role;
ALTER TABLE public.purchase_plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_plans TO authenticated, service_role;
ALTER TABLE public.qc_inspections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qc_inspections TO authenticated, service_role;
ALTER TABLE public.qc_reworks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qc_reworks TO authenticated, service_role;
ALTER TABLE public.ready_production_usage_lots ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ready_production_usage_lots TO authenticated, service_role;
ALTER TABLE public.ready_production_usages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ready_production_usages TO authenticated, service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated, service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated, service_role;
ALTER TABLE public.salary_submissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_submissions TO authenticated, service_role;
ALTER TABLE public.smpt_keepalive_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smpt_keepalive_log TO authenticated, service_role;
ALTER TABLE public.stock_balances ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_balances TO authenticated, service_role;
ALTER TABLE public.stock_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_events TO authenticated, service_role;
ALTER TABLE public.stock_ledger_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_ledger_entries TO authenticated, service_role;
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_locations TO authenticated, service_role;
ALTER TABLE public.system_data_backups ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_data_backups TO authenticated, service_role;
ALTER TABLE public.system_test_run_entities ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_test_run_entities TO authenticated, service_role;
ALTER TABLE public.system_test_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_test_runs TO authenticated, service_role;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated, service_role;
ALTER TABLE public.user_worker_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_worker_links TO authenticated, service_role;
ALTER TABLE public.vendor_delivery_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_delivery_logs TO authenticated, service_role;
ALTER TABLE public.vendor_down_payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_down_payments TO authenticated, service_role;
ALTER TABLE public.vendor_po_targets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_po_targets TO authenticated, service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated, service_role;
ALTER TABLE public.warehouse_issue_lots ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_issue_lots TO authenticated, service_role;
ALTER TABLE public.warehouse_issues ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_issues TO authenticated, service_role;
ALTER TABLE public.warehouse_receipts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_receipts TO authenticated, service_role;
ALTER TABLE public.work_item_dependencies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_item_dependencies TO authenticated, service_role;
ALTER TABLE public.work_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_items TO authenticated, service_role;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workers TO authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ============================================================================
-- SELESAI: MASTER SCRIPT ADDITIVE-ONLY SUDAH LENGKAP & SIAP DIEKSEKUSI DI PRODUCTION
-- ============================================================================
