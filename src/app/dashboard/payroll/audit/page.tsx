import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageShell, Card, Badge, Flow, Empty } from "@/components/final/final-ui";
import Link from "next/link";

// Helper untuk format menit ke Jam & Menit
function formatMinutes(totalMins: number) {
  if (totalMins <= 0) return "-";
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0 && m > 0) return `${h}j ${m}m`;
  if (h > 0) return `${h} Jam`;
  return `${m} mnt`;
}

// Helper untuk menentukan Status Klaim Gaji
function getClaimStatus(att: any) {
  if (att.verification_status === "DITOLAK") return { label: "DITOLAK", color: "bg-red-100 text-red-800 border-red-200" };

  const linkedRuns = Array.isArray(att.payroll_run_details)
    ? att.payroll_run_details.map((d: any) => d.payroll_runs).filter(Boolean)
    : [];

  if (linkedRuns.length > 0) {
    const run = linkedRuns[0]; // Ambil run pertama yang terikat
    const status = String(run.status || "").toUpperCase();
    const snapStatus = String(run.config_snapshot?.payment_status || "").toUpperCase();

    if (status === "FINAL" || status === "PAID" || snapStatus === "SUDAH DIBAYAR" || snapStatus === "SUDAH_DIBAYAR") {
      return { label: "LUNAS", color: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    }
    return { label: "DRAFT PAYROLL", color: "bg-amber-100 text-amber-800 border-amber-200" };
  }

  if (att.verification_status === "DRAFT") return { label: "BELUM VERIFIKASI", color: "bg-slate-100 text-slate-700 border-slate-200" };

  return { label: "BELUM DIKLAIM", color: "bg-blue-100 text-blue-800 border-blue-200" };
}

export default async function AuditPayrollPage() {
  await requirePermission("payroll.view");
  const s = await createClient();

  // 1. Tarik Data Pekerja
  const { data: workers } = await s.from("workers").select("id, name, worker_code, pay_system");
  const workerMap = new Map((workers || []).map((w: any) => [w.id, w]));

  // 2. Tarik Data Presensi 30 Hari Terakhir (Agar performa tetap kencang)
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const searchStart = thirtyDaysAgo.toISOString().slice(0, 10);

  const { data: atts } = await s
    .from("attendance_records")
    .select(`
      id, worker_id, attendance_date, actual_in, actual_out, 
      overtime_minutes, manual_overtime_hours, notes, attendance_status, verification_status,
      payroll_run_details(
          payroll_run_id, 
          payroll_runs(id, status, period_start, period_end, config_snapshot)
      )
    `)
    .gte("attendance_date", searchStart)
    .order("attendance_date", { ascending: false });

  const auditData = (atts || []).map((a: any) => {
    const worker = workerMap.get(a.worker_id) || {};
    const paySystem = String(worker.pay_system || "HARIAN").toUpperCase();
    
    // Kalkulasi Total Lembur (Mesin + Manual)
    const totalOtMinutes = Number(a.overtime_minutes || 0) + (Number(a.manual_overtime_hours || 0) * 60);

    // Deteksi Otomatis: Apakah ini lembur CUTOFF?
    const d = new Date(a.attendance_date + "T00:00:00Z");
    const isJumat = d.getUTCDay() === 5;
    const isHarian = paySystem !== "BULANAN";
    const isFridayCutoff = isJumat && isHarian && totalOtMinutes > 0;
    const noteStr = String(a.notes || "").toLowerCase();
    const hasCutoffNote = noteStr.includes("cutoff") || noteStr.includes("slip depan") || noteStr.includes("titipan");
    
    const isCutoff = isFridayCutoff || hasCutoffNote;
    const claimStatus = getClaimStatus(a);

    return {
      id: a.id,
      workerName: worker.name || "Unknown",
      workerCode: worker.worker_code || "-",
      paySystem,
      date: a.attendance_date,
      inOut: `${a.actual_in || "--:--"} - ${a.actual_out || "--:--"}`,
      totalOtMinutes,
      isCutoff,
      notes: a.notes,
      claimStatus,
      rawOt: a.overtime_minutes,
      manualOt: a.manual_overtime_hours,
    };
  });

  // Filter khusus menampilkan data yang ada lemburnya atau merupakan Cutoff, 
  // atau masih belum lunas agar Admin fokus ke data yang "Actionable"
  const filteredData = auditData.filter(d => 
    (d.totalOtMinutes > 0 || d.isCutoff || d.claimStatus.label === "BELUM DIKLAIM" || d.claimStatus.label === "DRAFT PAYROLL") 
    && d.claimStatus.label !== "DITOLAK"
  );

  return (
    <PageShell
      eyebrow="Payroll Audit"
      title="Rekonsiliasi & Audit Lembur"
      description="Pantau arus data jam lembur mentah dan status Cutoff pekerja harian secara real-time sebelum finalisasi slip gaji."
    >
      <div className="mb-6">
        <Link 
          href="/dashboard/payroll" 
          className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"></path>
          </svg>
          Kembali ke Menu Payroll
        </Link>
      </div>

      <Flow>
        Halaman ini membaca langsung dari mesin absensi dan database *live*. Data dengan status <b>"BELUM DIKLAIM"</b> akan tertarik otomatis saat tombol Sinkronisasi diklik di menu Payroll.
      </Flow>

      <Card title="Monitoring Real-Time (30 Hari Terakhir)">
        {filteredData.length === 0 ? (
          <Empty>Tidak ada data lembur aktif atau cutoff yang perlu diaudit saat ini.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-800">Tanggal</th>
                  <th className="px-4 py-3 font-semibold text-slate-800">Nama Pekerja</th>
                  <th className="px-4 py-3 font-semibold text-slate-800">Jam Kerja</th>
                  <th className="px-4 py-3 font-semibold text-slate-800">Lembur Diakui</th>
                  <th className="px-4 py-3 font-semibold text-slate-800">Indikator</th>
                  <th className="px-4 py-3 font-semibold text-slate-800">Status Klaim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">
                      {row.date}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">{row.workerName}</div>
                      <div className="text-xs text-slate-400">{row.paySystem}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.inOut}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.totalOtMinutes > 0 ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${row.totalOtMinutes >= 240 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                          ⏱️ {formatMinutes(row.totalOtMinutes)}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                      {(Number(row.manualOt) > 0) && (
                        <div className="text-[10px] text-amber-600 mt-1 font-medium">
                          (+ Manual {row.manualOt}j)
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.isCutoff ? (
                        <Badge variant="warning" className="text-[10px]">⚠️ CUTOFF / SLIP DEPAN</Badge>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${row.claimStatus.color}`}>
                        {row.claimStatus.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
