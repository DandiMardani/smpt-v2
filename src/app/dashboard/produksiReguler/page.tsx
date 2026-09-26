import {
  EmptyState,
  MasterPageShell,
  Notice,
  ReadOnlyBanner,
  SectionCard,
} from "@/components/master/master-ui";
import { requirePermission } from "@/lib/access/current-user";
import { formatNumber, param, type SearchParams } from "@/lib/master/page-utils";
import { resolveProjectCategory } from "@/lib/project-category";
import { createClient } from "@/lib/supabase/server";
import { ProduksiRegulerClient } from "./produksi-reguler-client";

type Props = { searchParams: Promise<SearchParams> };

export default async function ProduksiRegulerPage({ searchParams }: Props) {
  const access = await requirePermission("hasil_produksi.view");
  const canWrite = access.permissionCodes.includes("hasil_produksi.write");
  const q = await searchParams;
  const supabase = await createClient();

  // Load supporting reference data
  const [projectRes, productRes, workerRes, workItemRes, recentChecksRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, project_code, name, status, product_category")
      .order("name"),
    supabase.from("project_products").select("id, project_id, product_code, name, unit").eq("status", "AKTIF").order("name"),
    supabase.from("workers").select("id, worker_code, name, pay_system").eq("status", "AKTIF").order("name"),
    supabase.from("work_items").select("id, project_id, product_id, name, operator_price, proposed_price, unit").eq("status", "AKTIF").order("name"),
    supabase
      .from("production_checks")
      .select("id, check_date, good_qty, reject_qty, notes, order_item_id, created_at")
      .eq("status", "AKTIF")
      .order("id", { ascending: false })
      .limit(30),
  ]);

  const rawProjects = (projectRes.data ?? []) as any[];
  const projects = rawProjects
    .filter(
      (x) =>
        !["SELESAI", "NONAKTIF", "BATAL", "DIBATALKAN"].includes(
          String(x.status ?? "").trim().toUpperCase(),
        ),
    )
    .map((x) => ({
      id: x.id,
      project_code: x.project_code,
      name: x.name,
      category: resolveProjectCategory(x),
    }))
    .sort((a, b) => {
      if (a.category === b.category) return a.name.localeCompare(b.name);
      return a.category === "REGULER" ? -1 : 1;
    });
  const products = (productRes.data ?? []) as any[];
  const workers = (workerRes.data ?? []) as any[];
  const workItems = (workItemRes.data ?? []) as any[];
  const recentChecks = (recentChecksRes.data ?? []) as any[];

  // Ambil metadata order item untuk tabel riwayat
  const orderItemIds = recentChecks.map((c) => c.order_item_id).filter(Boolean);
  let orderItemsMap = new Map<number, any>();

  if (orderItemIds.length > 0) {
    const { data: oItems } = await supabase
      .from("production_order_items")
      .select("id, order_id, work_item_name_snapshot, operator_price_snapshot, submission_price_snapshot")
      .in("id", orderItemIds);

    const orderIds = (oItems ?? []).map((oi) => oi.order_id).filter(Boolean);
    const { data: orders } = await supabase
      .from("production_orders")
      .select("id, operator_worker_id, project_id, product_id")
      .in("id", orderIds);

    const orderMap = new Map((orders ?? []).map((o) => [o.id, o]));
    const workerMap = new Map(workers.map((w) => [w.id, w]));
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const oi of oItems ?? []) {
      const ord = orderMap.get(oi.order_id);
      const wrk = ord ? workerMap.get(ord.operator_worker_id) : null;
      const prd = ord ? productMap.get(ord.product_id) : null;
      const isHarian = (wrk?.pay_system || "").toUpperCase() === "HARIAN";
      const opPrice = Number(oi.operator_price_snapshot || 0);
      const subPrice = Number(oi.submission_price_snapshot || opPrice);

      orderItemsMap.set(oi.id, {
        workName: oi.work_item_name_snapshot,
        operatorPrice: opPrice,
        proposedPrice: subPrice,
        workerName: wrk?.name || "Penjahit",
        paySystem: wrk?.pay_system || "BORONGAN",
        productName: prd?.name || "Tas",
        isHarian,
      });
    }
  }

  return (
    <MasterPageShell
      eyebrow="Produksi Reguler"
      title="Setoran Jahit Cepat (Jalur Langsung)"
      description="Pencatatan setoran jahit cepat untuk proyek umum & non-haji. Langsung menghitung upah penjahit dan menambah stok Barang Jadi di Gudang PUSAT tanpa SPV & Checker."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {/* Form Input Interaktif */}
      <ProduksiRegulerClient
        projects={projects}
        products={products}
        workers={workers}
        workItems={workItems}
        canWrite={canWrite}
      />

      {/* Tabel Riwayat Setoran Terkini */}
      <div className="mt-8">
        <SectionCard
          title="Riwayat Setoran Jahit Terkini"
          description="Daftar setoran jahit yang telah masuk ke pembukuan upah dan stok barang jadi (termasuk repakan pekerja harian)."
        >
          {recentChecks.length === 0 ? (
            <EmptyState text="Belum ada riwayat setoran jahit tercatat." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Penjahit & Upah</th>
                    <th className="px-4 py-3">Produk & Bagian Jahit</th>
                    <th className="px-4 py-3 text-right">Hasil Repakan (Pcs)</th>
                    <th className="px-4 py-3 text-right">Upah Operator (Riil)</th>
                    <th className="px-4 py-3 text-right">Nilai Pengajuan</th>
                    <th className="px-4 py-3">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-700">
                  {recentChecks.map((c) => {
                    const meta = orderItemsMap.get(c.order_item_id);
                    const goodQty = Number(c.good_qty || 0);
                    const opPrice = meta?.operatorPrice || 0;
                    const propPrice = meta?.proposedPrice || opPrice;
                    const isHarian = Boolean(meta?.isHarian);
                    const wageOperator = isHarian ? 0 : goodQty * opPrice;
                    const valProposed = goodQty * propPrice;

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-500">
                          {c.check_date}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <b className="text-slate-900">{meta?.workerName || "-"}</b>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                                isHarian
                                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              }`}
                            >
                              {meta?.paySystem || "BORONGAN"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-900">{meta?.productName || "Tas"}</span>
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span className="text-slate-600">{meta?.workName || "-"}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            {formatNumber(goodQty)} pcs
                          </span>
                          {c.reject_qty > 0 ? (
                            <span className="ml-1 text-[10px] text-red-500 font-bold">
                              ({c.reject_qty} reject)
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold">
                          {isHarian ? (
                            <div className="inline-flex flex-col items-end">
                              <span className="text-slate-500 text-xs">Rp 0</span>
                              <span className="text-[10px] text-amber-700 font-semibold">(Dibayar Harian)</span>
                            </div>
                          ) : (
                            <span className="text-emerald-700">
                              Rp {wageOperator.toLocaleString("id-ID")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-blue-700">
                          Rp {valProposed.toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[11px] max-w-xs truncate">
                          {c.notes || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </MasterPageShell>
  );
}
