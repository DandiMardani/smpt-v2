import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAccessContext } from "@/lib/access/current-user";

export type NotificationItem = {
  id: string;
  category: "ABSENSI" | "PENGIRIMAN" | "PACKING" | "TRANSFER" | "KASBON";
  title: string;
  description: string;
  actor: string;
  timestamp: string;
  timeAgo: string;
  link: string;
  badge: {
    label: string;
    color: string;
  };
};

function formatTimeAgo(isoString: string): string {
  if (!isoString) return "Baru saja";
  const now = new Date();
  const date = new Date(isoString);
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return "Baru saja";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 1) return "Kemarin";
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export async function GET() {
  try {
    const access = await getCurrentAccessContext();
    const userRole = (access.role || "").toUpperCase();

    // User pekerja/warung tidak perlu menerima notifikasi aktivitas pabrik/logistik
    if (["PEKERJA", "WARUNG", "CUTTING"].includes(userRole)) {
      return NextResponse.json({ success: true, unreadCount: 0, notifications: [] });
    }

    const supabase = await createClient();
    const currentUserId = access.userId;

    // Fetch in parallel recent inputs across modules
    const [attRes, shipRes, packRes, transRes, qcRes, profilesRes] = await Promise.all([
      // 1. Absensi terbaru
      supabase
        .from("attendance_records")
        .select("id, attendance_code, attendance_date, attendance_status, created_at, created_by, workers(name)")
        .order("created_at", { ascending: false })
        .limit(30),
      // 2. Pengiriman Embarkasi terbaru
      supabase
        .from("embarkation_shipments")
        .select("id, shipment_code, document_no, shipment_date, quantity, status, created_at, created_by, driver_name")
        .order("created_at", { ascending: false })
        .limit(15),
      // 3. Packing Runs MR WU terbaru
      supabase
        .from("packing_runs")
        .select("id, set_qty, packing_date, notes, created_at, created_by, locations(name), product_sets(name)")
        .order("created_at", { ascending: false })
        .limit(15),
      // 4. Transfer Barang Jadi terbaru
      supabase
        .from("finished_goods_transfers")
        .select("id, transfer_code, document_no, quantity, transfer_date, delivery_status, created_at, created_by, received_by, finished_goods(name)")
        .order("created_at", { ascending: false })
        .limit(15),
      // 5. QC Inspections terbaru
      supabase
        .from("qc_inspections")
        .select("id, inspection_date, inspected_qty, good_qty, reject_qty, rework_qty, created_at, created_by, finished_goods(name)")
        .order("created_at", { ascending: false })
        .limit(15),
      // 6. Profiles & roles map
      supabase.from("profiles").select("id, display_name, email, role_id, roles(name, code)"),
    ]);

    type ProfileInfo = { name: string; roleName: string; roleCode: string };
    const profileMap = new Map<string, ProfileInfo>();
    (profilesRes.data ?? []).forEach((p: any) => {
      profileMap.set(p.id, {
        name: p.display_name || p.email,
        roleName: p.roles?.name || "Staf",
        roleCode: String(p.roles?.code || "").toUpperCase(),
      });
    });

    const items: NotificationItem[] = [];

    // 1. Group Absensi by date (hanya inputan dari user lain, bukan user yang sedang login)
    const attList = (attRes.data ?? []).filter((a: any) => {
      if (currentUserId && a.created_by === currentUserId) return false;
      return true;
    });

    if (attList.length > 0) {
      const byDate = new Map<string, any[]>();
      attList.forEach((a: any) => {
        const d = a.attendance_date;
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(a);
      });

      byDate.forEach((list, d) => {
        const creator = list[0]?.created_by ? profileMap.get(list[0].created_by) : null;
        const actorName = creator ? `${creator.name} (${creator.roleName})` : "Mandor / Petugas Lapangan";
        const hadirs = list.filter((x) => x.attendance_status === "HADIR").length;
        const alphas = list.filter((x) => x.attendance_status === "ALPHA").length;
        let desc = `${list.length} Pekerja (${hadirs} Hadir`;
        if (alphas > 0) desc += `, ${alphas} Alpha`;
        desc += `) dicatat oleh ${actorName}`;

        items.push({
          id: `att-${d}-${list[0]?.id}`,
          category: "ABSENSI",
          title: `Presensi & Absensi: ${d}`,
          description: desc,
          actor: actorName,
          timestamp: list[0]?.created_at || new Date().toISOString(),
          timeAgo: formatTimeAgo(list[0]?.created_at),
          link: `/dashboard/absensi`,
          badge: {
            label: "Presensi",
            color: "bg-blue-100 text-blue-800 border-blue-200",
          },
        });
      });
    }

    // 2. Pengiriman Embarkasi (kecualikan jika dibuat oleh user yang sedang login)
    (shipRes.data ?? []).forEach((s: any) => {
      if (currentUserId && s.created_by === currentUserId) return;
      const creator = s.created_by ? profileMap.get(s.created_by) : null;
      const actorName = creator ? `${creator.name} (${creator.roleName})` : "Petugas Pengiriman";

      items.push({
        id: `ship-${s.id}`,
        category: "PENGIRIMAN",
        title: `Surat Jalan ${s.document_no || s.shipment_code}`,
        description: `Pengiriman ${s.quantity} Set (Status: ${s.status}) - Supir: ${s.driver_name || "-"}`,
        actor: actorName,
        timestamp: s.created_at,
        timeAgo: formatTimeAgo(s.created_at),
        link: `/dashboard/pengirimanEmbarkasi`,
        badge: {
          label: "Logistik",
          color: "bg-emerald-100 text-emerald-800 border-emerald-200",
        },
      });
    });

    // 3. Packing Runs MR WU (kecualikan jika dibuat oleh user yang sedang login)
    (packRes.data ?? []).forEach((p: any) => {
      if (currentUserId && p.created_by === currentUserId) return;
      const creator = p.created_by ? profileMap.get(p.created_by) : null;
      const actorName = creator ? `${creator.name} (${creator.roleName})` : "Admin MR WU";
      const locName = (p.locations as any)?.name || "Gudang MR WU";
      const setName = (p.product_sets as any)?.name || "Set Koper Haji";

      items.push({
        id: `pack-${p.id}`,
        category: "PACKING",
        title: `Hasil Packing SET di ${locName}`,
        description: `Selesai perakitan +${p.set_qty} ${setName} (${p.packing_date})`,
        actor: actorName,
        timestamp: p.created_at,
        timeAgo: formatTimeAgo(p.created_at),
        link: `/dashboard/mitraMrWu`,
        badge: {
          label: "Perakitan Set",
          color: "bg-purple-100 text-purple-800 border-purple-200",
        },
      });
    });

    // 4. Transfer Barang Jadi (kecualikan jika user login yang buat dan terima)
    (transRes.data ?? []).forEach((t: any) => {
      const isReceived = t.delivery_status === "DITERIMA" && t.received_by;
      if (isReceived && t.received_by === currentUserId) return;
      if (!isReceived && t.created_by === currentUserId) return;

      const actorProfile = isReceived ? profileMap.get(t.received_by) : profileMap.get(t.created_by);
      const actorName = actorProfile ? `${actorProfile.name} (${actorProfile.roleName})` : "Petugas Gudang / Pabrik";
      const fgName = (t.finished_goods as any)?.name || "Barang Jadi";

      items.push({
        id: `trans-${t.id}`,
        category: "TRANSFER",
        title: `Transfer BJ: ${t.document_no || t.transfer_code}`,
        description: `Kirim ${t.quantity} Pcs ${fgName} (Status: ${t.delivery_status})`,
        actor: actorName,
        timestamp: t.created_at,
        timeAgo: formatTimeAgo(t.created_at),
        link: `/dashboard/transferBarangJadi`,
        badge: {
          label: "Transfer BJ",
          color: "bg-amber-100 text-amber-800 border-amber-200",
        },
      });
    });

    // 5. QC Inspections (kecualikan jika dibuat oleh user yang sedang login)
    (qcRes.data ?? []).forEach((q: any) => {
      if (currentUserId && q.created_by === currentUserId) return;
      const creator = q.created_by ? profileMap.get(q.created_by) : null;
      const actorName = creator ? `${creator.name} (${creator.roleName})` : "Petugas QC";
      const fgName = (q.finished_goods as any)?.name || "Barang Jadi";

      items.push({
        id: `qc-${q.id}`,
        category: "TRANSFER",
        title: `Hasil QC: ${fgName}`,
        description: `Inspeksi ${q.inspected_qty} Pcs (${q.good_qty} Baik, ${q.reject_qty} Reject)`,
        actor: actorName,
        timestamp: q.created_at,
        timeAgo: formatTimeAgo(q.created_at),
        link: `/dashboard/qc`,
        badge: {
          label: "QC",
          color: "bg-teal-100 text-teal-800 border-teal-200",
        },
      });
    });

    // Sort by timestamp desc
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Filter notifikasi sesuai ranah peran (role-based targeting)
    const relevantItems = items.filter((item) => {
      if (userRole === "ADMIN" || userRole === "MANAGER") return true; // Manajemen melihat semua
      if (userRole === "ADMIN_EMBARKASI") return item.category === "PENGIRIMAN" || item.category === "TRANSFER";
      if (userRole === "ADMIN_MR_WU") return item.category === "PACKING" || item.category === "TRANSFER";
      if (userRole === "SUPERVISOR") return item.category === "ABSENSI" || item.category === "PACKING";
      if (userRole === "GUDANG") return item.category === "TRANSFER" || item.category === "PACKING" || item.category === "PENGIRIMAN";
      return true;
    });

    return NextResponse.json({
      success: true,
      unreadCount: relevantItems.length,
      notifications: relevantItems.slice(0, 30),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, notifications: [] }, { status: 500 });
  }
}
