import {
  Badge,
  Card,
  Empty,
  Field,
  Flow,
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
import PayrollAccordionTable from "@/components/payroll/payroll-accordion-table";
import PayrollSettingsModal, { type PayrollSettingsMap } from "@/components/payroll/payroll-settings-modal";
import PayrollFinalizeForm from "@/components/payroll/payroll-finalize-form";
import PayrollViewTabs from "@/components/payroll/payroll-view-tabs";
import { requireAnyPermission } from "@/lib/access/current-user";
import { finalizeOperatorPayrollAction, deletePayrollRunAction, syncPayrollAdvancesAction } from "@/lib/final/actions";
import { CancelOperatorPayrollRunButton } from "@/components/payroll/cancel-operator-run-button";
import { money, param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  work_items?: { id: number; name: string; item_code?: string } | null;
  workers?: { id: number; name: string; worker_code?: string } | null;
  work_item_name?: string;
  item_name?: string;
  spk_no?: string;
  order_no?: string;
};

export default async function Page({ searchParams }: Props) {
  const access = await requireAnyPermission(["payroll.view", "payroll.operator.view", "pekerjaan_saya.view"]);
  const canWrite = access.permissionCodes.includes("payroll.write");
  const q = await searchParams;
  const supabase = await createClient();

  // --- SERVER ACTION: EDIT KOREKSI ITEM ---
  async function editBulananItem(formData: FormData) {
    "use server";
    const itemId = Number(formData.get("item_id"));
    const runId = Number(formData.get("run_id"));
    const base = Number(formData.get("base_amount") || 0);
    const meal = Number(formData.get("meal_amount") || 0);
    const overtime = Number(formData.get("overtime_amount") || 0);
    const kasbonP = Number(formData.get("kasbon_perusahaan_amount") || 0);
    const kasbonW = Number(formData.get("kasbon_warung_amount") || 0);

    const gross = base + meal + overtime;
    const ded = kasbonP + kasbonW;
    const net = Math.max(0, gross - ded);

    const client = await createClient();
    try {
      await client
        .from("payroll_run_items")
        .update({
          base_amount: base,
          meal_amount: meal,
          overtime_amount: overtime,
          kasbon_perusahaan_amount: kasbonP,
          kasbon_warung_amount: kasbonW,
          deduction_amount: ded,
          net_amount: net,
        })
        .eq("id", itemId);

      const { data: all } = await client
        .from("payroll_run_items")
        .select("base_amount, meal_amount, overtime_amount, deduction_amount, net_amount")
        .eq("payroll_run_id", runId);

      if (all) {
        const tG = all.reduce((acc, i) => acc + Number(i.base_amount || 0) + Number(i.meal_amount || 0) + Number(i.overtime_amount || 0), 0);
        const tD = all.reduce((acc, i) => acc + Number(i.deduction_amount || 0), 0);
        const tN = all.reduce((acc, i) => acc + Number(i.net_amount || 0), 0);
        await client.from("payroll_runs").update({ total_gross: tG, total_deduction: tD, total_net: tN }).eq("id", runId);
      }
    } catch (err) {
      console.error("Gagal simpan edit:", err);
    }
    revalidatePath("/dashboard/payroll");
  }

  // --- SERVER ACTION: VERIFIKASI PEMBAYARAN LUNAS ---
  async function markBulananPaid(formData: FormData) {
    "use server";
    const itemId = Number(formData.get("item_id"));
    const runId = Number(formData.get("run_id"));
    const workerId = Number(formData.get("worker_id"));
    const cutW = Number(formData.get("kasbon_warung_amount") || 0);
    const cutP = Number(formData.get("kasbon_perusahaan_amount") || 0);

    const client = await createClient();

    try {
      if (cutW > 0) {
        const { data: activeWarung } = await client
          .from("cash_advances")
          .select("id, amount")
          .eq("worker_id", workerId)
          .eq("category", "KASBON_WARUNG")
          .eq("status", "AKTIF");

        if (activeWarung && activeWarung.length > 0) {
          for (const w of activeWarung) {
            await client
              .from("cash_advances")
              .update({
                paid_amount: w.amount,
                status: "LUNAS",
                notes: `Lunas via Payroll #${runId}`,
              })
              .eq("id", w.id);
          }
        }
      }

      if (cutP > 0) {
        const { data: advancesP } = await client
          .from("cash_advances")
          .select("id, amount, paid_amount, installment_amount")
          .eq("worker_id", workerId)
          .in("category", ["KASBON_PERUSAHAAN", "KASBON_KANTOR"])
          .eq("status", "AKTIF")
          .order("installment_amount", { ascending: true });

        if (advancesP && advancesP.length > 0) {
          let remainBudget = cutP;

          for (const adv of advancesP) {
            if (remainBudget <= 0) break;

            const tot = Number(adv.amount || 0);
            const cur = Number(adv.paid_amount || 0);
            const sisa = Math.max(0, tot - cur);

            if (sisa <= 0) continue;

            const instAmt = Number(adv.installment_amount || 0);
            const targetPotong = instAmt > 0 && instAmt < sisa ? instAmt : sisa;

            const bayar = Math.min(targetPotong, remainBudget);
            const newPaid = cur + bayar;
            const isLunas = newPaid >= tot;

            await client
              .from("cash_advances")
              .update({
                paid_amount: newPaid,
                status: isLunas ? "LUNAS" : "AKTIF",
                notes: isLunas
                  ? `Lunas via Payroll #${runId}`
                  : `Angsuran terbayar via Payroll #${runId}`,
              })
              .eq("id", adv.id);

            remainBudget -= bayar;
          }
        }
      }

      const { error: updateErr } = await client
        .from("payroll_run_items")
        .update({ payment_status: "PAID" })
        .eq("id", itemId);

      if (updateErr) console.error("Gagal update status item:", updateErr.message);
    } catch (err) {
      console.error("Fatal action error:", err);
    }

    revalidatePath("/dashboard/payroll");
  }

  // --- SERVER ACTION: BATAL LUNAS ---
  async function revertBulananPaid(formData: FormData) {
    "use server";
    const itemId = Number(formData.get("item_id"));
    const client = await createClient();
    try {
      await client.from("payroll_run_items").update({ payment_status: "PENDING" }).eq("id", itemId);
    } catch (err) {
      console.error("Gagal revert payment_status:", err);
    }
    revalidatePath("/dashboard/payroll");
  }

  const [
    payrollRunResult,
    payrollItemResult,
    operatorRunResult,
    operatorItemResult,
    workersResult,
    workerIdResult,
    settingsResult,
    advancesResult,
    productionOrderItemsResult,
  ] = await Promise.all([
    supabase.from("payroll_runs").select("*").neq("status", "DIBATALKAN").order("period_end", { ascending: false }).limit(100),
    supabase.from("payroll_run_items").select("*").limit(2000),
    supabase.from("operator_payroll_runs").select("*").neq("status", "DIBATALKAN").order("period_end", { ascending: false }).limit(100),
    supabase
      .from("operator_payroll_items")
      .select("*, work_items(id, name, item_code), workers(id, name, worker_code)")
      .order("id", { ascending: false })
      .limit(3000),
    supabase.from("workers").select("id, worker_code, name, phone, department, position, identity_no, pay_system"),
    supabase.rpc("smpt_current_worker_id"),
    supabase.from("payroll_settings").select("key, value_numeric, value_text"),
    supabase
      .from("cash_advances")
      .select("id, worker_id, amount, paid_amount, category, warung_name, installment_amount, installment_count, installments_paid, status, notes")
      .neq("status", "DIBATALKAN")
      .order("id", { ascending: false })
      .limit(3000),
    supabase
      .from("production_order_items")
      .select("work_item_id, work_item_name_snapshot, production_orders(spk_code, operator_worker_id)")
      .limit(3000),
  ]);
  const error = [payrollRunResult.error, payrollItemResult.error, operatorRunResult.error, operatorItemResult.error, workersResult.error].find(Boolean);
  if (error) throw new Error(error.message);

  const spkMap = new Map<string, string>();
  const poiData = (productionOrderItemsResult?.data ?? []) as any[];
  poiData.forEach((poi) => {
    const wId = poi.production_orders?.operator_worker_id;
    const wiId = poi.work_item_id;
    const spkCode = poi.production_orders?.spk_code;
    if (wId && wiId && spkCode && !spkMap.has(`${wId}_${wiId}`)) {
      spkMap.set(`${wId}_${wiId}`, spkCode);
    }
  });

  const payrollRuns = (payrollRunResult.data ?? []) as PayrollRunRow[];
  const payrollItems = (payrollItemResult.data ?? []) as PayrollItemRow[];
  const workers = (workersResult.data ?? []) as WorkerInfo[];
  const operatorRuns = (operatorRunResult.data ?? []) as OperatorRun[];
  const rawOperatorItems = (operatorItemResult.data ?? []) as any[];
  const allOperatorItems: OperatorItem[] = rawOperatorItems.map((item) => {
    const spkCode = spkMap.get(`${item.worker_id}_${item.work_item_id}`) || "";
    const realItemName =
      item.work_items?.name ||
      item.work_item_name_snapshot ||
      (item.work_item_id ? `Item #${item.work_item_id}` : "Item SPK");
    const workerName = item.workers?.name || item.worker_name_snapshot || `Operator #${item.worker_id}`;
    return {
      ...item,
      worker_name_snapshot: workerName,
      work_item_name: realItemName,
      work_item_name_snapshot: realItemName,
      item_name: realItemName,
      spk_no: spkCode,
      order_no: spkCode,
    };
  });
  const currentWorkerId = (workerIdResult.data as number | null) ?? null;
  const activeAdvances = (advancesResult.data ?? []) as any[];
  const operatorRunMap = new Map(operatorRuns.map((run) => [run.id, run]));
  // Sembunyikan item operator dari run yang dibatalkan
  const operatorItems = allOperatorItems.filter((item) => operatorRunMap.has(item.run_id));
  const workerMap = new Map(workers.map((w) => [w.id, w]));

  // Grouping Agregat Detail Payroll Operator per Periode / Kode Run (Batch)
  const operatorBatchMap = new Map<number, {
    runId: number;
    payrollCode: string;
    periodStart: string;
    periodEnd: string;
    workerIds: Set<number | string>;
    totalQty: number;
    totalValue: number;
    itemCount: number;
  }>();

  for (const opRun of operatorRuns) {
    operatorBatchMap.set(opRun.id, {
      runId: opRun.id,
      payrollCode: opRun.payroll_code || `OPR-${String(opRun.id).padStart(6, "0")}`,
      periodStart: opRun.period_start,
      periodEnd: opRun.period_end,
      workerIds: new Set<number | string>(),
      totalQty: 0,
      totalValue: Number(opRun.total_operator_value || 0),
      itemCount: 0,
    });
  }

  for (const item of operatorItems) {
    let batch = operatorBatchMap.get(item.run_id);
    if (!batch) {
      const run = operatorRunMap.get(item.run_id);
      batch = {
        runId: item.run_id,
        payrollCode: run?.payroll_code || `OPR-${String(item.run_id).padStart(6, "0")}`,
        periodStart: run?.period_start || "-",
        periodEnd: run?.period_end || "-",
        workerIds: new Set<number | string>(),
        totalQty: 0,
        totalValue: 0,
        itemCount: 0,
      };
      operatorBatchMap.set(item.run_id, batch);
    }
    const workerIdent = item.worker_id || item.worker_name_snapshot;
    if (workerIdent) batch.workerIds.add(workerIdent);
    const itemQty = Number(item.qty_approved || 0);
    batch.totalQty += itemQty;
    batch.itemCount += 1;
  }

  for (const [runId, batch] of operatorBatchMap.entries()) {
    const itemsInRun = operatorItems.filter((i) => i.run_id === runId);
    if (itemsInRun.length > 0) {
      const sumVal = itemsInRun.reduce((acc, i) => {
        const q = Number(i.qty_approved || 0);
        const p = Number(i.operator_price_snapshot || 0);
        return acc + Number(i.operator_value ?? (q * p));
      }, 0);
      if (sumVal > 0) {
        batch.totalValue = sumVal;
      }
    }
  }

  const operatorBatchSummaries = Array.from(operatorBatchMap.values())
    .map((b) => ({
      ...b,
      workerCount: b.workerIds.size,
    }))
    .sort(
      (a, b) => (b.periodEnd || "").localeCompare(a.periodEnd || "") || b.runId - a.runId
    );

  const settingsRows = (settingsResult.data ?? []) as Array<{ key: string; value_numeric: number | null; value_text: string | null }>;
  const settingsMap: PayrollSettingsMap = {};
  settingsRows.forEach((r) => {
    (settingsMap as any)[r.key] = r.value_numeric ?? r.value_text;
  });

  const latestRunId = payrollRuns[0]?.id ?? "";

  // Ambil Run Aktif Terbaru
  const activeRun = payrollRuns[0];
  const activeItems = activeRun
    ? payrollItems.filter((it) => it.payroll_run_id === activeRun.id)
    : [];

  const isBulanan = activeRun?.payroll_type === "BULANAN";

  // PEMISAHAN KATEGORI DATA: HARIAN VS BULANAN (UANG MAKAN)
  const uangMakanItems = activeItems.filter((item) => {
    const w = workerMap.get(item.worker_id);
    const sys = String(w?.pay_system || item.pay_system_snapshot || "").toUpperCase();
    return sys.includes("BULANAN");
  });

  const harianItems = activeItems.filter((item) => !uangMakanItems.includes(item));

  // Hitung Total Uang Makan Staf Bulanan
  const totMealBase = uangMakanItems.reduce((acc, i) => acc + Number(i.meal_amount || 0), 0);
  const totMealOt = uangMakanItems.reduce(
    (acc, i) => acc + Number(i.overtime_amount || 0) + Number(i.manual_overtime_amount || 0) + Number(i.overtime_bonus || 0),
    0
  );
  const totMealNet = totMealBase + totMealOt;

  // Hitung Total Upah Pekerja Harian
  const totHarianBase = harianItems.reduce((acc, i) => acc + Number(i.base_amount || 0), 0);
  const totHarianOt = harianItems.reduce(
    (acc, i) => acc + Number(i.overtime_amount || 0) + Number(i.manual_overtime_amount || 0) + Number(i.overtime_bonus || 0),
    0
  );
  const totHarianGross = totHarianBase + totHarianOt;
  const totHarianKp = harianItems.reduce((acc, i) => acc + Number(i.kasbon_perusahaan_amount || 0), 0);
  const totHarianKw = harianItems.reduce((acc, i) => acc + Number(i.kasbon_warung_amount || 0), 0);
  const totHarianDed = totHarianKp + totHarianKw;
  const totHarianNet = Math.max(0, totHarianGross - totHarianDed);

  // Total Gabungan Keseluruhan
  const totNet = isBulanan
    ? activeItems.reduce((acc, i) => acc + Number(i.net_amount || 0), 0)
    : totHarianNet + totMealNet;

  return (
    <PageShell
      eyebrow="SDM & Payroll"
      title="Payroll & Slip Gaji"
      description="Kelola finalisasi upah HARIAN & BULANAN, verifikasi pembayaran lunas, cetak slip gaji resmi, dan ekspor laporan format CV. SMPT."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {latestRunId ? (
          <>
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
              href={`/api/export/xlsx?report=payroll_slips&run_id=${activeRun?.id ?? latestRunId}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs hover:bg-emerald-100 transition"
            >
              📥 Export Slip Payroll
            </a>
          </>
        ) : null}

        {operatorRuns.length > 0 ? (
          <>
            <a
              href={`/api/export/xlsx?report=operator_payroll_slips&price_type=operator&run_id=${operatorRuns[0].id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-900 shadow-xs hover:bg-violet-100 transition"
            >
              💰 Export Upah Real Operator (Gabungan)
            </a>
            <a
              href={`/api/export/xlsx?report=operator_payroll_slips&price_type=pengajuan&run_id=${operatorRuns[0].id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-900 shadow-xs hover:bg-emerald-100 transition"
            >
              📑 Export Rekap Pengajuan (Per Produk)
            </a>
            <a
              href={`/api/export/xlsx?report=operator_payroll_slips&run_id=${operatorRuns[0].id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-800 shadow-xs hover:bg-indigo-100 transition"
            >
              📊 Export Lengkap + Margin
            </a>
          </>
        ) : null}
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
        activeRunCode={activeRun?.payroll_code}
        workerCount={activeItems.length}
        slipsNode={
          <div className="space-y-6 min-w-0 max-w-full">
            {/* 3 KARTU STATISTIK METRIK */}
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

            {/* HEADER INFORMASI RUN AKTIF */}
            {activeRun && !isBulanan && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-blue-600 px-2 py-0.5 text-xs font-black text-white">
                      {activeRun.payroll_code}
                    </span>
                    <h2 className="text-base font-extrabold text-slate-900">
                      Payroll Mingguan (Upah Harian & Uang Makan Staf)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Periode: <b>{activeRun.period_start} s/d {activeRun.period_end}</b> — Total pencairan kas minggu berjalan.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-left md:text-right">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Upah Harian ({harianItems.length})</div>
                    <div className="text-sm font-extrabold text-emerald-700">{money(totHarianNet)}</div>
                  </div>
                  <div className="h-7 w-px bg-slate-300 hidden sm:block" />
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Uang Makan ({uangMakanItems.length})</div>
                    <div className="text-sm font-extrabold text-amber-700">{money(totMealNet)}</div>
                  </div>
                  <div className="h-7 w-px bg-slate-300 hidden sm:block" />
                  <div>
                    <div className="text-[10px] font-bold uppercase text-blue-600">Total Cair Bersih</div>
                    <div className="text-lg font-black text-blue-900">{money(totNet)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* TABEL 1: REKAPITULASI UPAH PEKERJA HARIAN (ACCORDION INTERAKTIF) */}
            {activeRun && !isBulanan && (
              <PayrollAccordionTable
                items={harianItems}
                workerMap={workerMap}
                activeRun={activeRun}
                settings={settingsMap}
                canWrite={canWrite}
                type="HARIAN"
                title={`⏱️ Rekapitulasi Upah Pekerja Harian (${harianItems.length} Pekerja)`}
                subtitle="Upah pokok kehadiran harian + lembur, otomatis dipotong denda telat/kasbon. Klik baris pekerja untuk rincian perhitungan adaptif."
                badgeLabel="HARIAN"
                badgeColor="emerald"
                syncAction={syncPayrollAdvancesAction}
                totBase={totHarianBase}
                totOt={totHarianOt}
                totGross={totHarianGross}
                totKp={totHarianKp}
                totKw={totHarianKw}
                totDed={totHarianDed}
                totNet={totHarianNet}
              />
            )}

            {/* TABEL 2: REKAPITULASI UANG MAKAN STAF BULANAN (TERPISAH & BERSIH) */}
            {activeRun && !isBulanan && (
              <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-amber-600 px-2.5 py-0.5 text-xs font-black text-white">
                      UANG MAKAN
                    </span>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">
                        🍱 Rekapitulasi Uang Makan Staf Bulanan ({uangMakanItems.length} Pekerja)
                      </h3>
                      <p className="text-xs text-slate-500">Pencairan mingguan murni dari kehadiran aktif staf (Rp 50.000 / hari), tanpa potongan kasbon.</p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Total Uang Makan</div>
                    <div className="text-base font-black text-amber-700">{money(totMealNet)}</div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5">Staf / Karyawan</th>
                        <th className="px-3 py-2.5 text-center">Hari Hadir</th>
                        <th className="px-3 py-2.5 text-right text-amber-700">Uang Makan</th>
                        <th className="px-3 py-2.5 text-right">Lembur / Tambahan</th>
                        <th className="px-3 py-2.5 text-right bg-emerald-50 text-emerald-700 font-black">Total Cair Uang Makan</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                        {canWrite && <th className="px-3 py-2.5 text-center">Aksi / Verifikasi</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {uangMakanItems.map((item) => {
                        const w = workerMap.get(item.worker_id);
                        const meal = Number(item.meal_amount || 0);
                        const overtime =
                          Number(item.overtime_amount || 0) +
                          Number(item.manual_overtime_amount || 0) +
                          Number(item.overtime_bonus || 0);
                        const net = meal + overtime;
                        const isPaid = (item as any).payment_status === "PAID";

                        const fullDays = Number(item.full_days || 0);
                        const halfDays = Number(item.half_days || 0);
                        const totalDays = fullDays + halfDays * 0.5;

                        return (
                          <tr key={item.id} className={`transition ${isPaid ? "bg-emerald-50/20" : "hover:bg-slate-50/80"}`}>
                            <td className="px-3 py-2.5 font-bold text-slate-900">
                              <div>{item.worker_name_snapshot || w?.name || `Worker #${item.worker_id}`}</div>
                              <div className="text-[10px] font-normal text-slate-400">
                                {w?.worker_code || "-"} · {w?.position || "Staf Bulanan"}
                              </div>
                            </td>

                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
                                📅 {totalDays} Hari
                              </span>
                            </td>

                            <td className="px-3 py-2.5 text-right font-bold text-amber-700 text-sm">
                              {money(meal)}
                            </td>

                            <td className="px-3 py-2.5 text-right text-slate-600 font-medium">
                              {overtime > 0 ? money(overtime) : "-"}
                            </td>

                            <td className="px-3 py-2.5 text-right font-black text-emerald-700 bg-emerald-50/60 text-sm">
                              {money(net)}
                            </td>

                            <td className="px-3 py-2.5 text-center">
                              {isPaid ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                                  LUNAS
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  BELUM DIBAYAR
                                </span>
                              )}
                            </td>

                            {canWrite && (
                              <td className="px-3 py-2.5 text-center">
                                <div className="inline-flex items-center gap-1.5">
                                  {!isPaid ? (
                                    <>
                                      <details className="relative">
                                        <summary className="cursor-pointer list-none rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-2xs hover:bg-slate-100">
                                          ✏️ Edit
                                        </summary>
                                        <div className="absolute right-0 z-50 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-xl text-left">
                                          <form action={editBulananItem} className="space-y-2">
                                            <input type="hidden" name="item_id" value={item.id} />
                                            <input type="hidden" name="run_id" value={activeRun.id} />
                                            <input type="hidden" name="base_amount" value={0} />
                                            <input type="hidden" name="kasbon_perusahaan_amount" value={0} />
                                            <input type="hidden" name="kasbon_warung_amount" value={0} />
                                            <div>
                                              <label className="text-[10px] font-bold text-amber-700">Nominal Uang Makan</label>
                                              <input name="meal_amount" type="number" defaultValue={meal} className="w-full rounded border border-amber-200 px-2 py-1 text-xs font-semibold" required />
                                            </div>
                                            <div>
                                              <label className="text-[10px] font-bold text-slate-600">Lembur / Bonus</label>
                                              <input name="overtime_amount" type="number" defaultValue={overtime} className="w-full rounded border px-2 py-1 text-xs" />
                                            </div>
                                            <button className="w-full rounded bg-blue-600 py-1 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer">Simpan</button>
                                          </form>
                                        </div>
                                      </details>

                                      <form action={markBulananPaid}>
                                        <input type="hidden" name="item_id" value={item.id} />
                                        <input type="hidden" name="run_id" value={activeRun.id} />
                                        <input type="hidden" name="worker_id" value={item.worker_id} />
                                        <input type="hidden" name="kasbon_perusahaan_amount" value={0} />
                                        <input type="hidden" name="kasbon_warung_amount" value={0} />
                                        <button type="submit" className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-700 active:scale-95 cursor-pointer">
                                          Bayar
                                        </button>
                                      </form>
                                    </>
                                  ) : (
                                    <form action={revertBulananPaid}>
                                      <input type="hidden" name="item_id" value={item.id} />
                                      <button type="submit" className="rounded-lg border border-rose-300 bg-white px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50 cursor-pointer">
                                        Batal Lunas
                                      </button>
                                    </form>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100/90 font-black text-slate-900 border-t-2 border-slate-300">
                      <tr>
                        <td className="px-3 py-3 uppercase text-[11px] tracking-wider text-slate-600">
                          TOTAL ({uangMakanItems.length} Staf)
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-slate-500">-</td>
                        <td className="px-3 py-3 text-right text-amber-800 text-sm">{money(totMealBase)}</td>
                        <td className="px-3 py-3 text-right text-slate-700">{money(totMealOt)}</td>
                        <td className="px-3 py-3 text-right bg-emerald-100 text-emerald-800 text-sm">
                          {money(totMealNet)}
                        </td>
                        <td className="px-3 py-3 text-center">-</td>
                        {canWrite && <td></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* TABEL GAJI BULANAN (ACCORDION INTERAKTIF) */}
            {activeRun && isBulanan && (
              <PayrollAccordionTable
                items={activeItems}
                workerMap={workerMap}
                activeRun={activeRun}
                settings={settingsMap}
                canWrite={canWrite}
                type="BULANAN"
                title={`Rekapitulasi Gaji Karyawan Bulanan (${activeItems.length} Pekerja)`}
                subtitle={`Periode: ${activeRun.period_start} s/d ${activeRun.period_end} — Total Bruto = Gaji Pokok + Lembur. Klik baris pekerja untuk rincian perhitungan adaptif.`}
                badgeLabel={activeRun.payroll_code}
                badgeColor="blue"
                totBase={activeItems.reduce((acc, i) => acc + Number(i.base_amount || 0), 0)}
                totOt={activeItems.reduce((acc, i) => acc + Number(i.overtime_amount || 0), 0)}
                totGross={activeItems.reduce((acc, i) => acc + Number(i.base_amount || 0) + Number(i.overtime_amount || 0), 0)}
                totKp={activeItems.reduce((acc, i) => acc + Number(i.kasbon_perusahaan_amount || 0), 0)}
                totKw={activeItems.reduce((acc, i) => acc + Number(i.kasbon_warung_amount || 0), 0)}
                totDed={activeItems.reduce((acc, i) => acc + Number(i.deduction_amount || 0), 0)}
                totNet={totNet}
              />
            )}

            {/* Slip Gaji & WhatsApp Manager */}
            <PayrollSlipManager
              settings={settingsMap}
              runs={payrollRuns}
              items={payrollItems}
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
          ) : null}
        historyNode={
          <div className="space-y-4">
            <Card title="Riwayat Finalisasi Payroll Umum">
  <TableWrap>
    <thead>
      <tr>
        <Th>Kode</Th>
        <Th>Jenis</Th>
        <Th>Periode</Th>
        <Th>Bruto</Th>
        <Th>Potongan</Th>
        <Th>Net</Th>
        {canWrite && <Th>Aksi</Th>}
      </tr>
    </thead>
    <tbody>
      {payrollRuns.map((item) => (
        <tr key={item.id}>
          <Td>{item.payroll_code}</Td>
          <Td>{item.payroll_type}</Td>
          <Td>{item.period_start}—{item.period_end}</Td>
          <Td>{money(item.total_gross)}</Td>
          <Td>{money(item.total_deduction)}</Td>
          <Td>{money(item.total_net)}</Td>
          {canWrite && (
            <Td>
              <form action={deletePayrollRunAction}>
                <input type="hidden" name="run_id" value={item.id} />
                <button
                  type="submit"
                  className="rounded-md bg-rose-100 px-3 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-200 transition-colors cursor-pointer"
                >
                  Batalkan
                </button>
              </form>
            </Td>
          )}
        </tr>
      ))}
    </tbody>
  </TableWrap>
</Card>

            <Card title="Riwayat Finalisasi Payroll Operator (Borongan)">
              {operatorBatchSummaries.length === 0 ? (
                <Empty>Belum ada riwayat batch Payroll Operator (Borongan).</Empty>
              ) : (
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>KODE RUN</Th>
                      <Th>PERIODE</Th>
                      <Th>TOTAL PEKERJA</Th>
                      <Th>TOTAL QTY</Th>
                      <Th>TOTAL NILAI</Th>
                      {canWrite && <Th>AKSI</Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {operatorBatchSummaries.map((batch) => (
                      <tr key={batch.runId}>
                        <Td>
                          <span className="font-extrabold text-slate-900 bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200">
                            {batch.payrollCode}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap font-medium text-slate-700">
                          {batch.periodStart} — {batch.periodEnd}
                        </Td>
                        <Td className="whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200">
                            👥 {batch.workerCount} Pekerja
                          </span>
                        </Td>
                        <Td className="font-bold text-slate-900 whitespace-nowrap">
                          {qty(batch.totalQty)}
                        </Td>
                        <Td className="font-black text-amber-700 whitespace-nowrap text-sm">
                          {money(batch.totalValue)}
                        </Td>
                        {canWrite && (
                          <Td>
                            <CancelOperatorPayrollRunButton runId={batch.runId} />
                          </Td>
                        )}
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
