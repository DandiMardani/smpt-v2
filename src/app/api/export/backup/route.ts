import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildXlsx, type XlsxSheet } from "@/lib/export/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(n: number | string): string {
  const v = Number(n || 0);
  if (v <= 0) return "0 B";
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / 1024 ** 2).toFixed(2)} MB`;
}

function fmtWib(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso));
}

function labelFor(tableName: string): string {
  const MAP: Record<string, string> = {
    workers: "Pekerja",
    projects: "Proyek",
    project_products: "Produk Proyek",
    materials: "Bahan Baku",
    work_items: "Item Pekerjaan",
    production_orders: "SPK",
    production_order_items: "Item SPK",
    production_checks: "Hasil Produksi",
    attendance_records: "Absensi",
    payroll_runs: "Payroll Run",
    payroll_run_items: "Item Payroll",
    operator_payroll_runs: "Payroll Borongan",
    operator_payroll_items: "Item Payroll Borongan",
    cash_advances: "Kasbon",
    cash_advance_payments: "Bayar Kasbon",
    petty_cash_transactions: "Kas Kecil",
    finance_transactions: "Transaksi Keuangan",
    qc_inspections: "Inspeksi QC",
    qc_reworks: "QC Rework",
    finished_goods: "Barang Jadi",
    finished_goods_transfers: "Transfer BJ",
    embarkation_shipments: "Pengiriman Embarkasi",
    packing_runs: "Packing",
    warehouse_receipts: "Penerimaan Gudang",
    warehouse_issues: "Pengeluaran Gudang",
    stock_ledger_entries: "Ledger Stok",
    purchase_orders: "PO",
    purchase_order_lines: "Item PO",
    cutting_daily_results: "Hasil Cutting",
    manufacturing_transactions: "Transaksi Manufaktur",
  };
  return MAP[tableName] ?? tableName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Warna tab bergantian (hex tanpa #)
const TAB_COLORS = ["10B981", "F59E0B", "3B82F6", "8B5CF6", "EF4444", "F97316", "06B6D4", "84CC16"];
const HDR_COLORS = ["065F46", "92400E", "1E3A8A", "4C1D95", "991B1B", "9A3412", "164E63", "3F6212"];

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Permission check: setup_test.admin
  const { data: perms } = await supabase.rpc("current_user_permissions");
  const permCodes: string[] = Array.isArray(perms) ? perms.map((p: { permission_code: string }) => p.permission_code) : [];
  if (!permCodes.includes("setup_test.admin")) {
    return NextResponse.json({ error: "Akses ditolak. Butuh permission setup_test.admin." }, { status: 403 });
  }

  // Parse backup_id
  const backupIdRaw = request.nextUrl.searchParams.get("backup_id");
  const backupId = backupIdRaw && /^\d+$/.test(backupIdRaw) ? Number(backupIdRaw) : null;
  if (!backupId) {
    return NextResponse.json({ error: "backup_id tidak valid." }, { status: 400 });
  }

  // Fetch backup
  const { data: backup, error: bErr } = await supabase
    .from("system_data_backups")
    .select("id,backup_code,label,status,schema_fingerprint,snapshot,table_counts,byte_size,created_at,last_restored_at")
    .eq("id", backupId)
    .single();

  if (bErr || !backup) {
    return NextResponse.json({ error: "Backup tidak ditemukan." }, { status: 404 });
  }

  const snapshot = (backup.snapshot ?? {}) as Record<string, Array<Record<string, unknown>>>;
  const tableCounts = (backup.table_counts ?? {}) as Record<string, number>;
  const exportedAt = new Date().toISOString();
  const exportedWib = fmtWib(exportedAt);

  // ── Sheet 1: Info Backup ────────────────────────────────────────────────────
  const totalRows = Object.values(tableCounts).reduce((s, c) => s + Number(c || 0), 0);
  const totalTables = Object.keys(snapshot).length;

  const infoSheet: XlsxSheet = {
    name: "📋 Info Backup",
    tabColor: "0EA5E9",
    headerColor: "0C4A6E",
    columns: [{ key: "k", label: "Keterangan" }, { key: "v", label: "Nilai" }],
    rows: [
      { k: "Kode Backup", v: backup.backup_code },
      { k: "Label", v: backup.label || "Tanpa label" },
      { k: "Status", v: backup.status },
      { k: "Dibuat", v: fmtWib(backup.created_at) },
      { k: "Restore Terakhir", v: fmtWib(backup.last_restored_at) },
      { k: "Ukuran File", v: fmtBytes(backup.byte_size) },
      { k: "Total Tabel", v: totalTables },
      { k: "Total Baris", v: totalRows },
      { k: "Schema Fingerprint", v: backup.schema_fingerprint },
      { k: "", v: "" },
      { k: "Diekspor Pada", v: exportedWib },
      { k: "Diekspor Oleh", v: "SMPT V2 System" },
      { k: "Catatan", v: "File ini berisi snapshot data bisnis saat backup dibuat. TIDAK termasuk: users, roles, permissions, audit log, konfigurasi sistem." },
    ],
  };

  // ── Sheet 2: Ringkasan Tabel ────────────────────────────────────────────────
  const ringkasanRows = Object.entries(tableCounts)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([tbl, cnt], i) => ({
      no: i + 1,
      tabel: tbl,
      label: labelFor(tbl),
      jumlah: Number(cnt),
      ada: Object.keys(snapshot).includes(tbl) ? "✅ Ada" : "⚠️ Tidak",
    }));

  const ringkasanSheet: XlsxSheet = {
    name: "📊 Ringkasan Tabel",
    tabColor: "7C3AED",
    headerColor: "4C1D95",
    columns: [
      { key: "no", label: "No" },
      { key: "tabel", label: "Nama Tabel" },
      { key: "label", label: "Keterangan" },
      { key: "jumlah", label: "Jumlah Baris" },
      { key: "ada", label: "Ada di Snapshot" },
    ],
    rows: ringkasanRows,
  };

  // ── Sheet per tabel ─────────────────────────────────────────────────────────
  const tableSheets: XlsxSheet[] = [];
  let colorIdx = 0;

  // Urutkan tabel: yang banyak baris dulu
  const sortedTables = Object.entries(snapshot)
    .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
    .sort((a, b) => b[1].length - a[1].length);

  for (const [tblName, rows] of sortedTables) {
    if (!Array.isArray(rows) || rows.length === 0) continue;

    // Ambil semua keys dari baris-baris (union semua keys)
    const keySet = new Set<string>();
    for (const row of rows.slice(0, 50)) {
      Object.keys(row).forEach((k) => keySet.add(k));
    }
    const keys = Array.from(keySet);

    const limitedRows = rows.slice(0, 10000); // max 10.000 baris per tabel

    const ci = colorIdx % TAB_COLORS.length;
    colorIdx++;

    const sheetName = `${labelFor(tblName)}`.slice(0, 28);

    tableSheets.push({
      name: sheetName,
      tabColor: TAB_COLORS[ci],
      headerColor: HDR_COLORS[ci],
      columns: keys.map((k) => ({ key: k, label: k })),
      rows: limitedRows,
    });
  }

  // ── Build Excel ─────────────────────────────────────────────────────────────
  const allSheets = [infoSheet, ringkasanSheet, ...tableSheets];
  const xlsx = buildXlsx(allSheets);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `SMPT-Backup-${backup.backup_code}-${dateStr}.xlsx`;

  return new NextResponse(Buffer.from(xlsx), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
