"use client";

import { useState } from "react";

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

  const handleExportExcel = () => {
    if (filtered.length === 0) {
      alert("Tidak ada data pada periode ini.");
      return;
    }

    const headers = [
      "Kode Transaksi",
      "Tanggal",
      "Arah",
      "Kategori",
      "Nominal (Rp)",
      "Deskripsi",
      "No Dokumen / Nota",
      "Link Bukti Nota",
      "Status",
    ];

    const escape = (val: unknown) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const rows = filtered.map((x) => [
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

    const csvContent =
      "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const label = startDate || endDate ? `_${startDate}_sd_${endDate}` : "_Semua";
    link.href = url;
    link.setAttribute("download", `Laporan_Kas_Kecil${label}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Baris Kontrol Filter & Tombol Export (Disembunyikan saat dicetak) */}
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
              className="text-[11px] font-semibold text-rose-600 hover:underline"
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition active:scale-95"
            title="Download file Excel (.csv)"
          >
            📊 Export Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 shadow-2xs hover:bg-blue-100 transition active:scale-95"
            title="Cetak atau simpan PDF"
          >
            🖨️ Cetak / PDF
          </button>
        </div>
      </div>

      {/* Tampilan Cetak Khusus PDF (Hanya aktif saat dialog print browser terbuka) */}
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
