-- ==============================================================================
-- Migration: 20261104125000_fix_rpc_order_code_spk_code.sql
-- Module: Perbaikan RPC review_checker_edit_request & validate_checker_max_qty
-- Bug: "column 'order_code' does not exist" -> dikoreksi menjadi "spk_code"
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Perbaikan Fungsi: validate_checker_max_qty
-- Tabel production_orders tidak memiliki kolom 'order_code'. Kolom yang sah adalah 'spk_code'.
-- Fungsi ini dipanggil di dalam review_checker_edit_request saat keputusan 'approved'.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_checker_max_qty(
  p_order_item_id BIGINT,
  p_input_qty NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item RECORD;
  v_order RECORD;
  v_predecessor_id BIGINT;
  v_predecessor_name TEXT;
  v_predecessor_qty_per_product NUMERIC(18, 4);
  v_predecessor_qty_sah NUMERIC(18, 4) := 0;
  v_max_allowed_qty NUMERIC(18, 4);
  v_is_valid BOOLEAN := true;
  v_message TEXT := 'Valid: Qty dalam batas toleransi.';
BEGIN
  -- 1. Validasi eksistensi Item SPK & SPK Induk
  SELECT 
    poi.id,
    poi.order_id,
    poi.work_item_id,
    poi.assigned_qty,
    COALESCE(poi.qty_per_product_snapshot, wi.qty_per_product, 1) AS qty_per_product,
    wi.name AS current_work_item_name,
    wi.display_order
  INTO v_item
  FROM public.production_order_items poi
  JOIN public.work_items wi ON wi.id = poi.work_item_id
  WHERE poi.id = p_order_item_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_valid', false,
      'message', 'Item SPK tidak ditemukan.'
    );
  END IF;

  -- KOREKSI: Gunakan kolom spk_code (bukan order_code yang tidak ada di skema production_orders)
  SELECT project_id, product_id, spk_code
  INTO v_order
  FROM public.production_orders
  WHERE id = v_item.order_id;

  -- 2. Cari Pekerjaan Urutan Sebelumnya (Predecessor)
  -- Prioritas A: Cek definisi eksplisit di work_item_dependencies
  SELECT 
    wid.predecessor_work_item_id,
    wp.name,
    wp.qty_per_product
  INTO 
    v_predecessor_id,
    v_predecessor_name,
    v_predecessor_qty_per_product
  FROM public.work_item_dependencies wid
  JOIN public.work_items wp ON wp.id = wid.predecessor_work_item_id
  WHERE wid.product_id = v_order.product_id
    AND wid.successor_work_item_id = v_item.work_item_id
    AND wid.status = 'AKTIF'
    AND wid.dependency_type <> 'OPTIONAL'
  ORDER BY wid.id ASC
  LIMIT 1;

  -- Prioritas B: Fallback urutan linear display_order jika dependency eksplisit belum diset
  IF v_predecessor_id IS NULL THEN
    SELECT 
      wi.id,
      wi.name,
      wi.qty_per_product
    INTO 
      v_predecessor_id,
      v_predecessor_name,
      v_predecessor_qty_per_product
    FROM public.work_items wi
    WHERE wi.product_id = v_order.product_id
      AND wi.display_order < v_item.display_order
    ORDER BY wi.display_order DESC, wi.id DESC
    LIMIT 1;
  END IF;

  -- 3. Jika tidak ada pekerjaan urutan sebelumnya (operasi rantai pertama, misal Cutting awal)
  IF v_predecessor_id IS NULL THEN
    RETURN jsonb_build_object(
      'is_valid', (p_input_qty <= v_item.assigned_qty),
      'has_predecessor', false,
      'current_work_item_name', v_item.current_work_item_name,
      'input_qty', p_input_qty,
      'max_allowed_qty', v_item.assigned_qty,
      'message', CASE 
        WHEN p_input_qty <= v_item.assigned_qty THEN 'Pekerjaan pertama dalam rantai. Maksimal sesuai sisa penugasan SPK.'
        ELSE 'Qty melebihi penugasan SPK (' || v_item.assigned_qty || ').'
      END
    );
  END IF;

  -- 4. Hitung Total Qty Sah dari Pekerjaan Sebelumnya (Predecessor)
  -- Mengakumulasi hasil verifikasi checker aktif + manual hasil produksi
  SELECT 
    COALESCE(p.qty_sah, 0)
  INTO v_predecessor_qty_sah
  FROM public.v_work_item_equivalent_progress p
  WHERE p.work_item_id = v_predecessor_id;

  -- 5. Hitung Batas Maksimal Qty yang Sah untuk Pekerjaan Saat Ini
  -- Rasio konversi: (Total Sah Predecessor / Qty Per Produk Predecessor) * Qty Per Produk Saat Ini
  v_max_allowed_qty := round(
    (v_predecessor_qty_sah / NULLIF(COALESCE(v_predecessor_qty_per_product, 1), 0) * v_item.qty_per_product)::numeric, 
    4
  );

  -- Batas atas juga tidak boleh melebihi sisa penugasan SPK saat ini
  v_max_allowed_qty := LEAST(v_max_allowed_qty, v_item.assigned_qty);

  -- 6. Evaluasi Validitas
  IF p_input_qty > (v_max_allowed_qty + 0.0001) THEN
    v_is_valid := false;
    v_message := 'Peringatan: Qty yang diinput (' || p_input_qty || ') melebihi total Qty Sah dari pekerjaan sebelumnya "' 
                 || v_predecessor_name || '" (Maksimal diperbolehkan: ' || v_max_allowed_qty || ').';
  ELSE
    v_is_valid := true;
    v_message := 'Valid: Qty (' || p_input_qty || ') berada dalam batas sah pekerjaan sebelumnya "' 
                 || v_predecessor_name || '" (Maksimal: ' || v_max_allowed_qty || ').';
  END IF;

  RETURN jsonb_build_object(
    'is_valid', v_is_valid,
    'has_predecessor', true,
    'predecessor_work_item_id', v_predecessor_id,
    'predecessor_work_item_name', v_predecessor_name,
    'predecessor_qty_sah', v_predecessor_qty_sah,
    'current_work_item_name', v_item.current_work_item_name,
    'input_qty', p_input_qty,
    'max_allowed_qty', v_max_allowed_qty,
    'message', v_message
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_checker_max_qty(BIGINT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_checker_max_qty(BIGINT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_checker_max_qty(BIGINT, NUMERIC) TO service_role;

-- ------------------------------------------------------------------------------
-- 2. Fungsi RPC Utama: review_checker_edit_request
-- Dipanggil saat Administrator/Manager melakukan review (approve / reject).
-- Saat parameter 'approved', fungsi ini secara atomik memvalidasi urutan rantai,
-- lalu meng-UPDATE kolom good_qty (Qty Sah) di tabel production_checks sesuai requested_qty.
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
    -- Fungsi ini sekarang aman dipanggil karena telah menggunakan spk_code
    v_validation := public.validate_checker_max_qty(v_check.order_item_id, v_req.requested_qty);
    
    IF (v_validation->>'is_valid')::boolean = false THEN
      RAISE EXCEPTION 'Tidak dapat menyetujui: %', (v_validation->>'message');
    END IF;

    -- Update Qty pada setoran asli: good_qty (Qty Sah) diupdate menjadi requested_qty
    v_diff_qty := v_req.requested_qty - v_check.good_qty;

    UPDATE public.production_checks
    SET 
      good_qty = v_req.requested_qty,
      notes = COALESCE(notes, '') || ' | Diedit via Request #' || v_req.id::text || ' (' || COALESCE(p_review_notes, 'Approved') || ')'
    WHERE id = v_check.id;

    -- Update status pengajuan menjadi approved
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
      'diff_qty', v_diff_qty,
      'message', 'Pengajuan berhasil disetujui dan data setoran (Qty Sah) telah diperbarui.'
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

