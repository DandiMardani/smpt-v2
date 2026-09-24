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
  secondaryClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { text } from "@/lib/final/final-utils";
import { param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { ResetGroupSelector } from "./reset-group-selector";
import {
  createBackup,
  fullDevReset,
  resetDummyRun,
  resetSelected,
  restoreBackup,
  runDiagnostic,
  runDummyFull,
  runManualBoronganTest,
  runRepeatOrderTest,
} from "./actions";

type Props = { searchParams: Promise<SearchParams> };
type TestRun = {
  id: number;
  run_code: string;
  run_type: string;
  status: string;
  result: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
};
type Step = {
  step?: string;
  status?: string;
  actual?: unknown;
  expected?: unknown;
  possible_cause?: unknown;
  error_database?: unknown;
  sqlstate?: unknown;
};
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

function renderValue(value: unknown) {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default async function Page({ searchParams }: Props) {
  await requirePermission("setup_test.admin");
  const q = await searchParams;
  const s = await createClient();

  const [healthRes, runsRes, backupsRes, dummyRes] = await Promise.all([
    s.rpc("smpt_final_health"),
    s.from("system_test_runs").select("id,run_code,run_type,status,result,started_at,finished_at").order("id", { ascending: false }).limit(20),
    s.from("system_data_backups").select("id,backup_code,label,status,byte_size,created_at,last_restored_at").order("id", { ascending: false }).limit(12),
    s.from("system_test_runs").select("id,run_code,run_type,status,result,started_at,finished_at").in("run_type", ["DUMMY_FULL", "REPEAT_ORDER", "MANIPULASI_PAYROLL"]).eq("status", "PASS").order("id", { ascending: false }).limit(12),
  ]);

  const firstError = healthRes.error || runsRes.error || backupsRes.error || dummyRes.error;
  if (firstError) throw new Error(firstError.message);

  const h = (healthRes.data ?? {}) as Record<string, unknown>;
  const runs = (runsRes.data ?? []) as TestRun[];
  const backups = (backupsRes.data ?? []) as Backup[];
  const dummyRuns = ((dummyRes.data ?? []) as TestRun[]).filter((run) => !run.result?.reset_at && !run.result?.maintenance_invalidated_at);
  const latestDiagnostic = runs.find((run) => run.run_type === "DIAGNOSTIC");
  const latestDummy = runs.find((run) => run.run_type === "DUMMY_FULL");
  const latestRepeat = runs.find((run) => run.run_type === "REPEAT_ORDER");
  const latestManipulation = runs.find((run) => run.run_type === "MANIPULASI_PAYROLL");
  const latestDetailed = [latestDiagnostic, latestDummy, latestRepeat, latestManipulation]
    .filter((run): run is TestRun => Boolean(run))
    .sort((a, b) => b.id - a.id)[0];
  const steps = Array.isArray(latestDetailed?.result?.steps) ? (latestDetailed.result.steps as Step[]) : [];

  return (
    <PageShell
      eyebrow="System"
      title="Setup & Data Test"
      description="Pusat testing dan maintenance SMPT V2. Dummy Full + runtime test Repeat Order + runtime test Manipulasi Payroll berjalan dengan Run ID; Backup/Restore dan Reset dikerjakan di database dengan guard dan FK dependency cleanup."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      <Flow>
        Urutan aman: <b>Backup → Dummy Full → Diagnostic → runtime check → Reset Dummy</b>. Full Dev Reset selalu menawarkan backup dan tidak menghapus Auth, role/permission, profile, stock location system, payroll settings, migration/schema, atau audit log.
      </Flow>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="SPK" value={text(h.production_orders, "0")} />
        <Metric label="QC" value={text(h.qc_inspections, "0")} />
        <Metric label="Barang Jadi" value={text(h.finished_goods, "0")} />
        <Metric label="Negative Raw" value={text(h.negative_raw_stock, "0")} />
        <Metric label="Negative Logistics" value={text(h.negative_logistics_stock, "0")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Dummy Full End-to-End">
          <p className="text-sm leading-6 text-slate-600">
            Membuat data test terisolasi dari Master → BOM → Supplier → Planning → Draft/Issue PO → partial PO receipt + Roll/Lot → Gudang → Cutting → Gudang Hasil → Sablon → SPV Request → Gudang Fulfill → SPK → Checker HARD routing → QC → Barang Jadi → SET/Packing → Pengiriman.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Jika satu step gagal, seluruh data dummy dari run tersebut rollback otomatis dan hanya diagnostic FAIL yang disimpan.
          </p>
          <form action={runDummyFull} className="mt-4">
            <button className={buttonClass}>Buat Dummy Full</button>
          </form>
          {latestDummy ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>Terakhir:</span><b className="font-semibold text-slate-900">{latestDummy.run_code}</b><Badge>{latestDummy.status}</Badge><span>{latestDummy.started_at}</span>
            </div>
          ) : null}
        </Card>

        <Card title="System Diagnostic">
          <p className="text-sm leading-6 text-slate-600">
            Cek negative stock, SPV Request → Gudang, Procurement/PO, PO Receipt, serta konflik signature RPC fulfill. Setiap run mempunyai reference/test run ID.
          </p>
          <form action={runDiagnostic} className="mt-4">
            <button className={secondaryClass}>Jalankan Diagnostic</button>
          </form>
          {latestDiagnostic ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>Terakhir:</span><b className="font-semibold text-slate-900">{latestDiagnostic.run_code}</b><Badge>{latestDiagnostic.status}</Badge><span>{latestDiagnostic.started_at}</span>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Runtime Test · Repeat Order">
          <p className="text-sm leading-6 text-slate-600">
            Membuat source dummy, menjalankan Repeat Order lewat RPC yang sama dengan fitur utama, lalu memverifikasi target baru, Produk/Tas, BOM, Item, Routing, profile pelaksana/pengajuan, trace source, transaksi tercopy = 0, dan repeat project bisa dipakai membuat Draft SPK normal.
          </p>
          <form action={runRepeatOrderTest} className="mt-4"><button className={buttonClass}>Jalankan Repeat Order Test</button></form>
          {latestRepeat ? <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500"><span>Terakhir:</span><b className="font-semibold text-slate-900">{latestRepeat.run_code}</b><Badge>{latestRepeat.status}</Badge><span>{latestRepeat.started_at}</span></div> : null}
        </Card>

        <Card title="Runtime Test · HARIAN → BORONGAN → Payroll Operator">
          <p className="text-sm leading-6 text-slate-600">
            Membuat pekerja HARIAN + absensi terverifikasi, input Qty Hasil manual, memverifikasi progress, finalisasi Payroll Operator (Nilai Operator = 0; Nilai Pengajuan benar), lalu finalisasi payout mingguan untuk memastikan payroll HARIAN tetap terpisah tanpa double-pay.
          </p>
          <form action={runManualBoronganTest} className="mt-4"><button className={buttonClass}>Jalankan Manipulasi Payroll Test</button></form>
          {latestManipulation ? <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500"><span>Terakhir:</span><b className="font-semibold text-slate-900">{latestManipulation.run_code}</b><Badge>{latestManipulation.status}</Badge><span>{latestManipulation.started_at}</span></div> : null}
        </Card>
      </div>

      {latestDetailed && latestDetailed.status === "FAIL" && !steps.length ? (
        <Card title={`Error ${latestDetailed.run_code}`}>
          <p className="text-sm font-medium text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-xl">
            {String(latestDetailed.result?.error || "Test gagal.")} · SQLSTATE {String(latestDetailed.result?.sqlstate || "-")}
          </p>
          <p className="mt-2 text-xs text-slate-600">{String(latestDetailed.result?.possible_cause || "Lihat detail database/RLS/permission.")}</p>
        </Card>
      ) : null}

      {steps.length ? (
        <Card title={`Detail ${latestDetailed?.run_code || "Test"}`}>
          <TableWrap>
            <thead><tr><Th>Step</Th><Th>Status</Th><Th>Actual</Th><Th>Expected</Th><Th>Error / Kemungkinan Penyebab</Th></tr></thead>
            <tbody>
              {steps.map((step, index) => (
                <tr key={`${step.step || "step"}-${index}`}>
                  <Td>{step.step || "-"}</Td>
                  <Td><Badge>{step.status || "-"}</Badge></Td>
                  <Td><span className="block max-w-xl whitespace-normal text-xs">{renderValue(step.actual)}</span></Td>
                  <Td><span className="block max-w-xl whitespace-normal text-xs">{renderValue(step.expected)}</span></Td>
                  <Td><span className="block max-w-xl whitespace-normal text-xs">{renderValue(step.error_database || step.possible_cause)}{step.sqlstate ? ` · SQLSTATE ${step.sqlstate}` : ""}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Backup Data">
          <p className="text-sm leading-6 text-slate-600">
            Snapshot konsisten seluruh data bisnis dalam satu transaksi database. Security/config inti dan audit log tidak dimasukkan ke snapshot agar restore tidak merusak sistem akses.
          </p>
          <form action={createBackup} className="mt-4 space-y-3">
            <Field label="Label Backup (opsional)"><input className={inputClass} name="label" maxLength={120} placeholder="Contoh: sebelum test procurement" /></Field>
            <button className={buttonClass}>Buat Backup Sekarang</button>
          </form>
        </Card>

        <Card title="Restore Backup">
          <p className="text-sm leading-6 text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-xl font-medium">
            Restore mengganti seluruh data bisnis dengan isi backup. Restore otomatis ditolak bila fingerprint schema sudah berubah sejak backup dibuat.
          </p>
          <form action={restoreBackup} className="mt-4 space-y-3">
            <Field label="Pilih Backup">
              <select className={inputClass} name="backup_id" required data-field-label="Backup">
                <option value="">Pilih backup</option>
                {backups.map((backup) => <option key={backup.id} value={backup.id}>{backup.backup_code} · {backup.label || "Tanpa label"} · {sizeLabel(backup.byte_size)}</option>)}
              </select>
            </Field>
            <Field label="Konfirmasi RESTORE">
              <input className={inputClass} name="confirmation" required pattern="RESTORE" autoComplete="off" placeholder="Ketik RESTORE" data-validation-message="Ketik RESTORE persis untuk melanjutkan." />
            </Field>
            <button className={dangerClass}>Restore Backup</button>
          </form>
        </Card>
      </div>

      <Card title="Backup Tersimpan">
        {backups.length ? (
          <TableWrap>
            <thead><tr><Th>Backup</Th><Th>Label</Th><Th>Status</Th><Th>Ukuran</Th><Th>Dibuat</Th><Th>Restore Terakhir</Th></tr></thead>
            <tbody>{backups.map((backup) => <tr key={backup.id}><Td>{backup.backup_code}</Td><Td>{backup.label || "-"}</Td><Td>{backup.status}</Td><Td>{sizeLabel(backup.byte_size)}</Td><Td>{backup.created_at}</Td><Td>{backup.last_restored_at || "-"}</Td></tr>)}</tbody>
          </TableWrap>
        ) : <p className="text-sm text-slate-500">Belum ada backup.</p>}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Reset Dummy Run">
          <p className="text-sm leading-6 text-slate-600">
            Menghapus hanya row yang dibuat oleh satu run PASS: Dummy Full, Repeat Order Test, atau Manipulasi Payroll Test. Data lain tidak dipilih berdasarkan nama/tebakan; setiap inserted row dicatat dengan Run ID.
          </p>
          <form action={resetDummyRun} className="mt-4 space-y-3">
            <Field label="Run Test yang Bisa Dibersihkan">
              <select className={inputClass} name="run_id" required data-field-label="Dummy Run">
                <option value="">Pilih run yang akan dibersihkan</option>
                {dummyRuns.map((run) => <option key={run.id} value={run.id}>{run.run_code} · {run.started_at}</option>)}
              </select>
            </Field>
            <Field label="Konfirmasi DELETE DUMMY">
              <input className={inputClass} name="confirmation" required pattern="DELETE DUMMY" autoComplete="off" placeholder="Ketik DELETE DUMMY" data-validation-message="Ketik DELETE DUMMY persis untuk melanjutkan." />
            </Field>
            <button className={dangerClass}>Hapus Dummy Run Ini</button>
          </form>
        </Card>

        <Card title="Selective Reset">
          <p className="text-sm leading-6 text-slate-600">
            Dependency FK dihitung backend. Procurement ikut membersihkan raw-material flow terkait agar ledger tidak tertinggal. Pilihan tidak pernah menghapus role/permission/profile/system config.
          </p>
          <form action={resetSelected} className="mt-4 space-y-3">
            <ResetGroupSelector />
            <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer"><input type="checkbox" name="backup_before" defaultChecked className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> Buat backup otomatis sebelum reset</label>
            <Field label="Konfirmasi RESET">
              <input className={inputClass} name="confirmation" required pattern="RESET" autoComplete="off" placeholder="Ketik RESET" data-validation-message="Ketik RESET persis untuk melanjutkan." />
            </Field>
            <button className={dangerClass}>Jalankan Selective Reset</button>
          </form>
        </Card>
      </div>

      <Card title="Full Dev Reset">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-sm leading-6 text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-xl font-medium">
              Menghapus seluruh data bisnis pada whitelist maintenance lalu membuat baseline lokasi PUSAT bila diperlukan. Tidak menghapus migration/schema, Supabase Auth, roles, permissions, role permissions, profiles, user permission overrides, stock location state machine, payroll settings, atau audit log.
            </p>
            <p className="mt-2 text-xs text-slate-500">Gunakan ini hanya untuk environment development/test. Backup otomatis sebaiknya tetap aktif.</p>
          </div>
          <form action={fullDevReset} className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer"><input type="checkbox" name="backup_before" defaultChecked className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> Buat backup otomatis sebelum Full Reset</label>
            <Field label="Konfirmasi FULL RESET">
              <input className={inputClass} name="confirmation" required pattern="FULL RESET" autoComplete="off" placeholder="Ketik FULL RESET" data-validation-message="Ketik FULL RESET persis untuk melanjutkan." />
            </Field>
            <button className={dangerClass}>Full Dev Reset</button>
          </form>
        </div>
      </Card>

      <Card title="Riwayat Test & Maintenance">
        {runs.length ? (
          <TableWrap>
            <thead><tr><Th>Run ID</Th><Th>Jenis</Th><Th>Status</Th><Th>Mulai</Th><Th>Selesai</Th></tr></thead>
            <tbody>{runs.map((run) => <tr key={run.id}><Td>{run.run_code}</Td><Td>{run.run_type}</Td><Td><Badge>{run.status}</Badge></Td><Td>{run.started_at}</Td><Td>{run.finished_at || "-"}</Td></tr>)}</tbody>
          </TableWrap>
        ) : <p className="text-sm text-slate-500">Belum ada test/maintenance run.</p>}
      </Card>
    </PageShell>
  );
}
