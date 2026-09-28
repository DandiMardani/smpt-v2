"use client";

import type { WorkerItem } from "./worker-directory-client";

type Props = {
  workers: WorkerItem[];
};

export function ExportWorkerButton({ workers }: Props) {
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
      "Jabatan / Posisi",
      "Jumlah Anak / Tanggungan",
      "Alamat",
      "Status",
      "Link Foto KTP (Klik)",
    ];

    const escape = (val: unknown) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const rows = workers.map((w: any) => [
      escape(w.worker_code || w.code || "-"),
      escape(w.name || "-"),
      // Trik format string Excel agar 16 digit NIK tidak terpotong menjadi 3.2E+15
      escape(w.nik ? `="${w.nik}"` : "-"),
      // Pertahankan angka 0 di depan nomor HP
      escape(w.phone ? `="${w.phone}"` : "-"),
      escape(w.wage_system || w.wage_type || "-"),
      escape(w.position || w.role || "-"),
      escape(w.children_count ?? w.dependents_count ?? 0),
      escape(w.address || "-"),
      escape(w.status || "AKTIF"),
      // Link foto KTP langsung dari Supabase Storage
      escape(w.ktp_photo_url || w.ktp_url || "-"),
    ]);

    // \uFEFF memastikan karakter UTF-8 terbaca rapi di Excel tanpa teks rusak
    const csvContent =
      "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute("download", `Master_Pekerja_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="flex items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={handleExportExcel}
        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 active:scale-95 transition"
        title="Download file Excel berisi data pekerja lengkap dengan NIK dan Link KTP"
      >
        📊 Export Excel & KTP
      </button>
      <button
        type="button"
        onClick={handlePrintPdf}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 active:scale-95 transition"
        title="Cetak atau simpan sebagai PDF"
      >
        🖨️ Cetak / PDF
      </button>
    </div>
  );
}
