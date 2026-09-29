import { Badge, Card, Empty, Flow, Metric, PageShell } from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { n, qty } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { WorkerFinancialSummary, type OfficialSlipData } from "@/components/worker/worker-financial-summary";

function getRunPaymentStatus(run?: { status?: string; config_snapshot?: any; notes?: string | null }): "SUDAH DIBAYAR" | "BELUM DIBAYAR" {
  if (!run) return "BELUM DIBAYAR";
  if (run.config_snapshot?.payment_status === "SUDAH_DIBAYAR") return "SUDAH DIBAYAR";
  if (run.config_snapshot?.payment_status === "BELUM_DIBAYAR") return "BELUM DIBAYAR";
  if (/\[STATUS:\s*SUDAH_DIBAYAR\]/i.test(run.notes || "")) return "SUDAH DIBAYAR";
  if (/\[STATUS:\s*BELUM_DIBAYAR\]/i.test(run.notes || "")) return "BELUM DIBAYAR";
  return "BELUM DIBAYAR";
}

export default async function Page() {
  await requirePermission("pekerjaan_saya.view");
  const s = await createClient();

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [wr, or, ir, cr, setRes] = await Promise.all([
    s.rpc("smpt_current_worker_id"),
    s.from("production_orders").select("*").order("order_date", { ascending: false }).limit(200),
    s.from("production_order_items").select("*").limit(1000),
    s.from("production_checks").select("*").eq("status", "AKTIF").limit(2000),
    s.from("payroll_settings").select("key, value_numeric, value_text"),
  ]);

  const e = [wr.error, or.error, ir.error, cr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const settingsMap: Record<string, any> = {};
  (setRes.data ?? []).forEach((row: any) => {
    settingsMap[row.key] = row.value_numeric ?? row.value_text;
  });

  const workerId = wr.data;
  let workerData: any = null;
  let warungDebts: any[] = [];
  let companyLoans: any[] = [];
  let workedDays = 0;
  let overtimeHours = 0;
  let estimatedGross = 0;
  let breakdown: any = undefined;
  let officialSlip: OfficialSlipData | null = null;

  const orders = or.data ?? [];
  const items = ir.data ?? [];
  const checks = cr.data ?? [];

  if (workerId) {
    const [rpcProfRes, wRes, advRes, attRes, pSlipRes, opSlipRes] = await Promise.all([
      s.rpc("smpt_get_my_worker_profile"),
      s.from("workers").select("id,name,worker_code,pay_system,daily_wage,monthly_salary,department,phone").eq("id", workerId).maybeSingle(),
      s.from("cash_advances").select("*").eq("worker_id", workerId).eq("status", "AKTIF").order("advance_date", { ascending: false }),
      s.from("attendance_records").select("id,attendance_date,day_class,attendance_status,overtime_minutes,manual_overtime_hours,verification_status").eq("worker_id", workerId).gte("attendance_date", firstDayOfMonth),
      s.from("payroll_run_items").select("*, payroll_runs(*)").eq("worker_id", workerId).order("id", { ascending: false }).limit(1),
      s.from("operator_payroll_items").select("*, operator_payroll_runs(*)").eq("worker_id", workerId).order("id", { ascending: false }).limit(30),
    ]);

    const rpcWorker = rpcProfRes.data && rpcProfRes.data.length > 0 ? rpcProfRes.data[0] : null;
    const directWorker = wRes.data || null;

    // Gabungkan data agar kolom monthly_salary & daily_wage dari master workers tidak hilang
    workerData = {
      ...(directWorker ?? {}),
      ...(rpcWorker ?? {}),
      monthly_salary: directWorker?.monthly_salary ?? rpcWorker?.monthly_salary ?? 0,
      daily_wage: directWorker?.daily_wage ?? rpcWorker?.daily_wage ?? 0,
      pay_system: directWorker?.pay_system ?? rpcWorker?.pay_system ?? "HARIAN",
    };

    const allAdv = advRes.data ?? [];
    warungDebts = allAdv.filter((a) => a.category === "KASBON_WARUNG");
    companyLoans = allAdv.filter((a) => a.category !== "KASBON_WARUNG");

    const attList = attRes.data ?? [];
    let fullDays = 0;
    let halfDays = 0;
    let otMins = 0;
    let count4h = 0;
    let sundayCount = 0;

    for (const a of attList) {
      if (a.attendance_status === "HADIR") {
        if (a.day_class === "FULL_DAY") fullDays += 1;
        else if (a.day_class === "HALF_DAY") halfDays += 1;
      }
      const dayOt = Number(a.overtime_minutes || 0) + (Number(a.manual_overtime_hours || 0) * 60);
      otMins += dayOt;
      if (dayOt >= 240) count4h += 1;

      if (a.attendance_date) {
        const parts = String(a.attendance_date).slice(0, 10).split("-");
        const y = parseInt(parts[0], 10);
        const m = (parseInt(parts[1], 10) || 1) - 1;
        const d = parseInt(parts[2], 10);
        const dow = new Date(y, m, d).getDay();
        if (dow === 0 && (a.attendance_status === "HADIR" || dayOt > 0)) {
          sundayCount += 1;
        }
      }
    }

    workedDays = fullDays + (halfDays * 0.5);
    overtimeHours = Math.round((otMins / 60) * 10) / 10;

    // Akumulasi borongan berjalan dari SPK pekerja ini
    const myOrders = orders.filter((o: any) => o.operator_worker_id === workerId);
    const myBoronganItems: any[] = [];
    let totalBoronganValue = 0;

    for (const o of myOrders) {
      const oItems = items.filter((x: any) => x.order_id === o.id);
      for (const it of oItems) {
        const c = checks.filter((x: any) => x.order_item_id === it.id);
        const good = c.reduce((a: number, x: any) => a + n(x.good_qty), 0);
        const reject = c.reduce((a: number, x: any) => a + n(x.reject_qty), 0);
        const price = n(it.operator_price_snapshot);
        const itemVal = Math.round(good * price);
        totalBoronganValue += itemVal;
        myBoronganItems.push({
          spkCode: o.spk_code,
          orderDate: o.order_date,
          status: o.status,
          workItemName: it.work_item_name_snapshot,
          assignedQty: n(it.assigned_qty),
          goodQty: good,
          rejectQty: reject,
          operatorPrice: price,
          totalValue: itemVal,
        });
      }
    }

    if (workerData) {
      if (workerData.pay_system === "BORONGAN") {
        estimatedGross = totalBoronganValue;
        breakdown = {
          baseAmount: totalBoronganValue,
          overtimeWage: 0,
          bonus4h: 0,
          sundayMealOrBonus: 0,
          regularMeal: 0,
          totalGross: totalBoronganValue,
          boronganItems: myBoronganItems,
        };
      } else if (workerData.pay_system === "BULANAN") {
        const baseAmount = n(workerData.monthly_salary);
        const otDiv = Number(settingsMap.OT_DIVISOR_BULANAN || 190);
        const otHourlyRate = baseAmount > 0 ? baseAmount / Math.max(1, otDiv) : 0;
        const overtimeWage = Math.round((otMins / 60) * otHourlyRate);
        const bonus4h = count4h * Number(settingsMap.OT_BONUS_BULANAN_4H || 17500);
        const sundayMealOrBonus = sundayCount * Number(settingsMap.BULANAN_SUNDAY_MEAL || 50000);
        estimatedGross = baseAmount + overtimeWage + bonus4h + sundayMealOrBonus;

        breakdown = {
          baseAmount,
          overtimeWage,
          bonus4h,
          sundayMealOrBonus,
          regularMeal: 0,
          totalGross: estimatedGross,
          otHourlyRate: Math.round(otHourlyRate),
          count4h,
          sundayCount,
          otMinutes: otMins,
        };
      } else {
        const dailyWage = n(workerData.daily_wage);
        const baseAmount = Math.round((fullDays * dailyWage) + (halfDays * dailyWage * 0.5));
        const otDiv = Number(settingsMap.OT_DIVISOR_HARIAN || 8);
        const otHourlyRate = dailyWage / Math.max(1, otDiv);
        const overtimeWage = Math.round((otMins / 60) * otHourlyRate);
        const bonus4h = count4h * Number(settingsMap.OT_BONUS_HARIAN_4H || 5000);
        const sundayMealOrBonus = sundayCount * Number(settingsMap.HARIAN_HOLIDAY_BONUS_FULL || 20000);
        estimatedGross = baseAmount + overtimeWage + bonus4h + sundayMealOrBonus;

        breakdown = {
          baseAmount,
          overtimeWage,
          bonus4h,
          sundayMealOrBonus,
          regularMeal: 0,
          totalGross: estimatedGross,
          otHourlyRate: Math.round(otHourlyRate),
          count4h,
          sundayCount,
          otMinutes: otMins,
        };
      }

      // Ambil Slip Gaji Resmi Terakhir
      if (workerData.pay_system === "BORONGAN" && opSlipRes.data && opSlipRes.data.length > 0) {
        const latestRunId = opSlipRes.data[0].run_id;
        const latestRun = opSlipRes.data[0].operator_payroll_runs;
        const itemsInRun = opSlipRes.data.filter((it: any) => it.run_id === latestRunId);
        const totalVal = itemsInRun.reduce((acc: number, it: any) => acc + n(it.operator_value), 0);
        const totalQty = itemsInRun.reduce((acc: number, it: any) => acc + n(it.qty_approved), 0);

        officialSlip = {
          type: "BORONGAN",
          payrollCode: latestRun?.payroll_code || `OPR-${String(latestRunId).padStart(6, "0")}`,
          periodStart: latestRun?.period_start || "",
          periodEnd: latestRun?.period_end || "",
          paymentStatus: getRunPaymentStatus(latestRun),
          baseAmount: totalVal,
          grossAmount: totalVal,
          deductionAmount: 0,
          netAmount: totalVal,
          notes: latestRun?.notes,
          totalQtyApproved: totalQty,
          boronganItems: itemsInRun.map((it: any) => ({
            workItemName: it.work_item_name_snapshot,
            qtyApproved: Number(it.qty_approved || 0),
            operatorPrice: Number(it.operator_price_snapshot || 0),
            operatorValue: Number(it.operator_value || 0),
          })),
        };
      } else if (pSlipRes.data && pSlipRes.data[0]) {
        const it = pSlipRes.data[0];
        const run = it.payroll_runs;
        const gr = n(it.base_amount) + n(it.meal_amount) + n(it.overtime_amount) + n(it.manual_overtime_amount) + n(it.overtime_bonus) + n(it.holiday_bonus);

        let liveKasbonPerusahaan = n(it.kasbon_perusahaan_amount);
        let liveKasbonWarung = n(it.kasbon_warung_amount);

        const runPayStatus = getRunPaymentStatus(run);
        if (runPayStatus === "BELUM DIBAYAR") {
          const allAdv = advRes.data ?? [];
          liveKasbonPerusahaan = allAdv
            .filter((a: any) => a.category !== "KASBON_WARUNG")
            .reduce((acc: number, a: any) => {
              const rem = n(a.amount) - n(a.paid_amount);
              const count = Number(a.installment_count) || 1;
              const instAmt = n(a.installment_amount) || (count > 1 ? Math.round(n(a.amount) / count) : rem);
              return acc + Math.min(rem, instAmt);
            }, 0);
          liveKasbonWarung = allAdv
            .filter((a: any) => a.category === "KASBON_WARUNG")
            .reduce((acc: number, a: any) => acc + Math.max(0, n(a.amount) - n(a.paid_amount)), 0);
        }

        const liveTotalDeduction = liveKasbonPerusahaan + liveKasbonWarung;
        const liveNetAmount = Math.max(0, gr - liveTotalDeduction);

        officialSlip = {
          type: it.pay_system_snapshot || workerData.pay_system,
          payrollCode: run?.payroll_code || `PAY-${String(it.payroll_run_id).padStart(6, "0")}`,
          periodStart: run?.period_start || "",
          periodEnd: run?.period_end || "",
          paymentStatus: getRunPaymentStatus(run),
          baseAmount: (workerData.pay_system === "BULANAN" && n(it.base_amount) === 0) ? n(workerData.monthly_salary) : n(it.base_amount),
          fullDays: Number(it.full_days || 0),
          halfDays: Number(it.half_days || 0),
          overtimeMinutes: Number(it.overtime_minutes || 0),
          manualOvertimeHours: Number(it.manual_overtime_hours || 0),
          overtimeAmount: n(it.overtime_amount),
          manualOvertimeAmount: n(it.manual_overtime_amount),
          overtimeBonus: n(it.overtime_bonus),
          mealAmount: n(it.meal_amount),
          holidayBonus: n(it.holiday_bonus),
          grossAmount: gr,
          kasbonPerusahaanAmount: liveKasbonPerusahaan,
          kasbonWarungAmount: liveKasbonWarung,
          deductionAmount: liveTotalDeduction,
          netAmount: liveNetAmount,
          notes: run?.notes,
        };
      }

      // SINKRONISASI DATA DENGAN SLIP RESMI
      if (officialSlip) {
        if (officialSlip.type === "BORONGAN") {
          estimatedGross = officialSlip.grossAmount;
          breakdown = {
            baseAmount: officialSlip.grossAmount,
            overtimeWage: 0,
            bonus4h: 0,
            sundayMealOrBonus: 0,
            regularMeal: 0,
            totalGross: officialSlip.grossAmount,
            boronganItems: officialSlip.boronganItems?.map((b) => ({
              workItemName: b.workItemName,
              goodQty: b.qtyApproved,
              operatorPrice: b.operatorPrice,
              totalValue: b.operatorValue,
            })),
          };
        } else if (workerData.pay_system === "BULANAN" || officialSlip.type === "BULANAN") {
          // KHUSUS BULANAN: Gaji pokok diambil dari master workers (monthly_salary)
          // Jangan ditimpa Rp 0 dari base_amount slip mingguan!
          const monthlySalary = n(workerData.monthly_salary);
          const totalOtMins = (officialSlip.overtimeMinutes || 0) + ((officialSlip.manualOvertimeHours || 0) * 60);
          overtimeHours = Math.round((totalOtMins / 60) * 10) / 10;
          workedDays = (officialSlip.fullDays || 0) + ((officialSlip.halfDays || 0) * 0.5);

          const totalOtWage = (officialSlip.overtimeAmount || 0) + (officialSlip.manualOvertimeAmount || 0);
          const slipMeal = officialSlip.mealAmount || 0;
          const otBonus = officialSlip.overtimeBonus || 0;
          const holidayBonus = officialSlip.holidayBonus || 0;

          // Estimasi bruto bulanan: Gaji Pokok Bulanan Tetap + Uang Makan + Lembur Mingguan
          estimatedGross = monthlySalary + totalOtWage + otBonus + holidayBonus + slipMeal;

          breakdown = {
            baseAmount: monthlySalary,
            overtimeWage: totalOtWage,
            bonus4h: otBonus,
            sundayMealOrBonus: slipMeal || holidayBonus,
            regularMeal: slipMeal,
            totalGross: estimatedGross,
            otMinutes: totalOtMins,
            sundayCount: (slipMeal > 0 || holidayBonus > 0) ? Math.round((slipMeal || holidayBonus) / 50000) : 0,
            count4h: otBonus > 0 ? Math.round(otBonus / 17500) : 0,
          };
        } else {
          // Harian
          estimatedGross = officialSlip.grossAmount;
          const totalOtMins = (officialSlip.overtimeMinutes || 0) + ((officialSlip.manualOvertimeHours || 0) * 60);
          overtimeHours = Math.round((totalOtMins / 60) * 10) / 10;
          workedDays = (officialSlip.fullDays || 0) + ((officialSlip.halfDays || 0) * 0.5);

          const totalOtWage = (officialSlip.overtimeAmount || 0) + (officialSlip.manualOvertimeAmount || 0);
          const sundayAmt = officialSlip.holidayBonus || 0;

          breakdown = {
            baseAmount: officialSlip.baseAmount || 0,
            overtimeWage: totalOtWage,
            bonus4h: officialSlip.overtimeBonus || 0,
            sundayMealOrBonus: sundayAmt,
            regularMeal: 0,
            totalGross: officialSlip.grossAmount,
            otMinutes: totalOtMins,
            sundayCount: sundayAmt > 0 ? Math.round(sundayAmt / 20000) : 0,
            count4h: (officialSlip.overtimeBonus || 0) > 0 ? Math.round((officialSlip.overtimeBonus || 0) / 5000) : 0,
          };
        }
      }
    }
  }

  const isBulanan = workerData?.pay_system === "BULANAN";
  const isBorongan = workerData?.pay_system === "BORONGAN";
  const myAssignedOrders = orders.filter((o: any) => o.operator_worker_id === workerId);

  return (
    <PageShell
      eyebrow="Pekerja"
      title="Gaji, Kasbon & Pekerjaan Saya"
      description="Transparansi akumulasi gaji berjalan, slip gaji resmi terverifikasi, status pembayaran, rincian potongan hutang di warung makan luar, cicilan pinjaman perusahaan, dan status pekerjaan Anda."
    >
      <Flow>
        Informasi gaji, cicilan pinjaman perusahaan, dan hutang warung makan diperbarui secara transparan dan otomatis sinkron dengan slip payroll resmi Anda.
      </Flow>

      {/* Real-time Worker Salary, Official Slip & Debt Transparency */}
      {workerData ? (
        <WorkerFinancialSummary
          worker={workerData}
          warungDebts={warungDebts}
          companyLoans={companyLoans}
          workedDays={workedDays}
          overtimeHours={overtimeHours}
          estimatedGross={estimatedGross}
          breakdown={breakdown}
          officialSlip={officialSlip}
        />
      ) : (
        <Card title="Status Akun Pekerja">
          <Empty>
            Akun login Anda belum terhubung ke profil Master Pekerja. Silakan hubungi Administrator (melalui menu Manajemen User) untuk menghubungkan akun email Anda ke data nama pekerja Anda.
          </Empty>
        </Card>
      )}

      {/* Rincian Status Khusus Karyawan Bulanan */}
      {isBulanan && workerData ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">💼</span>
            <h3 className="text-base font-extrabold text-indigo-950">
              Informasi Karyawan Sistem Upah Bulanan
            </h3>
          </div>
          <p className="text-xs leading-relaxed text-indigo-800">
            Anda terdaftar sebagai <b>Karyawan Bulanan ({workerData.department || "Operasional / Staf"})</b>. Penghasilan Anda bersifat tetap setiap periode gajian bulanan sesuai ketentuan manajemen. Potongan kasbon perusahaan akan dicicil per bulan sesuai kesepakatan, dan hutang konsumsi di warung mitra akan dilunasi otomatis saat slip gaji resmi diterbitkan.
          </p>
        </div>
      ) : null}

      {/* Rincian Penugasan SPK Borongan / Harian */}
      {!isBulanan ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Kode Pekerja" value={String(workerData?.worker_code || workerId || "-")} />
            <Metric label="Penugasan SPK Aktif" value={myAssignedOrders.length} />
            <Metric label="Sistem Kerja" value={isBorongan ? "Borongan (Qty Sah)" : "Harian Lepas"} />
          </div>

          <Card title="Penugasan & Hasil Kerja SPK Operator">
            <div className="space-y-3">
              {myAssignedOrders.length === 0 ? (
                <Empty>
                  Belum ada SPK aktif yang ditugaskan ke pekerja ini.
                </Empty>
              ) : (
                myAssignedOrders.map((o: any) => {
                  const oi = (items as any[]).filter((x) => x.order_id === o.id);
                  return (
                    <div key={o.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                      <div className="flex justify-between items-center gap-2">
                        <b className="font-bold text-slate-900 text-sm">{o.spk_code}</b>
                        <Badge>{o.status}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Tanggal: {o.order_date} · Checker: {o.checker_email}
                      </p>
                      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                        {oi.map((i: any) => {
                          const c = (checks as any[]).filter((x) => x.order_item_id === i.id);
                          const good = c.reduce((a, x) => a + n(x.good_qty), 0);
                          const reject = c.reduce((a, x) => a + n(x.reject_qty), 0);
                          const price = n(i.operator_price_snapshot);
                          const totalVal = Math.round(good * price);
                          return (
                            <div key={i.id} className="flex flex-wrap justify-between gap-2 text-sm">
                              <div>
                                <span className="font-medium text-slate-800">{i.work_item_name_snapshot}</span>
                                {isBorongan && price > 0 ? (
                                  <span className="text-xs font-bold text-emerald-700 ml-2">
                                    @{qty(price)} = {qty(good)} pcs × {qty(price)}
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-xs font-semibold text-slate-500">
                                Tugas {qty(i.assigned_qty)} · Sah <span className="text-emerald-700">{qty(good)}</span> · Reject <span className="text-rose-600">{qty(reject)}</span>
                                {isBorongan && price > 0 ? (
                                  <span className="ml-2 font-black text-emerald-800">
                                    ({new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(totalVal)})
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </>
      ) : null}
    </PageShell>
  );
}
