import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function asDate(value: string | null, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return value;
}

function asOptionalId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function asBoundedInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  }

  const today = jakartaToday();
  const params = request.nextUrl.searchParams;
  const section = String(params.get("section") || "summary").trim().toUpperCase();
  const from = asDate(params.get("from"), today);
  const to = asDate(params.get("to"), today);

  // 1. SUMMARY
  if (section === "SUMMARY") {
    const { data, error } = await supabase.rpc("smpt_manager_dashboard_summary", {
      p_from: from,
      p_to: to,
    });

    if (error) {
      const status = error.code === "42501" ? 403 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(data ?? {});
  }

  // 2. RIWAYAT DETAIL PENGERJAAN PER WORK ITEM (Buka / Tutup Riwayat)
  if (section === "ITEM_HISTORY") {
    const workItemId = asOptionalId(params.get("work_item_id"));
    if (!workItemId) {
      return NextResponse.json({ error: "ID Item Pekerjaan wajib diisi." }, { status: 400 });
    }

    const { data: checks, error: checksError } = await supabase
      .from("production_checks")
      .select(`
        id,
        check_code,
        check_date,
        good_qty,
        reject_qty,
        notes,
        status,
        created_at,
        checker_user_id,
        production_order_items!inner (
          id,
          work_item_id,
          work_item_name_snapshot,
          production_orders!inner (
            id,
            spk_code,
            status,
            operator_worker_id
          )
        )
      `)
      .eq("production_order_items.work_item_id", workItemId)
      .order("check_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);

    if (checksError) {
      return NextResponse.json({ error: checksError.message }, { status: 500 });
    }

    // Lookup Checkers & Operators separately to prevent relationship embedding ambiguity
    const checkerIds = Array.from(new Set((checks || []).map((c: any) => c.checker_user_id).filter(Boolean)));
    const operatorIds = Array.from(
      new Set((checks || []).map((c: any) => c.production_order_items?.production_orders?.operator_worker_id).filter(Boolean))
    );

    const profileMap = new Map<string, string>();
    if (checkerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", checkerIds);
      (profiles || []).forEach((p: any) => profileMap.set(p.id, p.display_name));
    }

    const workerMap = new Map<number, { name: string; worker_code: string }>();
    if (operatorIds.length > 0) {
      const { data: workers } = await supabase
        .from("workers")
        .select("id, name, worker_code")
        .in("id", operatorIds);
      (workers || []).forEach((w: any) => workerMap.set(w.id, { name: w.name, worker_code: w.worker_code }));
    }

    const items = (checks || []).map((c: any) => {
      const poi = c.production_order_items;
      const po = poi?.production_orders;
      const opId = po?.operator_worker_id;
      const worker = opId ? workerMap.get(opId) : null;

      return {
        id: c.id,
        check_code: c.check_code,
        check_date: c.check_date,
        created_at: c.created_at,
        spk_code: po?.spk_code || "-",
        spk_status: po?.status || "-",
        operator_name: worker?.name || (opId ? `Pekerja #${opId}` : "-"),
        operator_code: worker?.worker_code || "",
        checker_name: profileMap.get(c.checker_user_id) || "Checker",
        good_qty: Number(c.good_qty || 0),
        reject_qty: Number(c.reject_qty || 0),
        notes: c.notes || "-",
        status: c.status || "AKTIF",
      };
    });

    return NextResponse.json({ work_item_id: workItemId, items });
  }

  // 3. BARANG JADI & STOK GUDANG / PABRIK MITRA
  if (section === "BARANG_JADI") {
    const [fgRes, balancesRes, locRes] = await Promise.all([
      supabase
        .from("finished_goods")
        .select("id, finished_good_code, name, category, unit, source, status, notes, project_products(name, target_production)")
        .order("name", { ascending: true }),
      supabase
        .from("logistics_stock_balances")
        .select("id, item_kind, finished_good_id, set_id, location_id, quantity, updated_at")
        .eq("item_kind", "FINISHED_GOOD"),
      supabase
        .from("locations")
        .select("id, name, location_type, status")
        .eq("status", "AKTIF"),
    ]);

    const locMap = new Map((locRes.data || []).map((l: any) => [l.id, l.name]));
    const balanceMap = new Map<number, { total: number; byLocation: Record<string, number> }>();

    (balancesRes.data || []).forEach((b: any) => {
      const fgId = Number(b.finished_good_id);
      const locName = locMap.get(b.location_id) || `Lokasi #${b.location_id}`;
      const qty = Number(b.quantity || 0);

      const entry = balanceMap.get(fgId) || { total: 0, byLocation: {} };
      entry.total += qty;
      entry.byLocation[locName] = (entry.byLocation[locName] || 0) + qty;
      balanceMap.set(fgId, entry);
    });

    const items = (fgRes.data || []).map((fg: any) => {
      const stockInfo = balanceMap.get(fg.id) || { total: 0, byLocation: {} };
      return {
        id: fg.id,
        code: fg.finished_good_code,
        name: fg.name,
        category: fg.category,
        unit: fg.unit,
        source: fg.source,
        status: fg.status,
        product_name: fg.project_products?.name || "-",
        target_production: Number(fg.project_products?.target_production || 0),
        total_stock: stockInfo.total,
        locations: stockInfo.byLocation,
      };
    });

    return NextResponse.json({ items, locations: locRes.data || [] });
  }

  // 4. EMBERKASI & PENGIRIMAN / TRANSFER BARANG
  if (section === "EMBARKASI") {
    // Dynamically fetch MR WU locations (supporting 3, 4, or more facilities)
    const { data: mrWuLocsData } = await supabase
      .from("locations")
      .select("id, name, location_code, notes, status")
      .eq("status", "AKTIF")
      .neq("location_code", "LOK-00101")
      .or("name.ilike.%MR WU%,notes.ilike.%MR WU%,name.ilike.%Dadap%,name.ilike.%Angkasa%,id.in.(2,3,4)")
      .order("id");

    const mrWuLocations = (mrWuLocsData && mrWuLocsData.length > 0) ? mrWuLocsData : [
      { id: 2, name: "Pabrik Mitra MR WU (Dadap)", location_code: "MRWU-DAP", notes: "Dadap" },
      { id: 3, name: "Pabrik Mitra MR WU (Angkasa)", location_code: "MRWU-ANG", notes: "Angkasa" },
      { id: 4, name: "Pabrik Mitra MR WU (Gudang Utama)", location_code: "MRWU-UTM", notes: "Gudang Utama" },
    ];
    const mrWuLocationIds = mrWuLocations.map((l: any) => Number(l.id));

    const [targetsRes, shipmentsRes, transfersRes, embRes, locRes, mrWuStockRes, packingRunsRes] = await Promise.all([
      supabase
        .from("embarkation_targets")
        .select("id, target_code, embarkation_id, item_kind, finished_good_id, set_id, target_qty, status, finished_goods(name, unit), product_sets(name, unit), embarkations(name, short_code)")
        .eq("status", "AKTIF"),
      supabase
        .from("embarkation_shipments")
        .select("id, shipment_code, document_no, shipment_date, quantity, status, received_qty, reject_qty, damaged_qty, missing_qty, driver_name, vehicle_no, notes, surat_jalan_photo_url, source_location_id, target_id, embarkation_targets(embarkation_id, finished_good_id, set_id, finished_goods(name), product_sets(name), embarkations(name, short_code))")
        .order("shipment_date", { ascending: false })
        .limit(150),
      supabase
        .from("finished_goods_transfers")
        .select("id, transfer_code, document_no, transfer_date, quantity, notes, status, delivery_status, received_qty, reject_qty, damaged_qty, received_notes, surat_jalan_photo_url, source_location_id, destination_location_id, finished_goods(name, finished_good_code, unit)")
        .order("transfer_date", { ascending: false })
        .limit(150),
      supabase
        .from("embarkations")
        .select("id, embarkation_code, short_code, name"),
      supabase
        .from("locations")
        .select("id, name, location_code, notes"),
      supabase
        .from("logistics_stock_balances")
        .select("id, item_kind, finished_good_id, set_id, location_id, quantity, finished_goods(name, finished_good_code), product_sets(name, set_code)")
        .in("location_id", mrWuLocationIds)
        .gt("quantity", 0),
      supabase
        .from("packing_runs")
        .select("id, location_id, set_id, packing_date, set_qty, notes, created_at, product_sets(name, set_code), locations(name, location_code)")
        .in("location_id", mrWuLocationIds)
        .order("packing_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(150),
    ]);

    const locMap = new Map((locRes.data || []).map((l: any) => [l.id, l]));

    const shipments = (shipmentsRes.data || []).map((s: any) => {
      const tgt = s.embarkation_targets;
      const emb = tgt?.embarkations;
      const itemName = tgt?.finished_goods?.name || tgt?.product_sets?.name || "Item";
      return {
        id: s.id,
        code: s.shipment_code,
        document_no: s.document_no || null,
        date: s.shipment_date,
        embarkation: emb?.short_code ? `${emb.name} (${emb.short_code})` : emb?.name || "-",
        item_name: itemName,
        source_location: locMap.get(s.source_location_id)?.name || "-",
        quantity: Number(s.quantity || 0),
        received_qty: Number(s.received_qty || 0),
        reject_qty: Number(s.reject_qty || 0),
        damaged_qty: Number(s.damaged_qty || 0),
        missing_qty: Number(s.missing_qty || 0),
        driver: s.driver_name || "-",
        vehicle_no: s.vehicle_no || "-",
        status: s.status,
        notes: s.notes || "-",
        surat_jalan_photo_url: s.surat_jalan_photo_url || null,
      };
    });

    const transfers = (transfersRes.data || []).map((t: any) => ({
      id: t.id,
      code: t.transfer_code,
      document_no: t.document_no || null,
      date: t.transfer_date,
      item_name: t.finished_goods?.name || "-",
      item_code: t.finished_goods?.finished_good_code || "-",
      unit: t.finished_goods?.unit || "PCS",
      quantity: Number(t.quantity || 0),
      from_location_id: t.source_location_id,
      from_location: locMap.get(t.source_location_id)?.name || "-",
      to_location_id: t.destination_location_id,
      to_location: locMap.get(t.destination_location_id)?.name || "-",
      status: t.status,
      delivery_status: t.delivery_status || "DITERIMA",
      received_qty: t.received_qty !== null ? Number(t.received_qty) : null,
      reject_qty: Number(t.reject_qty || 0),
      damaged_qty: Number(t.damaged_qty || 0),
      received_notes: t.received_notes || null,
      surat_jalan_photo_url: t.surat_jalan_photo_url || null,
      notes: t.notes || "-",
    }));

    // Posisi stok gudang MR WU
    const mrWuBalances = (mrWuStockRes.data || []).map((b: any) => {
      const loc = locMap.get(b.location_id);
      const fg = b.finished_goods;
      const setObj = b.product_sets;
      return {
        id: b.id,
        location_id: b.location_id,
        location_name: loc?.name || `Lokasi #${b.location_id}`,
        item_kind: b.item_kind,
        item_name: fg?.name || setObj?.name || "Barang",
        item_code: fg?.finished_good_code || setObj?.set_code || "-",
        quantity: Number(b.quantity || 0),
      };
    });

    // Riwayat packing harian di MR WU
    const mrWuPackingRuns = (packingRunsRes.data || []).map((pr: any) => ({
      id: pr.id,
      location_id: pr.location_id,
      location_name: pr.locations?.name || locMap.get(pr.location_id)?.name || `Lokasi #${pr.location_id}`,
      set_id: pr.set_id,
      set_name: pr.product_sets?.name || `Set #${pr.set_id}`,
      set_code: pr.product_sets?.set_code || "-",
      packing_date: pr.packing_date,
      set_qty: Number(pr.set_qty || 0),
      notes: pr.notes || "-",
      created_at: pr.created_at,
    }));

    return NextResponse.json({
      targets: targetsRes.data || [],
      shipments,
      transfers,
      embarkations: embRes.data || [],
      mr_wu_locations: mrWuLocations,
      mr_wu_stock: mrWuBalances,
      mr_wu_packing_runs: mrWuPackingRuns,
    });
  }

  // 5. BARANG REJECT (Produksi, QC, dan Pengiriman Embarkasi)
  if (section === "REJECT") {
    const [checksRejectRes, qcRejectRes, issuesRes] = await Promise.all([
      // A. Reject dari Checker Lini Produksi
      supabase
        .from("production_checks")
        .select(`
          id,
          check_code,
          check_date,
          good_qty,
          reject_qty,
          notes,
          status,
          production_order_items (
            work_item_name_snapshot,
            production_orders (
              spk_code,
              operator_worker_id,
              project_products (name)
            )
          )
        `)
        .gt("reject_qty", 0)
        .order("check_date", { ascending: false })
        .limit(100),

      // B. Reject dari QC Inspeksi
      supabase
        .from("qc_inspections")
        .select(`
          id,
          qc_code,
          inspection_date,
          inspected_qty,
          good_qty,
          reject_qty,
          rework_qty,
          notes,
          status,
          finished_goods (name, finished_good_code)
        `)
        .or("reject_qty.gt.0,rework_qty.gt.0")
        .order("inspection_date", { ascending: false })
        .limit(100),

      // C. Reject / Kendala dari Embarkasi
      supabase
        .from("embarkation_issues")
        .select(`
          id,
          issue_code,
          issue_type,
          quantity,
          description,
          status,
          resolution,
          created_at,
          embarkation_shipments (shipment_code, shipment_date)
        `)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    // Separate lookup for operator workers to prevent relationship embedding ambiguity
    const rejectOperatorIds = Array.from(
      new Set(
        (checksRejectRes.data || [])
          .map((c: any) => c.production_order_items?.production_orders?.operator_worker_id)
          .filter(Boolean)
      )
    );
    const rejectWorkerMap = new Map<number, { name: string; worker_code: string }>();
    if (rejectOperatorIds.length > 0) {
      const { data: workers } = await supabase
        .from("workers")
        .select("id, name, worker_code")
        .in("id", rejectOperatorIds);
      (workers || []).forEach((w: any) =>
        rejectWorkerMap.set(w.id, { name: w.name, worker_code: w.worker_code })
      );
    }

    const productionRejects = (checksRejectRes.data || []).map((c: any) => {
      const poi = c.production_order_items;
      const po = poi?.production_orders;
      const opId = po?.operator_worker_id;
      const worker = opId ? rejectWorkerMap.get(opId) : null;

      return {
        id: c.id,
        type: "PRODUKSI",
        code: c.check_code,
        date: c.check_date,
        product: po?.project_products?.name || "-",
        work_item: poi?.work_item_name_snapshot || "-",
        spk_code: po?.spk_code || "-",
        operator: worker ? `${worker.name} (${worker.worker_code})` : opId ? `Pekerja #${opId}` : "-",
        reject_qty: Number(c.reject_qty || 0),
        good_qty: Number(c.good_qty || 0),
        notes: c.notes || "-",
        status: c.status,
      };
    });

    const qcRejects = (qcRejectRes.data || []).map((q: any) => ({
      id: q.id,
      type: "QC",
      code: q.qc_code,
      date: q.inspection_date,
      item: q.finished_goods?.name || "-",
      inspected_qty: Number(q.inspected_qty || 0),
      good_qty: Number(q.good_qty || 0),
      reject_qty: Number(q.reject_qty || 0),
      rework_qty: Number(q.rework_qty || 0),
      notes: q.notes || "-",
      status: q.status,
    }));

    const embarkationIssues = (issuesRes.data || []).map((i: any) => ({
      id: i.id,
      type: "EMBARKASI",
      code: i.issue_code,
      issue_type: i.issue_type,
      quantity: Number(i.quantity || 0),
      description: i.description || "-",
      status: i.status,
      resolution: i.resolution || "-",
      created_at: i.created_at,
      shipment_code: i.embarkation_shipments?.shipment_code || "-",
      shipment_date: i.embarkation_shipments?.shipment_date || "-",
    }));

    return NextResponse.json({
      production_rejects: productionRejects,
      qc_rejects: qcRejects,
      embarkation_issues: embarkationIssues,
      summary: {
        total_production_reject: productionRejects.reduce((sum, r) => sum + r.reject_qty, 0),
        total_qc_reject: qcRejects.reduce((sum, r) => sum + r.reject_qty, 0),
        total_qc_rework: qcRejects.reduce((sum, r) => sum + r.rework_qty, 0),
        total_embarkation_issues: embarkationIssues.reduce((sum, r) => sum + r.quantity, 0),
      },
    });
  }

  // 6. DEFAULT RPC DETAIL (PRODUCTION, HISTORY, MATERIAL, dll)
  const detailSections = new Set(["PRODUCTION", "MATERIAL", "WORKFORCE", "FINANCE", "ATTENTION", "HISTORY"]);
  if (!detailSections.has(section)) {
    return NextResponse.json({ error: "Section dashboard tidak valid." }, { status: 400 });
  }

  const projectId = asOptionalId(params.get("project"));
  const productId = asOptionalId(params.get("product"));
  // Naikkan limit agar semua item kerja produk bisa tampil sekaligus
  const limit = asBoundedInt(params.get("limit"), 500, 1, 500);
  const offset = asBoundedInt(params.get("offset"), 0, 0, 1000000);

  const { data, error } = await supabase.rpc("smpt_manager_dashboard_detail", {
    p_section: section,
    p_from: from,
    p_to: to,
    p_project_id: projectId,
    p_product_id: productId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    const status = error.code === "42501" ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data ?? { section, items: [] });
}
