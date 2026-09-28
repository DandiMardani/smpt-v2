"use client";

import { useState } from "react";
import type { WorkerItem } from "./worker-directory-client";

type Props = {
  workers: WorkerItem[];
};

export function ExportWorkerButton({ workers }: Props) {
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // 1. Export Excel Ringan (Link tetap disediakan untuk klik cepat)
  const handleExportExcel = () => {
    if (!workers || workers.length === 0) {
      alert("Tidak ada data pekerja untuk diekspor.");
      return;
    }

    const headers = [
      "Kode Pekerja",
      "Nama Lengkap",
      "NIK",
      "No. HP / WA",
      "Sistem Upah",
      "Jabatan",
      "Jumlah Anak",
      "Alamat",
      "Status",
      "Link Foto KTP",
    ];

    const escape = (val: unknown) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const rows = workers.map((w: any) => [
      escape(w.worker_code || w.code || "-"),
      escape(w.name || "-"),
      escape(w.nik ? `="${w.nik}"` : "-"),
      escape(w.phone ? `="${w.phone}"` : "-"),
      escape(w.wage_system || w.wage_type || "-"),
      escape(w.position || w.role || "-"),
      escape(w.children_count ?? w.dependents_count ?? 0),
      escape(w.address || "-"),
      escape(w.status || "AKTIF"),
      escape(w.ktp_photo_url || w.ktp_url || "-"),
    ]);

    const csvContent =
      "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Master_Pekerja_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 2. Buka dialog cetak PDF browser
  const handlePrint = () => {
    setShowPrintPreview(true);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <>
      <div className="flex items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={handleExportExcel}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 active:scale-95 transition"
        >
          📊 Export Excel
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 shadow-2xs hover:bg-blue-100 active:scale-95 transition"
        >
          🖨️ Cetak / PDF Lengkap Foto KTP
        </button>
      </div>

      {/* Area Khusus Cetak PDF (Otomatis muncul saat tombol Cetak PDF diklik) */}
      <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-6 text-slate-900">
        <div className="border-b border-slate-300 pb-3 mb-4">
          <h1 className="text-xl font-bold">DAFTAR MASTER PEKERJA & IDENTITAS KTP</h1>
          <p className="text-xs text-slate-500">
            Dicetak pada: {new Date().toLocaleDateString("id-ID", { dateStyle: "full" })} · Sistem SMPT V2
          </p>
        </div>

        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-400 bg-slate-100">
              <th className="p-2">No</th>
              <th className="p-2">Pekerja</th>
              <th className="p-2">NIK & No. HP</th>
              <th className="p-2">Upah / Jabatan</th>
              <th className="p-2">Alamat</th>
              <th className="p-2 text-center">Fisik Foto KTP</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w: any, index: number) => {
              const ktpUrl = w.ktp_photo_url || w.ktp_url;
              return (
                <tr key={w.id || index} className="border-b border-slate-200">
                  <td className="p-2 align-top text-slate-400">{index + 1}</td>
                  <td className="p-2 align-top">
                    <p className="font-bold text-slate-900">{w.name}</p>
                    <p className="text-[10px] text-slate-500">{w.worker_code || "-"}</p>
                  </td>
                  <td className="p-2 align-top">
                    <p className="font-medium font-mono text-[11px]">{w.nik || "-"}</p>
                    <p className="text-[10px] text-slate-500">{w.phone || "-"}</p>
                  </td>
                  <td className="p-2 align-top">
                    <span className="font-semibold text-slate-700">{w.wage_system || "-"}</span>
                    <p className="text-[10px] text-slate-500">{w.position || "-"}</p>
                  </td>
                  <td className="p-2 align-top text-slate-600 max-w-xs text-[11px]">
                    {w.address || "-"}
                  </td>
                  {/* Foto KTP langsung dirender sebagai gambar fisik */}
                  <td className="p-2 align-top text-center w-36">
                    {ktpUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ktpUrl}
                        alt={`KTP ${w.name}`}
                        className="h-20 w-32 object-cover rounded border border-slate-300 mx-auto"
                      />
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Belum ada KTP</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
