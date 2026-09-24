import { ManagerDashboard, type ManagerSummary } from "@/components/manager/manager-dashboard";
import { getCurrentAccessContext } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";

function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function DashboardPage() {
  const access = await getCurrentAccessContext();

  if (access.role === "MANAGER") {
    const supabase = await createClient();
    const today = jakartaToday();
    const { data, error } = await supabase.rpc("smpt_manager_dashboard_summary", {
      p_from: today,
      p_to: today,
    });

    if (error) {
      return (
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0d6efd]">Executive Dashboard</p>
            <h1 className="mt-1 text-2xl font-extrabold text-gray-900 sm:text-3xl">Dashboard Manager</h1>
            <p className="mt-1 text-sm text-gray-500">Dashboard tetap read only.</p>
          </section>
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 shadow-xs">
            Ringkasan Manager gagal dimuat: {error.message}
          </div>
        </div>
      );
    }

    return <ManagerDashboard initialSummary={(data ?? {}) as ManagerSummary} />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0d6efd]">
              Sistem Manajemen Produksi Terpadu
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
              Dashboard Operasional
            </h1>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-gray-600">
              Selamat datang di SMPT V2. Pilih modul kerja dari sidebar untuk memulai aktivitas.
            </p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-right">
            <p className="text-xs font-bold text-gray-500">Status Akses Akun</p>
            <p className="mt-0.5 text-sm font-extrabold text-[#0d6efd]">{access.role}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs transition hover:shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Role Pengguna</p>
          <p className="mt-2 text-2xl font-extrabold text-gray-900">{access.role}</p>
          <p className="mt-1 text-xs text-gray-400">Hak peran aktif saat ini</p>
        </div>
        <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs transition hover:shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Permission Efektif</p>
          <p className="mt-2 text-2xl font-extrabold text-gray-900">{access.permissionCodes.length}</p>
          <p className="mt-1 text-xs text-gray-400">Izin granular diberikan</p>
        </div>
        <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs transition hover:shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Modul Diizinkan</p>
          <p className="mt-2 text-2xl font-extrabold text-gray-900">{access.allowedMenuIds.length}</p>
          <p className="mt-1 text-xs text-gray-400">Menu kerja tersedia</p>
        </div>
        <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/50 p-5 shadow-xs transition hover:shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Sesi & Koneksi</p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-700">Aktif & Aman</p>
          <p className="mt-1 text-xs text-emerald-600">Terotentikasi Supabase</p>
        </div>
      </section>
    </div>
  );
}
