"use client";

import { useMemo, useState } from "react";
import {
  Field,
  inputClass,
  primaryButtonClass,
  SectionCard,
  selectClass,
  StatusBadge,
} from "@/components/master/master-ui";
import { KtpUploadInput } from "@/components/master/ktp-upload-input";
import { PAY_SYSTEMS, WORKER_DEPARTMENTS, WORKER_POSITIONS } from "@/lib/workers/options";
import { updateWorker, deleteWorker } from "./actions";

export type WorkerItem = {
  id: number;
  worker_code: string;
  name: string;
  finger_id: string | null;
  identity_no: string | null;
  department: string | null;
  position: string | null;
  pay_system: string | null;
  daily_wage: number | string | null;
  monthly_salary: number | string | null;
  phone: string | null;
  address: string | null;
  entry_date: string | null;
  exit_date: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
  status: string;
  notes: string | null;
  children_count: number;
  ktp_photo_url: string | null;
};

function optionList(values: readonly string[], current?: string | null) {
  const normalized = String(current ?? "").trim().toUpperCase();
  const list: string[] = [...values];
  if (normalized && !list.includes(normalized)) list.push(normalized);
  return list;
}

export function WorkerFormFields({
  w,
  canViewSalary = true,
}: {
  w?: WorkerItem;
  canViewSalary?: boolean;
}) {
  return (
    <>
      <Field label="Nama Pekerja">
        <input name="name" required defaultValue={w?.name ?? ""} className={inputClass} placeholder="Contoh: Budi Santoso" />
      </Field>
      <Field label="ID Finger">
        <input name="finger_id" defaultValue={w?.finger_id ?? ""} className={inputClass} />
      </Field>
      <Field label="No Identitas (NIK / KTP)">
        <input name="identity_no" defaultValue={w?.identity_no ?? ""} className={inputClass} placeholder="Nomor KTP / SIM" />
      </Field>
      <Field label="Jumlah Anak (Tanggungan)">
        <input name="children_count" type="number" min="0" defaultValue={String(w?.children_count ?? 0)} className={inputClass} placeholder="0" />
      </Field>
      <div className="md:col-span-2 xl:col-span-3">
        <Field label="Foto / Dokumen KTP">
          <KtpUploadInput existingUrl={w?.ktp_photo_url} />
        </Field>
      </div>
      <Field label="Bagian">
        <select name="department" required defaultValue={w?.department?.toUpperCase() ?? "PRODUKSI"} className={selectClass}>
          {optionList(WORKER_DEPARTMENTS, w?.department).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </Field>
      <Field label="Jabatan">
        <select name="position" required defaultValue={w?.position?.toUpperCase() ?? "OPERATOR JAHIT"} className={selectClass}>
          {optionList(WORKER_POSITIONS, w?.position).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </Field>
      <Field label="Sistem Upah">
        <select name="pay_system" required defaultValue={w?.pay_system?.toUpperCase() ?? "BORONGAN"} className={selectClass}>
          {optionList(PAY_SYSTEMS, w?.pay_system).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </Field>

      {/* Kontrol Akses Input Gaji */}
      {canViewSalary ? (
        <>
          <Field label="Upah Harian">
            <input name="daily_wage" type="number" min="0" defaultValue={String(w?.daily_wage ?? 0)} className={inputClass} />
          </Field>
          <Field label="Gaji Bulanan">
            <input name="monthly_salary" type="number" min="0" defaultValue={String(w?.monthly_salary ?? 0)} className={inputClass} />
          </Field>
        </>
      ) : null}

      <Field label="No HP / WhatsApp">
        <input name="phone" defaultValue={w?.phone ?? ""} className={inputClass} placeholder="Contoh: 08123456789" />
      </Field>
      {!w ? (
        <Field label="Email Login (Opsional)">
          <input name="email" type="email" placeholder="Otomatis dibuat jika dikosongkan" className={inputClass} />
        </Field>
      ) : null}
      <Field label="Tanggal Masuk">
        <input name="entry_date" type="date" defaultValue={w?.entry_date ?? ""} className={inputClass} />
      </Field>
      <Field label="Tanggal Keluar">
        <input name="exit_date" type="date" defaultValue={w?.exit_date ?? ""} className={inputClass} />
      </Field>
      <Field label="Bank">
        <input name="bank_name" defaultValue={w?.bank_name ?? ""} className={inputClass} />
      </Field>
      <Field label="No Rekening">
        <input name="bank_account_no" defaultValue={w?.bank_account_no ?? ""} className={inputClass} />
      </Field>
      <Field label="Nama Rekening">
        <input name="bank_account_name" defaultValue={w?.bank_account_name ?? ""} className={inputClass} />
      </Field>
      <Field label="Status">
        <select name="status" defaultValue={w?.status ?? "AKTIF"} className={selectClass}>
          <option value="AKTIF">AKTIF</option>
          <option value="NONAKTIF">NONAKTIF</option>
        </select>
      </Field>
      <Field label="Alamat">
        <input name="address" defaultValue={w?.address ?? ""} className={inputClass} />
      </Field>
      <Field label="Keterangan">
        <input name="notes" defaultValue={w?.notes ?? ""} className={inputClass} />
      </Field>
    </>
  );
}

export function WorkerDirectoryClient({
  workers,
  canWrite,
  canViewSalary = true,
}: {
  workers: WorkerItem[];
  canWrite: boolean;
  canViewSalary?: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [paySystemFilter, setPaySystemFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; name: string } | null>(null);

  // Metrik jumlah pekerja
  const metrics = useMemo(() => {
    let bulanan = 0;
    let harian = 0;
    let borongan = 0;
    for (const w of workers) {
      const ps = (w.pay_system || "").toUpperCase();
      if (ps.includes("BULANAN")) bulanan++;
      else if (ps.includes("HARIAN")) harian++;
      else if (ps.includes("BORONGAN")) borongan++;
    }
    return {
      total: workers.length,
      bulanan,
      harian,
      borongan,
    };
  }, [workers]);

  // Filter pencarian & status
  const filteredWorkers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return workers.filter((w) => {
      if (statusFilter !== "ALL" && w.status !== statusFilter) return false;

      if (paySystemFilter !== "ALL") {
        const ps = (w.pay_system || "").toUpperCase();
        if (paySystemFilter === "BULANAN" && !ps.includes("BULANAN")) return false;
        if (paySystemFilter === "HARIAN" && !ps.includes("HARIAN")) return false;
        if (paySystemFilter === "BORONGAN" && !ps.includes("BORONGAN")) return false;
      }

      if (!term) return true;
      const matchName = w.name?.toLowerCase().includes(term);
      const matchCode = w.worker_code?.toLowerCase().includes(term);
      const matchNik = w.identity_no?.toLowerCase().includes(term);
      const matchPhone = w.phone?.toLowerCase().includes(term);
      const matchDept = w.department?.toLowerCase().includes(term);
      const matchPos = w.position?.toLowerCase().includes(term);

      return matchName || matchCode || matchNik || matchPhone || matchDept || matchPos;
    });
  }, [workers, searchTerm, paySystemFilter, statusFilter]);

  // Fungsi Export Excel Ringan (.csv UTF-8)
  const handleExportExcel = () => {
    if (filteredWorkers.length === 0) {
      alert("Tidak ada data pekerja untuk diexport.");
      return;
    }

    const headers = [
      "Kode Pekerja",
      "Nama Lengkap",
      "NIK / No Identitas",
      "No HP / WA",
      "Bagian",
      "Jabatan",
      "Sistem Upah",
      ...(canViewSalary ? ["Upah Harian", "Gaji Bulanan"] : []),
      "Tanggungan Anak",
      "Alamat",
      "Bank",
      "No Rekening",
      "Atas Nama Rekening",
      "Status",
      "Link Foto KTP (Klik)",
    ];

    const escape = (val: unknown) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const rows = filteredWorkers.map((w) => [
      escape(w.worker_code),
      escape(w.name),
      escape(w.identity_no ? `="${w.identity_no}"` : "-"),
      escape(w.phone ? `="${w.phone}"` : "-"),
      escape(w.department || "-"),
      escape(w.position || "-"),
      escape(w.pay_system || "-"),
      ...(canViewSalary
        ? [escape(w.daily_wage || 0), escape(w.monthly_salary || 0)]
        : []),
      escape(w.children_count || 0),
      escape(w.address || "-"),
      escape(w.bank_name || "-"),
      escape(w.bank_account_no ? `="${w.bank_account_no}"` : "-"),
      escape(w.bank_account_name || "-"),
      escape(w.status),
      escape(w.ktp_photo_url || "-"),
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
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

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* 4 Kartu Metrik Jumlah Pekerja */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <button
          type="button"
          onClick={() => setPaySystemFilter("ALL")}
          className={`rounded-2xl border p-4 text-left transition shadow-xs ${
            paySystemFilter === "ALL"
              ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20"
              : "border-slate-200/80 bg-white hover:border-slate-300"
          }`}
        >
          <span className="text-xs font-semibold text-slate-500 block">Total Pekerja</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{metrics.total}</span>
          <span className="text-[11px] text-blue-600 font-medium mt-0.5 block">Semua Karyawan</span>
        </button>

        <button
          type="button"
          onClick={() => setPaySystemFilter("BULANAN")}
          className={`rounded-2xl border p-4 text-left transition shadow-xs ${
            paySystemFilter === "BULANAN"
              ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20"
              : "border-slate-200/80 bg-white hover:border-slate-300"
          }`}
        >
          <span className="text-xs font-semibold text-slate-500 block">Karyawan Bulanan</span>
          <span className="text-2xl font-black text-emerald-700 mt-1 block">{metrics.bulanan}</span>
          <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">Gaji Bulanan Tetap</span>
        </button>

        <button
          type="button"
          onClick={() => setPaySystemFilter("HARIAN")}
          className={`rounded-2xl border p-4 text-left transition shadow-xs ${
            paySystemFilter === "HARIAN"
              ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20"
              : "border-slate-200/80 bg-white hover:border-slate-300"
          }`}
        >
          <span className="text-xs font-semibold text-slate-500 block">Karyawan Harian</span>
          <span className="text-2xl font-black text-amber-700 mt-1 block">{metrics.harian}</span>
          <span className="text-[11px] text-amber-600 font-medium mt-0.5 block">Upah Harian & Shift</span>
        </button>

        <button
          type="button"
          onClick={() => setPaySystemFilter("BORONGAN")}
          className={`rounded-2xl border p-4 text-left transition shadow-xs ${
            paySystemFilter === "BORONGAN"
              ? "border-purple-500 bg-purple-50/50 ring-2 ring-purple-500/20"
              : "border-slate-200/80 bg-white hover:border-slate-300"
          }`}
        >
          <span className="text-xs font-semibold text-slate-500 block">Operator Borongan</span>
          <span className="text-2xl font-black text-purple-700 mt-1 block">{metrics.borongan}</span>
          <span className="text-[11px] text-purple-600 font-medium mt-0.5 block">Upah Hasil Setoran</span>
        </button>
      </div>

      {/* Baris Pencarian, Filter Cepat & Tombol Export */}
      <SectionCard title={`Daftar Pekerja (${filteredWorkers.length} dari ${workers.length})`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              🔍
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama, NIK, kode pekerja, no HP, atau jabatan..."
              className={`${inputClass} pl-9`}
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕ Hapus
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={paySystemFilter}
              onChange={(e) => setPaySystemFilter(e.target.value)}
              className={selectClass}
            >
              <option value="ALL">Semua Upah</option>
              <option value="BULANAN">Bulanan</option>
              <option value="HARIAN">Harian</option>
              <option value="BORONGAN">Borongan</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={selectClass}
            >
              <option value="ALL">Semua Status</option>
              <option value="AKTIF">Aktif</option>
              <option value="NONAKTIF">Nonaktif</option>
            </select>

            {/* Tombol Export */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition active:scale-95"
            >
              📊 Export Excel
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 shadow-2xs hover:bg-blue-100 transition active:scale-95"
            >
              🖨️ Cetak / PDF
            </button>
          </div>
        </div>

        {/* Daftar Kartu Pekerja */}
        <div className="space-y-3 print:hidden">
          {filteredWorkers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
              <p className="text-sm font-semibold">Tidak ada pekerja yang sesuai kriteria pencarian.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setPaySystemFilter("ALL");
                  setStatusFilter("ALL");
                }}
                className="mt-2 text-xs font-bold text-blue-600 hover:underline"
              >
                Reset Semua Filter
              </button>
            </div>
          ) : null}

          {filteredWorkers.map((w) => (
            <details
              key={w.id}
              className="group rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {w.ktp_photo_url ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPhoto({ url: w.ktp_photo_url!, name: w.name });
                        }}
                        className="relative shrink-0 overflow-hidden rounded-lg border border-slate-200 shadow-2xs hover:border-blue-400 transition"
                        title="Klik untuk memperbesar Foto KTP"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={w.ktp_photo_url} alt={`KTP ${w.name}`} className="h-11 w-16 object-cover" />
                      </button>
                    ) : (
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-400 text-base"
                        title="Belum ada foto KTP"
                      >
                        🪪
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <b className="text-slate-900 text-sm">{w.name}</b>
                        {w.ktp_photo_url ? (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                            ✓ KTP
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-semibold text-blue-600">{w.worker_code}</span>
                        <span>·</span>
                        <span>{w.department || "-"}</span>
                        <span>·</span>
                        <span>{w.position || "-"}</span>
                        <span>·</span>
                        <span
                          className={`font-bold px-1.5 py-0.2 rounded text-[11px] ${
                            w.pay_system === "BULANAN"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : w.pay_system === "HARIAN"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-purple-50 text-purple-700 border border-purple-200"
                          }`}
                        >
                          {w.pay_system || "-"}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                          👶 {w.children_count ?? 0} Anak
                        </span>
                        {w.phone ? (
                          <>
                            <span>·</span>
                            <span>📞 {w.phone}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={w.status} />
                    <span className="text-xs text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                  </div>
                </div>
              </summary>

              {/* TAMPILAN JIKA WRITE (ADMIN DENGAN AKSES UBAH) */}
              {canWrite ? (
                <form
                  action={updateWorker}
                  encType="multipart/form-data"
                  className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-3"
                >
                  <input type="hidden" name="id" value={w.id} />
                  <WorkerFormFields w={w} canViewSalary={canViewSalary} />
                  <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button className={primaryButtonClass}>Simpan Perubahan</button>
                    <button
                      type="submit"
                      formAction={deleteWorker}
                      formNoValidate
                      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                    >
                      🗑️ Hapus Pekerja
                    </button>
                  </div>
                </form>
              ) : (
                /* TAMPILAN DETAIL LENGKAP JIKA READ-ONLY */
                <div className="mt-4 border-t border-slate-100 pt-4 space-y-4">
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200">
                    👁️ Detail Pekerja (Mode Baca Saja)
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                      <span className="text-slate-400 block text-[11px]">No. NIK / KTP</span>
                      <span className="font-mono font-bold text-slate-800">{w.identity_no || "-"}</span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                      <span className="text-slate-400 block text-[11px]">ID Fingerprint</span>
                      <span className="font-semibold text-slate-800">{w.finger_id || "-"}</span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                      <span className="text-slate-400 block text-[11px]">No. HP / WhatsApp</span>
                      <span className="font-semibold text-slate-800">{w.phone || "-"}</span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                      <span className="text-slate-400 block text-[11px]">Tanggungan Anak</span>
                      <span className="font-bold text-slate-800">{w.children_count ?? 0} Orang</span>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                      <span className="text-slate-400 block text-[11px]">Bagian / Departemen</span>
                      <span className="font-bold text-slate-800">{w.department || "-"}</span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                      <span className="text-slate-400 block text-[11px]">Jabatan</span>
                      <span className="font-bold text-slate-800">{w.position || "-"}</span>
                    </div>

                    {/* Sensor Kolom Upah / Gaji */}
                    {canViewSalary ? (
                      <>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                          <span className="text-slate-400 block text-[11px]">Upah Harian</span>
                          <span className="font-bold text-emerald-700">
                            Rp {Number(w.daily_wage || 0).toLocaleString("id-ID")}
                          </span>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                          <span className="text-slate-400 block text-[11px]">Gaji Bulanan</span>
                          <span className="font-bold text-emerald-700">
                            Rp {Number(w.monthly_salary || 0).toLocaleString("id-ID")}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 col-span-2 sm:col-span-2">
                        <span className="text-slate-400 block text-[11px]">Upah & Gaji</span>
                        <span className="font-bold text-slate-400 tracking-wider">
                          Rp •••••••• <span className="text-[10px] font-normal text-slate-400">(Terkunci)</span>
                        </span>
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                      <span className="text-slate-400 block text-[11px]">Rekening Bank</span>
                      <span className="font-semibold text-slate-800">
                        {w.bank_name ? `${w.bank_name} - ${w.bank_account_no} (a.n ${w.bank_account_name})` : "-"}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                      <span className="text-slate-400 block text-[11px]">Tanggal Masuk</span>
                      <span className="font-semibold text-slate-800">{w.entry_date || "-"}</span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 sm:col-span-2">
                      <span className="text-slate-400 block text-[11px]">Alamat Lengkap</span>
                      <span className="text-slate-700">{w.address || "-"}</span>
                    </div>
                  </div>

                  {/* Pratinjau Foto KTP */}
                  {w.ktp_photo_url ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <span className="text-xs font-bold text-slate-700 block mb-2">🪪 Pratinjau Foto KTP</span>
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={w.ktp_photo_url}
                          alt={`KTP ${w.name}`}
                          className="h-24 w-36 rounded-lg object-cover border border-slate-200 shadow-2xs cursor-pointer hover:scale-105 transition"
                          onClick={() => setSelectedPhoto({ url: w.ktp_photo_url!, name: w.name })}
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedPhoto({ url: w.ktp_photo_url!, name: w.name })}
                          className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-2xs hover:bg-blue-50"
                        >
                          🔍 Perbesar Foto KTP
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </details>
          ))}
        </div>

        {/* AREA PRINT / CETAK PDF */}
        <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-6 text-slate-900">
          <div className="border-b-2 border-slate-400 pb-2 mb-4">
            <h1 className="text-xl font-bold">DAFTAR MASTER PEKERJA & IDENTITAS KTP</h1>
            <p className="text-xs text-slate-500">Dicetak pada: {new Date().toLocaleDateString("id-ID", { dateStyle: "full" })} · SMPT V2</p>
          </div>
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b-2 border-slate-400 bg-slate-100">
                <th className="p-2">No</th>
                <th className="p-2">Pekerja</th>
                <th className="p-2">NIK & HP</th>
                <th className="p-2">Bagian / Jabatan</th>
                <th className="p-2">Alamat</th>
                <th className="p-2 text-center">Fisik Foto KTP</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkers.map((w, idx) => (
                <tr key={w.id} className="border-b border-slate-200">
                  <td className="p-2 align-top text-slate-400">{idx + 1}</td>
                  <td className="p-2 align-top">
                    <p className="font-bold text-slate-900">{w.name}</p>
                    <p className="text-[10px] text-slate-500">{w.worker_code}</p>
                  </td>
                  <td className="p-2 align-top">
                    <p className="font-mono">{w.identity_no || "-"}</p>
                    <p className="text-slate-500">{w.phone || "-"}</p>
                  </td>
                  <td className="p-2 align-top">
                    <p className="font-semibold">{w.department || "-"}</p>
                    <p className="text-slate-500">{w.position || "-"} ({w.pay_system})</p>
                  </td>
                  <td className="p-2 align-top max-w-xs">{w.address || "-"}</td>
                  <td className="p-2 align-top text-center w-36">
                    {w.ktp_photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.ktp_photo_url} alt={`KTP ${w.name}`} className="h-16 w-28 object-cover rounded border border-slate-300 mx-auto" />
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">Tanpa KTP</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Modal Popup Perbesar Foto KTP */}
      {selectedPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-2xl w-full rounded-2xl bg-white p-4 shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-base font-bold text-slate-900">🪪 Foto KTP: {selectedPhoto.name}</span>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center max-h-[75vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedPhoto.url} alt="KTP Penuh" className="max-h-[75vh] w-auto max-w-full object-contain" />
            </div>
            <div className="mt-3 flex justify-between items-center">
              <a href={selectedPhoto.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                Buka di Tab Baru ↗
              </a>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
