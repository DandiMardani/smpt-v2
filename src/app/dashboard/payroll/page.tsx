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

  const [
    payrollRunResult,
    payrollItemResult,
    operatorRunResult,
    operatorItemResult,
    workersResult,
    workerIdResult,
    settingsResult,
    advancesResult,
  ] = await Promise.all([
    supabase.from("payroll_runs").select("*").order("period_end", { ascending: false }).limit(100),
    supabase.from("payroll_run_items").select("*").limit(2000),
    supabase.from("operator_payroll_runs").select("*").order("period_end", { ascending: false }).limit(100),
    supabase.from("operator_payroll_items").select("*").order("id", { ascending: false }).limit(3000),
    supabase.from("workers").select("id, worker_code, name, phone, department, position, identity_no, pay_system"),
    supabase.rpc("smpt_current_worker_id"),
    supabase.from("payroll_settings").select("key, value_numeric, value_text"),
    supabase
      .from("cash_advances")
      .select("id, worker_id, amount, paid_amount, category, warung_name, installment_amount, status")
      .eq("status", "AKTIF")
      .limit(2000),
  ]);
  const error = [payrollRunResult.error, payrollItemResult.error, operatorRunResult.error, operatorItemResult.error, workersResult.error].find(Boolean);
  if (error) throw new Error(error.message);

  const payrollRuns = (payrollRunResult.data ?? []) as PayrollRunRow[];
  const payrollItems = (payrollItemResult.data ?? []) as PayrollItemRow[];
  const workers = (workersResult.data ?? []) as WorkerInfo[];
  const operatorRuns = (operatorRunResult.data ?? []) as OperatorRun[];
  const operatorItems = (operatorItemResult.data ?? []) as OperatorItem[];
  const currentWorkerId = (workerIdResult.data as number | null) ?? null;
  const activeAdvances = (advancesResult.data ?? []) as any[];
  const operatorRunMap = new Map(operatorRuns.map((run) => [run.id, run]));
  const payrollRunMap = new Map(payrollRuns.map((run) => [run.id, run]));
  const workerMap = new Map(workers.map((w) => [w.id, w]));

  // Petakan live kasbon aktif per pekerja
  const activeAdvMap = new Map<number, { kasbonP: number; kasbonW: number }>();
  for (const a of activeAdvances) {
    if (a.status !== "AKTIF") continue;
    const cur = activeAdvMap.get(a.worker_id) || { kasbonP: 0, kasbonW: 0 };
    const rem = Math.max(0, Number(a.amount || 0) - Number(a.paid_amount || 0));
    if (a.category === "KASBON_PERUSAHAAN" || a.category === "KASBON_KANTOR") {
      const inst = Number(a.installment_amount || 0);
      cur.kasbonP += inst > 0 ? Math.min(inst, rem) : rem;
    } else if (a.category === "KASBON_WARUNG") {
      cur.kasbonW += rem;
    }
    activeAdvMap.set(a.worker_id, cur);
  }

  // Sinkronisasi khusus run yang BELUM DIBAYAR (status !== 'PAID' dan !== 'DIBATALKAN')
  const unpaidRuns = payrollRuns.filter((r) => r.status !== "PAID" && r.status !== "DIBATALKAN");
  const unpaidRunIds = new Set(unpaidRuns.map((r) => r.id));

  const itemsToSyncDb: PayrollItemRow[] = [];
  const synchronizedPayrollItems = payrollItems.map((it) => {
    if (!unpaidRunIds.has(it.payroll_run_id)) return it;
    const live = activeAdvMap.get(it.worker_id);
    const runInfo = payrollRunMap.get(it.payroll_run_id);
    const workerInfo = workerMap.get(it.worker_id);

    const isBulananWorker = workerInfo?.pay_system === "BULANAN" || it.pay_system_snapshot === "BULANAN";
    const isWeeklyOrMealRun =
      runInfo?.payroll_type === "MINGGUAN" ||
      runInfo?.payroll_type === "UANG_MAKAN" ||
      /makan|mingguan/i.test(runInfo?.notes || "") ||
      /makan|mingguan/i.test(runInfo?.payroll_code || "");

    const effP = (isBulananWorker && isWeeklyOrMealRun) ? 0 : (live?.kasbonP ?? Number(it.kasbon_perusahaan_amount || 0));
    const effW = (isBulananWorker && isWeeklyOrMealRun) ? 0 : (live?.kasbonW ?? Number(it.kasbon_warung_amount || 0));

    const curP = Number(it.kasbon_perusahaan_amount || 0);
    const curW = Number(it.kasbon_warung_amount || 0);

    const gross =
      Number(it.base_amount || 0) +
      Number(it.meal_amount || 0) +
      Number(it.overtime_amount || 0) +
      Number(it.manual_overtime_amount || 0) +
      Number(it.overtime_bonus || 0) +
      Number(it.holiday_bonus || 0) +
      Number(it.holiday_manual_amount || 0);
    const deduction = Math.round((effP + effW) * 100) / 100;
    const net = Math.max(0, Math.round((gross - deduction) * 100) / 100);

    if (Math.abs(curP - effP) < 0.01 && Math.abs(curW - effW) < 0.01 && Math.abs(Number(it.net_amount || 0) - net) < 0.01) {
      return it;
    }

    const updated = {
      ...it,
      kasbon_perusahaan_amount: effP,
      kasbon_warung_amount: effW,
      deduction_amount: deduction,
      net_amount: net,
    };
    itemsToSyncDb.push(updated);
    return updated;
  });

  // Pembaruan data sinkronisasi ke database
  if (itemsToSyncDb.length > 0 && canWrite) {
    (async () => {
      try {
        for (const item of itemsToSyncDb) {
          await supabase
            .from("payroll_run_items")
            .update({
              kasbon_perusahaan_amount: item.kasbon_perusahaan_amount,
              kasbon_warung_amount: item.kasbon_warung_amount,
              deduction_amount: item.deduction_amount,
              net_amount: item.net_amount,
            })
            .eq("id", item.id);
        }
        for (const run of unpaidRuns) {
          const runItems = synchronizedPayrollItems.filter((i) => i.payroll_run_id === run.id);
          const tGross = runItems.reduce((acc, i) => acc + Number(i.base_amount || 0) + Number(i.meal_amount || 0) + Number(i.overtime_amount || 0) + Number(i.manual_overtime_amount || 0) + Number(i.overtime_bonus || 0) + Number(i.holiday_bonus || 0) + Number(i.holiday_manual_amount || 0), 0);
          const tDed = runItems.reduce((acc, i) => acc + Number(i.deduction_amount || 0), 0);
          const tNet = runItems.reduce((acc, i) => acc + Number(i.net_amount || 0), 0);
          await supabase
            .from("payroll_runs")
            .update({ total_gross: tGross, total_deduction: tDed, total_net: tNet })
            .eq("id", run.id);
        }
      } catch (err) {
        console.error("Auto sync advances DB error:", err);
      }
    })();
  }

  const settingsRows = (settingsResult.data ?? []) as Array<{ key: string; value_numeric: number | null; value_text: string | null }>;
  const settingsMap: PayrollSettingsMap = {};
  settingsRows.forEach((r) => {
    (settingsMap as any)[r.key] = r.value_numeric ?? r.value_text;
  });

  const latestRunId = payrollRuns[0]?.id ?? "";

  // Cari batch BULANAN terbaru untuk ditampilkan rincian detailnya
  const latestBulananRun = payrollRuns.find((r) => r.payroll_type === "BULANAN") || payrollRuns[0];
  const bulananItems = latestBulananRun
    ? synchronizedPayrollItems.filter((it) => it.payroll_run_id === latestBulananRun.id)
    : [];

  return (
    <PageShell
      eyebrow="SDM & Payroll"
      title="Payroll & Slip Gaji"
      description="Kelola finalisasi upah HARIAN & BULANAN, pencairan uang makan mingguan tanpa potongan kasbon, cetak slip gaji resmi, dan ekspor dokumen laporan format CV. SMPT."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      {/* Tombol Ekspor Laporan Sesuai Format CV. SMPT */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/export/xlsx?report=pembayaran_uang_makan&run_id=${latestRunId}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-900 shadow-xs hover:bg-amber-100 transition"
        >
          🍱 Export Form Pembayaran Uang Makan (Excel)
        </a>
        <a
          href={`/api/export/xlsx?report=pembayaran_upah_harian&run_id=${latestRunId}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3.5 py-1.5 text-xs font-bold text-blue-900 shadow-xs hover:bg-blue-100 transition"
        >
          📑 Export Form Pembayaran Upah Harian (Excel)
        </a>
        <a
          href={`/api/export/xlsx?report=payroll_slips&run_id=${latestBulananRun?.id ?? latestRunId}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs hover:bg-emerald-100 transition"
        >
          📥 Export Slip Bulanan
        </a>
        <a
          href={`/api/export/xlsx?report=operator_payroll_slips&run_id=${operatorRuns[0]?.id ?? ""}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-800 shadow-xs hover:bg-violet-100 transition"
        >
          📥 Export Slip Borongan
        </a>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Flow>
          Pencairan Uang Makan Mingguan staf BULANAN dihitung murni dari hari masuk aktif tanpa pemotongan kasbon warung maupun kasbon kantor. Potongan kasbon resmi hanya berlaku pada proses Payroll Bulanan akhir bulan.
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
        workerCount={payrollRuns[0] ? synchronizedPayrollItems.filter((it) => it.payroll_run_id === payrollRuns[0].id).length : 0}
        slipsNode={
          <div className="space-y-6 min-w-0 max-w-full">
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

            {/* TABEL RINCIAN GAJI KARYAWAN BULANAN RESMI */}
            {latestBulananRun ? (
              <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-blue-600 px-2 py-0.5 text-xs font-black text-white">
                        {latestBulananRun.payroll_code}
                      </span>
                      <h2 className="text-base font-extrabold text-slate-900">
                        Rekapitulasi Gaji Karyawan Bulanan
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Periode: <b>{latestBulananRun.period_start} s/d {latestBulananRun.period_end}</b> — Memuat rincian Gaji Pokok, Lembur, Kasbon Kantor & Kasbon Warung.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Total Cair Bersih</div>
                      <div className="text-lg font-black text-emerald-600">{money(latestBulananRun.total_net)}</div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5">Pekerja</th>
                        <th className="px-3 py-2.5 text-right">Gaji Pokok</th>
                        <th className="px-3 py-2.5 text-right">Lembur</th>
                        <th className="px-3 py-2.5 text-right bg-blue-50/50">Total Bruto</th>
                        <th className="px-3 py-2.5 text-right text-rose-600">Kasbon Kantor</th>
                        <th className="px-3 py-2.5 text-right text-amber-600">Kasbon Warung</th>
                        <th className="px-3 py-2.5 text-right text-rose-700 bg-rose-50/50">Tot. Potongan</th>
                        <th className="px-3 py-2.5 text-right bg-emerald-50 text-emerald-700 font-black">Gaji Bersih (THP)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bulananItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-4 text-center text-slate-400 italic">
                            Belum ada rincian item pekerja untuk run bulanan ini.
                          </td>
                        </tr>
                      ) : (
                        bulananItems.map((item) => {
                          const w = workerMap.get(item.worker_id);
                          const gross =
                            Number(item.base_amount || 0) +
                            Number(item.meal_amount || 0) +
                            Number(item.overtime_amount || 0) +
                            Number(item.manual_overtime_amount || 0) +
                            Number(item.overtime_bonus || 0) +
                            Number(item.holiday_bonus || 0) +
                            Number(item.holiday_manual_amount || 0);
                          const lemburTotal =
                            Number(item.overtime_amount || 0) +
                            Number(item.manual_overtime_amount || 0) +
                            Number(item.overtime_bonus || 0);

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/80 transition">
                              <td className="px-3 py-2.5 font-bold text-slate-900">
                                <div>{item.worker_name_snapshot || w?.name || `Worker #${item.worker_id}`}</div>
                                <div className="text-[10px] font-normal text-slate-400">{w?.worker_code || w?.position || "Staf Bulanan"}</div>
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium">{money(item.base_amount)}</td>
                              <td className="px-3 py-2.5 text-right text-slate-600 font-medium">{money(lemburTotal)}</td>
                              <td className="px-3 py-2.5 text-right font-bold text-slate-900 bg-blue-50/30">{money(gross)}</td>
                              <td className="px-3 py-2.5 text-right text-rose-600 font-medium">{money(item.kasbon_perusahaan_amount)}</td>
                              <td className="px-3 py-2.5 text-right text-amber-600 font-medium">{money(item.kasbon_warung_amount)}</td>
                              <td className="px-3 py-2.5 text-right text-rose-700 font-bold bg-rose-50/30">{money(item.deduction_amount)}</td>
                              <td className="px-3 py-2.5 text-right font-black text-emerald-700 bg-emerald-50/60 text-sm">
                                {money(item.net_amount)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Slip Gaji & WhatsApp Manager (Form Uang Makan & Operator) */}
            <PayrollSlipManager
              runs={payrollRuns}
              items={synchronizedPayrollItems}
              operatorRuns={operatorRuns}
              operatorItems={operatorItems}
              workers={workers}
              activeAdvances={activeAdvances}
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
