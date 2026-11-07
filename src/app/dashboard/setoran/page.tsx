import { Badge, Card, Empty, Flow, Metric, PageShell } from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { n, qty } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { WorkerFinancialSummary, type OfficialSlipData, type OfficialMealSlipData } from "@/components/worker/worker-financial-summary";

function getRunPaymentStatus(
  run?: { status?: string; config_snapshot?: any; notes?: string | null },
  item?: { payment_status?: string | null }
): "SUDAH DIBAYAR" | "BELUM DIBAYAR" {
  const itemStatus = String(item?.payment_status || "").toUpperCase();
  if (itemStatus === "PAID" || itemStatus === "SUDAH_DIBAYAR" || itemStatus === "SUDAH DIBAYAR") {
    return "SUDAH DIBAYAR";
  }

  if (!run) return "BELUM DIBAYAR";

  const snap = run.config_snapshot || {};
  const snapStatus = String(snap.payment_status || "").toUpperCase();
  const snapCode = String(snap.payment_status_code || "").toUpperCase();
  const runStatus = String(run.status || "").toUpperCase();

  if (
    snapStatus === "SUDAH DIBAYAR" ||
    snapStatus === "SUDAH_DIBAYAR" ||
    snapCode === "SUDAH_DIBAYAR" ||
    snapCode === "SUDAH DIBAYAR" ||
    runStatus === "PAID" ||
    runStatus === "SUDAH_DIBAYAR"
  ) {
    return "SUDAH DIBAYAR";
  }

  if (String(run.notes || "").includes("SUDAH_DIBAYAR") || /SUDAH\s+DIBAYAR/i.test(run.notes || "")) {
    return "SUDAH DIBAYAR";
  }

  return "BELUM DIBAYAR";
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date | string, days: number): string {
  const dt = typeof d === "string" ? new Date(d + "T00:00:00Z") : new Date(d);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function getFlexibleMonthlyPeriod(paidPeriodEnd: string | null, refDate = new Date()): { start: string; end: string } {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const todayStr = formatIsoDate(refDate);

  let start = "";
  if (paidPeriodEnd) {
    start = addDays(paidPeriodEnd, 1);
  } else {
    start = formatIsoDate(new Date(y, m, 1));
  }

  const end = todayStr < start ? start : todayStr;
  return { start, end };
}

function getDynamicPeriod(paySystem: string, refDate = new Date()): { start: string; end: string } {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const d = refDate.getDay();

  if (paySystem === "BULANAN") {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    return { start: formatIsoDate(start), end: formatIsoDate(end) };
  }

  if (paySystem === "HARIAN") {
    const diffToSat = (d + 1) % 7;
    const start = new Date(y, m, refDate.getDate() - diffToSat);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: formatIsoDate(start), end: formatIsoDate(end) };
  }

  if (paySystem === "BORONGAN") {
    const diffToFri = (d + 2) % 7;
    const start = new Date(y, m, refDate.getDate() - diffToFri);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: formatIsoDate(start), end: formatIsoDate(end) };
  }

  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return { start: formatIsoDate(start), end: formatIsoDate(end) };
}

export default async function Page() {
  await requirePermission("pekerjaan_saya.view");
  const s = await createClient();

  const now = new Date();
  let currentPeriod = getDynamicPeriod("BULANAN", now);

  const [wr, setRes] = await Promise.all([
    s.rpc("smpt_current_worker_id"),
    s.from("payroll_settings").select("key, value_numeric, value_text"),
  ]);

  if (wr.error) throw new Error(wr.error.message);
  if (setRes.error) throw new Error(setRes.error.message);

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
  let latestMealSlip: OfficialMealSlipData | null = null; 

  let orders: any[] = [];
  let items: any[] = [];
  let checks: any[] = [];

  if (workerId) {
    const [rpcProfRes, wRes, pSlipRes, opSlipRes, ordersRes] = await Promise.all([
      s.rpc("smpt_get_my_worker_profile"),
      s.from("workers").select("id,name,worker_code,pay_system,daily_wage,monthly_salary,department,phone").eq("id", workerId).maybeSingle(),
      s.from("payroll_run_items").select("*, payroll_runs(*)").eq("worker_id", workerId).order("id", { ascending: false }).limit(10),
      s.from("operator_payroll_items").select("*, operator_payroll_runs(*)").eq("worker_id", workerId).order("id", { ascending: false }).limit(30),
      s.from("production_orders").select("*").eq("operator_worker_id", workerId).order("order_date", { ascending: false })
    ]);

    if (ordersRes.error) throw new Error(ordersRes.error.message);
    orders = ordersRes.data || [];

    const rpcWorker = rpcProfRes.data && rpcProfRes.data.length > 0 ? rpcProfRes.data[0] : null;
    const directWorker = wRes.data || null;

    workerData = {
      ...(directWorker ?? {}),
      ...(rpcWorker ?? {}),
      monthly_salary: directWorker?.monthly_salary ?? rpcWorker?.monthly_salary ?? 0,
      daily_wage: directWorker?.daily_wage ?? rpcWorker?.daily_wage ?? 0,
      pay_system: directWorker?.pay_system ?? rpcWorker?.pay_system ?? "HARIAN",
    };

    let officialSlipItem: any = null;
    let latestWeeklyMealItem: any = null;
    latestMealSlip = null;

    const validSlips = (pSlipRes.data ?? []).filter(
      (it: any) => it.payroll_runs && it.payroll_runs.status !== "DIBATALKAN"
    );

    if (workerData.pay_system === "BULANAN") {
      officialSlipItem = validSlips.find(
        (it: any) => it.payroll_runs?.payroll_type === "BULANAN"
      ) || null;

      latestWeeklyMealItem = validSlips.find(
        (it: any) => it.payroll_runs?.payroll_type === "MINGGUAN"
      ) || null;
    } else {
      officialSlipItem = validSlips.length > 0 ? validSlips[0] : null;
    }

    let isOfficialSlipPaid = officialSlipItem
      ? getRunPaymentStatus(officialSlipItem.payroll_runs, officialSlipItem) === "SUDAH DIBAYAR"
      : false;
    let paidPeriodEnd = isOfficialSlipPaid ? (officialSlipItem.payroll_runs?.period_end || null) : null;

    if (workerData.pay_system === "BULANAN") {
      currentPeriod = getFlexibleMonthlyPeriod(paidPeriodEnd, now);
    } else {
      currentPeriod = getDynamicPeriod(workerData.pay_system, now);
    }

    const searchStartDate = addDays(currentPeriod.start, -7);

    const [advRes, attRes] = await Promise.all([
      s.from("cash_advances").select("*").eq("worker_id", workerId).eq("status", "AKTIF").order("advance_date", { ascending: false }),
      s.from("attendance_records").select("id,attendance_code,attendance_date,day_class,attendance_status,overtime_minutes,manual_overtime_hours,verification_status,notes,actual_in,actual_out,payroll_run_details(payroll_run_id, payroll_runs(id, status, period_start, period_end))").eq("worker_id", workerId).gte("attendance_date", searchStartDate).lte("attendance_date", currentPeriod.end),
    ]);

    if (latestWeeklyMealItem) {
      const mRun = latestWeeklyMealItem.payroll_runs;
      latestMealSlip = {
        payrollCode: mRun?.payroll_code || `PAY-${String(latestWeeklyMealItem.payroll_run_id).padStart(6, "0")}`,
        periodStart: mRun?.period_start || "",
        periodEnd: mRun?.period_end || "",
        paymentStatus: getRunPaymentStatus(mRun, latestWeeklyMealItem),
        mealAmount: n(latestWeeklyMealItem.meal_amount),
        fullDays: Number(latestWeeklyMealItem.full_days || 0),
        halfDays: Number(latestWeeklyMealItem.half_days || 0),
        notes: mRun?.notes,
      };
    }

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
    } else if (officialSlipItem) {
      const it = officialSlipItem;
      const run = it.payroll_runs;
      const gr = n(it.base_amount) + n(it.meal_amount) + n(it.overtime_amount) + n(it.manual_overtime_amount) + n(it.overtime_bonus) + n(it.holiday_bonus);

      let liveKasbonPerusahaan = n(it.kasbon_perusahaan_amount);
      let liveKasbonWarung = n(it.kasbon_warung_amount);

      const runPayStatus = getRunPaymentStatus(run, it);
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
        paymentStatus: runPayStatus,
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

    isOfficialSlipPaid = officialSlip?.paymentStatus === "SUDAH DIBAYAR";
    paidPeriodEnd = isOfficialSlipPaid ? (officialSlip?.periodEnd || null) : null;

    const orderIds = orders.map((o: any) => o.id);
    if (orderIds.length > 0) {
      const itemsRes = await s.from("production_order_items").select("*").in("order_id", orderIds);
      if (itemsRes.error) throw new Error(itemsRes.error.message);
      items = itemsRes.data || [];

      const itemIds = items.map((i: any) => i.id);
      if (itemIds.length > 0) {
        let checksQuery = s.from("production_checks").select("*").eq("status", "AKTIF").in("order_item_id", itemIds);
        if (workerData.pay_system === "BORONGAN") {
          const checksStart = (isOfficialSlipPaid && paidPeriodEnd) ? paidPeriodEnd : currentPeriod.start;
          checksQuery = checksQuery.gte("check_date", checksStart).lte("check_date", currentPeriod.end);
        }
        const checksRes = await checksQuery;
        if (checksRes.error) throw new Error(checksRes.error.message);
        checks = checksRes.data || [];
        if (isOfficialSlipPaid && paidPeriodEnd) {
          checks = checks.filter((c: any) => c.check_date > paidPeriodEnd);
        }
      }
    }

    const isBulananWorker = workerData.pay_system === "BULANAN";
    const allAdv = advRes.data ?? [];
    if (isBulananWorker) {
      warungDebts = allAdv.filter(
        (a: any) =>
          a.category === "KASBON_WARUNG" &&
          a.advance_date >= currentPeriod.start &&
          a.advance_date <= currentPeriod.end
      );
      companyLoans = allAdv.filter(
        (a: any) =>
          a.category !== "KASBON_WARUNG" &&
          (paidPeriodEnd ? a.advance_date > paidPeriodEnd : true)
      );
    } else if (isOfficialSlipPaid && paidPeriodEnd) {
      warungDebts = allAdv.filter((a: any) => a.category === "KASBON_WARUNG" && a.advance_date > paidPeriodEnd);
      companyLoans = allAdv.filter((a: any) => a.category !== "KASBON_WARUNG" && a.advance_date > paidPeriodEnd);
    } else {
      warungDebts = allAdv.filter((a: any) => a.category === "KASBON_WARUNG");
      companyLoans = allAdv.filter((a: any) => a.category !== "KASBON_WARUNG");
    }

    const attList = attRes.data ?? [];
    let fullDays = 0;
    let halfDays = 0;
    let otMins = 0;
    let count4h = 0;
    let sundayCount = 0;

    for (const a of attList) {
      const linkedRuns = Array.isArray((a as any).payroll_run_details)
        ? (a as any).payroll_run_details.map((d: any) => d.payroll_runs).filter(Boolean)
        : [];
      const hasFinalizedRun = linkedRuns.some(
        (r: any) => r.status === "FINAL" || r.status === "PAID" || r.status === "SUDAH_DIBAYAR"
      );
      
      const isFinalized = Boolean((a as any).payroll_id) || hasFinalizedRun;
      if (isFinalized) continue;
      if (a.verification_status === "DITOLAK") continue;

      const isWithinCurrentPeriod = a.attendance_date >= currentPeriod.start && a.attendance_date <= currentPeriod.end;

      if (!isWithinCurrentPeriod) {
        const d = new Date(a.attendance_date + "T00:00:00Z");
        const isJumat = d.getUTCDay() === 5;
        const isHarian = workerData.pay_system !== "BULANAN";
        const rawDayOt = Number(a.overtime_minutes || 0) + (Number(a.manual_overtime_hours || 0) * 60);
        const isFridayCutoff = isJumat && isHarian && rawDayOt > 0;

        const noteStr = String(a.notes || "").toLowerCase();
        const hasCutoffNote = noteStr.includes("cutoff") || noteStr.includes("slip depan") || noteStr.includes("titipan");

        const isQualifyingCutoff = isFridayCutoff || hasCutoffNote;
        if (!isQualifyingCutoff) {
          continue; 
        }
      }

      // PERBAIKAN: Hanya hitung Hari Kerja (Base Salary) jika absen berada dalam periode minggu ini
      if (isWithinCurrentPeriod && a.attendance_status === "HADIR") {
        if (a.day_class === "HALF_DAY") {
          halfDays += 1;
        } else {
          fullDays += 1;
        }
      }

      let isSunday = false;
      if (a.attendance_date) {
        const parts = String(a.attendance_date).slice(0, 10).split("-");
        const y = parseInt(parts[0], 10);
        const m = (parseInt(parts[1], 10) || 1) - 1;
        const d = parseInt(parts[2], 10);
        isSunday = new Date(y, m, d).getDay() === 0;
      }

      const actualOtMinutes = Number(a.overtime_minutes || 0);
      const manualOtMinutes = Number(a.manual_overtime_hours || 0) * 60;
      const rawDayOt = actualOtMinutes + manualOtMinutes;
      
      // Lembur selalu diakumulasi (baik dari periode ini, maupun dari cutoff minggu lalu)
      otMins += rawDayOt;
      
      const effectiveShiftOt = actualOtMinutes + manualOtMinutes;

      if (isSunday && (a.attendance_status === "HADIR" || rawDayOt > 0)) {
        sundayCount += 1;
        if (isBulananWorker) {
          if (effectiveShiftOt >= 720) count4h += 1; 
        } else {
          if (effectiveShiftOt >= 240) count4h += 1; 
        }
      } else {
        if (effectiveShiftOt >= 240) count4h += 1;
      }
    }

    workedDays = fullDays + (halfDays * 0.5);
    overtimeHours = Math.round((otMins / 60) * 10) / 10;

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
        if (isOfficialSlipPaid && myBoronganItems.length === 0) {
          estimatedGross = 0;
          breakdown = {
            baseAmount: 0,
            overtimeWage: 0,
            bonus4h: 0,
            sundayMealOrBonus: 0,
            regularMeal: 0,
            totalGross: 0,
            boronganItems: [],
          };
        } else {
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
        }
      } else if (workerData.pay_system === "BULANAN") {
        const baseAmount = n(workerData.monthly_salary);
        const otDiv = Number(settingsMap.OT_DIVISOR_BULANAN || 190);
        const otHourlyRate = baseAmount > 0 ? baseAmount / Math.max(1, otDiv) : 0;
        const overtimeWage = Math.round((otMins / 60) * otHourlyRate);
        const bonus4h = count4h * Number(settingsMap.OT_BONUS_BULANAN_4H || 17500);

        if (isOfficialSlipPaid && workedDays === 0 && otMins === 0) {
          estimatedGross = 0;
          breakdown = {
            baseAmount: 0,
            overtimeWage: 0,
            bonus4h: 0,
            sundayMealOrBonus: 0,
            regularMeal: 0,
            totalGross: 0,
            otHourlyRate: Math.round(otHourlyRate),
            count4h: 0,
            sundayCount: 0,
            otMinutes: 0,
          };
        } else {
          estimatedGross = baseAmount + overtimeWage + bonus4h;
          breakdown = {
            baseAmount,
            overtimeWage,
            bonus4h,
            sundayMealOrBonus: 0,
            regularMeal: 0,
            totalGross: estimatedGross,
            otHourlyRate: Math.round(otHourlyRate),
            count4h,
            sundayCount,
            otMinutes: otMins,
          };
        }
      } else {
        const dailyWage = n(workerData.daily_wage);
        const baseAmount = Math.round((fullDays * dailyWage) + (halfDays * dailyWage * 0.5));
        const otDiv = Number(settingsMap.OT_DIVISOR_HARIAN || 8);
        const otHourlyRate = dailyWage / Math.max(1, otDiv);
        const overtimeWage = Math.round((otMins / 60) * otHourlyRate);
        const bonus4h = count4h * Number(settingsMap.OT_BONUS_HARIAN_4H || 5000);
        const sundayMealOrBonus = sundayCount * Number(settingsMap.HARIAN_HOLIDAY_BONUS_FULL || 20000);

        if (isOfficialSlipPaid && workedDays === 0 && otMins === 0) {
          estimatedGross = 0;
          breakdown = {
            baseAmount: 0,
            overtimeWage: 0,
            bonus4h: 0,
            sundayMealOrBonus: 0,
            regularMeal: 0,
            totalGross: 0,
            otHourlyRate: Math.round(otHourlyRate),
            count4h: 0,
            sundayCount: 0,
            otMinutes: 0,
          };
        } else {
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
      }

      if (officialSlip && officialSlip.paymentStatus === "BELUM DIBAYAR") {
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
          const monthlySalary = n(workerData.monthly_salary);
          const otDiv = Number(settingsMap.OT_DIVISOR_BULANAN || 190);
          const otHourlyRate = monthlySalary > 0 ? Math.round(monthlySalary / Math.max(1, otDiv)) : 0;

          const slipOtMins = (Number(officialSlip.overtimeMinutes) || 0) + ((Number(officialSlip.manualOvertimeHours) || 0) * 60);
          const totalOtMins = Math.max(otMins, slipOtMins);

          overtimeHours = Math.round((totalOtMins / 60) * 10) / 10;
          workedDays = (officialSlip.fullDays || 0) + ((officialSlip.halfDays || 0) * 0.5) || workedDays;

          const rawSlipOtWage = (Number(officialSlip.overtimeAmount) || 0) + (Number(officialSlip.manualOvertimeAmount) || 0);
          const totalOtWage = rawSlipOtWage > 0 ? rawSlipOtWage : Math.round((totalOtMins / 60) * otHourlyRate);

          const finalBonus4h = count4h * Number(settingsMap.OT_BONUS_BULANAN_4H || 17500);

          estimatedGross = monthlySalary + totalOtWage + finalBonus4h;

          breakdown = {
            baseAmount: monthlySalary,
            overtimeWage: totalOtWage,
            bonus4h: finalBonus4h,
            sundayMealOrBonus: 0,
            regularMeal: 0,
            totalGross: estimatedGross,
            otHourlyRate: Math.round(otHourlyRate),
            otMinutes: totalOtMins,
            sundayCount,
            count4h,
          };
        } else {
          const slipWorkedDays = (officialSlip.fullDays || 0) + ((officialSlip.halfDays || 0) * 0.5);
          workedDays = slipWorkedDays > 0 ? slipWorkedDays : workedDays;
          estimatedGross = officialSlip.grossAmount > 0 ? officialSlip.grossAmount : estimatedGross;
          const totalOtMins = (officialSlip.overtimeMinutes || 0) + ((officialSlip.manualOvertimeHours || 0) * 60);
          if (totalOtMins > 0) {
            overtimeHours = Math.round((totalOtMins / 60) * 10) / 10;
          }

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
          currentPeriod={currentPeriod}
          latestMealSlip={latestMealSlip}
        />
      ) : (
        <Card title="Status Akun Pekerja">
          <Empty>
            Akun login Anda belum terhubung ke profil Master Pekerja. Silakan hubungi Administrator (melalui menu Manajemen User) untuk menghubungkan akun email Anda ke data nama pekerja Anda.
          </Empty>
        </Card>
      )}

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
