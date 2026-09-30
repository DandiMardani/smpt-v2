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

function formatIndoDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatBulanTahun(dateStr?: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatRupiahCell(val: number | string): string {
  const n = Number(val) || 0;
  return `Rp ${n.toLocaleString("id-ID")}.00`;
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

  const wsRaw = String(params.get("ws") ?? "").trim().toUpperCase();
  const ws = wsRaw === "HAJI" ? "HAJI" : wsRaw === "REGULER" ? "REGULER" : null;

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
            return true;
          }
          return false;
        })
        .map((p) => p.id);
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

// -------------------------------------------------------------
// LAPORAN 1: BORONGAN OPERATOR FORMAT CV. SMPT (SARIAYU MOM & BABY)
// -------------------------------------------------------------
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
      .order("worker_id", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("workers")
      .select("id, worker_code, name, department, position, identity_no, phone, pay_system"),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  const items = itemsRes.data ?? [];
  const workerMap = new Map<number, any>((workersRes.data ?? []).map((w: any) => [w.id, w]));

  let projectName = "SARIAYU MOM & BABY";
  if (run.notes && !run.notes.includes("[STATUS:")) {
    projectName = run.notes.split("\n")[0].trim().toUpperCase() || projectName;
  }

  const columns = [
    { key: "kode_op", label: "KODE OP", width: 14 },
    { key: "kode", label: "KODE", width: 12 },
    { key: "nama", label: "Nama", width: 22 },
    { key: "bagian", label: "BAGIAN", width: 16 },
    { key: "item_pekerjaan", label: "ITEM PEKERJAAN", width: 34 },
    { key: "harga", label: "HARGA", width: 16 },
    { key: "hasil", label: "HASIL", width: 12 },
    { key: "jumlah", label: "JUMLAH", width: 18 },
    { key: "total", label: "TOTAL", width: 20 },
  ];

  const groupedByWorker = new Map<number, Array<any>>();
  items.forEach((it: any) => {
    const list = groupedByWorker.get(it.worker_id) || [];
    list.push(it);
    groupedByWorker.set(it.worker_id, list);
  });

  const rows: Array<Record<string, any>> = [];
  let grandTotal = 0;
  let opSeq = 1;

  groupedByWorker.forEach((workerItems, wId) => {
    const w = workerMap.get(wId);
    const workerTotal = workerItems.reduce((acc, it) => {
      const q = Number(it.qty_approved || 0);
      const pr = Number(it.operator_price_snapshot || 0);
      return acc + (Number(it.operator_value) || (q * pr));
    }, 0);
    grandTotal += workerTotal;

    const opCode = w?.worker_code ? (w.worker_code.startsWith("OP") ? w.worker_code : `OP${String(opSeq).padStart(3, "0")}`) : `OP${String(opSeq).padStart(3, "0")}`;
    const workerName = (w?.name || workerItems[0]?.worker_name_snapshot || "-").toUpperCase();
    const department = (w?.department || w?.position || "OPERATOR").toUpperCase();

    workerItems.forEach((it: any, index: number) => {
      const q = Number(it.qty_approved || 0);
      const pr = Number(it.operator_price_snapshot || 0);
      const subtotal = Number(it.operator_value) || (q * pr);
      const workCode = it.work_item_code_snapshot || `T${String(it.work_item_id || it.id).padStart(3, "0")}`;

      rows.push({
        kode_op: index === 0 ? opCode : "",
        kode: workCode,
        nama: index === 0 ? workerName : "",
        bagian: index === 0 ? department : "",
        item_pekerjaan: String(it.work_item_name_snapshot || "-").toUpperCase(),
        harga: formatRupiahCell(pr),
        hasil: q.toLocaleString("id-ID"),
        jumlah: formatRupiahCell(subtotal),
        total: index === 0 ? formatRupiahCell(workerTotal) : "",
      });
    });

    opSeq += 1;
  });

  rows.push({
    kode_op: "",
    kode: "",
    nama: "",
    bagian: "",
    item_pekerjaan: "",
    harga: "",
    hasil: "",
    jumlah: "TOTAL :",
    total: formatRupiahCell(grandTotal),
  });

  const signDate = formatIndoDate(run.period_end || jakartaToday());
  rows.push({ kode_op: "", kode: "", nama: "", bagian: "", item_pekerjaan: "", harga: "", hasil: "", jumlah: "", total: "" });
  rows.push({ kode_op: "", kode: "", nama: "", bagian: "", item_pekerjaan: "", harga: "", hasil: "", jumlah: "", total: `Tangerang Selatan, ${signDate}` });
  rows.push({ kode_op: "", kode: "Disetujui,", nama: "", bagian: "", item_pekerjaan: "", harga: "", hasil: "", jumlah: "Yang Mengajukan,", total: "" });
  rows.push({ kode_op: "", kode: "", nama: "", bagian: "", item_pekerjaan: "", harga: "", hasil: "", jumlah: "", total: "" });
  rows.push({ kode_op: "", kode: "", nama: "", bagian: "", item_pekerjaan: "", harga: "", hasil: "", jumlah: "", total: "" });
  rows.push({ kode_op: "", kode: "Bony Daty", nama: "", bagian: "", item_pekerjaan: "", harga: "", hasil: "", jumlah: "Dandi Mardani", total: "" });

  const mainSheet: XlsxSheet = {
    name: "Pengajuan Borongan",
    columns,
    rows,
    headerColor: "1E293B",
  };

  const filename = `SMPT-Pengajuan-Borongan-${fileSlug(projectName)}-${run.period_start}-${run.period_end}.xlsx`;
  return { sheets: [mainSheet], filename };
}

// -------------------------------------------------------------
// LAPORAN 2: DAFTAR GAJI KARYAWAN PT. KREASI DINAMIKA MAJU BERSAMA
// -------------------------------------------------------------
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
  const run = runData as any;

  const [itemsRes, workersRes] = await Promise.all([
    supabase
      .from("payroll_run_items")
      .select("*")
      .eq("payroll_run_id", run.id)
      .order("id", { ascending: true }),
    supabase
      .from("workers")
      .select("id, worker_code, name, department, position, identity_no, phone, pay_system, monthly_salary, daily_salary"),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  const items = itemsRes.data ?? [];
  const workerMap = new Map((workersRes.data ?? []).map((w: any) => [w.id, w]));

  const periodMonthStr = formatBulanTahun(run.period_start || run.period_end);

  const columns = [
    { key: "no", label: "No", width: 6 },
    { key: "nik", label: "NIK", width: 12 },
    { key: "nama", label: "Nama Karyawan", width: 22 },
    { key: "jabatan", label: "Jabatan", width: 18 },
    { key: "kehadiran", label: "KEHADIRAN", width: 14 },
    { key: "gaji_pokok", label: "Gaji Pokok", width: 18 },
    { key: "lemburan_per_jam", label: "Lemburan / Jam", width: 18 },
    { key: "jam_lembur", label: "Jam Lembur", width: 12 },
    { key: "lembur_uang_makan", label: "Lembur Uang Makan", width: 18 },
    { key: "total_lembur", label: "Total Lembur", width: 18 },
    { key: "gaji_bersih", label: "Gaji Bersih (Bulan ini)", width: 22 },
  ];

  let sumGajiPokok = 0;
  let sumTotalLembur = 0;
  let sumGajiBersih = 0;

  const rows: Array<Record<string, any>> = items.map((it: any, idx: number) => {
    const w = workerMap.get(it.worker_id);
    const full = Number(it.full_days || 0);
    const half = Number(it.half_days || 0);
    const kehadiran = full + (half * 0.5);

    const baseAmount = Number(it.base_amount || 0);
    const otMin = Number(it.overtime_minutes || 0);
    const otHours = Math.round((otMin / 60) * 10) / 10;
    const manualOtHours = Number(it.manual_overtime_hours || 0);
    const totalOtHours = otHours + manualOtHours;

    const hourlyRate = baseAmount > 0 ? Math.round((baseAmount / 190) * 100) / 100 : 0;
    const otAmount = Number(it.overtime_amount || 0) + Number(it.manual_overtime_amount || 0);
    const mealLembur = Number(it.overtime_bonus || 0);
    const totalLembur = otAmount + mealLembur;
    const netGaji = Number(it.net_amount || 0);

    sumGajiPokok += baseAmount;
    sumTotalLembur += totalLembur;
    sumGajiBersih += netGaji;

    return {
      no: idx + 1,
      nik: w?.worker_code || `K0${idx + 1}`,
      nama: it.worker_name_snapshot,
      jabatan: (w?.position || w?.department || "STAF").toUpperCase(),
      kehadiran: kehadiran % 1 === 0 ? kehadiran : kehadiran.toFixed(1),
      gaji_pokok: formatRupiahCell(baseAmount),
      lemburan_per_jam: formatRupiahCell(hourlyRate),
      jam_lembur: totalOtHours,
      lembur_uang_makan: mealLembur > 0 ? formatRupiahCell(mealLembur) : "-",
      total_lembur: formatRupiahCell(totalLembur),
      gaji_bersih: formatRupiahCell(netGaji),
    };
  });

  rows.push({
    no: "",
    nik: "",
    nama: "TOTAL",
    jabatan: "",
    kehadiran: "",
    gaji_pokok: formatRupiahCell(sumGajiPokok),
    lemburan_per_jam: "",
    jam_lembur: "",
    lembur_uang_makan: "",
    total_lembur: formatRupiahCell(sumTotalLembur),
    gaji_bersih: formatRupiahCell(sumGajiBersih),
  });

  const signDate = formatIndoDate(run.period_end || jakartaToday());
  rows.push({ no: "", nik: "", nama: "", jabatan: "", kehadiran: "", gaji_pokok: "", lemburan_per_jam: "", jam_lembur: "", lembur_uang_makan: "", total_lembur: "", gaji_bersih: "" });
  rows.push({ no: "", nik: "", nama: "", jabatan: "", kehadiran: "", gaji_pokok: "", lemburan_per_jam: "", jam_lembur: "", lembur_uang_makan: "", total_lembur: "", gaji_bersih: `Tangerang Selatan, ${signDate}` });
  rows.push({ no: "", nik: "Disetujui,", nama: "", jabatan: "", kehadiran: "", gaji_pokok: "", lemburan_per_jam: "", jam_lembur: "", lembur_uang_makan: "Yang Mengajukan,", total_lembur: "", gaji_bersih: "" });
  rows.push({ no: "", nik: "", nama: "", jabatan: "", kehadiran: "", gaji_pokok: "", lemburan_per_jam: "", jam_lembur: "", lembur_uang_makan: "", total_lembur: "", gaji_bersih: "" });
  rows.push({ no: "", nik: "", nama: "", jabatan: "", kehadiran: "", gaji_pokok: "", lemburan_per_jam: "", jam_lembur: "", lembur_uang_makan: "", total_lembur: "", gaji_bersih: "" });
  rows.push({ no: "", nik: "Bony Daty", nama: "", jabatan: "", kehadiran: "", gaji_pokok: "", lemburan_per_jam: "", jam_lembur: "", lembur_uang_makan: "Dandi Mardani", total_lembur: "", gaji_bersih: "" });

  const mainSheet: XlsxSheet = {
    name: "Daftar Gaji",
    columns,
    rows,
    headerColor: "1E293B",
  };

  const filename = `Daftar-Gaji-Karyawan-${fileSlug(periodMonthStr)}-${run.payroll_code}.xlsx`;
  return { sheets: [mainSheet], filename };
}

// -------------------------------------------------------------
// LAPORAN 3: FORM PEMBAYARAN UANG MAKAN MINGGUAN (8 KOLOM)
// -------------------------------------------------------------
async function uangMakanWorkbook(
  supabase: any,
  params: URLSearchParams
): Promise<{ sheets: XlsxSheet[]; filename: string }> {
  const runId = positiveId(params.get("run_id"));

  let runQuery = supabase.from("payroll_runs").select("*");
  if (runId) {
    runQuery = runQuery.eq("id", runId);
  } else {
    runQuery = runQuery.order("id", { ascending: false }).limit(1);
  }

  const { data: runData } = await runQuery;
  const run = runData?.[0] || {};

  const [itemsRes, workersRes] = await Promise.all([
    supabase
      .from("payroll_run_items")
      .select("*")
      .eq("payroll_run_id", run.id || 0)
      .order("id", { ascending: true }),
    supabase.from("workers").select("id, worker_code, name, department, position, pay_system"),
  ]);

  const items = itemsRes.data ?? [];
  const workerMap = new Map((workersRes.data ?? []).map((w: any) => [w.id, w]));

  const columns = [
    { key: "no", label: "NO", width: 6 },
    { key: "nama", label: "NAMA", width: 22 },
    { key: "hari", label: "HARI", width: 10 },
    { key: "uang_makan", label: "UANG MAKAN", width: 18 },
    { key: "insentif", label: "INSENTIF", width: 18 },
    { key: "kasbon", label: "KASBON", width: 16 },
    { key: "total", label: "TOTAL", width: 20 },
    { key: "paraf", label: "PARAF", width: 10 },
  ];

  let grandTotal = 0;
  const rows: Array<Record<string, any>> = items.map((it: any, idx: number) => {
    const full = Number(it.full_days || 0);
    const half = Number(it.half_days || 0);
    const totalHari = full + (half * 0.5);

    const totalMakan = totalHari * 50000;
    grandTotal += totalMakan;

    return {
      no: idx + 1,
      nama: it.worker_name_snapshot,
      hari: totalHari % 1 === 0 ? totalHari : totalHari.toFixed(1),
      uang_makan: "Rp 35,000.00",
      insentif: "Rp 15,000.00",
      kasbon: "",
      total: formatRupiahCell(totalMakan),
      paraf: idx + 1,
    };
  });

  rows.push({
    no: "",
    nama: "",
    hari: "",
    uang_makan: "",
    insentif: "",
    kasbon: "",
    total: formatRupiahCell(grandTotal),
    paraf: "",
  });

  const signDate = formatIndoDate(run.period_end || jakartaToday());
  rows.push({ no: "", nama: "", hari: "", uang_makan: "", insentif: "", kasbon: "", total: "", paraf: "" });
  rows.push({ no: "", nama: "", hari: "", uang_makan: "", insentif: "", kasbon: "", total: `Tangerang Selatan, ${signDate}`, paraf: "" });
  rows.push({ no: "", nama: "", hari: "", uang_makan: "", insentif: "Disetujui,", kasbon: "", total: "Yang Mengajukan,", paraf: "" });
  rows.push({ no: "", nama: "", hari: "", uang_makan: "", insentif: "", kasbon: "", total: "", paraf: "" });
  rows.push({ no: "", nama: "", hari: "", uang_makan: "", insentif: "", kasbon: "", total: "", paraf: "" });
  rows.push({ no: "", nama: "", hari: "", uang_makan: "", insentif: "Bony Daty", kasbon: "", total: "Dandi Mardani", paraf: "" });

  return {
    sheets: [{ name: "Uang Makan", columns, rows, headerColor: "1E293B" }],
    filename: `Pembayaran-Uang-Makan-${run.period_start || "Mingguan"}-${run.period_end || ""}.xlsx`,
  };
}

// -------------------------------------------------------------
// LAPORAN 4: FORM PEMBAYARAN UPAH HARIAN (12 KOLOM)
// -------------------------------------------------------------
async function upahHarianWorkbook(
  supabase: any,
  params: URLSearchParams
): Promise<{ sheets: XlsxSheet[]; filename: string }> {
  const runId = positiveId(params.get("run_id"));

  let runQuery = supabase.from("payroll_runs").select("*");
  if (runId) {
    runQuery = runQuery.eq("id", runId);
  } else {
    runQuery = runQuery.order("id", { ascending: false }).limit(1);
  }

  const { data: runData } = await runQuery;
  const run = runData?.[0] || {};

  const [itemsRes, workersRes] = await Promise.all([
    supabase
      .from("payroll_run_items")
      .select("*")
      .eq("payroll_run_id", run.id || 0)
      .order("id", { ascending: true }),
    supabase.from("workers").select("id, worker_code, name, department, position, identity_no, daily_salary, pay_system"),
  ]);

  const items = itemsRes.data ?? [];
  const workerMap = new Map((workersRes.data ?? []).map((w: any) => [w.id, w]));

  const columns = [
    { key: "no", label: "NO", width: 6 },
    { key: "nama", label: "NAMA", width: 22 },
    { key: "bagian", label: "BAGIAN", width: 16 },
    { key: "nik", label: "NIK", width: 20 },
    { key: "hari", label: "HARI", width: 8 },
    { key: "gaji", label: "GAJI", width: 16 },
    { key: "um", label: "UM", width: 8 },
    { key: "lembur_per_jam", label: "LEMBUR/JAM", width: 16 },
    { key: "um_lembur", label: "UANG MAKAN LEMBUR", width: 18 },
    { key: "total_jam", label: "TOTAL JAM", width: 12 },
    { key: "total_lembur", label: "TOTAL LEMBUR", width: 16 },
    { key: "total_upah", label: "TOTAL UPAH", width: 20 },
  ];

  let grandTotal = 0;

  const rows: Array<Record<string, any>> = items.map((it: any, idx: number) => {
    const w = workerMap.get(it.worker_id);
    const full = Number(it.full_days || 0);
    const half = Number(it.half_days || 0);
    const totalHari = full + (half * 0.5);

    const dailyRate = Number(w?.daily_salary) || (totalHari > 0 ? Math.round(Number(it.base_amount || 0) / totalHari) : 0);
    const hourlyOtRate = dailyRate > 0 ? Math.round(dailyRate / 8) : 0;

    const otMin = Number(it.overtime_minutes || 0);
    const otHours = Math.round((otMin / 60) * 10) / 10;
    const manualOtHours = Number(it.manual_overtime_hours || 0);
    const totalOtHours = otHours + manualOtHours;

    const totalLembur = (Number(it.overtime_amount || 0) + Number(it.manual_overtime_amount || 0));
    const mealLembur = Number(it.overtime_bonus || 0);
    const totalUpah = (totalHari * dailyRate) + totalLembur + mealLembur;
    grandTotal += totalUpah;

    return {
      no: idx + 1,
      nama: (it.worker_name_snapshot || w?.name || "-").toUpperCase(),
      bagian: (w?.position || w?.department || "HELPER").toUpperCase(),
      nik: w?.identity_no || w?.worker_code || "-",
      hari: totalHari % 1 === 0 ? totalHari : totalHari.toFixed(1),
      gaji: formatRupiahCell(dailyRate),
      um: "-",
      lembur_per_jam: formatRupiahCell(hourlyOtRate),
      um_lembur: mealLembur > 0 ? formatRupiahCell(mealLembur) : "Rp -",
      total_jam: totalOtHours,
      total_lembur: totalLembur > 0 ? formatRupiahCell(totalLembur) : "Rp -",
      total_upah: formatRupiahCell(totalUpah),
    };
  });

  rows.push({
    no: "",
    nama: "",
    bagian: "",
    nik: "",
    hari: "",
    gaji: "",
    um: "",
    lembur_per_jam: "",
    um_lembur: "",
    total_jam: "",
    total_lembur: "TOTAL :",
    total_upah: formatRupiahCell(grandTotal),
  });

  const signDate = formatIndoDate(run.period_end || jakartaToday());
  rows.push({ no: "", nama: "", bagian: "", nik: "", hari: "", gaji: "", um: "", lembur_per_jam: "", um_lembur: "", total_jam: "", total_lembur: "", total_upah: "" });
  rows.push({ no: "", nama: "", bagian: "", nik: "", hari: "", gaji: "", um: "", lembur_per_jam: "", um_lembur: "", total_jam: "", total_lembur: `Tangerang Selatan, ${signDate}`, total_upah: "" });
  rows.push({ no: "", nama: "", bagian: "", nik: "", hari: "", gaji: "", um: "", lembur_per_jam: "", um_lembur: "Disetujui,", total_jam: "", total_lembur: "Yang Mengajukan,", total_upah: "" });
  rows.push({ no: "", nama: "", bagian: "", nik: "", hari: "", gaji: "", um: "", lembur_per_jam: "", um_lembur: "", total_jam: "", total_lembur: "", total_upah: "" });
  rows.push({ no: "", nama: "", bagian: "", nik: "", hari: "", gaji: "", um: "", lembur_per_jam: "", um_lembur: "", total_jam: "", total_lembur: "", total_upah: "" });
  rows.push({ no: "", nama: "", bagian: "", nik: "", hari: "", gaji: "", um: "", lembur_per_jam: "", um_lembur: "Bony Daty", total_jam: "", total_lembur: "Dandi Mardani", total_upah: "" });

  return {
    sheets: [{ name: "Upah Harian", columns, rows, headerColor: "1E293B" }],
    filename: `Pembayaran-Upah-Harian-${run.period_start || "Mingguan"}-${run.period_end || ""}.xlsx`,
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

    if (
      key === "payroll_slips" ||
      key === "operator_payroll_slips" ||
      key === "pembayaran_uang_makan" ||
      key === "pembayaran_upah_harian"
    ) {
      if (!access.permissions.has("payroll.view") && !["MANAGER", "ADMIN"].includes(access.role)) {
        return NextResponse.json({ error: "Tidak punya akses melihat payroll." }, { status: 403 });
      }

      if (key === "operator_payroll_slips" || params.get("run_type") === "operator") {
        const result = await operatorPayrollSlipsWorkbook(supabase, params);
        sheets = result.sheets;
        customFilename = result.filename;
      } else if (key === "pembayaran_uang_makan") {
        const result = await uangMakanWorkbook(supabase, params);
        sheets = result.sheets;
        customFilename = result.filename;
      } else if (key === "pembayaran_upah_harian") {
        const result = await upahHarianWorkbook(supabase, params);
        sheets = result.sheets;
        customFilename = result.filename;
      } else {
        const result = await payrollSlipsWorkbook(supabase, params);
        sheets = result.sheets;
        customFilename = result.filename;
      }
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
