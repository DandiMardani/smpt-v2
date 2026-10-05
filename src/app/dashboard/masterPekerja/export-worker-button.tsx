"use client";

import { useState } from "react";
import type { WorkerItem } from "./worker-directory-client";

type Props = {
  workers: WorkerItem[];
};

export function ExportWorkerButton({ workers }: Props) {
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // 1. Export Excel Ringan (.csv)
  const handleExportExcel = () => {
    if (!workers || workers.length === 0) {
      alert("Tidak ada data pekerja untuk diekspor.");
      return;
    }

    const headers = [
      "No",
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

    const rows = workers.map((w: any, idx: number) => [
      idx + 1,
      escape(w.worker_code || w.code || "-"),
      escape(w.name || "-"),
      escape(w.nik ? `="${w.nik}"` : "-"),
      escape(w.phone ? `="${w.phone}"` : "-"),
      escape(w.wage_system || w.pay_system || w.wage_type || "-"),
      escape(w.position || w.role || "-"),
      escape(w.children_count ?? w.dependents_count ?? w.number_of_children ?? 0),
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
    }, 250);
  };

  return (
    <>
      {/* CSS Cetak A4: Pas 1 Lembar & Tanpa Halaman Kosong di Belakang */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: A4 portrait;
                margin: 6mm 8mm 6mm 8mm;
              }
              html, body {
                height: auto !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
              }
              body * {
                visibility: hidden;
              }
              .print-master-pekerja-sheet,
              .print-master-pekerja-sheet * {
                visibility: visible;
              }
              .print-master-pekerja-sheet {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                break-after: avoid !important;
                page-break-after: avoid !important;
              }
              tr {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              thead {
                display: table-header-group;
              }
            }
          `,
        }}
      />

      <div className="flex items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={handleExportExcel}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 active:scale-95 transition cursor-pointer"
        >
          📊 Export Excel
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 shadow-2xs hover:bg-blue-100 active:scale-95 transition cursor-pointer"
        >
          🖨️ Cetak / PDF Lengkap Foto KTP
        </button>
      </div>

      {/* Area Lembar Cetak PDF */}
      <div className="hidden print:block print-master-pekerja-sheet text-slate-900 font-sans">
        <div className="border-b-2 border-slate-800 pb-1.5 mb-2.5">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-950">
                DAFTAR MASTER PEKERJA & IDENTITAS KTP
              </h1>
              <p className="text-[9px] text-slate-500 font-medium">
                Dicetak pada: {new Date().toLocaleDateString("id-ID", { dateStyle: "full" })} · Sistem SMPT V2
              </p>
            </div>
            <div className="text-right">
              <span className="text-[9px] font-bold bg-slate-100 border border-slate-300 px-2 py-0.5 rounded">
                Total: {workers.length} Pekerja
              </span>
            </div>
          </div>
        </div>

        <table className="w-full text-left border-collapse text-[9.5px] leading-tight">
          <thead>
            <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-800">
              <th className="py-1 px-1 text-center w-5">No</th>
              <th className="py-1 px-1.5 w-32">Pekerja</th>
              <th className="py-1 px-1.5 w-28">NIK & No. HP</th>
              <th className="py-1 px-1.5 w-28">Bagian / Jabatan</th>
              <th className="py-1 px-1 text-center w-14">Jml Anak</th>
              <th className="py-1 px-1.5">Alamat</th>
              <th className="py-1 px-1 text-center w-20">Fisik Foto KTP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {workers.map((w: any, index: number) => {
              const ktpUrl = w.ktp_photo_url || w.ktp_url;
              const children = Number(w.children_count ?? w.dependents_count ?? w.number_of_children ?? 0);

              return (
                <tr key={w.id || index} className="align-top">
                  <td className="py-1 px-1 text-center text-slate-500 font-medium">{index + 1}</td>
                  <td className="py-1 px-1.5">
                    <p className="font-extrabold text-slate-950">{w.name}</p>
                    <p className="text-[8.5px] font-mono text-slate-500">{w.worker_code || "-"}</p>
                  </td>
                  <td className="py-1 px-1.5">
                    <p className="font-bold font-mono text-[9px] text-slate-800">{w.nik || "-"}</p>
                    <p className="text-[8.5px] text-slate-600">{w.phone || "-"}</p>
                  </td>
                  <td className="py-1 px-1.5">
                    <p className="font-bold text-slate-800">
                      {w.department || "PRODUKSI"}
                    </p>
                    <p className="text-[8.5px] text-slate-600">
                      {w.position || "-"} ({w.wage_system || w.pay_system || "HARIAN"})
                    </p>
                  </td>
                  {/* Kolom Jumlah Anak / Tanggungan */}
                  <td className="py-1 px-1 text-center">
                    {children > 0 ? (
                      <span className="font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-[9px]">
                        {children} Anak
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[9px]">-</span>
                    )}
                  </td>
                  <td className="py-1 px-1.5 text-slate-700 leading-snug text-[9px]">
                    {w.address || "-"}
                  </td>
                  <td className="py-1 px-1 text-center">
                    {ktpUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ktpUrl}
                        alt={`KTP ${w.name}`}
                        className="h-8 w-12 object-cover rounded border border-slate-300 mx-auto shadow-2xs"
                      />
                    ) : (
                      <span className="text-[8.5px] text-slate-400 italic">Tanpa KTP</span>
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
