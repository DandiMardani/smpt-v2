import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageShell, Card, Flow, Empty } from "@/components/final/final-ui";
import Link from "next/link";
import { money } from "@/lib/final/final-utils";
import { AdaptivePayrollDetail } from "@/components/payroll/payroll-accordion-table";

// --- HELPERS ---
function formatMinutes(totalMins: number) {
  if (totalMins <= 0) return "-";
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0 && m > 0) return `${h}j ${m}m`;
  if (h > 0) return `${h} Jam`;
  return `${m} mnt`;
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

  return { start: formatIsoDate(new Date(y, m, 1)), end: formatIsoDate(new Date(y, m + 1, 0)) };
}

// Satu definisi status "run sudah final/dibayar" supaya konsisten
const isFinalRun = (r: any) =>
  ["FINAL", "PAID", "SUDAH_DIBAYAR"].includes(String(r?.status || "").toUpperCase());

export default async function AuditPayrollPage() {
  await requirePermission("payroll.view");
  const s = await createClient();
  const now = new Date();

  const [workersRes, settingsRes, advRes, attRes, slipsRes, checksRes] = await Promise.all([
    s.from("workers").select("id,name,worker_code,pay_system,daily_wage,monthly_salary,department,phone"),
    s.from("payroll_settings").select("key, value_numeric, value_text"),
    s.from("cash_advances").select("*").eq("status", "AKTIF"),
    s.from("attendance_records").select("*, payroll_run_details(payroll_run_id, payroll_runs(id, status, period_start, period_end))").gte("attendance_date", addDays(now, -30)),
    s.from("payroll_run_items").select("*, payroll_runs(*)").order("id", { ascending: false }).limit(2000),
    s.from("production_checks").select("good_qty, order_item_id, production_order_items!inner(operator_price_snapshot, production_orders!inner(operator_worker_id))").eq("status", "AKTIF").gte("check_date", addDays(now, -30))
  ]);

  // Jangan diam-diam kosong kalau query absensi gagal (misal relasi embed bermasalah)
  if (attRes.error) throw new Error(`Gagal memuat absensi: ${attRes.error.message}`);

  const workers = workersRes.data || [];
  const settingsRows = settingsRes.data || [];
  const allAdvances = advRes.data || [];
  const allAtts = attRes.data || [];
  const allSlips = slipsRes.data || [];
  const allChecks = checksRes.data || [];

  const settingsMap: any = {};
  settingsRows.forEach(r => settingsMap[r.key] = r.value_numeric ?? r.value_text);
  const workerMap = new Map(workers.map(w => [w.id, w]));

  const simulatedItemsHarian: any[] = [];
  const simulatedItemsBulanan: any[] = [];
  const rawAuditLogs: any[] = [];
  const boronganTotals = new Map<number, number>();

  allChecks.forEach((c: any) => {
    const wId = c.production_order_items?.production_orders?.operator_worker_id;
    const price = Number(c.production_order_items?.operator_price_snapshot || 0);
    const qty = Number(c.good_qty || 0);
    if (wId && price > 0) {
      boronganTotals.set(wId, (boronganTotals.get(wId) || 0) + (price * qty));
    }
  });

  for (const worker of workers) {
    const paySystem = String(worker.pay_system || "HARIAN").toUpperCase();

    const mySlips = allSlips.filter(it => it.worker_id === worker.id && it.payroll_runs && it.payroll_runs.status !== "DIBATALKAN");
    let officialSlipItem = mySlips.length > 0 ? mySlips[0] : null;
    if (paySystem === "BULANAN") {
      officialSlipItem = mySlips.find(it => it.payroll_runs?.payroll_type === "BULANAN") || null;
    }

    let isPaid = false;
    let paidPeriodEnd = null;
    if (officialSlipItem) {
      const r = officialSlipItem.payroll_runs;
      const status = String(r?.status || "").toUpperCase();
      const snapStatus = String(r?.config_snapshot?.payment_status || "").toUpperCase();
      const itStatus = String(officialSlipItem.payment_status || "").toUpperCase();
      if (status === "FINAL" || status === "PAID" || snapStatus === "SUDAH DIBAYAR" || snapStatus === "SUDAH_DIBAYAR" || itStatus === "PAID") {
        isPaid = true;
        paidPeriodEnd = r.period_end;
      }
    }

    let currentPeriod = getDynamicPeriod(paySystem, now);
    if (paySystem === "BULANAN") {
      let start = paidPeriodEnd ? addDays(paidPeriodEnd, 1) : formatIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = formatIsoDate(now) < start ? start : formatIsoDate(now);
      currentPeriod = { start, end };
    }

    let fullDays = 0, halfDays = 0, otMins = 0, count4h = 0, sundayCount = 0, sundayHalfCount = 0, manualOtHours = 0;
    const myAtts = allAtts.filter(a => a.worker_id === worker.id);

    // --- LOGIKA ABSENSI & CUTOFF (mengikuti generator payroll di syncPayrollAdvancesCore) ---
    // Aturan:
    // - Absen DI DALAM periode berjalan: hari kerja dihitung. Kalau absen itu cutoff
    //   (Jumat harian ber-lembur / catatan cutoff), LEMBURNYA ditunda ke slip depan.
    // - Absen DI LUAR periode: hanya diambil kalau cutoff, dan belum diambil run FINAL
    //   yang periodenya mulai SETELAH tanggal absen itu (supaya tidak dobel bayar).
    //   Terikat ke run lama (penanda gaji pokok) BUKAN alasan untuk membuangnya.
    for (const a of myAtts) {
      if (a.verification_status === "DITOLAK") continue;

      const manOtHours = Number(a.manual_overtime_hours || 0);
      const rawDayOt = Number(a.overtime_minutes || 0) + manOtHours * 60;

      const dow = new Date(a.attendance_date + "T00:00:00Z").getUTCDay();
      const noteStr = String(a.notes || "").toLowerCase();
      const isFridayCutoff = dow === 5 && paySystem !== "BULANAN" && rawDayOt > 0;
      const hasCutoffNote = noteStr.includes("cutoff") || noteStr.includes("slip depan") || noteStr.includes("titipan");
      const isCutoffAtt = isFridayCutoff || hasCutoffNote;

      const linkedRuns = Array.isArray((a as any).payroll_run_details)
        ? (a as any).payroll_run_details.map((x: any) => x.payroll_runs).filter(Boolean)
        : [];
      const finalRuns = linkedRuns.filter(isFinalRun);

      const isWithin = a.attendance_date >= currentPeriod.start && a.attendance_date <= currentPeriod.end;

      let countDay = false;
      let countOt = false;
      let isCutoff = false;

      if (isWithin) {
        // Hari fisik periode ini
        if (isPaid && paidPeriodEnd && a.attendance_date <= paidPeriodEnd) continue;
        if (finalRuns.length > 0) continue;
        countDay = a.attendance_status === "HADIR";
        countOt = !isCutoffAtt; // lembur cutoff ditunda ke slip depan
        isCutoff = isCutoffAtt && rawDayOt > 0;
      } else {
        // Di luar periode: hanya cutoff yang lemburnya belum diambil run final yang lebih baru
        if (!isCutoffAtt || rawDayOt <= 0) continue;
        // Generator hanya melihat 7 hari sebelum period_start. Cutoff yang lebih lama
        // sudah menjadi urusan run sebelumnya, jangan dicampur ke estimasi minggu ini.
        if (a.attendance_date < addDays(currentPeriod.start, -7)) continue;
        if (finalRuns.some((r: any) => r.period_start > a.attendance_date)) continue;
        countOt = true;
        isCutoff = true;
      }

      rawAuditLogs.push({
        id: a.id,
        workerName: worker.name,
        paySystem,
        date: a.attendance_date,
        inOut: `${a.actual_in || "--:--"} - ${a.actual_out || "--:--"}`,
        totalOtMinutes: rawDayOt,
        isCutoff,
        manualOt: a.manual_overtime_hours
      });

      if (countDay) {
        if (a.day_class === "HALF_DAY") halfDays++;
        else fullDays++;
      }

      // Bonus hari Minggu hanya untuk hari fisik di periode ini
      if (isWithin && dow === 0 && (a.attendance_status === "HADIR" || rawDayOt > 0)) {
  sundayCount++;
  if (a.day_class === "HALF_DAY") sundayHalfCount++;
}
      if (countOt) {
        otMins += rawDayOt;
        manualOtHours += manOtHours;
        const threshold = dow === 0 && paySystem === "BULANAN" ? 720 : 240;
        if (rawDayOt >= threshold) count4h++;
      }
    }

    const totalDays = fullDays + (halfDays * 0.5);
    if (totalDays === 0 && otMins === 0) continue;

    let baseAmt = 0, mealAmt = 0, otAmt = 0, otBonus = 0, holBonus = 0;

    if (paySystem === "BULANAN") {
      const moSal = Number(worker.monthly_salary || 0);
      const otDiv = Number(settingsMap.OT_DIVISOR_BULANAN || 190);
      const otHourly = moSal > 0 ? moSal / Math.max(1, otDiv) : 0;
      baseAmt = moSal;
      otAmt = Math.round((otMins / 60) * otHourly);
      otBonus = count4h * Number(settingsMap.OT_BONUS_BULANAN_4H || 17500);
    } else {
      const dailyWage = Number(worker.daily_wage || 0);
      baseAmt = Math.round(totalDays * dailyWage);
      const otDiv = Number(settingsMap.OT_DIVISOR_HARIAN || 8);
      const otHourly = dailyWage / Math.max(1, otDiv);
      otAmt = Math.round((otMins / 60) * otHourly);
      otBonus = count4h * Number(settingsMap.OT_BONUS_HARIAN_4H || 5000);
      const holRate = Number(settingsMap.HARIAN_HOLIDAY_BONUS_FULL || 20000);
      holBonus = Math.round((sundayCount - sundayHalfCount) * holRate + sundayHalfCount * (holRate / 2));
    }

    let myAdvs = allAdvances.filter(a => a.worker_id === worker.id);
    if (isPaid && paidPeriodEnd) {
      myAdvs = myAdvs.filter(a => a.advance_date > paidPeriodEnd);
    }

    let kasbonP = 0, kasbonW = 0;
    myAdvs.forEach(a => {
      const rem = Math.max(0, Number(a.amount) - Number(a.paid_amount));
      if (a.category === "KASBON_WARUNG") kasbonW += rem;
      else kasbonP += (Number(a.installment_amount || 0) > 0 ? Math.min(Number(a.installment_amount), rem) : rem);
    });

    const gross = baseAmt + otAmt + otBonus + holBonus;
    const ded = kasbonP + kasbonW;

    const simItem = {
      id: worker.id,
      worker_id: worker.id,
      worker_name_snapshot: worker.name,
      pay_system_snapshot: paySystem,
      daily_wage_snapshot: worker.daily_wage,
      full_days: fullDays,
      half_days: halfDays,
      overtime_minutes: otMins - (manualOtHours * 60),
      manual_overtime_hours: manualOtHours,
      base_amount: baseAmt,
      meal_amount: mealAmt,
      overtime_amount: otAmt,
      manual_overtime_amount: 0,
      overtime_bonus: otBonus,
      holiday_bonus: holBonus,
      kasbon_perusahaan_amount: kasbonP,
      kasbon_warung_amount: kasbonW,
      deduction_amount: ded,
      net_amount: Math.max(0, gross - ded)
    };

    if (paySystem === "BULANAN") {
      simulatedItemsBulanan.push(simItem);
    } else {
      simulatedItemsHarian.push(simItem);
    }
  }

  rawAuditLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <PageShell
      eyebrow="Live Simulasi (Tanpa Simpan Database)"
      title="Estimasi Gaji Real-Time"
      description="Rincian hitungan adaptif ini ditarik 100% langsung dari mesin absensi detik ini juga, khusus untuk panduan Admin."
    >
      <div className="mb-4">
        <Link
          href="/dashboard/payroll"
          className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"></path></svg>
          Kembali ke Menu Payroll
        </Link>
      </div>

      <Flow>
        Seluruh kotak rincian di bawah ini adalah <b>SIMULASI LANGSUNG (LIVE)</b>. Angkanya akan persis sama dengan yang dilihat pekerja di HP mereka. Halaman ini aman dipakai untuk patokan Admin karena tidak mengubah data *Payroll* asli.
      </Flow>

      {/* --- SEKSI 1: KARYAWAN HARIAN --- */}
      <div className="mt-8 border-t-2 border-slate-200 pt-6">
        <h2 className="text-sm font-black text-emerald-800 uppercase tracking-wide mb-4 flex items-center gap-2">
          <span className="bg-emerald-500 w-2 h-2 rounded-full animate-ping"></span>
          LIVE: Pekerja Harian
        </h2>
        <div className="space-y-6">
          {simulatedItemsHarian.length === 0 ? (
            <Empty>Belum ada data absensi/lembur pekerja harian di siklus ini.</Empty>
          ) : (
            simulatedItemsHarian.map(item => (
              <div key={item.id} className="relative">
                <div className="absolute -top-3 left-4 z-10 flex gap-2">
                  <span className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px] font-black shadow-sm flex items-center gap-1">
                    LIVE
                  </span>
                  <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200 shadow-sm">
                    Estimasi Harian Berjalan
                  </span>
                </div>
                <AdaptivePayrollDetail
                  item={item}
                  worker={workerMap.get(item.worker_id)}
                  settings={settingsMap}
                  type="HARIAN"
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- SEKSI 2: STAF BULANAN --- */}
      <div className="mt-12 border-t-2 border-slate-200 pt-6">
        <h2 className="text-sm font-black text-blue-800 uppercase tracking-wide mb-4 flex items-center gap-2">
          <span className="bg-blue-500 w-2 h-2 rounded-full animate-ping"></span>
          LIVE: Staf Karyawan Bulanan
        </h2>
        <div className="space-y-6">
          {simulatedItemsBulanan.length === 0 ? (
            <Empty>Belum ada data absensi/lembur staf bulanan di siklus ini.</Empty>
          ) : (
            simulatedItemsBulanan.map(item => (
              <div key={item.id} className="relative">
                <div className="absolute -top-3 left-4 z-10 flex gap-2">
                  <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-black shadow-sm flex items-center gap-1">
                    LIVE
                  </span>
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-200 shadow-sm">
                    Estimasi Bulanan Berjalan
                  </span>
                </div>
                <AdaptivePayrollDetail
                  item={item}
                  worker={workerMap.get(item.worker_id)}
                  settings={settingsMap}
                  type="BULANAN"
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- SEKSI 3: OPERATOR BORONGAN --- */}
      <div className="mt-12 border-t-2 border-slate-200 pt-6">
        <h2 className="text-sm font-black text-violet-800 uppercase tracking-wide mb-4 flex items-center gap-2">
          <span className="bg-violet-500 w-2 h-2 rounded-full animate-ping"></span>
          LIVE: Operator Borongan
        </h2>
        {boronganTotals.size === 0 ? (
          <Empty>Belum ada nilai produksi (Qty Sah) operator borongan yang berjalan.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(boronganTotals.entries()).map(([wId, total]) => {
              const w = workerMap.get(wId);
              return (
                <div key={wId} className="rounded-xl border-2 border-violet-200 bg-white p-4 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-violet-100 text-violet-800 text-[9px] font-black px-2 py-1 rounded-bl-lg">BORONGAN</div>
                  <div className="font-bold text-slate-800 text-sm">{w?.name || `Operator #${wId}`}</div>
                  <div className="text-[10px] text-slate-500">{w?.worker_code || "-"}</div>
                  <div className="mt-3 text-2xl font-black text-violet-700">{money(total)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Total Qty Sah 脳 Harga (Belum Lunas)</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- TABEL RAW LOGS --- */}
      <details className="mt-10 rounded-2xl border border-slate-200 bg-white shadow-sm outline-none">
        <summary className="cursor-pointer p-4 font-bold text-slate-800 outline-none hover:bg-slate-50 rounded-2xl">
          馃攳 Buka Log Mentah Mesin Absensi & Indikator Cutoff
        </summary>
        <div className="p-4 border-t border-slate-100 overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">Pekerja</th>
                <th className="px-4 py-3 font-semibold">Jam</th>
                <th className="px-4 py-3 font-semibold">Lembur</th>
                <th className="px-4 py-3 font-semibold">Indikator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rawAuditLogs.map((r, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{r.date}</td>
                  <td className="px-4 py-2">
                    <div className="font-semibold text-slate-800">{r.workerName}</div>
                    <div className="text-[10px]">{r.paySystem}</div>
                  </td>
                  <td className="px-4 py-2">{r.inOut}</td>
                  <td className="px-4 py-2">
                    {r.totalOtMinutes > 0 ? (
                      <span className="font-bold text-blue-700">鈴憋笍 {formatMinutes(r.totalOtMinutes)}</span>
                    ) : "-"}
                  </td>
                  <td className="px-4 py-2">
                    {r.isCutoff && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        鈿狅笍 CUTOFF / SLIP DEPAN
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </PageShell>
  );
}
