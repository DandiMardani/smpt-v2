import Link from "next/link";
import {
  dangerButtonClass,
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
  secondaryButtonClass,
} from "@/components/master/master-ui";
import { Badge, FlowNote } from "@/components/operations/ops-ui";
import { ProjectProductFields } from "@/components/forms/project-product-fields";
import { requirePermission } from "@/lib/access/current-user";
import { formatNumber, param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import {
  addItem,
  cancelRequest,
  createRequest,
  removeItem,
  submitRequest,
} from "./actions";

type Props = { searchParams: Promise<SearchParams> };
type Project = { id: number; project_code: string; name: string };
type Product = { id: number; product_code: string; project_id: number; name: string };
type Worker = {
  id: number;
  worker_code: string;
  name: string;
  department: string | null;
  position: string | null;
};
type RequestRow = {
  id: number;
  request_code: string;
  request_date: string;
  project_id: number;
  product_id: number | null;
  supervisor_worker_id: number;
  purpose: string;
  status: string;
};
type RequestItem = {
  id: number;
  request_id: number;
  source_type: string;
  item_name_snapshot: string;
  color_snapshot: string;
  unit_snapshot: string;
  requested_qty: number | string;
  fulfilled_qty: number | string;
  status: string;
};
type Bom = {
  id: number;
  project_id: number;
  product_id: number | null;
  component_name: string;
  unit: string;
};
type CuttingComponent = {
  id: number;
  project_id: number;
  product_id: number | null;
  component_code: string;
  name: string;
  color: string;
  unit: string;
};
type StockLocation = { id: number; code: string };
type StockBalance = {
  cutting_component_id: number | null;
  location_id: number;
  project_id: number | null;
  product_id: number | null;
  quantity: number | string;
};

function key(componentId: number, locationId: number): string {
  return `${componentId}:${locationId}`;
}

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("permintaan_produksi.view");
  const canWrite = access.permissionCodes.includes("permintaan_produksi.write");
  const q = await searchParams;
  const requestId = Number(param(q, "request", "0"));
  const supabase = await createClient();

  const [projectsRes, productsRes, workersRes, requestsRes, itemsRes, bomRes, componentsRes, locationsRes, balancesRes] =
    await Promise.all([
      supabase.from("projects").select("id,project_code,name").order("name"),
      supabase
        .from("project_products")
        .select("id,product_code,project_id,name")
        .eq("status", "AKTIF")
        .order("name"),
      supabase
        .from("workers")
        .select("id,worker_code,name,department,position")
        .eq("status", "AKTIF")
        .order("name"),
      supabase
        .from("material_requests")
        .select("id,request_code,request_date,project_id,product_id,supervisor_worker_id,purpose,status")
        .order("id", { ascending: false })
        .limit(100),
      supabase
        .from("material_request_items")
        .select("id,request_id,source_type,item_name_snapshot,color_snapshot,unit_snapshot,requested_qty,fulfilled_qty,status"),
      supabase
        .from("bom_requirements")
        .select("id,project_id,product_id,component_name,unit")
        .eq("status", "AKTIF")
        .eq("component_type", "BAHAN"),
      supabase
        .from("cutting_components")
        .select("id,project_id,product_id,component_code,name,color,unit")
        .eq("status", "AKTIF"),
      supabase.from("stock_locations").select("id,code").eq("is_active", true),
      supabase
        .from("stock_balances")
        .select("cutting_component_id,location_id,project_id,product_id,quantity")
        .eq("item_kind", "CUTTING_COMPONENT")
        .gt("quantity", 0),
    ]);

  const error = [
    projectsRes.error,
    productsRes.error,
    workersRes.error,
    requestsRes.error,
    itemsRes.error,
    bomRes.error,
    componentsRes.error,
    locationsRes.error,
    balancesRes.error,
  ].find(Boolean);
  if (error) throw new Error(error.message);

  const projects = (projectsRes.data ?? []) as Project[];
  const products = (productsRes.data ?? []) as Product[];
  const workers = (workersRes.data ?? []) as Worker[];
  const rows = (requestsRes.data ?? []) as RequestRow[];
  const items = (itemsRes.data ?? []) as RequestItem[];
  const boms = (bomRes.data ?? []) as Bom[];
  const components = (componentsRes.data ?? []) as CuttingComponent[];
  const locations = (locationsRes.data ?? []) as StockLocation[];
  const balances = (balancesRes.data ?? []) as StockBalance[];

  const projectMap = new Map(projects.map((x) => [x.id, x]));
  const productMap = new Map(products.map((x) => [x.id, x]));
  const locationIdByCode = new Map(locations.map((x) => [x.code, x.id]));
  const balanceMap = new Map<string, number>();
  for (const balance of balances) {
    if (!balance.cutting_component_id) continue;
    const k = key(balance.cutting_component_id, balance.location_id);
    balanceMap.set(k, (balanceMap.get(k) ?? 0) + Number(balance.quantity || 0));
  }

  const selected = rows.find((x) => x.id === requestId);
  const selectedItems = selected
    ? items.filter((x) => x.request_id === selected.id && x.status !== "DIBATALKAN")
    : [];
  const supervisors = workers.filter((x) => /(SPV|SUPERVISOR)/i.test(x.position || ""));

  const locCuttingReady = locationIdByCode.get("GUDANG_HASIL_BELUM");
  const locSablonReady = locationIdByCode.get("GUDANG_HASIL_SABLON");
  const locSablonDone = locationIdByCode.get("GUDANG_HASIL_SELESAI_SABLON");

  const scopedComponents = selected
    ? components.filter(
        (x) =>
          x.project_id === selected.project_id &&
          (x.product_id === null || x.product_id === selected.product_id),
      )
    : [];

  const availableCutting = scopedComponents
    .map((component) => ({
      component,
      qty: locCuttingReady ? balanceMap.get(key(component.id, locCuttingReady)) ?? 0 : 0,
    }))
    .filter((x) => x.qty > 0);

  const availableForSablon = scopedComponents
    .map((component) => ({
      component,
      qty: locSablonReady ? balanceMap.get(key(component.id, locSablonReady)) ?? 0 : 0,
    }))
    .filter((x) => x.qty > 0);

  const availableSablonDone = scopedComponents
    .map((component) => ({
      component,
      qty: locSablonDone ? balanceMap.get(key(component.id, locSablonDone)) ?? 0 : 0,
    }))
    .filter((x) => x.qty > 0);

  return (
    <MasterPageShell
      eyebrow="Produksi"
      title="Permintaan Barang"
      description="SPV meminta barang yang benar-benar tersedia di Gudang. Request tidak mengurangi stok; stok bergerak saat Gudang memenuhi."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}
      <FlowNote>
        DRAFT → MENUNGGU GUDANG → SEBAGIAN/SELESAI. WIP Siap Produksi dibaca dari saldo fisik Gudang Hasil, bukan dari master komponen saja.
      </FlowNote>

      {canWrite ? (
        <SectionCard title="Buat Draft">
          <form action={createRequest} className="grid gap-3 md:grid-cols-3">
            <Field label="Tanggal">
              <input name="request_date" type="date" required className={inputClass} />
            </Field>
            <ProjectProductFields
              projects={projects.map((x) => ({ id:x.id, name:x.name, code:x.project_code }))}
              products={products.map((x) => ({ id:x.id, project_id:x.project_id, name:x.name, code:x.product_code }))}
              className={inputClass}
              productRequired={false}
              productEmptyLabel="Umum proyek"
            />
            <Field label="Supervisor">
              <select name="supervisor_worker_id" required className={inputClass}>
                <option value="">Pilih supervisor</option>
                {supervisors.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.worker_code} · {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tujuan">
              <select name="purpose" className={inputClass}>
                <option>CUTTING</option>
                <option>SABLON</option>
                <option>PRODUKSI</option>
              </select>
            </Field>
            <Field label="Keterangan">
              <input name="notes" className={inputClass} />
            </Field>
            <div>
              <button className={primaryButtonClass}>Buat Draft</button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {selected ? (
        <SectionCard title={`Draft ${selected.request_code}`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge>{selected.status}</Badge>
            <span className="text-xs text-slate-500">
              Tujuan: {selected.purpose}
            </span>
          </div>

          {canWrite && selected.status === "DRAFT" ? (
            <>
              <form action={addItem} className="grid gap-3 md:grid-cols-4">
                <input type="hidden" name="request_id" value={selected.id} />
                <Field label="Barang">
                  <select name="source_ref" required className={inputClass}>
                    <option value="">Pilih item</option>

                    <optgroup label="Bahan Baku / BOM">
                      {boms
                        .filter(
                          (x) =>
                            x.project_id === selected.project_id &&
                            (x.product_id === null || x.product_id === selected.product_id),
                        )
                        .map((x) => (
                          <option key={`b${x.id}`} value={`BAHAN BAKU:${x.id}`}>
                            BAHAN · {x.component_name} ({x.unit})
                          </option>
                        ))}
                    </optgroup>

                    {selected.purpose === "SABLON" ? (
                      <optgroup label="WIP untuk Sablon - tersedia di Gudang Hasil">
                        {availableForSablon.map(({ component, qty }) => (
                          <option key={`cs${component.id}`} value={`HASIL CUTTING:${component.id}`}>
                            WIP CUTTING · {component.name}
                            {component.color ? `/${component.color}` : ""} · tersedia {formatNumber(qty)} {component.unit}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}

                    {selected.purpose === "PRODUKSI" ? (
                      <>
                        <optgroup label="Siap Produksi - Hasil Cutting">
                          {availableCutting.map(({ component, qty }) => (
                            <option key={`cp${component.id}`} value={`HASIL CUTTING:${component.id}`}>
                              SIAP PRODUKSI · Hasil Cutting · {component.name}
                              {component.color ? `/${component.color}` : ""} · tersedia {formatNumber(qty)} {component.unit}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Siap Produksi - Hasil Sablon">
                          {availableSablonDone.map(({ component, qty }) => (
                            <option key={`sp${component.id}`} value={`HASIL SABLON:${component.id}`}>
                              SIAP PRODUKSI · Hasil Sablon · {component.name}
                              {component.color ? `/${component.color}` : ""} · tersedia {formatNumber(qty)} {component.unit}
                            </option>
                          ))}
                        </optgroup>
                      </>
                    ) : null}
                  </select>
                </Field>
                <Field label="Qty">
                  <input
                    name="quantity"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Keterangan">
                  <input name="notes" className={inputClass} />
                </Field>
                <div>
                  <button className={primaryButtonClass}>Tambah</button>
                </div>
              </form>

              {selected.purpose === "PRODUKSI" &&
              availableCutting.length === 0 &&
              availableSablonDone.length === 0 ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Belum ada WIP fisik yang siap dikirim dari Gudang Hasil ke Siap Produksi untuk Produk ini.
                </p>
              ) : null}

              <div className="mt-4 space-y-2">
                {selectedItems.map((x) => (
                  <div
                    key={x.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs"
                  >
                    <span className="text-sm font-medium text-slate-800">
                      {x.source_type} · {x.item_name_snapshot} · {formatNumber(x.requested_qty)} {x.unit_snapshot}
                    </span>
                    <form action={removeItem}>
                      <input type="hidden" name="request_id" value={selected.id} />
                      <input type="hidden" name="item_id" value={x.id} />
                      <button className={dangerButtonClass}>Hapus</button>
                    </form>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <form action={submitRequest}>
                  <input type="hidden" name="request_id" value={selected.id} />
                  <button className={primaryButtonClass}>Kirim ke Gudang</button>
                </form>
                <form action={cancelRequest}>
                  <input type="hidden" name="request_id" value={selected.id} />
                  <button className={dangerButtonClass}>Batalkan</button>
                </form>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Setelah tombol “Kirim ke Gudang” ditekan, status berubah menjadi MENUNGGU GUDANG dan masuk ke inbox Barang Keluar Gudang.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Permintaan sudah tidak dalam status DRAFT.</p>
          )}
        </SectionCard>
      ) : null}

      <SectionCard title="Riwayat Permintaan">
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs"
            >
              <div>
                <b className="font-bold text-slate-900">{r.request_code}</b>
                <p className="text-xs text-slate-500 mt-0.5">
                  {r.request_date} · {projectMap.get(r.project_id)?.name} · {r.product_id ? productMap.get(r.product_id)?.name : "Umum Proyek"} · {r.purpose}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge>{r.status}</Badge>
                {r.status === "DRAFT" ? (
                  <Link href={`/dashboard/permintaanProduksi?request=${r.id}`} className={secondaryButtonClass}>
                    Buka
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </MasterPageShell>
  );
}
