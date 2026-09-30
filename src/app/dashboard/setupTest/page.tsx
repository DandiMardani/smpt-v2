import {
  Badge,
  Card,
  Field,
  Flow,
  Metric,
  Notice,
  PageShell,
  TableWrap,
  Td,
  Th,
  buttonClass,
  dangerClass,
  inputClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { text } from "@/lib/final/final-utils";
import { param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { createBackup, cleanupArchivedData } from "./actions";

type Props = { searchParams: Promise<SearchParams> };
type Backup = {
  id: number;
  backup_code: string;
  label: string | null;
  status: string;
  byte_size: number | string;
  created_at: string;
  last_restored_at: string | null;
};

function sizeLabel(value: number | string) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export default async function Page({ searchParams }: Props) {
  await requirePermission("setup_test.admin");
  const q = await searchParams;
  const s = await createClient();

  const [healthRes, backupsRes] = await Promise.all([
    s.rpc("smpt_final_health"),
    s
      .from("system_data_backups")
      .select("id,backup_code,label,status,byte_size,created_at,last_restored_at")
      .order("id", { ascending: false })
      .limit(12),
  ]);

  const firstError = healthRes.error || backupsRes.error;
  if (firstError) throw new Error(firstError.message);

  const h = (healthRes.data ?? {}) as Record<string, unknown>;
  const backups = (backupsRes.data ?? []) as Backup[];

  // Hitung tanggal default (1 bulan ke belakang)
  const today = new Date().toISOString().slice(0, 10);
  const firstDayLastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
    .toISOString()
    .slice(0, 10);

  return (
    <PageShell
      eyebrow="System"
      title="Pusat Arsip & Cadangan Data"
      description="Kelola pencadangan arsip transaksi operasional ke format Excel dan pembersihan data lama secara aman tanpa memengaruhi stok gudang dan data produksi."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />

      <Flow>
        <b>Proteksi Stok Terjamin:</b> Fitur arsip dan pembersihan berkala hanya memproses data transaksional (Presensi, Nota Warung, dan Kasbon). Data inventaris gudang, stok kain, aksesoris, dan SPK terkunci serta tidak dapat dihapus melalui panel ini.
      </Flow>

      {/* Ringkasan Data Operasional */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="SPK" value={text(h.production_orders, "0")} />
        <Metric label="QC" value={text(h.qc_inspections, "0")} />
        <Metric label="Barang Jadi" value={text(h.finished_goods, "0")} />
        <Metric label="Negative Raw" value={text(h.negative_raw_stock, "0")} />
        <Metric label="Negative Logistics" value={text(h.negative_logistics_stock, "0")} />
      </div>

      {/* Panel Utama: Download Arsip & Pembersihan Terproteksi */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Formulir 1: Download Arsip Excel */}
        <Card title="1. Unduh Arsip Excel (.xlsx)">
          <p className="text-sm leading-6 text-slate-600">
            Pilih rentang tanggal dan jenis data operasional yang ingin dicadangkan. Sistem akan menggabungkan modul yang dipilih ke dalam satu file Excel multi-sheet.
          </p>

          <form action="/api/export/archive" method="GET" target="_blank" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tanggal Mulai">
                <input
                  type="date"
                  name="start_date"
                  defaultValue={firstDayLastMonth}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Tanggal Selesai">
                <input
                  type="date"
                  name="end_date"
                  defaultValue={today}
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
                  value="true"
                  defaultChecked
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Presensi & Absensi Pekerja
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  name="warung"
                  value="true"
                  defaultChecked
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Nota Warung (Dandi Store & Mitra)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  name="kasbon"
                  value="true"
                  defaultChecked
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Kasbon & Pinjaman Karyawan
              </label>
            </div>

            <button type="submit" className={buttonClass}>
              📥 Download Arsip Excel
            </button>
          </form>
        </Card>

        {/* Formulir 2: Pembersihan Data Lama Terproteksi */}
        <Card title="2. Bersihkan Data Lama (Optional)">
          <div className="text-sm leading-6 text-amber-900 bg-amber-50 border border-amber-200 p-3 rounded-xl font-medium space-y-1">
            <p>⚠️ <b>Perhatian Sebelum Menghapus:</b></p>
            <p className="text-xs leading-5 text-amber-800">
              Pastikan Anda sudah mengunduh file Excel di sebelah kiri. Penghapusan ini permanen untuk melegakan kapasitas database, namun <b>sama sekali tidak memengaruhi stok gudang</b>.
            </p>
          </div>

          <form action={cleanupArchivedData} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tanggal Mulai">
                <input
                  type="date"
                  name="start_date"
                  defaultValue={firstDayLastMonth}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Tanggal Selesai">
                <input
                  type="date"
                  name="end_date"
                  defaultValue={today}
                  required
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Data yang Akan Dihapus:
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  name="delete_attendance"
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                Hapus Presensi Periode Ini
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  name="delete_warung"
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                Hapus Nota Warung Periode Ini
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  name="delete_kasbon"
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                Hapus Kasbon Periode Ini
              </label>
            </div>

            <Field label="Ketik Kata Konfirmasi">
              <input
                className={inputClass}
                name="confirmation"
                required
                pattern="HAPUS"
                autoComplete="off"
                placeholder="Ketik HAPUS"
                data-validation-message="Ketik HAPUS persis dengan huruf kapital untuk melanjutkan."
              />
            </Field>

            <button type="submit" className={dangerClass}>
              🗑️ Hapus Data Periode Terpilih
            </button>
          </form>
        </Card>
      </div>

      {/* Snapshot Database Lengkap */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Buat Snapshot Cadangan Database">
          <p className="text-sm leading-6 text-slate-600">
            Snapshot menyalin seluruh data bisnis ke catatan cadangan internal database Supabase dalam satu transaksi aman.
          </p>
          <form action={createBackup} className="mt-4 space-y-3">
            <Field label="Label Snapshot (opsional)">
              <input
                className={inputClass}
                name="label"
                maxLength={120}
                placeholder="Contoh: Arsip Akhir Bulan"
              />
            </Field>
            <button className={buttonClass}>Buat Snapshot Sekarang</button>
          </form>
        </Card>

        <Card title="Daftar Snapshot Database">
          {backups.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Kode</Th>
                  <Th>Label</Th>
                  <Th>Ukuran</Th>
                  <Th>Dibuat</Th>
                  <Th>Export</Th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.id}>
                    <Td>{backup.backup_code}</Td>
                    <Td>{backup.label || "-"}</Td>
                    <Td>{sizeLabel(backup.byte_size)}</Td>
                    <Td>{backup.created_at?.slice(0, 10)}</Td>
                    <Td>
                      <a
                        href={`/api/export/backup?backup_id=${backup.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
                      >
                        📥 Excel
                      </a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <p className="text-sm text-slate-500">Belum ada snapshot database tersimpan.</p>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
