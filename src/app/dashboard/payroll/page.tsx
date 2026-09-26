import {
  Badge,
  Card,
  Empty,
  Field,
  Flow,
  Metric,
  Notice,
  PageShell,
  ReadOnly,
  TableWrap,
  Td,
  Th,
  buttonClass,
  inputClass,
} from "@/components/final/final-ui";
import { PayrollSlipManager, type WorkerInfo, type PayrollRunRow, type PayrollItemRow } from "@/components/payroll/payroll-slip-manager";
import PayrollSettingsModal, { type PayrollSettingsMap } from "@/components/payroll/payroll-settings-modal";
import PayrollFinalizeForm from "@/components/payroll/payroll-finalize-form";
import PayrollViewTabs from "@/components/payroll/payroll-view-tabs";
import { requireAnyPermission } from "@/lib/access/current-user";
import { finalizeOperatorPayrollAction, finalizePayrollAction } from "@/lib/final/actions";
import { money, param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<SearchParams> };

type OperatorRun = {
  id: number;
  payroll_code: string;
  period_start: string;
  period_end: string;
  status: string;
  total_operator_value: number | string;
  total_submission_value: number | string;
};

type OperatorItem = {
  id: number;
  run_id: number;
  worker_id: number;
  worker_name_snapshot: string;
  work_item_name_snapshot: string;
  qty_approved: number | string;
  operator_price_snapshot: number | string;
  submission_price_snapshot: number | string;
  operator_value: number | string;
  submission_value: number | string;
};

export default async function Page({ searchParams }: Props) {
  const access = await requireAnyPermission(["payroll.view", "payroll.operator.view", "pekerjaan_saya.view"]);
  const canWrite = access.permissionCodes.includes("payroll.write");
  const q = await searchParams;
  const supabase = await createClient();

  const [payrollRunResult, payrollItemResult, operatorRunResult, operatorItemResult, workersResult, workerIdResult, settingsResult] = await Promise.all([
    supabase.from("payroll_runs").select("*").order("period_end", { ascending: false }).limit(100),
    supabase.from("payroll_run_items").select("*").limit(2000),
    supabase.from("operator_payroll_runs").select("*").order("period_end", { ascending: false }).limit(100),
    supabase.from("operator_payroll_items").select("*").order("id", { ascending: false }).limit(3000),
    supabase.from("workers").select("id, worker_code, name, phone, department, position, identity_no, pay_system"),
    supabase.rpc("smpt_current_worker_id"),
    supabase.from("payroll_settings").select("key, value_numeric, value_text"),
  ]);
  const error = [payrollRunResult.error, payrollItemResult.error, operatorRunResult.error, operatorItemResult.error, workersResult.error].find(Boolean);
  if (error) throw new Error(error.message);

  const payrollRuns = (payrollRunResult.data ?? []) as PayrollRunRow[];
  const payrollItems = (payrollItemResult.data ?? []) as PayrollItemRow[];
  const workers = (workersResult.data ?? []) as WorkerInfo[];
  const operatorRuns = (operatorRunResult.data ?? []) as OperatorRun[];
  const operatorItems = (operatorItemResult.data ?? []) as OperatorItem[];
  const currentWorkerId = (workerIdResult.data as number | null) ?? null;
  const operatorRunMap = new Map(operatorRuns.map((run) => [run.id, run]));

  const settingsRows = (settingsResult.data ?? []) as Array<{ key: string; value_numeric: number | null; value_text: string | null }>;
  const settingsMap: PayrollSettingsMap = {};
  settingsRows.forEach((r) => {
    (settingsMap as any)[r.key] = r.value_numeric ?? r.value_text;
  });

  return (
    <PageShell
      eyebrow="SDM & Payroll"
      title="Payroll & Slip Gaji"
      description="Kelola finalisasi upah HARIAN & BULANAN, cetak slip gaji resmi, dan kirimkan slip gaji langsung ke WhatsApp pekerja dengan format teks rapi atau gambar slip."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Flow>
          HARIAN/BULANAN memakai Master Pekerja + absensi terverifikasi. Slip gaji dapat dicetak satuan, dicetak massal per periode, atau dikirimkan langsung ke nomor WhatsApp pekerja lengkap dengan rincian pendapatan, potongan kasbon, dan upah bersih (netto).
        </Flow>
        {canWrite ? (
          <div className="shrink-0">
            <PayrollSettingsModal initialSettings={settingsMap} canWrite={canWrite} returnPath="/dashboard/payroll" />
          </div>
        ) : null}
      </div>

      <PayrollViewTabs
        canWrite={canWrite}
        activeRunCode={payrollRuns[0]?.payroll_code}
        workerCount={payrollRuns[0] ? payrollItems.filter((it) => it.payroll_run_id === payrollRuns[0].id).length : 0}
        slipsNode={
          <div className="space-y-4 min-w-0 max-w-full">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center sm:text-left min-w-0">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-2.5 sm:p-3 shadow-2xs min-w-0">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">Total Run</span>
                <div className="text-base sm:text-2xl font-black text-slate-800">{payrollRuns.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200/90 bg-white p-2.5 sm:p-3 shadow-2xs min-w-0">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">Pekerja Aktif</span>
                <div className="text-base sm:text-2xl font-black text-blue-600">{workers.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200/90 bg-white p-2.5 sm:p-3 shadow-2xs min-w-0">
                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">Run Operator</span>
                <div className="text-base sm:text-2xl font-black text-emerald-600">{operatorRuns.length}</div>
              </div>
            </div>

            {/* Slip Gaji & WhatsApp Manager (Utama) */}
            <PayrollSlipManager
              runs={payrollRuns}
              items={payrollItems}
              operatorRuns={operatorRuns}
              operatorItems={operatorItems}
              workers={workers}
              currentWorkerId={currentWorkerId}
              canWrite={canWrite}
            />
          </div>
        }
        finalizeNode={
          canWrite ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Finalisasi Payroll Umum">
                <PayrollFinalizeForm />
              </Card>
              <Card title="Finalisasi Payroll Operator / Pengajuan">
                <form action={finalizeOperatorPayrollAction} className="grid gap-3">
                  <Field label="Periode Mulai"><input name="period_start" type="date" required className={inputClass} /></Field>
                  <Field label="Periode Selesai"><input name="period_end" type="date" required className={inputClass} /></Field>
                  <Field label="Catatan"><input name="notes" className={inputClass} /></Field>
                  <button className={buttonClass}>Finalisasi Operator</button>
                </form>
              </Card>
            </div>
          ) : null
        }
        historyNode={
          <div className="space-y-4">
            <Card title="Riwayat Finalisasi Payroll Umum">
              <TableWrap>
                <thead><tr><Th>Kode</Th><Th>Jenis</Th><Th>Periode</Th><Th>Bruto</Th><Th>Potongan</Th><Th>Net</Th></tr></thead>
                <tbody>{payrollRuns.map((item) => <tr key={item.id}><Td>{item.payroll_code}</Td><Td>{item.payroll_type}</Td><Td>{item.period_start}—{item.period_end}</Td><Td>{money(item.total_gross)}</Td><Td>{money(item.total_deduction)}</Td><Td>{money(item.total_net)}</Td></tr>)}</tbody>
              </TableWrap>
            </Card>

            <Card title="Payroll Operator / Pengajuan">
              {operatorRuns.length === 0 ? <Empty>Belum ada finalisasi Payroll Operator.</Empty> : (
                <TableWrap>
                  <thead><tr><Th>Kode</Th><Th>Periode</Th><Th>Status</Th><Th>Nilai Operator</Th><Th>Nilai Pengajuan</Th></tr></thead>
                  <tbody>{operatorRuns.map((item) => <tr key={item.id}><Td>{item.payroll_code}</Td><Td>{item.period_start}—{item.period_end}</Td><Td><Badge>{item.status}</Badge></Td><Td>{money(item.total_operator_value)}</Td><Td>{money(item.total_submission_value)}</Td></tr>)}</tbody>
                </TableWrap>
              )}
            </Card>

            <Card title="Detail Payroll Operator / Pengajuan">
              {operatorItems.length === 0 ? <Empty>Belum ada detail Payroll Operator.</Empty> : (
                <TableWrap>
                  <thead><tr><Th>Run</Th><Th>Pekerja</Th><Th>Item Pekerjaan</Th><Th>Qty</Th><Th>Harga Operator</Th><Th>Harga Pengajuan</Th><Th>Nilai Operator</Th><Th>Nilai Pengajuan</Th></tr></thead>
                  <tbody>
                    {operatorItems.map((item) => (
                      <tr key={item.id}>
                        <Td>{operatorRunMap.get(item.run_id)?.payroll_code ?? `Run #${item.run_id}`}</Td>
                        <Td>{item.worker_name_snapshot}</Td>
                        <Td>{item.work_item_name_snapshot}</Td>
                        <Td>{qty(item.qty_approved)}</Td>
                        <Td>{money(item.operator_price_snapshot)}</Td>
                        <Td>{money(item.submission_price_snapshot)}</Td>
                        <Td>{money(item.operator_value)}</Td>
                        <Td><b>{money(item.submission_value)}</b></Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Card>
          </div>
        }
      />
    </PageShell>
  );
}
