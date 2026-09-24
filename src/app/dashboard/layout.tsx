import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/auth/actions";
import { AppSidebar } from "@/components/app-sidebar";
import { getCurrentAccessContext } from "@/lib/access/current-user";
import { filterMenuTree, SMPT_MENU_TREE } from "@/lib/access/menu";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const access = await getCurrentAccessContext();
  const menuEntries = filterMenuTree(
    SMPT_MENU_TREE,
    access.allowedMenuIds,
  );

  const canSeeGudangInbox =
    access.permissionCodes.includes("barang_keluar_gudang.view") &&
    access.permissionCodes.includes("permintaan_produksi.fulfill");

  let pendingGudangCount = 0;
  if (canSeeGudangInbox) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("smpt_gudang_pending_count");

    if (!error) {
      pendingGudangCount = Number(data ?? 0);
    }
  }

  const userProfile = {
    displayName: access.displayName,
    email: access.email,
    role: access.role,
  };

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900">
      <AppSidebar
        entries={menuEntries}
        badgeCounts={{ barangKeluarGudang: pendingGudangCount }}
        userProfile={userProfile}
      />

      <div className="flex min-h-screen flex-col lg:pl-72">
        {/* FROSTED GLASS MODERN HEADER */}
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-md shadow-xs transition-colors">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            {/* Left: Brand info on mobile & desktop */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-xs font-black text-white shadow-xs">
                KD
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-900 tracking-tight">
                  Kreasi Dinamika Maju Bersama
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="truncate hidden sm:inline">{access.email}</span>
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200/60">
                    {access.role}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {pendingGudangCount > 0 ? (
                <Link
                  href="/dashboard/barangKeluarGudang"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 shadow-xs transition hover:bg-amber-100"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span>Inbox Gudang ({pendingGudangCount})</span>
                </Link>
              ) : null}

              <Link
                href="/dashboard/akun"
                className="hidden sm:inline-flex rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50"
              >
                Akun
              </Link>

              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  Keluar
                </button>
              </form>
            </div>
          </div>
        </header>

        {/* MAIN BODY (with extra pb-20 on mobile to clear bottom dock) */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-12">
          {children}
        </main>

        {/* FOOTER */}
        <footer className="border-t border-slate-200/70 bg-white/50 py-4 text-center text-xs font-medium text-slate-400">
          Kreasi Dinamika Maju Bersama © 2026 · Sistem Manajemen Produksi Terpadu (SMPT V2)
        </footer>
      </div>
    </div>
  );
}
