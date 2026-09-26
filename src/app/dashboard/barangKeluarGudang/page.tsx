import Link from "next/link";
import {
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
} from "@/components/master/master-ui";
import { Badge, FlowNote } from "@/components/operations/ops-ui";
import { requirePermission } from "@/lib/access/current-user";
import { formatNumber, param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { fulfillRequest } from "./actions";
import { DirectIssueUnifiedForm } from "./direct-issue-client";

type Props = { searchParams: Promise<SearchParams> };
type Project = { id: number; name: string };
type Product = { id: number; name: string; project_id?: number };
type Worker = { id: number; worker_code: string; name: string };
type RequestRow = {
  id: number; request_code: string; request_date: string; project_id: number; product_id: number | null; purpose: string; status: string;
};
type RequestItem = {
  id: number; request_id: number; source_type: string; bom_requirement_id: number | null; cutting_component_id: number | null; material_id: number | null;
  item_name_snapshot: string; color_snapshot: string; unit_snapshot: string; requested_qty: number | string; fulfilled_qty: number | string; status: string;
  available_material: number | string; available_cutting: number | string; available_sablon: number | string;
};
type InboxRow = {
  request_id: number; request_code: string; request_date: string; project_id: number; project_name: string; product_id: number | null; product_name: string | null;
  purpose: string; request_status: string; item_id: number; source_type: string; bom_requirement_id: number | null; cutting_component_id: number | null;
  material_id: number | null; item_name_snapshot: string; color_snapshot: string; unit_snapshot: string; requested_qty: number | string; fulfilled_qty: number | string;
  item_status: string; available_material: number | string; available_cutting: number | string; available_sablon: number | string;
};
type Bom = { id: number; project_id: number; product_id: number | null; component_name: string; unit: string };

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("barang_keluar_gudang.view");
  const canWrite = access.permissionCodes.includes("barang_keluar_gudang.write") && access.permissionCodes.includes("permintaan_produksi.fulfill");
  const q = await searchParams;
  const supabase = await createClient();

  const [inboxRes, projectsRes, productsRes, workersRes, bomRes, locRes, balancesRes, compsRes] = await Promise.all([
    supabase.rpc("smpt_gudang_pending_inbox"),
    supabase.from("projects").select("id,name").order("id", { ascending: false }).limit(300),
    supabase.from("project_products").select("id,project_id,name").eq("status", "AKTIF").order("id", { ascending: false }).limit(1000),
    supabase.from("workers").select("id,worker_code,name").eq("status", "AKTIF").order("name").limit(1000),
    supabase.from("bom_requirements").select("id,project_id,product_id,component_name,unit").eq("status", "AKTIF").eq("component_type", "BAHAN").limit(2000),
    supabase.from("stock_locations").select("id,code,name,physical_group"),
    supabase.from("stock_balances").select("id,item_kind,cutting_component_id,location_id,project_id,product_id,quantity").eq("item_kind", "CUTTING_COMPONENT").gt("quantity", 0).limit(2000),
    supabase.from("cutting_components").select("id,component_code,name,color,unit,product_id,project_id").eq("status", "AKTIF").limit(2000),
  ]);

  const error = [inboxRes.error, projectsRes.error, productsRes.error, workersRes.error, bomRes.error, locRes.error, balancesRes.error, compsRes.error].find(Boolean);
  if (error) throw new Error(error.message);

  const inbox = (inboxRes.data ?? []) as InboxRow[];
  const projects = (projectsRes.data ?? []) as Project[];
  const products = (productsRes.data ?? []) as Product[];
  const workers = (workersRes.data ?? []) as Worker[];
  const boms = (bomRes.data ?? []) as Bom[];
  const projectMap = new Map(projects.map((x) => [x.id, x]));
  const productMap = new Map(products.map((x) => [x.id, x]));

  // The inbox RPC already returns only outstanding rows and scoped availability.
  // Rehydrate the existing UI model without loading global request-item/stock tables.
  const requestMap = new Map<number, RequestRow>();
  const items: RequestItem[] = [];
  for (const row of inbox) {
    if (!requestMap.has(row.request_id)) {
      requestMap.set(row.request_id, {
        id: row.request_id,
        request_code: row.request_code,
        request_date: row.request_date,
        project_id: row.project_id,
        product_id: row.product_id,
        purpose: row.purpose,
        status: row.request_status,
      });
      if (!projectMap.has(row.project_id)) projectMap.set(row.project_id, { id: row.project_id, name: row.project_name });
      if (row.product_id && row.product_name && !productMap.has(row.product_id)) productMap.set(row.product_id, { id: row.product_id, name: row.product_name });
    }
    items.push({
      id: row.item_id, request_id: row.request_id, source_type: row.source_type, bom_requirement_id: row.bom_requirement_id,
      cutting_component_id: row.cutting_component_id, material_id: row.material_id, item_name_snapshot: row.item_name_snapshot,
      color_snapshot: row.color_snapshot, unit_snapshot: row.unit_snapshot, requested_qty: row.requested_qty, fulfilled_qty: row.fulfilled_qty,
      status: row.item_status, available_material: row.available_material, available_cutting: row.available_cutting, available_sablon: row.available_sablon,
    });
  }
  const pendingRows = Array.from(requestMap.values());

  function getMaterialAvailable(item: RequestItem): number {
    return Number(item.available_material || 0);
  }
  function getWipAvailable(item: RequestItem, _request: RequestRow, sourceState?: "HASIL_CUTTING" | "HASIL_SABLON"): number {
    return sourceState === "HASIL_SABLON" || item.source_type === "HASIL SABLON"
      ? Number(item.available_sablon || 0)
      : Number(item.available_cutting || 0);
  }

  const locRows = (locRes.data ?? []) as { id: number; code: string; name: string }[];
  const locMap = new Map(locRows.map((x) => [x.id, x]));
  const balanceRows = (balancesRes.data ?? []) as { id: number; cutting_component_id: number; location_id: number; project_id: number | null; product_id: number | null; quantity: number | string }[];
  const compRows = (compsRes.data ?? []) as { id: number; component_code: string; name: string; color: string; unit: string; product_id: number | null; project_id: number }[];
  const compMap = new Map(compRows.map((x) => [x.id, x]));

  const wipCuttingStocks = balanceRows
    .filter((b) => {
      const loc = locMap.get(b.location_id);
      return loc?.code === "GUDANG_HASIL_BELUM" || loc?.code === "GUDANG_HASIL_SABLON";
    })
    .map((b) => {
      const c = compMap.get(b.cutting_component_id);
      const loc = locMap.get(b.location_id);
      return {
        id: b.id,
        location_code: loc?.code || "",
        location_name: loc?.name || "Gudang Hasil Potong",
        component_id: b.cutting_component_id,
        component_code: c?.component_code || "",
        component_name: c?.name || "Komponen",
        color: c?.color || "",
        unit: c?.unit || "Pcs",
        project_id: b.project_id,
        project_name: b.project_id ? (projectMap.get(b.project_id)?.name || "-") : "-",
        product_id: b.product_id,
        product_name: b.product_id ? (productMap.get(b.product_id)?.name || "-") : "-",
        quantity: Number(b.quantity),
      };
    });

  const wipSablonStocks = balanceRows
    .filter((b) => locMap.get(b.location_id)?.code === "GUDANG_HASIL_SELESAI_SABLON")
    .map((b) => {
      const c = compMap.get(b.cutting_component_id);
      const loc = locMap.get(b.location_id);
      return {
        id: b.id,
        location_code: loc?.code || "",
        location_name: loc?.name || "Selesai Sablon",
        component_id: b.cutting_component_id,
        component_code: c?.component_code || "",
        component_name: c?.name || "Komponen",
        color: c?.color || "",
        unit: c?.unit || "Pcs",
        project_id: b.project_id,
        project_name: b.project_id ? (projectMap.get(b.project_id)?.name || "-") : "-",
        product_id: b.product_id,
        product_name: b.product_id ? (productMap.get(b.product_id)?.name || "-") : "-",
        quantity: Number(b.quantity),
      };
    });

  return (
    <MasterPageShell
      eyebrow="Gudang & Material"
      title="Barang Keluar Gudang (1 Pintu)"
      description="Pusat 1 Pintu Seluruh Pengeluaran Barang Pabrik: Bahan Mentah Roll (ke Cutting), Hasil Potong (ke Sablon/Jahit), dan Hasil Sablon (ke Jahit)."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {/* Diagram Alur 1 Pintu Logistik Pabrik */}
      <div className="mb-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/90 to-indigo-50/70 p-4 text-xs text-slate-700 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 font-bold text-blue-900 text-sm">
            <span>🚪</span>
            <span>Alur 1 Pintu Logistik & Pengeluaran Barang Pabrik</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/barangMasukGudang"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              📥 1. Bahan Datang
            </Link>
            <Link
              href="/dashboard/cutting"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              ✂️ 2. Cutting (Input Potong)
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs">
              🚪 3. Barang Keluar (Halaman Ini)
            </span>
            <Link
              href="/dashboard/stokGudang"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              📦 4. Pantau Stok
            </Link>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-5 text-center">
          <div className="rounded-xl border border-blue-200/80 bg-white p-2.5 shadow-2xs">
            <span className="font-bold text-blue-700 block">1. Bahan Roll / Kain</span>
            <span className="text-[11px] text-slate-500">Keluar ke Cutting</span>
          </div>
          <div className="flex items-center justify-center font-bold text-blue-400">➔</div>
          <div className="rounded-xl border border-amber-200/80 bg-white p-2.5 shadow-2xs">
            <span className="font-bold text-amber-700 block">2. Gudang Hasil Potong</span>
            <span className="text-[11px] text-slate-500">Masuk otomatis dari cutting</span>
          </div>
          <div className="flex items-center justify-center font-bold text-blue-400">➔ (Sablon) ➔</div>
          <div className="rounded-xl border border-emerald-200/80 bg-white p-2.5 shadow-2xs">
            <span className="font-bold text-emerald-700 block">3. Ke Siap Produksi</span>
            <span className="text-[11px] text-slate-500">Keluar ke Jahit / Assembling</span>
          </div>
        </div>
      </div>

      <FlowNote>
        SEMUA PENGELUARAN 1 PINTU: Pengeluaran Bahan Mentah, Hasil Cutting, dan Hasil Sablon dapat dilakukan langsung dari halaman ini tanpa perlu membuka halaman stok terpisah.
      </FlowNote>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Notifikasi Gudang</p>
          <p className="mt-1 text-2xl font-black text-amber-950">{pendingRows.length}</p>
          <p className="mt-0.5 text-xs text-amber-700">permintaan perlu diproses</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Menunggu Gudang</p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {pendingRows.filter((x) => x.status === "MENUNGGU GUDANG").length}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">antrean utama</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sebagian</p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {pendingRows.filter((x) => x.status === "SEBAGIAN").length}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">belum terpenuhi penuh</p>
        </div>
      </div>

      <SectionCard title={`Permintaan Menunggu Gudang (${pendingRows.length})`}>
        <div className="space-y-4">
          {pendingRows.length === 0 ? (
            <p className="text-sm text-slate-500">
              Tidak ada permintaan aktif. Pastikan SPV sudah menekan “Kirim ke Gudang”; DRAFT belum menjadi tugas Gudang.
            </p>
          ) : null}

          {pendingRows.map((request) => {
            const requestItems = items.filter(
              (item) =>
                item.request_id === request.id &&
                Number(item.fulfilled_qty) < Number(item.requested_qty),
            );

            return (
              <div
                key={request.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
              >
                <div className="mb-3 flex justify-between gap-3">
                  <div>
                    <b className="text-slate-900 font-bold">{request.request_code}</b>
                    <p className="text-xs text-slate-500">
                      {request.request_date} · {projectMap.get(request.project_id)?.name} · {request.product_id ? productMap.get(request.product_id)?.name : "Umum Proyek"} · {request.purpose}
                    </p>
                  </div>
                  <Badge>{request.status}</Badge>
                </div>

                <div className="space-y-3">
                  {requestItems.map((item) => {
                    const remaining = Number(item.requested_qty) - Number(item.fulfilled_qty);
                    const cuttingAvailable =
                      item.source_type === "BAHAN BAKU"
                        ? 0
                        : getWipAvailable(item, request, "HASIL_CUTTING");
                    const sablonAvailable =
                      item.source_type === "BAHAN BAKU"
                        ? 0
                        : getWipAvailable(item, request, "HASIL_SABLON");
                    const fixedAvailable =
                      item.source_type === "BAHAN BAKU"
                        ? getMaterialAvailable(item)
                        : item.source_type === "HASIL SABLON"
                          ? sablonAvailable
                          : request.purpose === "PRODUKSI"
                            ? Math.max(cuttingAvailable, sablonAvailable)
                            : cuttingAvailable;
                    const maxQty = Math.max(0, Math.min(remaining, fixedAvailable));
                    const legacyChoice =
                      item.source_type === "HASIL CUTTING" && request.purpose === "PRODUKSI";

                    return (
                      <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800">
                            {item.source_type} · {item.item_name_snapshot}
                            {item.color_snapshot ? ` / ${item.color_snapshot}` : ""} · sisa {formatNumber(remaining)} {item.unit_snapshot}
                          </p>
                          <span className={`text-xs font-bold ${fixedAvailable > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            stok sumber {formatNumber(fixedAvailable)} {item.unit_snapshot}
                          </span>
                        </div>

                        {canWrite ? (
                          <form action={fulfillRequest} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                            <input type="hidden" name="request_item_id" value={item.id} />
                            <Field label="Tanggal">
                              <input name="issue_date" type="date" required className={inputClass} />
                            </Field>
                            <Field label="Qty">
                              <input
                                name="quantity"
                                type="number"
                                min="0.0001"
                                max={maxQty || undefined}
                                step="0.0001"
                                required
                                disabled={maxQty <= 0}
                                className={inputClass}
                              />
                            </Field>
                            <Field label="Pengambil">
                              <select name="recipient_worker_id" className={inputClass}>
                                <option value="">Manual</option>
                                {workers.map((worker) => (
                                  <option key={worker.id} value={worker.id}>
                                    {worker.worker_code} · {worker.name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Nama Manual">
                              <input name="recipient_name" className={inputClass} />
                            </Field>

                            {legacyChoice ? (
                              <Field label="Sumber WIP">
                                <select
                                  name="wip_source_state"
                                  defaultValue={cuttingAvailable > 0 ? "HASIL_CUTTING" : "HASIL_SABLON"}
                                  className={inputClass}
                                >
                                  <option value="HASIL_CUTTING" disabled={cuttingAvailable <= 0}>
                                    Hasil Cutting · tersedia {formatNumber(cuttingAvailable)}
                                  </option>
                                  <option value="HASIL_SABLON" disabled={sablonAvailable <= 0}>
                                    Hasil Sablon · tersedia {formatNumber(sablonAvailable)}
                                  </option>
                                </select>
                              </Field>
                            ) : (
                              <input
                                type="hidden"
                                name="wip_source_state"
                                value={item.source_type === "HASIL SABLON" ? "HASIL_SABLON" : ""}
                              />
                            )}

                            <Field label="Keterangan">
                              <input name="notes" className={inputClass} />
                            </Field>
                            <div>
                              <button disabled={maxQty <= 0} className={primaryButtonClass}>
                                Keluarkan
                              </button>
                            </div>
                          </form>
                        ) : null}

                        {maxQty <= 0 ? (
                          <p className="mt-2 text-xs text-rose-400">
                            Belum ada stok fisik pada lokasi sumber yang sesuai. Gudang tidak boleh memenuhi request ini sampai stok tersedia.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {canWrite ? (
        <DirectIssueUnifiedForm
          projects={Array.from(projectMap.values()).map((x) => ({ id: x.id, name: x.name }))}
          products={products.filter((x) => x.project_id).map((x) => ({ id: x.id, project_id: Number(x.project_id), name: x.name }))}
          boms={boms.map((x) => ({ id: x.id, project_id: x.project_id, product_id: x.product_id, label: `${x.component_name} (${x.unit})` }))}
          workers={workers.map((x) => ({ id: x.id, worker_code: x.worker_code, name: x.name }))}
          wipCuttingStocks={wipCuttingStocks}
          wipSablonStocks={wipSablonStocks}
        />
      ) : null}

      {/* Tabel Stok Gudang Yang Siap Dikeluarkan (Bertaut Hasil Potong & Sablon) */}
      <SectionCard
        title={`📦 Stok Komponen di Gudang Siap Dikeluarkan (${wipCuttingStocks.length + wipSablonStocks.length})`}
        description="Hasil cutting otomatis masuk ke sini. Bisa langsung dikeluarkan ke Sablon atau Siap Jahit / Produksi."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {/* Kolom 1: Hasil Potong (Cutting) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <span>✂️</span>
                <span>Hasil Potong (Cutting WIP)</span>
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                {wipCuttingStocks.length} Komponen
              </span>
            </div>
            {wipCuttingStocks.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">Belum ada stok hasil potong di gudang.</p>
            ) : (
              <div className="space-y-2">
                {wipCuttingStocks.map((w) => (
                  <div key={w.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <b className="text-slate-900">{w.component_name}</b>
                        {w.color ? <span className="text-slate-500"> ({w.color})</span> : null}
                        <p className="text-[11px] text-slate-500">{w.product_name} · {w.project_name}</p>
                      </div>
                      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {formatNumber(w.quantity)} {w.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Kolom 2: Selesai Sablon */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <span>🎨</span>
                <span>Hasil Sablon di Gudang</span>
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                {wipSablonStocks.length} Komponen
              </span>
            </div>
            {wipSablonStocks.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">Belum ada stok selesai sablon di gudang.</p>
            ) : (
              <div className="space-y-2">
                {wipSablonStocks.map((w) => (
                  <div key={w.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <b className="text-slate-900">{w.component_name}</b>
                        {w.color ? <span className="text-slate-500"> ({w.color})</span> : null}
                        <p className="text-[11px] text-slate-500">{w.product_name} · {w.project_name}</p>
                      </div>
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {formatNumber(w.quantity)} {w.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </MasterPageShell>
  );
}
