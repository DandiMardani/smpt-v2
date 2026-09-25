import {
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
  selectClass,
  StatusBadge,
} from "@/components/master/master-ui";
import { BoronganCredentialCard } from "@/components/master/borongan-credential-card";
import { KtpUploadInput } from "@/components/master/ktp-upload-input";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { PAY_SYSTEMS, WORKER_DEPARTMENTS, WORKER_POSITIONS } from "@/lib/workers/options";
import { createWorker, updateWorker, deleteWorker } from "./actions";

type Props = { searchParams: Promise<SearchParams> };
type W = {
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

function Fields({ w }: { w?: W }) {
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

export default async function Page({ searchParams }: Props) {
  const [access, params, s] = await Promise.all([
    requirePermission("master_pekerja.view"),
    searchParams,
    createClient(),
  ]);
  const canWrite = access.permissionCodes.includes("master_pekerja.write");
  const { data, error } = await s.from("workers").select("*").order("name");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as W[];

  const accUser = param(params, "acc_user");
  const accPass = param(params, "acc_pass");
  const accName = param(params, "acc_name");
  const accCode = param(params, "acc_code");
  const accPhone = param(params, "acc_phone");

  return (
    <MasterPageShell
      eyebrow="Master Data"
      title="Master Pekerja"
      description="Kelola data pekerja pabrik (Harian, Borongan, dan Bulanan). Dilengkapi input foto KTP, jumlah anak/tanggungan, dan otomatisasi akun login khusus pekerja borongan."
    >
      <Notice success={param(params, "success")} error={param(params, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {/* Kartu Kredensial Akun Otomatis jika baru menambahkan pekerja BORONGAN */}
      {accUser && accPass ? (
        <BoronganCredentialCard
          name={accName || "Pekerja"}
          workerCode={accCode || "PKR-XXX"}
          email={accUser}
          pass={accPass}
          phone={accPhone}
        />
      ) : null}

      {canWrite ? (
        <SectionCard title="Tambah Pekerja">
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-slate-600 leading-relaxed">
            <span className="font-bold text-slate-900 block mb-0.5">ℹ️ Informasi Pekerja & Akun Borongan:</span>
            Berlaku untuk semua pekerja (<b className="text-slate-800">HARIAN, BORONGAN, dan BULANAN</b>). Lampirkan <b className="text-slate-800">Foto KTP</b> dan <b className="text-slate-800">Jumlah Anak</b> untuk data kependudukan & tanggungan. Khusus pekerja <b className="text-blue-700">BORONGAN</b>, akun login aplikasi otomatis dibuatkan di sistem dengan password nama depan + 123 (contoh: <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-blue-700 font-semibold">budi123</code>).
          </div>
          <form action={createWorker} encType="multipart/form-data" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Fields />
            <div className="md:col-span-2 xl:col-span-3">
              <button className={primaryButtonClass}>Simpan Pekerja</button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title={`Daftar Pekerja (${rows.length})`}>
        <div className="space-y-3">
          {rows.map((w) => (
            <details key={w.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition">
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
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-400 text-base" title="Belum ada foto KTP">
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
                        <span className="font-semibold text-slate-700">{w.pay_system || "-"}</span>
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
                <form action={updateWorker} encType="multipart/form-data" className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-3">
                  <input type="hidden" name="id" value={w.id} />
                  <Fields w={w} />
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
    </MasterPageShell>
  );
}
