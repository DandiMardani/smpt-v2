-- ==============================================================================
-- Migration: 20261104080000_mrp_monitoring_rls_and_policies.sql
-- Module: Dashboard Monitoring Kebutuhan Bahan (MRP) per Proyek
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Hak Akses SELECT untuk Role Authenticated pada Tabel Terkait MRP
-- Memastikan dashboard MRP dapat membaca:
-- bom_requirements, purchase_plans, purchase_plan_lines, purchase_order_lines
-- ------------------------------------------------------------------------------

-- 1a. Tabel bom_requirements
ALTER TABLE public.bom_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_bom_requirements" ON public.bom_requirements;
CREATE POLICY "authenticated_select_bom_requirements"
  ON public.bom_requirements
  FOR SELECT
  TO authenticated
  USING (true);

-- 1b. Tabel purchase_plans
ALTER TABLE public.purchase_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_purchase_plans" ON public.purchase_plans;
CREATE POLICY "authenticated_select_purchase_plans"
  ON public.purchase_plans
  FOR SELECT
  TO authenticated
  USING (true);

-- 1c. Tabel purchase_plan_lines
ALTER TABLE public.purchase_plan_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_purchase_plan_lines" ON public.purchase_plan_lines;
CREATE POLICY "authenticated_select_purchase_plan_lines"
  ON public.purchase_plan_lines
  FOR SELECT
  TO authenticated
  USING (true);

-- 1d. Tabel purchase_order_lines
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_purchase_order_lines" ON public.purchase_order_lines;
CREATE POLICY "authenticated_select_purchase_order_lines"
  ON public.purchase_order_lines
  FOR SELECT
  TO authenticated
  USING (true);

