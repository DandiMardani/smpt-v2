"use client";

type WorkerItem = {
  worker_code?: string;
  name: string;
  nik?: string;
  phone?: string;
  role?: string;
  position?: string;
  address?: string;
  status: string;
  ktp_photo_url?: string | null;
};

type Props = {
  workers: WorkerItem[];
};

export function ExportPekerjaButton({ workers }: Props) {
  const handleExport = () => {
    if (!workers || workers.length === 0) {
      alert("Tidak ada data pekerja untuk diexport.");
      return;
    }

    const headers = [
      "Kode Pekerja",
      "Nama Lengkap",
      "NIK KTP",
      "No HP",
      "Jabatan / Posisi",
      "Alamat",
      "Status",
      "Link Foto KTP (Klik)",
    ];

    const escape = (val: unknown) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const rows = workers.map((w) => [
      escape(w.worker_code || "-"),
      escape(w.name),
      escape(w.nik ? `'${w.nik}` : "-"), // petik ' agar NIK 16 digit tidak terpotong ilmiah (E+) di Excel
      escape(w.phone ? `'${w.phone}` : "-"),
      escape(w.position || w.role || "-"),
      escape(w.address || "-"),
      escape(w.status),
      escape(w.ktp_photo_url || "-"), // Link foto KTP di Supabase Storage
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Master_Pekerja_Karyawan_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs active:scale-95"
      title="Download database pekerja ke format Excel lengkap dengan link KTP"
    >
      📊 Export Data & KTP (Excel)
    </button>
  );
}
