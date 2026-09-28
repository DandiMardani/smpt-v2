import type { ReactNode } from "react";
import { getCurrentAccessContext } from "@/lib/access/current-user";
import {
  filterMenuTree,
  SMPT_HAJI_MENU_TREE,
  SMPT_REGULER_MENU_TREE,
  SMPT_GUDANG_MENU_TREE,
  SMPT_SDM_MENU_TREE,
} from "@/lib/access/menu";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const access = await getCurrentAccessContext();

  const hajiMenuEntries = filterMenuTree(
    SMPT_HAJI_MENU_TREE,
    access.allowedMenuIds,
  );
  const regulerMenuEntries = filterMenuTree(
    SMPT_REGULER_MENU_TREE,
    access.allowedMenuIds,
  );
  const gudangMenuEntries = filterMenuTree(
    SMPT_GUDANG_MENU_TREE,
    access.allowedMenuIds,
  );
  const sdmMenuEntries = filterMenuTree(
    SMPT_SDM_MENU_TREE,
    access.allowedMenuIds,
  );

  const canSeeGudangInbox =
    access.permissionCodes.includes("barang_keluar_gudang.view") &&
    access.permissionCodes.includes("permintaan_produksi.fulfill");

  let pendingGudangCount = 0;
  if (canSeeGudangInbox) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("smpt_gudang_pending_count");
    if (!error) pendingGudangCount = Number(data ?? 0);
  }

  // DB usage warning — hanya untuk ADMIN/MANAGER, jangan block render jika gagal
  let dbWarning: { pretty: string; pct: number; status: "WARNING" | "CRITICAL" } | null = null;
  if (access.permissionCodes.includes("setup_test.admin")) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.rpc("smpt_db_resource_usage").maybeSingle();
      if (data) {
        const d = data as { db_size_pretty: string; db_size_pct: number; status: string };
        if (d.status === "WARNING" || d.status === "CRITICAL") {
          dbWarning = { pretty: d.db_size_pretty, pct: Number(d.db_size_pct), status: d.status as "WARNING" | "CRITICAL" };
        }
      }
    } catch { /* silent — jangan block layout jika RPC belum ada */ }
  }

  const userProfile = {
    displayName: access.displayName,
    email: access.email,
    role: access.role,
  };

  return (
    <DashboardShell
      menuEntries={hajiMenuEntries}
      hajiEntries={hajiMenuEntries}
      regulerEntries={regulerMenuEntries}
      gudangEntries={gudangMenuEntries}
      sdmEntries={sdmMenuEntries}
      badgeCounts={{ barangKeluarGudang: pendingGudangCount }}
      userProfile={userProfile}
      pendingGudangCount={pendingGudangCount}
    >
      {dbWarning && (
        <div className={`mx-4 mt-4 rounded-xl border px-4 py-3 text-sm font-medium flex items-center justify-between gap-3 ${
          dbWarning.status === "CRITICAL"
            ? "border-red-200 bg-red-50 text-red-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}>
          <span>
            {dbWarning.status === "CRITICAL" ? "🔴" : "⚠️"}{" "}
            <strong>Database Supabase {dbWarning.status === "CRITICAL" ? "hampir penuh!" : "mendekati batas!"}</strong>{" "}
            Penggunaan: <strong>{dbWarning.pretty}</strong> ({dbWarning.pct}% dari 500 MB free tier).{" "}
            {dbWarning.status === "CRITICAL"
              ? "Segera upgrade ke Supabase Pro atau hapus data lama."
              : "Pertimbangkan cleanup data lama atau upgrade ke Supabase Pro."}
          </span>
          <a
            href="https://supabase.com/dashboard/org/cfsgflvmojhnfjzsbpyj/usage"
            target="_blank"
            rel="noopener"
            className="shrink-0 rounded-lg border border-current px-2.5 py-1 text-xs font-semibold hover:opacity-80 transition"
          >
            Cek Usage
          </a>
        </div>
      )}
      {children}
    </DashboardShell>
  );
}
