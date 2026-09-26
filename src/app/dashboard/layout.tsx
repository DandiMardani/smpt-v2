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
      {children}
    </DashboardShell>
  );
}
