import subprocess
import os

def run():
    seed_path = r'c:\Users\HP\Projects\smpt-v2\supabase\seed.sql'
    if not os.path.exists(seed_path):
        print("seed.sql not found!")
        return

    # 1. Align schema (add missing columns and relax NOT NULL constraints that are nullable in Live)
    align_sql = """
    -- Add columns present in live schema
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
    """

    print("Aligning local schema with Live Supabase schema...")
    res = subprocess.run(
        ['docker', 'exec', '-i', 'supabase_db_smpt-v2', 'psql', '-U', 'postgres', '-d', 'postgres'],
        input=align_sql, text=True, capture_output=True
    )
    if res.returncode != 0:
        print("Align failed:", res.stderr)
        return
    print("Schema alignment successful.")

    # 2. Extract tables to truncate
    tables = []
    with open(seed_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if line.startswith('INSERT INTO '):
                tbl = line.split()[2]
                if tbl not in tables:
                    tables.append(tbl)
    print(f"Found {len(tables)} tables to populate from seed.sql.")

    # 3. Truncate tables cleanly under replica role
    truncate_sql = f"""
    SET session_replication_role = replica;
    TRUNCATE TABLE {', '.join(tables)} CASCADE;
    """
    print("Truncating existing tables before clean import...")
    res_trunc = subprocess.run(
        ['docker', 'exec', '-i', 'supabase_db_smpt-v2', 'psql', '-U', 'postgres', '-d', 'postgres'],
        input=truncate_sql, text=True, capture_output=True
    )
    if res_trunc.returncode != 0:
        print("Truncate failed:", res_trunc.stderr)
        return
    print("Truncate completed.")

    # 4. Stream seed.sql into psql
    print("Streaming seed.sql into local PostgreSQL container...")
    with open(seed_path, 'rb') as f:
        res_seed = subprocess.run(
            ['docker', 'exec', '-i', 'supabase_db_smpt-v2', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=0'],
            stdin=f, capture_output=True, text=True, errors='replace'
        )
    
    # Check for any errors
    errors = [l for l in res_seed.stderr.splitlines() if 'ERROR' in l]
    print(f"Seed execution finished. Total errors: {len(errors)}")
    if errors:
        for e in errors[:15]:
            print("  ", e)

    # 5. Verify row counts on critical tables
    verify_sql = """
    SELECT 'auth.users' as table_name, count(*) as count FROM auth.users
    UNION ALL SELECT 'profiles', count(*) FROM public.profiles
    UNION ALL SELECT 'workers', count(*) FROM public.workers
    UNION ALL SELECT 'attendance_records', count(*) FROM public.attendance_records
    UNION ALL SELECT 'payroll_runs', count(*) FROM public.payroll_runs
    UNION ALL SELECT 'payroll_run_items', count(*) FROM public.payroll_run_items
    UNION ALL SELECT 'cash_advances', count(*) FROM public.cash_advances
    UNION ALL SELECT 'projects', count(*) FROM public.projects
    UNION ALL SELECT 'materials', count(*) FROM public.materials
    UNION ALL SELECT 'finished_goods', count(*) FROM public.finished_goods;
    """
    proc_verify = subprocess.run(
        ['docker', 'exec', '-i', 'supabase_db_smpt-v2', 'psql', '-U', 'postgres', '-d', 'postgres', '-c', verify_sql],
        capture_output=True, text=True
    )
    print("\n=== Verification Results ===")
    print(proc_verify.stdout)

if __name__ == '__main__':
    run()
