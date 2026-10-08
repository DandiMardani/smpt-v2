import {
  MasterPageShell,
  Notice,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
} from "@/components/master/master-ui";
import { BoronganCredentialCard } from "@/components/master/borongan-credential-card";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { createWorker } from "./actions";
import {
  WorkerDirectoryClient,
  WorkerFormFields,
  type WorkerItem,
} from "./worker-directory-client";
import { ExportWorkerButton } from "./export-worker-button";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const [access, params, s] = await Promise.all([
    requirePermission("master_pekerja.view"),
    searchParams,
    createClient(),
  ]);

  // Cek Admin & Hak Akses Gaji
  const isAdmin =
    access.role === "ADMIN" ||
    access.role === "SUPERADMIN" ||
    access.permissionCodes.includes("admin") ||
    access.permissionCodes.includes("access_control.write");

  const canWrite = isAdmin || access.permissionCodes.includes("master_pekerja.write");

  const canViewSalary =
    isAdmin ||
    access.permissionCodes.includes("payroll.view") ||
    access.permissionCodes.includes("payroll.write");

  const { data, error } = await s.from("workers").select("*").order("name");
  if (error) throw new Error(error.message);

  const rawRows = (data ?? []) as any[];

  // Sensor data gaji di server jika staf tidak memiliki hak akses Payroll
  const rows: WorkerItem[] = rawRows.map((w) => {
    if (canViewSalary) return w;
    return {
      ...w,
      daily_wage: 0,
      monthly_salary: 0,
    };
  });

  const accUser = param(params, "acc_user");
  const accPass = param(params, "acc_pass");
  const accName = param(params, "acc_name");
  const accCode = param(params, "acc_code");
  const accPhone = param(params, "acc_phone");

  return (
    <MasterPageShell
      eyebrow="Master Data"
      title="Master Pekerja"
      description="Kelola data pekerja pabrik (Harian, Borongan, dan Bulanan). Dilengkapi pencarian cepat, filter sistem upah, foto KTP, dan jumlah anak/tanggungan."
    >
      <Notice success={param(params, "success")} error={param(params, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {/* Kartu Kredensial Akun Otomatis jika baru menambahkan pekerja BORONGAN */}
      {accUser && accPass ? (
        <BoronganCredentialCard
          name={accName || "Pekerja"}
          workerCode={accCode || "PKR-XXX"}
          email={accUser}
          pass={accPass}
          phone={accPhone}
        />
      ) : null}

      {canWrite ? (
        <SectionCard title="Tambah Pekerja">
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-slate-600 leading-relaxed">
            <span className="font-bold text-slate-900 block mb-0.5">ℹ️ Informasi Pekerja & Akun Borongan:</span>
            Berlaku untuk semua pekerja (<b className="text-slate-800">HARIAN, BORONGAN, dan BULANAN</b>). Lampirkan <b className="text-slate-800">Foto KTP</b> dan <b className="text-slate-800">Jumlah Anak</b> untuk data kependudukan & tanggungan. Khusus pekerja <b className="text-blue-700">BORONGAN</b>, akun login aplikasi otomatis dibuatkan di sistem dengan password nama depan + 123.
          </div>
          <form action={createWorker} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <WorkerFormFields canViewSalary={canViewSalary} />
            <div className="md:col-span-2 xl:col-span-3">
              <button className={primaryButtonClass}>Simpan Pekerja</button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {/* Baris Tombol Export Excel & PDF (Hanya kirim workers) */}
      <div className="flex justify-end my-3">
        <ExportWorkerButton workers={rows} />
      </div>

      {/* Tampilan Direktori Pekerja */}
      <WorkerDirectoryClient workers={rows} canWrite={canWrite} canViewSalary={canViewSalary} />
    </MasterPageShell>
  );
}
