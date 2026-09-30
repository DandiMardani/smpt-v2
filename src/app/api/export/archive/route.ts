import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildXlsx, type XlsxSheet } from "@/lib/export/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtWib(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // 1. Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Permission check
  const { data: perms } = await supabase.rpc("current_user_permissions");
  const permCodes: string[] = Array.isArray(perms) ? perms.map((p: { permission_code: string }) => p.permission_code) : [];
  if (!permCodes.includes("setup_test.admin")) {
    return NextResponse.json({ error: "Akses ditolak. Butuh permission setup_test.admin." }, { status: 403 });
  }

  // 3. Parameter rentang tanggal & modul
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");
  const includeAttendance = searchParams.get("attendance") === "true";
  const includeWarung = searchParams.get("warung") === "true";
  const includeKasbon = searchParams.get("kasbon") === "true";

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Rentang tanggal awal dan akhir wajib diisi." }, { status: 400 });
  }

  const sheets: XlsxSheet[] = [];

  // Sheet 1: Metadata Arsip
  sheets.push({
    name: "📋 Info Arsip",
    tabColor: "0EA5E9",
    headerColor: "0C4A6E",
    columns: [{ key: "k", label: "Parameter" }, { key: "v", label: "Keterangan" }],
    rows: [
      { k: "Periode Mulai", v: startDate },
      { k: "Periode Selesai", v: endDate },
      { k: "Tanggal Export", v: fmtWib(new Date().toISOString()) },
      { k: "Modul Absensi", v: includeAttendance ? "Ya" : "Tidak" },
      { k: "Modul Nota Warung", v: includeWarung ? "Ya" : "Tidak" },
      { k: "Modul Kasbon Finansial", v: includeKasbon ? "Ya" : "Tidak" },
      { k: "Proteksi Stok Gudang", v: "Terkunci & Aman (Tidak tersentuh)" },
    ],
  });

  // Sheet 2: Data Absensi (Hanya jika dicentang)
  if (includeAttendance) {
    const { data: attData } = await supabase
      .from("attendance_records")
      .select("id, worker_id, attendance_date, check_in_time, check_out_time, status, notes, created_at")
      .gte("attendance_date", startDate)
      .lte("attendance_date", endDate)
      .order("attendance_date", { ascending: true });

    const rows = (attData || []).map((r: any, idx: number) => ({
      no: idx + 1,
      id: r.id,
      worker_id: r.worker_id,
      tanggal: r.attendance_date,
      masuk: r.check_in_time || "-",
      keluar: r.check_out_time || "-",
      status: r.status,
      keterangan: r.notes || "-",
      dibuat: fmtWib(r.created_at),
    }));

    sheets.push({
      name: "Presensi Pekerja",
      tabColor: "10B981",
      headerColor: "065F46",
      columns: [
        { key: "no", label: "No" },
        { key: "tanggal", label: "Tanggal" },
        { key: "worker_id", label: "ID Pekerja" },
        { key: "masuk", label: "Jam Masuk" },
        { key: "keluar", label: "Jam Keluar" },
        { key: "status", label: "Status" },
        { key: "keterangan", label: "Keterangan" },
        { key: "dibuat", label: "Waktu Input" },
      ],
      rows,
    });
  }

  // Sheet 3 & 4: Data Warung dan Kasbon Finansial (Hanya jika dicentang)
  if (includeWarung || includeKasbon) {
    let query = supabase
      .from("cash_advances")
      .select("id, worker_id, category, amount, paid_amount, advance_date, notes, status, warung_name, created_at")
      .gte("advance_date", startDate)
      .lte("advance_date", endDate)
      .order("advance_date", { ascending: true });

    if (includeWarung && !includeKasbon) {
      query = query.eq("category", "KASBON_WARUNG");
    } else if (!includeWarung && includeKasbon) {
      query = query.neq("category", "KASBON_WARUNG");
    }

    const { data: cashData } = await query;
    const allCash = cashData || [];

    if (includeWarung) {
      const warungRows = allCash
        .filter((r: any) => r.category === "KASBON_WARUNG")
        .map((r: any, idx: number) => ({
          no: idx + 1,
          id: r.id,
          tanggal: r.advance_date,
          warung: r.warung_name || "Dandi Store",
          worker_id: r.worker_id,
          total: Number(r.amount || 0),
          terbayar: Number(r.paid_amount || 0),
          sisa: Math.max(0, Number(r.amount || 0) - Number(r.paid_amount || 0)),
          status: r.status,
          keterangan: r.notes || "-",
          dibuat: fmtWib(r.created_at),
        }));

      sheets.push({
        name: "Nota Warung",
        tabColor: "F59E0B",
        headerColor: "92400E",
        columns: [
          { key: "no", label: "No" },
          { key: "tanggal", label: "Tanggal" },
          { key: "warung", label: "Nama Warung" },
          { key: "worker_id", label: "ID Pekerja" },
          { key: "total", label: "Nominal (Rp)" },
          { key: "terbayar", label: "Terbayar (Rp)" },
          { key: "sisa", label: "Sisa (Rp)" },
          { key: "status", label: "Status" },
          { key: "keterangan", label: "Menu / Keterangan" },
          { key: "dibuat", label: "Dicatat Pada" },
        ],
        rows: warungRows,
      });
    }

    if (includeKasbon) {
      const kasbonRows = allCash
        .filter((r: any) => r.category !== "KASBON_WARUNG")
        .map((r: any, idx: number) => ({
          no: idx + 1,
          id: r.id,
          tanggal: r.advance_date,
          worker_id: r.worker_id,
          kategori: r.category || "KASBON",
          total: Number(r.amount || 0),
          terbayar: Number(r.paid_amount || 0),
          sisa: Math.max(0, Number(r.amount || 0) - Number(r.paid_amount || 0)),
          status: r.status,
          keterangan: r.notes || "-",
          dibuat: fmtWib(r.created_at),
        }));

      sheets.push({
        name: "Kasbon Finansial",
        tabColor: "3B82F6",
        headerColor: "1E3A8A",
        columns: [
          { key: "no", label: "No" },
          { key: "tanggal", label: "Tanggal" },
          { key: "worker_id", label: "ID Pekerja" },
          { key: "kategori", label: "Kategori" },
          { key: "total", label: "Nominal (Rp)" },
          { key: "terbayar", label: "Terbayar (Rp)" },
          { key: "sisa", label: "Sisa (Rp)" },
          { key: "status", label: "Status" },
          { key: "keterangan", label: "Keterangan" },
          { key: "dibuat", label: "Dicatat Pada" },
        ],
        rows: kasbonRows,
      });
    }
  }

  // 4. Generate file Excel
  const xlsx = buildXlsx(sheets);
  const filename = `Arsip_SMPT_${startDate}_sd_${endDate}.xlsx`;

  return new NextResponse(Buffer.from(xlsx), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
