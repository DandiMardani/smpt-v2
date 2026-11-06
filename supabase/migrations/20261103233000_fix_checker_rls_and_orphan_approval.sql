-- ==============================================================================
-- Migration: 20261103233000_fix_checker_rls_and_orphan_approval.sql
-- Module: Hak Akses Checker (Auto-SPK RLS) & Filter Data Yatim (Admin Approval)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Hak Akses SELECT untuk Role Authenticated (Auto-SPK Dropdowns)
-- Memastikan Checker (dan seluruh authenticated users) dapat membaca referensi:
-- projects, project_products, work_items, dan workers tanpa terhalang RLS
-- ------------------------------------------------------------------------------

-- 1a. Tabel projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_projects" ON public.projects;
CREATE POLICY "authenticated_select_projects"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (true);

-- 1b. Tabel project_products
ALTER TABLE public.project_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_project_products" ON public.project_products;
CREATE POLICY "authenticated_select_project_products"
  ON public.project_products
  FOR SELECT
  TO authenticated
  USING (true);

-- 1c. Tabel work_items
ALTER TABLE public.work_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_work_items" ON public.work_items;
CREATE POLICY "authenticated_select_work_items"
  ON public.work_items
  FOR SELECT
  TO authenticated
  USING (true);

-- 1d. Tabel workers
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_workers" ON public.workers;
CREATE POLICY "authenticated_select_workers"
  ON public.workers
  FOR SELECT
  TO authenticated
  USING (true);

-- ------------------------------------------------------------------------------
-- 2. Modifikasi RPC: review_checker_edit_request
-- Aturan Data Yatim: Jika data setoran asli tidak aktif/dihapus, JANGAN gunakan
-- RAISE EXCEPTION, tapi update status pengajuan menjadi rejected dengan catatan
-- otomatis dari sistem.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_checker_edit_request(
  p_request_id BIGINT,
  p_decision TEXT, -- 'approved' atau 'rejected'
  p_review_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_req RECORD;
  v_validation JSONB;
  v_check RECORD;
  v_diff_qty NUMERIC(18, 4);
BEGIN
  -- Hanya role ADMIN atau MANAGER yang berwenang mereview
  IF public.current_user_role() NOT IN ('ADMIN', 'MANAGER') THEN
    RAISE EXCEPTION 'Hanya Administrator atau Manager yang berhak memproses pengajuan edit.' 
      USING errcode = '42501';
  END IF;

  IF lower(p_decision) NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Keputusan harus berupa "approved" atau "rejected".';
  END IF;

  -- Kunci baris pengajuan
  SELECT * INTO v_req
  FROM public.checker_edit_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan edit ID % tidak ditemukan.', p_request_id;
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Pengajuan ini sudah pernah diproses sebelumnya (Status: %).', v_req.status;
  END IF;

  -- Kunci baris setoran (production_checks)
  SELECT * INTO v_check
  FROM public.production_checks
  WHERE id = v_req.setoran_id
  FOR UPDATE;

  -- Penanganan Data Yatim:
  -- Jika data setoran asli tidak ditemukan atau statusnya bukan 'AKTIF',
  -- jangan melempar Exception. Otomatis tolak pengajuan ini dengan catatan sistem.
  IF NOT FOUND OR v_check.status <> 'AKTIF' THEN
    UPDATE public.checker_edit_requests
    SET 
      status = 'rejected'::public.checker_request_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = COALESCE(p_review_notes, '') || 
        CASE 
          WHEN p_review_notes IS NOT NULL AND btrim(p_review_notes) <> '' THEN ' | ' 
          ELSE '' 
        END || '[Sistem] Ditolak otomatis: Data setoran asli sudah tidak aktif atau telah dibatalkan.',
      updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'rejected',
      'setoran_id', v_req.setoran_id,
      'message', 'Pengajuan edit ditolak otomatis oleh sistem karena data setoran asli sudah tidak aktif atau dibatalkan.'
    );
  END IF;

  -- Jika Disetujui (Approved)
  IF lower(p_decision) = 'approved' THEN
    -- Validasi apakah requested_qty melanggar batas maksimal urutan sebelumnya
    v_validation := public.validate_checker_max_qty(v_check.order_item_id, v_req.requested_qty);
    
    IF (v_validation->>'is_valid')::boolean = false THEN
      RAISE EXCEPTION 'Tidak dapat menyetujui: %', (v_validation->>'message');
    END IF;

    -- Update Qty pada setoran asli
    v_diff_qty := v_req.requested_qty - v_check.good_qty;

    UPDATE public.production_checks
    SET 
      good_qty = v_req.requested_qty,
      notes = COALESCE(notes, '') || ' | Diedit via Request #' || v_req.id::text || ' (' || COALESCE(p_review_notes, 'Approved') || ')'
    WHERE id = v_check.id;

    -- Update status pengajuan
    UPDATE public.checker_edit_requests
    SET 
      status = 'approved'::public.checker_request_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = p_review_notes,
      updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'approved',
      'setoran_id', v_check.id,
      'old_qty', v_check.good_qty,
      'new_qty', v_req.requested_qty,
      'message', 'Pengajuan berhasil disetujui dan data setoran telah diperbarui.'
    );
  ELSE
    -- Jika Ditolak (Rejected) secara manual oleh Admin/Manager
    UPDATE public.checker_edit_requests
    SET 
      status = 'rejected'::public.checker_request_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = p_review_notes,
      updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'rejected',
      'setoran_id', v_check.id,
      'message', 'Pengajuan berhasil ditolak.'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_checker_edit_request(BIGINT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_checker_edit_request(BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_checker_edit_request(BIGINT, TEXT, TEXT) TO service_role;
