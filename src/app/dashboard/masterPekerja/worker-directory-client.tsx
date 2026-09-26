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
  daily_wage: number | string;
  monthly_salary: number | string;
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

export function WorkerFormFields({ w }: { w?: WorkerItem }) {
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
      <Field label="Upah Harian">
        <input name="daily_wage" type="number" min="0" defaultValue={String(w?.daily_wage ?? 0)} className={inputClass} />
      </Field>
      <Field label="Gaji Bulanan">
        <input name="monthly_salary" type="number" min="0" defaultValue={String(w?.monthly_salary ?? 0)} className={inputClass} />
      </Field>
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
}: {
  workers: WorkerItem[];
  canWrite: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [paySystemFilter, setPaySystemFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Hitung jumlah pekerja per kategori
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

  // Filter pekerja
  const filteredWorkers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return workers.filter((w) => {
      // Filter status
      if (statusFilter !== "ALL" && w.status !== statusFilter) return false;

      // Filter pay system
      if (paySystemFilter !== "ALL") {
        const ps = (w.pay_system || "").toUpperCase();
        if (paySystemFilter === "BULANAN" && !ps.includes("BULANAN")) return false;
        if (paySystemFilter === "HARIAN" && !ps.includes("HARIAN")) return false;
        if (paySystemFilter === "BORONGAN" && !ps.includes("BORONGAN")) return false;
      }

      // Filter teks pencarian
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

  return (
    <div className="space-y-4">
      {/* 4 Kartu Metrik Jumlah Pekerja */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      {/* Baris Pencarian & Filter Cepat */}
      <SectionCard title={`Daftar Pekerja (${filteredWorkers.length} dari ${workers.length})`}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

          <div className="flex items-center gap-2">
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
          </div>
        </div>

        {/* Daftar Kartu Pekerja */}
        <div className="space-y-3">
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
              className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {w.ktp_photo_url ? (
                      <a
                        href={w.ktp_photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="relative shrink-0 overflow-hidden rounded-lg border border-slate-200 shadow-2xs hover:border-blue-400 transition"
                        title="Lihat Foto KTP"
                      >
                        <img src={w.ktp_photo_url} alt={`KTP ${w.name}`} className="h-11 w-16 object-cover" />
                      </a>
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
                  <StatusBadge status={w.status} />
                </div>
              </summary>
              {canWrite ? (
                <form
                  action={updateWorker}
                  encType="multipart/form-data"
                  className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-3"
                >
                  <input type="hidden" name="id" value={w.id} />
                  <WorkerFormFields w={w} />
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
              ) : null}
            </details>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
