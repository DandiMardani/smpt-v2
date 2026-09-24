import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access/current-user";
import {
  findMenuItemById,
  MENU_PERMISSION_BY_ID,
} from "@/lib/access/menu";

type ModulePlaceholderPageProps = {
  params: Promise<{
    menuId: string;
  }>;
};

export default async function ModulePlaceholderPage({
  params,
}: ModulePlaceholderPageProps) {
  const { menuId } = await params;
  const menuItem = findMenuItemById(menuId);

  if (!menuItem || menuId === "dashboard") {
    notFound();
  }

  const permission = MENU_PERMISSION_BY_ID[menuId];

  if (!permission) {
    notFound();
  }

  await requirePermission(permission);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
          SMPT V2
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {menuItem.text}
        </h1>
      </header>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 sm:p-6 shadow-xs">
        <p className="font-bold text-amber-900">
          Modul ini belum dimigrasikan.
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          Route sudah berada di dalam session protection dan sudah memverifikasi
          permission di server. Flow bisnis V1 belum diubah dan belum ada transaksi
          V2 yang dijalankan dari halaman ini.
        </p>
        <p className="mt-4 text-xs font-mono font-medium text-amber-700">
          Permission: {permission}
        </p>
      </section>
    </div>
  );
}
