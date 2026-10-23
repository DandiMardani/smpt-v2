"use client";

import { useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

export type PettyCashItem = {
  id: number;
  transaction_code: string;
  transaction_date: string;
  direction: string;
  category: string;
  amount: number;
  description: string;
  document_no: string | null;
  receipt_url: string | null;
  status: string;
};

export function ExportKasKecilBar({ data }: { data: PettyCashItem[] }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filtered = data.filter((item) => {
    if (startDate && item.transaction_date < startDate) return false;
    if (endDate && item.transaction_date > endDate) return false;
    return true;
  });

  const handleExportExcel = async () => {
    if (filtered.length === 0) {
      alert("Tidak ada data pada periode ini.");
      return;
    }

    // Urutkan dari tanggal terlama ke terbaru agar hitungan saldo berjalan akurat
    const sortedData = [...filtered].sort(
      (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Laporan Kas Kecil");

    // Mengatur Lebar Kolom
    sheet.columns = [
      { key: "tanggal", width: 30 },
      { key: "keterangan", width: 40 },
      { key: "debet", width: 22 },
      { key: "kredit", width: 22 },
      { key: "saldo", width: 22 },
    ];

    // Judul Laporan (Merge cell)
    sheet.mergeCells("A1:E1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "LAPORAN KAS KECIL BUARAN";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    // Header Tabel
    const headerRow = sheet.getRow(3);
    headerRow.values = ["TANGGAL", "KETERANGAN", "DEBET / MASUK", "KREDIT/KELUAR", "SALDO"];
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    // Style Border
    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    headerRow.eachCell((cell) => {
      cell.border = borderStyle;
    });

    // Isi Data Laporan
    let runningBalance = 0;
    let totalDebet = 0;
    let totalKredit = 0;
    let currentRow = 4;

    // Format Mata Uang Rupiah Akuntansi Excel
    const currencyFormat = '_("Rp"* #,##0.00_);_("Rp"* -#,##0.00_);_("Rp"* "-"??_);_(@_)';

    sortedData.forEach((item) => {
      const isMasuk = item.direction.toUpperCase() === "MASUK";
      const debet = isMasuk ? Number(item.amount || 0) : 0;
      const kredit = !isMasuk ? Number(item.amount || 0) : 0;
      
      runningBalance += debet - kredit;
      totalDebet += debet;
      totalKredit += kredit;

      // Format Tanggal (Contoh: Friday, October 2, 2026)
      const dateObj = new Date(item.transaction_date);
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const row = sheet.getRow(currentRow);
      row.values = [
        formattedDate,
        item.description || item.category,
        debet || null, // Pakai null agar cell kosong jika 0
        kredit || null,
        runningBalance,
      ];

      // Terapkan Border dan Format Mata Uang
      row.eachCell((cell, colNumber) => {
        cell.border = borderStyle;
        if (colNumber === 1) cell.alignment = { horizontal: "center" };
        if (colNumber >= 3) cell.numFmt = currencyFormat;
      });

      currentRow++;
    });

    // Spasi sebelum baris Total
    currentRow++;

    // Baris Total Bawah
    const totalRow = sheet.getRow(currentRow);
    totalRow.values = ["Total", "", totalDebet, totalKredit, runningBalance];
    totalRow.font = { bold: true };
    
    totalRow.eachCell((cell, colNumber) => {
      cell.border = borderStyle;
      if (colNumber === 1) cell.alignment = { horizontal: "center" };
      if (colNumber >= 3) cell.numFmt = currencyFormat;
    });

    // Proses Download File Excel
    const buffer = await workbook.xlsx.writeBuffer();
    const label = startDate || endDate ? `_${startDate}_sd_${endDate}` : "_Semua";
    saveAs(new Blob([buffer]), `Laporan_Kas_Kecil${label}.xlsx`);
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs print:hidden">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-700">Filter Periode:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-slate-400">s/d</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">({filtered.length} transaksi)</span>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition active:scale-95 cursor-pointer"
            title="Download file Excel (.xlsx)"
          >
            📊 Export Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 shadow-2xs hover:bg-blue-100 transition active:scale-95 cursor-pointer"
            title="Cetak atau simpan PDF"
          >
            🖨️ Cetak / PDF
          </button>
        </div>
      </div>

      <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-6 text-slate-900">
        <div className="border-b-2 border-slate-400 pb-2 mb-4">
          <h1 className="text-xl font-bold">REKAP TRANSAKSI KAS KECIL</h1>
          <p className="text-xs text-slate-500">
            Periode: {startDate || "Awal"} s/d {endDate || "Sekarang"} · Dicetak:{" "}
            {new Date().toLocaleDateString("id-ID", { dateStyle: "full" })}
          </p>
        </div>
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="border-b-2 border-slate-400 bg-slate-100">
              <th className="p-2">Kode</th>
              <th className="p-2">Tanggal</th>
              <th className="p-2">Arah</th>
              <th className="p-2">Kategori</th>
              <th className="p-2">Nominal</th>
              <th className="p-2">Keterangan</th>
              <th className="p-2 text-center">Fisik Nota</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((x) => (
              <tr key={x.id} className="border-b border-slate-200">
                <td className="p-2 align-top font-mono font-semibold">{x.transaction_code}</td>
                <td className="p-2 align-top">{x.transaction_date}</td>
                <td className="p-2 align-top font-bold">{x.direction}</td>
                <td className="p-2 align-top">{x.category}</td>
                <td className="p-2 align-top font-mono">
                  Rp {Number(x.amount || 0).toLocaleString("id-ID")}
                </td>
                <td className="p-2 align-top max-w-xs">{x.description}</td>
                <td className="p-2 align-top text-center w-28">
                  {x.receipt_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={x.receipt_url}
                      alt="Nota"
                      className="h-14 w-20 object-cover rounded border border-slate-300 mx-auto"
                    />
                  ) : (
                    <span className="text-slate-400 italic text-[10px]">Tanpa Nota</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
