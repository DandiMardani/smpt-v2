"use client";

import { useState } from "react";

type Transaction = {
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

type Props = {
  data: Transaction[];
  initialStartDate?: string;
  initialEndDate?: string;
};

export function ExportKasKecilBar({ data, initialStartDate = "", initialEndDate = "" }: Props) {
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);

  // Filter data sesuai periode tanggal
  const filteredData = data.filter((item) => {
    if (startDate && item.transaction_date < startDate) return false;
    if (endDate && item.transaction_date > endDate) return false;
    return true;
  });

  // Export Excel (.csv ringan < 5 KB)
  const handleExportExcel = () => {
    if (filteredData.length === 0) {
      alert("Tidak ada data pada periode yang dipilih.");
      return;
    }

    const headers = [
      "Kode Transaksi",
      "Tanggal",
      "Arah",
      "Kategori",
      "Nominal (Rp)",
      "Deskripsi",
      "No Dokumen",
      "Link Bukti Nota",
      "Status",
    ];

    const escape = (val: unknown) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const rows = filteredData.map((x) => [
      escape(x.transaction_code),
      escape(x.transaction_date),
      escape(x.direction),
      escape(x.category),
      escape(x.amount),
      escape(x.description),
      escape(x.document_no || "-"),
      escape(x.receipt_url || "-"),
      escape(x.status),
    ]);

    // \uFEFF memastikan karakter UTF-8 terbaca rapi di Excel tanpa teks rusak
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const periodLabel = startDate || endDate ? `_${startDate}_sd_${endDate}` : "_Semua";
    link.href = url;
    link.setAttribute("download", `Laporan_Kas_Kecil${periodLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs print:hidden">
      {/* Filter Periode */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-slate-700">Filter Periode:</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          title="Tanggal Mulai"
        />
        <span className="text-slate-400">s/d</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          title="Tanggal Akhir"
        />
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
            className="text-[11px] font-semibold text-rose-600 hover:underline"
          >
            Reset
          </button>
        )}
      </div>

      {/* Tombol Export */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-400 font-medium">
          ({filteredData.length} data)
        </span>
        <button
          type="button"
          onClick={handleExportExcel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs active:scale-95"
        >
          📊 Export Excel
        </button>
        <button
          type="button"
          onClick={handlePrintPdf}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs active:scale-95"
        >
          🖨️ Cetak / PDF
        </button>
      </div>
    </div>
  );
}
