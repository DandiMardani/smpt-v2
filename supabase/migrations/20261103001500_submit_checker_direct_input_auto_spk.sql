-- ==============================================================================
-- Migration: 20261103001500_submit_checker_direct_input_auto_spk.sql
-- Module: Input Setoran Mandiri (Auto-SPK) Checker
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.submit_checker_direct_input(
  p_project_id BIGINT,
  p_product_id BIGINT,
  p_work_item_id BIGINT,
  p_worker_id BIGINT,
  p_qty NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_product RECORD;
  v_work_item RECORD;
  v_worker RECORD;
  v_checker_email TEXT;
  
  v_target_production NUMERIC(18, 4);
  v_tolerance_spare NUMERIC(18, 4) := 0;
  v_total_checks NUMERIC(18, 4) := 0;
  v_total_manual NUMERIC(18, 4) := 0;
  v_total_qty_sah NUMERIC(18, 4) := 0;
  v_sisa_kuota NUMERIC(18, 4) := 0;
  
  v_order_id BIGINT;
  v_spk_code TEXT;
  v_order_item_id BIGINT;
  v_check_id BIGINT;
  v_check_code TEXT;
  v_audit_notes TEXT;
BEGIN
  -- 1. Validasi Autorisasi Pemanggil (Hanya Checker atau Admin)
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_permission('borongan.operate') 
    OR public.has_permission('spk.write') 
    OR public.current_user_role() IN ('ADMIN', 'CHECKER')
  ) THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Checker atau Administrator yang dapat melakukan input setoran mandiri.' 
      USING errcode = '42501';
  END IF;

  -- 2. Validasi Parameter Input Dasar
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Qty setoran tidak valid: Qty harus bernilai lebih dari 0 (diterima: %).', p_qty 
      USING errcode = '22023';
  END IF;

  -- 3. Validasi Eksistensi Produk & Proyek
  SELECT 
    pp.id,
    pp.project_id,
    pp.name,
    pp.target_production,
    pp.status
  INTO v_product
  FROM public.project_products pp
  WHERE pp.id = p_product_id 
    AND pp.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk ID % tidak ditemukan pada Proyek ID %.', p_product_id, p_project_id 
      USING errcode = 'P0002';
  END IF;

  IF v_product.status <> 'AKTIF' THEN
    RAISE EXCEPTION 'Produk "%" saat ini berstatus NONAKTIF.', v_product.name 
      USING errcode = 'P0002';
  END IF;

  -- 4. Validasi Eksistensi & Kompatibilitas Item Pekerjaan
  SELECT 
    wi.id,
    wi.project_id,
    wi.product_id,
    wi.name,
    wi.unit,
    COALESCE(wi.qty_per_product, 1) AS qty_per_product,
    COALESCE(wi.operator_price, 0) AS operator_price,
    COALESCE(wi.proposed_price, 0) AS proposed_price,
    COALESCE(wi.output_final, false) AS output_final,
    wi.status
  INTO v_work_item
  FROM public.work_items wi
  WHERE wi.id = p_work_item_id
    AND wi.project_id = p_project_id
    AND (wi.product_id IS NULL OR wi.product_id = p_product_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item pekerjaan ID % tidak ditemukan atau tidak terikat dengan proyek/produk ini.', p_work_item_id 
      USING errcode = 'P0002';
  END IF;

  IF v_work_item.status <> 'AKTIF' THEN
    RAISE EXCEPTION 'Item pekerjaan "%" saat ini berstatus NONAKTIF.', v_work_item.name 
      USING errcode = 'P0002';
  END IF;

  -- 5. Validasi Eksistensi & Keaktifan Pekerja
  SELECT 
    w.id,
    w.name,
    w.status
  INTO v_worker
  FROM public.workers w
  WHERE w.id = p_worker_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pekerja ID % tidak ditemukan di master data pekerja.', p_worker_id 
      USING errcode = 'P0002';
  END IF;

  IF v_worker.status <> 'AKTIF' THEN
    RAISE EXCEPTION 'Pekerja "%" saat ini berstatus NONAKTIF.', v_worker.name 
      USING errcode = 'P0002';
  END IF;

  -- 6. Tentukan Email Identitas Checker
  v_checker_email := lower(btrim(COALESCE(auth.jwt() ->> 'email', '')));
  IF v_checker_email = '' THEN
    SELECT email INTO v_checker_email FROM auth.users WHERE id = auth.uid();
  END IF;
  IF v_checker_email IS NULL OR v_checker_email = '' THEN
    v_checker_email := 'checker@smpt.local';
  END IF;

  -- 7. Logic Validasi Kuota:
  -- Rumus: Sisa Kuota = (Target Produksi + Toleransi/Spare) - (Total Qty Sah yang sudah disetor)
  v_target_production := round((v_product.target_production * v_work_item.qty_per_product)::numeric, 4);
  v_tolerance_spare := 0; -- Cadangan toleransi/spare default 0

  -- 7a. Akumulasi Total Qty Sah dari Setoran Checker Aktif
  SELECT COALESCE(SUM(c.good_qty), 0)
  INTO v_total_checks
  FROM public.production_checks c
  JOIN public.production_order_items poi ON poi.id = c.order_item_id
  JOIN public.production_orders po ON po.id = poi.order_id
  WHERE po.project_id = p_project_id
    AND po.product_id = p_product_id
    AND poi.work_item_id = p_work_item_id
    AND c.status = 'AKTIF'
    AND po.status <> 'DIBATALKAN'
    AND poi.status <> 'DIBATALKAN';

  -- 7b. Akumulasi Total Qty Sah dari Hasil Produksi Manual Aktif
  SELECT COALESCE(SUM(m.qty_good), 0)
  INTO v_total_manual
  FROM public.production_manual_results m
  WHERE m.project_id = p_project_id
    AND m.product_id = p_product_id
    AND m.work_item_id = p_work_item_id
    AND m.status = 'AKTIF';

  v_total_qty_sah := v_total_checks + v_total_manual;
  v_sisa_kuota := (v_target_production + v_tolerance_spare) - v_total_qty_sah;

  -- 7c. Evaluasi Batas Kuota: Throw error jika input melebihi sisa kuota
  IF p_qty > (v_sisa_kuota + 0.0001) THEN
    RAISE EXCEPTION 'Input setoran ditolak: Qty input (%) melebihi sisa kuota yang tersedia (%). (Target: %, Terpenuhi: %)',
      p_qty, 
      GREATEST(v_sisa_kuota, 0), 
      v_target_production, 
      v_total_qty_sah
      USING errcode = 'P0001';
  END IF;

  -- Format catatan audit Auto-SPK
  v_audit_notes := 'Auto-SPK dari Checker' || 
    CASE 
      WHEN p_notes IS NOT NULL AND btrim(p_notes) <> '' THEN ': ' || btrim(p_notes) 
      ELSE '' 
    END;

  -- 8. Logic Pembuatan Auto-SPK:
  -- Buat record production_orders secara on-the-fly
  INSERT INTO public.production_orders (
    order_date,
    project_id,
    product_id,
    operator_worker_id,
    checker_email,
    due_date,
    status,
    notes,
    published_at,
    completed_at,
    created_by,
    updated_by
  )
  VALUES (
    CURRENT_DATE,
    p_project_id,
    p_product_id,
    p_worker_id,
    v_checker_email,
    CURRENT_DATE,
    'SELESAI',
    v_audit_notes,
    now(),
    now(),
    auth.uid(),
    auth.uid()
  )
  RETURNING id, spk_code INTO v_order_id, v_spk_code;

  -- Buat record production_order_items on-the-fly
  INSERT INTO public.production_order_items (
    order_id,
    work_item_id,
    work_item_name_snapshot,
    unit_snapshot,
    qty_per_product_snapshot,
    operator_price_snapshot,
    submission_price_snapshot,
    assigned_qty,
    is_final_output_snapshot,
    status
  )
  VALUES (
    v_order_id,
    p_work_item_id,
    v_work_item.name,
    v_work_item.unit,
    v_work_item.qty_per_product,
    v_work_item.operator_price,
    v_work_item.proposed_price,
    p_qty,
    v_work_item.output_final,
    'SELESAI'
  )
  RETURNING id INTO v_order_item_id;

  -- 9. Logic Setoran Otomatis:
  -- Langsung insert data ke production_checks menggunakan ID item SPK baru
  INSERT INTO public.production_checks (
    order_item_id,
    check_date,
    good_qty,
    reject_qty,
    notes,
    checker_user_id,
    checker_email,
    status
  )
  VALUES (
    v_order_item_id,
    CURRENT_DATE,
    p_qty,
    0,
    v_audit_notes,
    auth.uid(),
    v_checker_email,
    'AKTIF'
  )
  RETURNING id, check_code INTO v_check_id, v_check_code;

  -- 10. Return Response Hasil Eksekusi Atomic
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Setoran mandiri berhasil disimpan dengan Auto-SPK.',
    'check_id', v_check_id,
    'check_code', v_check_code,
    'order_id', v_order_id,
    'spk_code', v_spk_code,
    'order_item_id', v_order_item_id,
    'worker_id', p_worker_id,
    'worker_name', v_worker.name,
    'work_item_name', v_work_item.name,
    'qty', p_qty,
    'target_production', v_target_production,
    'total_qty_sah', v_total_qty_sah + p_qty,
    'sisa_kuota', v_sisa_kuota - p_qty
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_checker_direct_input(BIGINT, BIGINT, BIGINT, BIGINT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_checker_direct_input(BIGINT, BIGINT, BIGINT, BIGINT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_checker_direct_input(BIGINT, BIGINT, BIGINT, BIGINT, NUMERIC, TEXT) TO service_role;

