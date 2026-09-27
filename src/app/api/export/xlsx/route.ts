import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildXlsx, type XlsxSheet } from "@/lib/export/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;
const MANAGER_PAGE_SIZE = 100;
const MAX_MANAGER_ROWS_PER_SECTION = 20000;

type SimpleReport = {
  title: string;
  sheet: string;
  permission: string;
  table: string;
  dateColumn?: string;
  timestampDate?: boolean;
  orderColumn: string;
  projectColumn?: string;
  productColumn?: string;
  materialColumn?: string;
  workerColumn?: string;
  statusColumn?: string;
  fixedEq?: Record<string, string | number | boolean>;
  fixedIlike?: Record<string, string>;
};

const SIMPLE_REPORTS: Record<string, SimpleReport> = {
  barang_masuk: { title: "Barang Masuk Gudang", sheet: "Barang Masuk", permission: "barang_masuk_gudang.view", table: "warehouse_receipts", dateColumn: "receipt_date", orderColumn: "id", materialColumn: "material_id", statusColumn: "status" },
  permintaan_produksi: { title: "Permintaan Produksi", sheet: "Permintaan", permission: "permintaan_produksi.view", table: "material_requests", dateColumn: "request_date", orderColumn: "id", projectColumn: "project_id", productColumn: "product_id", statusColumn: "status" },
  barang_keluar: { title: "Barang Keluar Gudang", sheet: "Barang Keluar", permission: "barang_keluar_gudang.view", table: "warehouse_issues", dateColumn: "issue_date", orderColumn: "id", projectColumn: "project_id", productColumn: "product_id", materialColumn: "material_id" },
  log_bahan: { title: "Log Bahan Baku", sheet: "Log Bahan", permission: "log_bahan.view", table: "stock_ledger_entries", dateColumn: "created_at", timestampDate: true, orderColumn: "id", projectColumn: "project_id", productColumn: "product_id", materialColumn: "material_id" },
  stok_gudang: { title: "Stok Gudang", sheet: "Stok Gudang", permission: "stok_gudang.view", table: "stock_balances", orderColumn: "id", projectColumn: "project_id", productColumn: "product_id", materialColumn: "material_id" },
  cutting: { title: "Hasil Cutting", sheet: "Cutting", permission: "cutting.view", table: "cutting_daily_results", dateColumn: "result_date", orderColumn: "id", projectColumn: "project_id", productColumn: "product_id", statusColumn: "status" },
  sablon: { title: "Riwayat WIP Sablon", sheet: "Sablon WIP", permission: "sablon.view", table: "stock_ledger_entries", dateColumn: "created_at", timestampDate: true, orderColumn: "id", projectColumn: "project_id", productColumn: "product_id", fixedEq: { item_kind: "CUTTING_COMPONENT" }, fixedIlike: { movement_kind: "%SABLON%" } },
  roll_lot: { title: "Stock Roll Lot", sheet: "Roll Lot", permission: "stok_gudang.view", table: "v_material_lot_status", orderColumn: "id", projectColumn: "current_project_id", productColumn: "current_product_id", materialColumn: "material_id", statusColumn: "status" },
  siap_produksi: { title: "Pemakaian Siap Produksi", sheet: "Siap Produksi", permission: "produksi.view", table: "ready_production_usages", dateColumn: "usage_date", orderColumn: "id", projectColumn: "project_id", productColumn: "product_id", materialColumn: "material_id" },
  spk: { title: "SPK Produksi", sheet: "SPK", permission: "spk.view", table: "production_orders", dateColumn: "order_date", orderColumn: "id", projectColumn: "project_id", productColumn: "product_id", workerColumn: "operator_worker_id", statusColumn: "status" },
  checker: { title: "Hasil Checker", sheet: "Checker", permission: "borongan.view", table: "production_checks", dateColumn: "check_date", orderColumn: "id", statusColumn: "status" },
  hasil_produksi: { title: "Hasil Produksi Equivalent", sheet: "Hasil Produksi", permission: "hasil_produksi.view", table: "v_work_item_equivalent_progress", orderColumn: "work_item_id", projectColumn: "project_id", productColumn: "product_id" },
  qc: { title: "Quality Control", sheet: "QC", permission: "qc.view", table: "qc_inspections", dateColumn: "inspection_date", orderColumn: "id", statusColumn: "status" },
  stok_barang_jadi: { title: "Stok Barang Jadi", sheet: "Barang Jadi", permission: "stok_barang_jadi.view", table: "v_finished_stock", orderColumn: "finished_good_id", fixedEq: { item_kind: "FINISHED_GOOD" } },
  barang_luar: { title: "Barang Luar", sheet: "Barang Luar", permission: "barang_luar.view", table: "external_finished_receipts", dateColumn: "receipt_date", orderColumn: "id", statusColumn: "status" },
  transfer_barang_jadi: { title: "Transfer Barang Jadi", sheet: "Transfer BJ", permission: "transfer_barang_jadi.view", table: "finished_goods_transfers", dateColumn: "transfer_date", orderColumn: "id", statusColumn: "status" },
  stok_set: { title: "Stok Set", sheet: "Stok Set", permission: "stok_set.view", table: "logistics_stock_balances", orderColumn: "id", fixedEq: { item_kind: "SET" } },
  packing_set: { title: "Packing Set", sheet: "Packing Set", permission: "packing_set.view", table: "packing_runs", dateColumn: "packing_date", orderColumn: "id", statusColumn: "status" },
  pengiriman: { title: "Pengiriman Embarkasi", sheet: "Pengiriman", permission: "pengiriman_embarkasi.view", table: "embarkation_shipments", dateColumn: "shipment_date", orderColumn: "id", statusColumn: "status" },
  target_embarkasi: { title: "Target Embarkasi", sheet: "Target Embarkasi", permission: "target_embarkasi.view", table: "embarkation_targets", orderColumn: "id", statusColumn: "status" },
  reject_embarkasi: { title: "Reject Masalah Embarkasi", sheet: "Masalah Embarkasi", permission: "reject_embarkasi.view", table: "embarkation_issues", dateColumn: "created_at", timestampDate: true, orderColumn: "id", statusColumn: "status" },
  absensi: { title: "Absensi", sheet: "Absensi", permission: "absensi.view", table: "attendance_records", dateColumn: "attendance_date", orderColumn: "id", workerColumn: "worker_id", statusColumn: "verification_status" },
  payroll: { title: "Payroll Harian Bulanan", sheet: "Payroll", permission: "payroll.view", table: "payroll_runs", dateColumn: "period_start", orderColumn: "id", statusColumn: "status" },
  payroll_borongan: { title: "Payroll Borongan", sheet: "Payroll Borongan", permission: "payroll.view", table: "operator_payroll_runs", dateColumn: "period_start", orderColumn: "id", statusColumn: "status" },
  kasbon: { title: "Kasbon", sheet: "Kasbon", permission: "kasbon.view", table: "cash_advances", dateColumn: "advance_date", orderColumn: "id", workerColumn: "worker_id", statusColumn: "status" },
  kas_kecil: { title: "Kas Kecil", sheet: "Kas Kecil", permission: "kas_kecil.view", table: "petty_cash_transactions", dateColumn: "transaction_date", orderColumn: "id", statusColumn: "status" },
  keuangan: { title: "Keuangan", sheet: "Keuangan", permission: "keuangan.view", table: "finance_transactions", dateColumn: "transaction_date", orderColumn: "id", statusColumn: "status" },
  manufaktur: { title: "Manufaktur", sheet: "Manufaktur", permission: "manufaktur.view", table: "manufacturing_transactions", dateColumn: "transaction_date", orderColumn: "id", projectColumn: "project_id", productColumn: "product_id", materialColumn: "material_id", statusColumn: "status" },
  procurement_plan: { title: "Purchase Planning", sheet: "Purchase Planning", permission: "procurement.export", table: "v_procurement_plan_lines", dateColumn: "plan_date", orderColumn: "id", projectColumn: "project_id", productColumn: "product_id", materialColumn: "material_id", statusColumn: "plan_status" },
  purchase_orders: { title: "Purchase Orders", sheet: "Purchase Orders", permission: "procurement.export", table: "v_purchase_orders", dateColumn: "order_date", orderColumn: "id", statusColumn: "status" },
  purchase_order_lines: { title: "Purchase Order Lines", sheet: "PO Lines", permission: "procurement.export", table: "purchase_order_lines", orderColumn: "id", materialColumn: "material_id", statusColumn: "status" },
  audit: { title: "Audit Sistem", sheet: "Audit", permission: "laporan.view", table: "audit_events", dateColumn: "occurred_at", timestampDate: true, orderColumn: "id" },
};

function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function validDate(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}
function positiveId(value: string | null): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function safeStatus(value: string | null): string | null {
  const v = String(value ?? "").trim();
  return v && v.length <= 50 ? v : null;
}
function fileSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "export";
}
function label(key: string): string {
  const aliases: Record<string, string> = {
    id: "ID", project_id: "Project ID", product_id: "Produk ID", material_id: "Material ID", worker_id: "Pekerja ID",
    created_at: "Dibuat Pada", updated_at: "Diubah Pada", created_by: "Dibuat Oleh", updated_by: "Diubah Oleh",
    qty_sah: "Qty Sah", equivalent_product: "Equivalent Product", progress_percent: "Progress %",
    target_production: "Target Produk", target_item_qty: "Target Item", remaining_equivalent: "Sisa Equivalent", over_equivalent: "Over Equivalent",
  };
  if (aliases[key]) return aliases[key];
  return key.split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
}
function columnsFromRows(rows: Array<Record<string, unknown>>) {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, 100)) {
    for (const key of Object.keys(row)) if (!seen.has(key)) { seen.add(key); keys.push(key); }
  }
  return (keys.length ? keys : ["info"]).map((key) => ({ key, label: label(key) }));
}
function metaSheet(title: string, from: string, to: string, params: URLSearchParams, rowCount: number): XlsxSheet {
  const wsRaw = String(params.get("ws") ?? "").trim().toUpperCase();
  const wsLabel = wsRaw === "HAJI" ? "Haji" : wsRaw === "REGULER" ? "Reguler" : "Semua";
  return {
    name: "Info Export",
    columns: [{ key: "field", label: "Keterangan" }, { key: "value", label: "Nilai" }],
    rows: [
      { field: "Laporan", value: title },
      { field: "Periode", value: `${from} s/d ${to}` },
      { field: "Workspace", value: wsLabel },
      { field: "Project ID", value: params.get("project") || params.get("project_id") || "Semua" },
      { field: "Produk ID", value: params.get("product") || "Semua" },
      { field: "Material ID", value: params.get("material") || "Semua" },
      { field: "Pekerja ID", value: params.get("worker") || "Semua" },
      { field: "Status", value: params.get("status") || "Semua" },
      { field: "Jumlah baris", value: rowCount },
      { field: "Generated", value: new Date().toISOString() },
    ],
  };
}

async function accessContext(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: userData, error: userError }, roleResult, permissionResult] = await Promise.all([
    supabase.auth.getUser(), supabase.rpc("current_user_role"), supabase.rpc("current_user_permissions"),
  ]);
  if (userError || !userData.user) return null;
  if (roleResult.error || permissionResult.error) throw new Error(roleResult.error?.message || permissionResult.error?.message || "Akses gagal dibaca.");
  const permissions = new Set(((permissionResult.data ?? []) as Array<{ permission_code?: string }>).map((x) => String(x.permission_code ?? "").trim()).filter(Boolean));
  return { role: String(roleResult.data ?? "").toUpperCase(), permissions };
}

async function loadSimpleReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  report: SimpleReport,
  params: URLSearchParams,
  from: string,
  to: string,
): Promise<Array<Record<string, unknown>>> {
  const project = positiveId(params.get("project") || params.get("project_id"));
  const product = positiveId(params.get("product"));
  const material = positiveId(params.get("material"));
  const worker = positiveId(params.get("worker"));
  const status = safeStatus(params.get("status"));

  // workspace filter: hanya berlaku jika tabel punya projectColumn
  const wsRaw = String(params.get("ws") ?? "").trim().toUpperCase();
  const ws = wsRaw === "HAJI" ? "HAJI" : wsRaw === "REGULER" ? "REGULER" : null;

  // Jika ada filter workspace dan tabel punya projectColumn, fetch project IDs dulu
  let wsProjectIds: number[] | null = null;
  if (ws && report.projectColumn) {
    const { data: projData } = await (supabase as any)
      .from("projects")
      .select("id, product_category, name, project_code")
      .limit(2000);
    if (projData) {
      wsProjectIds = (projData as Array<{ id: number; product_category?: string | null; name?: string; project_code?: string }>)
        .filter((p) => {
          const cat = String(p.product_category ?? "").trim().toUpperCase();
          if (cat === ws) return true;
          if (!cat) {
            const txt = `${p.name ?? ""} ${p.project_code ?? ""}`.toLowerCase();
            if (ws === "HAJI") return txt.includes("haji") || txt.includes("embarkasi") || txt.includes("hajj") || txt.includes("kemenag");
            return true; // REGULER adalah fallback
          }
          return false;
        })
        .map((p) => p.id);
      // Jika tidak ada proyek cocok, kembalikan kosong
      if (wsProjectIds.length === 0) return [];
    }
  }

  const all: Array<Record<string, unknown>> = [];

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let query: any = (supabase as any).from(report.table).select("*").order(report.orderColumn, { ascending: false }).range(offset, Math.min(offset + PAGE_SIZE - 1, MAX_ROWS - 1));
    if (report.dateColumn) {
      if (report.timestampDate) {
        query = query.gte(report.dateColumn, `${from}T00:00:00+07:00`).lte(report.dateColumn, `${to}T23:59:59.999+07:00`);
      } else {
        query = query.gte(report.dateColumn, from).lte(report.dateColumn, to);
      }
    }
    if (project && report.projectColumn) query = query.eq(report.projectColumn, project);
    else if (wsProjectIds && report.projectColumn) query = query.in(report.projectColumn, wsProjectIds);
    if (product && report.productColumn) query = query.eq(report.productColumn, product);
    if (material && report.materialColumn) query = query.eq(report.materialColumn, material);
    if (worker && report.workerColumn) query = query.eq(report.workerColumn, worker);
    if (status && report.statusColumn) query = query.eq(report.statusColumn, status);
    for (const [column, value] of Object.entries(report.fixedEq ?? {})) query = query.eq(column, value);
    for (const [column, value] of Object.entries(report.fixedIlike ?? {})) query = query.ilike(column, value);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as Array<Record<string, unknown>>;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return all;
}

const MANAGER_SECTIONS = ["PRODUCTION", "MATERIAL", "WORKFORCE", "FINANCE", "ATTENTION", "HISTORY"] as const;
async function loadManagerSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  section: string,
  from: string,
  to: string,
  project: number | null,
  product: number | null,
) {
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < MAX_MANAGER_ROWS_PER_SECTION; offset += MANAGER_PAGE_SIZE) {
    const { data, error } = await supabase.rpc("smpt_manager_dashboard_detail", {
      p_section: section,
      p_from: from,
      p_to: to,
      p_project_id: project,
      p_product_id: product,
      p_limit: MANAGER_PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw error;
    const items = Array.isArray((data as { items?: unknown[] } | null)?.items) ? ((data as { items: Array<Record<string, unknown>> }).items) : [];
    rows.push(...items);
    if (items.length < MANAGER_PAGE_SIZE) break;
  }
  return rows;
}

async function managerWorkbook(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: URLSearchParams,
  from: string,
  to: string,
  onlySection?: string,
): Promise<XlsxSheet[]> {
  const project = positiveId(params.get("project"));
  const product = positiveId(params.get("product"));
  const { data: summary, error: summaryError } = await supabase.rpc("smpt_manager_dashboard_summary", { p_from: from, p_to: to });
  if (summaryError) throw summaryError;
  const summaryRows: Array<Record<string, unknown>> = [];
  const walk = (value: unknown, prefix = "") => {
    if (Array.isArray(value)) { summaryRows.push({ metric: prefix || "data", value: JSON.stringify(value) }); return; }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) walk(child, prefix ? `${prefix}.${key}` : key);
      return;
    }
    summaryRows.push({ metric: prefix || "value", value: value ?? "" });
  };
  walk(summary ?? {});
  const sheets: XlsxSheet[] = [{ name: "Ringkasan", columns: [{ key: "metric", label: "Metric" }, { key: "value", label: "Nilai" }], rows: summaryRows.length ? summaryRows : [{ metric: "info", value: "Tidak ada ringkasan." }] }];
  const sections = onlySection ? [onlySection.toUpperCase()] : [...MANAGER_SECTIONS];
  for (const section of sections) {
    if (!MANAGER_SECTIONS.includes(section as (typeof MANAGER_SECTIONS)[number])) throw new Error("Section Manager tidak valid.");
    const rows = await loadManagerSection(supabase, section, from, to, project, product);
    sheets.push({ name: section[0] + section.slice(1).toLowerCase(), columns: columnsFromRows(rows), rows: rows.length ? rows : [{ info: "Tidak ada data untuk filter ini." }] });
  }
  return sheets;
}

async function laporanWorkbook(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: URLSearchParams,
  from: string,
  to: string,
): Promise<XlsxSheet[]> {
  const [production, stock, finance, audit] = await Promise.all([
    loadSimpleReport(supabase, { title: "Progress Produksi", sheet: "Progress Produksi", permission: "laporan.view", table: "v_production_progress", orderColumn: "order_id" }, params, from, to),
    loadSimpleReport(supabase, { title: "Stok Barang Jadi", sheet: "Stok Barang Jadi", permission: "laporan.view", table: "v_finished_stock", orderColumn: "finished_good_id", fixedEq: { item_kind: "FINISHED_GOOD" } }, params, from, to),
    loadSimpleReport(supabase, { title: "Aktivitas Keuangan", sheet: "Keuangan", permission: "laporan.view", table: "v_finance_activity", dateColumn: "transaction_date", orderColumn: "transaction_date" }, params, from, to),
    loadSimpleReport(supabase, SIMPLE_REPORTS.audit, params, from, to),
  ]);
  return [
    metaSheet("Laporan Lintas Modul", from, to, params, production.length + stock.length + finance.length + audit.length),
    { name: "Progress Produksi", columns: columnsFromRows(production), rows: production.length ? production : [{ info: "Tidak ada data." }] },
    { name: "Stok Barang Jadi", columns: columnsFromRows(stock), rows: stock.length ? stock : [{ info: "Tidak ada data." }] },
    { name: "Keuangan", columns: columnsFromRows(finance), rows: finance.length ? finance : [{ info: "Tidak ada data." }] },
    { name: "Audit", columns: columnsFromRows(audit), rows: audit.length ? audit : [{ info: "Tidak ada data." }] },
  ];
}

async function payrollSlipsWorkbook(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: URLSearchParams
): Promise<{ sheets: XlsxSheet[]; filename: string }> {
  const runId = positiveId(params.get("run_id"));

  let runQuery = supabase.from("payroll_runs").select("*");
  if (runId) {
    runQuery = runQuery.eq("id", runId);
  } else {
    runQuery = runQuery.order("id", { ascending: false }).limit(1);
  }

  const { data: runData, error: runError } = await runQuery.single();
  if (runError || !runData) {
    throw new Error("Data Payroll Run tidak ditemukan.");
  }
  const run = runData as {
    id: number;
    payroll_code: string;
    payroll_type: string;
    period_start: string;
    period_end: string;
    status: string;
    total_gross: number;
    total_deduction: number;
    total_net: number;
    notes?: string | null;
    config_snapshot?: any;
  };

  const cfg = run.config_snapshot || {};
  const isPaid = cfg.payment_status === "SUDAH_DIBAYAR" || run.status === "PAID";
  const runPaymentStatus = isPaid ? "SUDAH DIBAYAR" : "BELUM DIBAYAR";

  const [itemsRes, workersRes] = await Promise.all([
    supabase
      .from("payroll_run_items")
      .select("*")
      .eq("payroll_run_id", run.id)
      .order("id", { ascending: true }),
    supabase
      .from("workers")
      .select("id, worker_code, name, department, position, identity_no, phone, pay_system"),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  const items = itemsRes.data ?? [];
  const workerMap = new Map((workersRes.data ?? []).map((w: any) => [w.id, w]));

  const columns = [
    { key: "no", label: "No" },
    { key: "worker_code", label: "Kode Pekerja" },
    { key: "worker_name", label: "Nama Pekerja" },
    { key: "department", label: "Bagian / Dept" },
    { key: "position", label: "Jabatan" },
    { key: "pay_system", label: "Sistem Upah" },
    { key: "identity_no", label: "NIK / KTP" },
    { key: "phone", label: "No. HP / WA" },
    { key: "full_days", label: "Hadir Full (Hari)" },
    { key: "half_days", label: "Hadir Half (Hari)" },
    { key: "ot_hours", label: "Jam Lembur Sistem" },
    { key: "manual_ot_hours", label: "Jam Lembur Manual" },
    { key: "total_ot_hours", label: "Total Jam Lembur" },
    { key: "base_amount", label: "Gaji / Upah Pokok (Rp)" },
    { key: "meal_amount", label: "Uang Makan Minggu (Rp)" },
    { key: "overtime_amount", label: "Upah Lembur Sistem (Rp)" },
    { key: "manual_overtime_amount", label: "Upah Lembur Manual (Rp)" },
    { key: "overtime_bonus", label: "Bonus Lembur 4H (Rp)" },
    { key: "holiday_bonus", label: "Tambahan Minggu (Rp)" },
    { key: "gross_amount", label: "Total Bruto (Rp)" },
    { key: "kasbon_perusahaan", label: "Kasbon Kantor (Rp)" },
    { key: "kasbon_warung", label: "Kasbon Warung (Rp)" },
    { key: "deduction_amount", label: "Total Potongan (Rp)" },
    { key: "net_amount", label: "Gaji Bersih / Net (Rp)" },
    { key: "payment_status", label: "Status Pembayaran" },
  ];

  let sumFull = 0;
  let sumHalf = 0;
  let sumOtHours = 0;
  let sumManualOtHours = 0;
  let sumTotalOtHours = 0;
  let sumBase = 0;
  let sumMeal = 0;
  let sumOtAmount = 0;
  let sumManualOtAmount = 0;
  let sumOtBonus = 0;
  let sumHolidayBonus = 0;
  let sumGross = 0;
  let sumKasbonP = 0;
  let sumKasbonW = 0;
  let sumDeduction = 0;
  let sumNet = 0;

  const rows: Array<Record<string, unknown>> = items.map((item: any, idx: number) => {
    const w = workerMap.get(item.worker_id);
    const full = Number(item.full_days || 0);
    const half = Number(item.half_days || 0);
    const otMin = Number(item.overtime_minutes || 0);
    const otHours = Math.round((otMin / 60) * 10) / 10;
    const manualOtHours = Number(item.manual_overtime_hours || 0);
    const totalOtHours = Math.round((otHours + manualOtHours) * 10) / 10;

    const base = Number(item.base_amount || 0);
    const meal = Number(item.meal_amount || 0);
    const otAmount = Number(item.overtime_amount || 0);
    const manualOtAmount = Number(item.manual_overtime_amount || 0);
    const otBonus = Number(item.overtime_bonus || 0);
    const holidayBonus = Number(item.holiday_bonus || 0) + Number(item.holiday_manual_amount || 0);
    const gross = Math.round((base + meal + otAmount + manualOtAmount + otBonus + holidayBonus) * 100) / 100;

    const kasbonP = Number(item.kasbon_perusahaan_amount || 0);
    const kasbonW = Number(item.kasbon_warung_amount || 0);
    const deduction = Number(item.deduction_amount || (kasbonP + kasbonW));
    const net = Number(item.net_amount || Math.max(0, gross - deduction));

    sumFull += full;
    sumHalf += half;
    sumOtHours += otHours;
    sumManualOtHours += manualOtHours;
    sumTotalOtHours += totalOtHours;
    sumBase += base;
    sumMeal += meal;
    sumOtAmount += otAmount;
    sumManualOtAmount += manualOtAmount;
    sumOtBonus += otBonus;
    sumHolidayBonus += holidayBonus;
    sumGross += gross;
    sumKasbonP += kasbonP;
    sumKasbonW += kasbonW;
    sumDeduction += deduction;
    sumNet += net;

    return {
      no: idx + 1,
      worker_code: w?.worker_code || `PKR-${item.worker_id}`,
      worker_name: item.worker_name_snapshot,
      department: w?.department || "-",
      position: w?.position || "-",
      pay_system: item.pay_system_snapshot,
      identity_no: w?.identity_no || "-",
      phone: w?.phone || "-",
      full_days: full,
      half_days: half,
      ot_hours: otHours,
      manual_ot_hours: manualOtHours,
      total_ot_hours: totalOtHours,
      base_amount: base,
      meal_amount: meal,
      overtime_amount: otAmount,
      manual_overtime_amount: manualOtAmount,
      overtime_bonus: otBonus,
      holiday_bonus: holidayBonus,
      gross_amount: gross,
      kasbon_perusahaan: kasbonP,
      kasbon_warung: kasbonW,
      deduction_amount: deduction,
      net_amount: net,
      payment_status: runPaymentStatus,
    };
  });

  // Tambahkan baris total rekap di akhir sheet 1
  rows.push({
    no: "TOTAL",
    worker_code: "",
    worker_name: `${items.length} Pekerja`,
    department: "",
    position: "",
    pay_system: "",
    identity_no: "",
    phone: "",
    full_days: sumFull,
    half_days: sumHalf,
    ot_hours: Math.round(sumOtHours * 10) / 10,
    manual_ot_hours: Math.round(sumManualOtHours * 10) / 10,
    total_ot_hours: Math.round(sumTotalOtHours * 10) / 10,
    base_amount: Math.round(sumBase * 100) / 100,
    meal_amount: Math.round(sumMeal * 100) / 100,
    overtime_amount: Math.round(sumOtAmount * 100) / 100,
    manual_overtime_amount: Math.round(sumManualOtAmount * 100) / 100,
    overtime_bonus: Math.round(sumOtBonus * 100) / 100,
    holiday_bonus: Math.round(sumHolidayBonus * 100) / 100,
    gross_amount: Math.round(sumGross * 100) / 100,
    kasbon_perusahaan: Math.round(sumKasbonP * 100) / 100,
    kasbon_warung: Math.round(sumKasbonW * 100) / 100,
    deduction_amount: Math.round(sumDeduction * 100) / 100,
    net_amount: Math.round(sumNet * 100) / 100,
    payment_status: runPaymentStatus,
  });

  const summarySheet: XlsxSheet = {
    name: "Ringkasan Payroll",
    columns: [
      { key: "field", label: "Parameter" },
      { key: "value", label: "Nilai" },
    ],
    rows: [
      { field: "Kode Payroll", value: run.payroll_code },
      { field: "Jenis Payroll", value: run.payroll_type === "MINGGUAN" ? "Karyawan Harian (Mingguan)" : "Karyawan Bulanan" },
      { field: "Periode Mulai", value: run.period_start },
      { field: "Periode Selesai", value: run.period_end },
      { field: "Status Payout", value: run.status },
      { field: "Status Pembayaran", value: runPaymentStatus },
      { field: "Total Pekerja", value: items.length },
      { field: "Total Gaji / Upah Pokok", value: Math.round(sumBase * 100) / 100 },
      { field: "Total Uang Makan", value: Math.round(sumMeal * 100) / 100 },
      { field: "Total Upah Lembur (Sistem + Manual)", value: Math.round((sumOtAmount + sumManualOtAmount) * 100) / 100 },
      { field: "Total Bonus Lembur 4H", value: Math.round(sumOtBonus * 100) / 100 },
      { field: "Total Insentif Minggu", value: Math.round(sumHolidayBonus * 100) / 100 },
      { field: "TOTAL PENDAPATAN BRUTO", value: Math.round(sumGross * 100) / 100 },
      { field: "Total Potongan Kasbon Perusahaan", value: Math.round(sumKasbonP * 100) / 100 },
      { field: "Total Potongan Kasbon Warung", value: Math.round(sumKasbonW * 100) / 100 },
      { field: "TOTAL SELURUH POTONGAN", value: Math.round(sumDeduction * 100) / 100 },
      { field: "TOTAL GAJI BERSIH (NET DIBAYARKAN)", value: Math.round(sumNet * 100) / 100 },
      { field: "Catatan", value: run.notes || "-" },
      { field: "Waktu Export", value: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) },
    ],
  };

  const mainSheet: XlsxSheet = {
    name: "Rekap Slip Gaji",
    columns,
    rows,
  };

  const filename = `SMPT-Slip-Gaji-${run.payroll_code}-${run.payroll_type}-${run.period_start}-${run.period_end}.xlsx`;

  return {
    sheets: [mainSheet, summarySheet],
    filename,
  };
}

async function operatorPayrollSlipsWorkbook(
  supabase: any,
  params: URLSearchParams,
): Promise<{ sheets: XlsxSheet[]; filename: string }> {
  const runId = positiveId(params.get("run_id"));

  let runQuery = supabase.from("operator_payroll_runs").select("*");
  if (runId) {
    runQuery = runQuery.eq("id", runId);
  } else {
    runQuery = runQuery.order("id", { ascending: false }).limit(1);
  }

  const { data: runData, error: runError } = await runQuery;
  if (runError || !runData || runData.length === 0) {
    throw new Error("Data Payroll Operator tidak ditemukan.");
  }
  const run = runData[0];

  const [itemsRes, workersRes] = await Promise.all([
    supabase
      .from("operator_payroll_items")
      .select("*")
      .eq("run_id", run.id)
      .order("id", { ascending: true }),
    supabase
      .from("workers")
      .select("id, worker_code, name, department, position, identity_no, phone, pay_system"),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  const items = itemsRes.data ?? [];
  const workerMap = new Map<number, any>((workersRes.data ?? []).map((w: any) => [w.id, w]));

  const notesStr = String(run.notes || "");
  const isPaid = /\[STATUS:\s*SUDAH_DIBAYAR\]/i.test(notesStr) || run.status === "PAID";
  const paymentStatus = isPaid ? "SUDAH DIBAYAR" : "BELUM DIBAYAR";

  const columns = [
    { key: "no", label: "No" },
    { key: "worker_code", label: "Kode Pekerja" },
    { key: "worker_name", label: "Nama Pekerja" },
    { key: "department", label: "Bagian / Dept" },
    { key: "pay_system", label: "Sistem Upah" },
    { key: "work_item_name", label: "Item Pekerjaan" },
    { key: "qty_approved", label: "Qty Sah (Approved)" },
    { key: "operator_price", label: "Tarif Borongan (Rp)" },
    { key: "operator_value", label: "Total Upah Borongan (Rp)" },
    { key: "submission_price", label: "Tarif Pengajuan (Rp)" },
    { key: "submission_value", label: "Nilai Pengajuan (Rp)" },
    { key: "payment_status", label: "Status Pembayaran" },
  ];

  let sumQty = 0;
  let sumOpVal = 0;
  let sumSubVal = 0;

  const rows: Array<Record<string, unknown>> = items.map((item: any, idx: number) => {
    const w = workerMap.get(item.worker_id);
    const qty = Number(item.qty_approved || 0);
    const opPrice = Number(item.operator_price_snapshot || 0);
    const opVal = Number(item.operator_value || (qty * opPrice));
    const subPrice = Number(item.submission_price_snapshot || 0);
    const subVal = Number(item.submission_value || (qty * subPrice));

    sumQty += qty;
    sumOpVal += opVal;
    sumSubVal += subVal;

    return {
      no: idx + 1,
      worker_code: w?.worker_code || `PKR-${item.worker_id}`,
      worker_name: item.worker_name_snapshot,
      department: w?.department || "PRODUKSI",
      pay_system: "BORONGAN",
      work_item_name: item.work_item_name_snapshot,
      qty_approved: qty,
      operator_price: opPrice,
      operator_value: opVal,
      submission_price: subPrice,
      submission_value: subVal,
      payment_status: paymentStatus,
    };
  });

  rows.push({
    no: "TOTAL",
    worker_code: "",
    worker_name: `${items.length} Item Pekerjaan`,
    department: "",
    pay_system: "",
    work_item_name: "",
    qty_approved: Math.round(sumQty * 100) / 100,
    operator_price: "",
    operator_value: Math.round(sumOpVal * 100) / 100,
    submission_price: "",
    submission_value: Math.round(sumSubVal * 100) / 100,
    payment_status: paymentStatus,
  });

  const summarySheet: XlsxSheet = {
    name: "Ringkasan Payroll Operator",
    columns: [
      { key: "field", label: "Parameter" },
      { key: "value", label: "Nilai" },
    ],
    rows: [
      { field: "Kode Payroll", value: run.payroll_code },
      { field: "Jenis Payroll", value: "Payroll Operator Borongan" },
      { field: "Periode Mulai", value: run.period_start },
      { field: "Periode Selesai", value: run.period_end },
      { field: "Status Run", value: run.status },
      { field: "Status Pembayaran", value: paymentStatus },
      { field: "Total Baris Pekerjaan", value: items.length },
      { field: "Total Qty Sah", value: Math.round(sumQty * 100) / 100 },
      { field: "TOTAL UPAH BORONGAN (OPERATOR)", value: Math.round(sumOpVal * 100) / 100 },
      { field: "TOTAL NILAI PENGAJUAN", value: Math.round(sumSubVal * 100) / 100 },
      { field: "Catatan", value: run.notes || "-" },
      { field: "Waktu Export", value: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) },
    ],
  };

  const mainSheet: XlsxSheet = {
    name: "Rekap Slip Borongan",
    columns,
    rows,
  };

  const filename = `SMPT-Slip-Borongan-${run.payroll_code}-${run.period_start}-${run.period_end}.xlsx`;

  return {
    sheets: [mainSheet, summarySheet],
    filename,
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const key = String(params.get("report") || "").trim().toLowerCase();
    const today = jakartaToday();
    const from = validDate(params.get("from"), today);
    const to = validDate(params.get("to"), today);
    if (to < from) return NextResponse.json({ error: "Periode export tidak valid." }, { status: 400 });

    const supabase = await createClient();
    const access = await accessContext(supabase);
    if (!access) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });

    let title = "SMPT Export";
    let sheets: XlsxSheet[];
    let customFilename: string | null = null;

    if (key === "payroll_slips" || key === "operator_payroll_slips") {
      if (!access.permissions.has("payroll.view") && !["MANAGER", "ADMIN"].includes(access.role)) {
        return NextResponse.json({ error: "Tidak punya akses melihat payroll." }, { status: 403 });
      }
      const isOperator = key === "operator_payroll_slips" || params.get("run_type") === "operator";
      const result = isOperator
        ? await operatorPayrollSlipsWorkbook(supabase, params)
        : await payrollSlipsWorkbook(supabase, params);
      sheets = result.sheets;
      customFilename = result.filename;
    } else if (key === "manager_dashboard" || key === "manager_section") {
      if (!["MANAGER", "ADMIN"].includes(access.role)) return NextResponse.json({ error: "Export Dashboard Manager hanya untuk MANAGER/ADMIN." }, { status: 403 });
      title = key === "manager_section" ? `Manager ${String(params.get("section") || "Detail")}` : "Manager Dashboard";
      sheets = await managerWorkbook(supabase, params, from, to, key === "manager_section" ? String(params.get("section") || "") : undefined);
    } else if (key === "laporan") {
      if (!access.permissions.has("laporan.view")) return NextResponse.json({ error: "Tidak punya akses laporan." }, { status: 403 });
      title = "Laporan SMPT";
      sheets = await laporanWorkbook(supabase, params, from, to);
    } else {
      const report = SIMPLE_REPORTS[key];
      if (!report) return NextResponse.json({ error: "Jenis export tidak valid." }, { status: 400 });
      if (!access.permissions.has(report.permission)) return NextResponse.json({ error: "Tidak punya permission untuk export ini." }, { status: 403 });
      const rows = await loadSimpleReport(supabase, report, params, from, to);
      title = report.title;
      sheets = [metaSheet(report.title, from, to, params, rows.length), { name: report.sheet, columns: columnsFromRows(rows), rows: rows.length ? rows : [{ info: "Tidak ada data untuk filter ini." }] }];
    }

    const bytes = buildXlsx(sheets);
    const filename = customFilename || `SMPT-${fileSlug(title)}-${from}-${to}.xlsx`;
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export gagal dibuat.";
    const status = message.toLowerCase().includes("permission") || message.toLowerCase().includes("hanya untuk") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
