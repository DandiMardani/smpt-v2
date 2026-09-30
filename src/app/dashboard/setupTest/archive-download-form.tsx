"use client";

import { useState } from "react";
import { Field, buttonClass, inputClass } from "@/components/final/final-ui";

type Props = {
  defaultStartDate: string;
  defaultEndDate: string;
};

export function ArchiveDownloadForm({ defaultStartDate, defaultEndDate }: Props) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const params = new URLSearchParams();

    params.set("start_date", String(formData.get("start_date") || ""));
    params.set("end_date", String(formData.get("end_date") || ""));
    if (formData.get("attendance")) params.set("attendance", "true");
    if (formData.get("warung")) params.set("warung", "true");
    if (formData.get("kasbon")) params.set("kasbon", "true");

    try {
      const response = await fetch(`/api/export/archive?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Gagal mengambil file arsip");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Arsip_SMPT_${params.get("start_date")}_sd_${params.get("end_date")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      alert("File arsip Excel berhasil diunduh.");
    } catch {
      alert("Terjadi kesalahan saat mengunduh file arsip.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Tanggal Mulai">
          <input
            type="date"
            name="start_date"
            defaultValue={defaultStartDate}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Tanggal Selesai">
          <input
            type="date"
            name="end_date"
            defaultValue={defaultEndDate}
            required
            className={inputClass}
          />
        </Field>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
          Pilih Modul Transaksi:
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
          <input
            type="checkbox"
            name="attendance"
            defaultChecked
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Presensi & Absensi Pekerja
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
          <input
            type="checkbox"
            name="warung"
            defaultChecked
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Nota Warung (Dandi Store & Mitra)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
          <input
            type="checkbox"
            name="kasbon"
            defaultChecked
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Kasbon & Pinjaman Karyawan
        </label>
      </div>

      <button type="submit" disabled={loading} className={buttonClass}>
        {loading ? "Membuat Arsip..." : "📥 Download Arsip Excel"}
      </button>
    </form>
  );
}
