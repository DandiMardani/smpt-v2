-- Align local schema with live Supabase schema for seamless seeding and synchronization

-- Add missing columns
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS late_minutes integer DEFAULT 0;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS late_deduction numeric DEFAULT 0;
ALTER TABLE public.cash_advances ADD COLUMN IF NOT EXISTS warung_id uuid;
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS gross_bill numeric DEFAULT 0;
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS dp_deduction numeric DEFAULT 0;
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS cash_payment numeric DEFAULT 0;
ALTER TABLE public.external_finished_receipts ADD COLUMN IF NOT EXISTS payment_status character varying(30) DEFAULT 'BELUM_LUNAS';
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS item_kind character varying(30) DEFAULT 'FINISHED_GOOD';
ALTER TABLE public.finished_goods_transfers ADD COLUMN IF NOT EXISTS package_id bigint;
ALTER TABLE public.payroll_run_items ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'PENDING';

-- Relax constraints that are nullable in Live
ALTER TABLE public.purchase_plans ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE public.purchase_orders ALTER COLUMN supplier_id DROP NOT NULL;
ALTER TABLE public.finished_goods_transfers ALTER COLUMN finished_good_id DROP NOT NULL;
ALTER TABLE public.stock_ledger_entries ALTER COLUMN event_id DROP NOT NULL;

-- Update check constraints
ALTER TABLE public.manufacturing_transactions DROP CONSTRAINT IF EXISTS manufacturing_transactions_flow_type_check;
ALTER TABLE public.manufacturing_transactions ADD CONSTRAINT manufacturing_transactions_flow_type_check 
    CHECK (flow_type = ANY (ARRAY['INTERNAL'::text, 'TITIPAN'::text, 'BARANG_LUAR'::text, 'PENGIRIMAN'::text, 'OPNAME'::text, 'OPNAME_MASUK'::text, 'OPNAME_KELUAR'::text]));

