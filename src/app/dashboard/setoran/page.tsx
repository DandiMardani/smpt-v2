import { Badge, Card, Empty, Flow, Metric, PageShell } from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { n, qty } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { WorkerFinancialSummary } from "@/components/worker/worker-financial-summary";

export default async function Page() {
  await requirePermission("pekerjaan_saya.view");
  const s = await createClient();

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [wr, or, ir, cr] = await Promise.all([
    s.rpc("smpt_current_worker_id"),
    s.from("production_orders").select("*").order("order_date", { ascending: false }).limit(100),
    s.from("production_order_items").select("*").limit(500),
    s.from("production_checks").select("*").eq("status", "AKTIF").limit(1000),
  ]);

  const e = [wr.error, or.error, ir.error, cr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const workerId = wr.data;
  let workerData: any = null;
  let warungDebts: any[] = [];
  let companyLoans: any[] = [];
  let workedDays = 0;
  let overtimeHours = 0;
  let estimatedGross = 0;

  if (workerId) {
    const [rpcProfRes, wRes, advRes, attRes] = await Promise.all([
      s.rpc("smpt_get_my_worker_profile"),
      s.from("workers").select("id,name,worker_code,pay_system,daily_wage,monthly_salary,department").eq("id", workerId).maybeSingle(),
      s.from("cash_advances").select("*").eq("worker_id", workerId).eq("status", "AKTIF").order("advance_date", { ascending: false }),
      s.from("attendance_records").select("id,day_class,attendance_status,overtime_minutes,manual_overtime_hours").eq("worker_id", workerId).gte("attendance_date", firstDayOfMonth),
    ]);

    if (rpcProfRes.data && rpcProfRes.data.length > 0) {
      workerData = rpcProfRes.data[0];
    } else if (wRes.data) {
      workerData = wRes.data;
    }

    const allAdv = advRes.data ?? [];
    warungDebts = allAdv.filter((a) => a.category === "KASBON_WARUNG");
    companyLoans = allAdv.filter((a) => a.category !== "KASBON_WARUNG");

    const attList = attRes.data ?? [];
    let fullDays = 0;
    let halfDays = 0;
    let otMins = 0;

    for (const a of attList) {
      if (a.attendance_status === "HADIR") {
        if (a.day_class === "FULL_DAY") fullDays += 1;
        else if (a.day_class === "HALF_DAY") halfDays += 1;
      }
      otMins += Number(a.overtime_minutes || 0) + (Number(a.manual_overtime_hours || 0) * 60);
    }

    workedDays = fullDays + (halfDays * 0.5);
    overtimeHours = Math.round((otMins / 60) * 10) / 10;

    if (workerData) {
      if (workerData.pay_system === "BULANAN") {
        estimatedGross = n(workerData.monthly_salary);
      } else {
        const dailyWage = n(workerData.daily_wage);
        const otWage = (otMins / 60) * (dailyWage / 7);
        estimatedGross = (fullDays * dailyWage) + (halfDays * dailyWage * 0.5) + otWage;
      }
    }
  }

  const isBulanan = workerData?.pay_system === "BULANAN";
  const orders = or.data ?? [];
  const items = ir.data ?? [];
  const checks = cr.data ?? [];

  return (
    <PageShell
      eyebrow="Pekerja"
      title="Gaji, Kasbon & Pekerjaan Saya"
      description="Transparansi akumulasi gaji berjalan, rincian potongan hutang di warung makan luar, cicilan pinjaman perusahaan, dan status pekerjaan Anda."
    >
      <Flow>
        Informasi gaji, cicilan pinjaman perusahaan, dan hutang warung makan diperbarui secara transparan dan otomatis masuk ke slip payroll bulanan Anda.
      </Flow>

      {/* Real-time Worker Salary & Debt Transparency */}
      {workerData ? (
        <WorkerFinancialSummary
          worker={workerData}
          warungDebts={warungDebts}
          companyLoans={companyLoans}
          workedDays={workedDays}
          overtimeHours={overtimeHours}
          estimatedGross={estimatedGross}
        />
      ) : (
        <Card title="Status Akun Pekerja">
          <Empty>
            Akun login Anda belum terhubung ke profil Master Pekerja. Silakan hubungi Administrator (melalui menu Manajemen User) untuk menghubungkan akun email Anda ke data nama pekerja Anda.
          </Empty>
        </Card>
      )}

      {/* Rincian Status Khusus Karyawan Bulanan */}
      {isBulanan ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">💼</span>
            <h3 className="text-base font-extrabold text-indigo-950">
              Informasi Karyawan Sistem Upah Bulanan
            </h3>
          </div>
          <p className="text-xs leading-relaxed text-indigo-800">
            Anda terdaftar sebagai <b>Karyawan Bulanan ({workerData.department || "Operasional / Staf"})</b>. Penghasilan Anda bersifat tetap setiap periode gajian bulanan sesuai ketentuan manajemen. Potongan kasbon perusahaan akan dicicil per bulan sesuai kesepakatan, dan hutang konsumsi di warung mitra akan dilunasi otomatis saat slip gaji diterbitkan.
          </p>
        </div>
      ) : null}

      {!isBulanan ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Worker ID" value={String(workerId ?? "-")} />
            <Metric label="Penugasan SPK" value={orders.length} />
            <Metric label="Input Operator" value="Tervalidasi" />
          </div>

          <Card title="Penugasan & Hasil Kerja Borongan / Harian">
            <div className="space-y-3">
              {orders.length === 0 ? (
                <Empty>
                  Belum ada SPK aktif yang ditugaskan ke pekerja ini.
                </Empty>
              ) : (
                orders.map((o: any) => {
                  const oi = (items as any[]).filter((x) => x.order_id === o.id);
                  return (
                    <div key={o.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                      <div className="flex justify-between items-center gap-2">
                        <b className="font-bold text-slate-900 text-sm">{o.spk_code}</b>
                        <Badge>{o.status}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {o.order_date} · Checker {o.checker_email}
                      </p>
                      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                        {oi.map((i: any) => {
                          const c = (checks as any[]).filter((x) => x.order_item_id === i.id);
                          const good = c.reduce((a, x) => a + n(x.good_qty), 0);
                          const reject = c.reduce((a, x) => a + n(x.reject_qty), 0);
                          return (
                            <div key={i.id} className="flex flex-wrap justify-between gap-2 text-sm">
                              <span className="font-medium text-slate-800">{i.work_item_name_snapshot}</span>
                              <span className="text-xs font-semibold text-slate-500">
                                Tugas {qty(i.assigned_qty)} · Sah <span className="text-emerald-700">{qty(good)}</span> · Reject <span className="text-rose-600">{qty(reject)}</span>
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
