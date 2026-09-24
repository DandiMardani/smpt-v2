import Link from "next/link";

type Props = {
  searchParams: Promise<{ permission?: string | string[] }>;
};

export default async function AccessDeniedPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawPermission = params.permission;
  const permission = Array.isArray(rawPermission)
    ? rawPermission.join(", ")
    : rawPermission ?? "permission yang diperlukan";

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-amber-50/80 p-6 sm:p-8 shadow-xs">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-800">
        Akses Ditolak
      </p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
        Halaman ini tidak tersedia untuk akun saat ini.
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Permission yang dibutuhkan: <strong className="font-bold text-amber-900">{permission}</strong>.
        Ini bukan error route/404. ADMIN memiliki full access; role lain mengikuti preset dan user override.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:from-blue-700 hover:to-blue-800 transition"
        >
          Kembali ke Dashboard
        </Link>
        <Link
          href="/dashboard/akun"
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
        >
          Lihat Akun Saya
        </Link>
      </div>
    </section>
  );
}
