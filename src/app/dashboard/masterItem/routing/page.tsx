import {
  Badge,
  Card,
  Empty,
  Field,
  Flow,
  Metric,
  Notice,
  PageShell,
  ReadOnly,
  TableWrap,
  Td,
  Th,
  buttonClass,
  dangerClass,
  inputClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { n, param, qty, text, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { deactivateDependency, saveDependency, saveWorkItemFlow } from "./actions";

type Props = { searchParams: Promise<SearchParams> };

type WorkItem = {
  id: number;
  project_id: number;
  product_id: number | null;
  name: string;
  qty_per_product: number | string;
  unit: string;
  display_order: number;
  flow_mode: "MANDIRI" | "BERANTAI" | "KHUSUS";
  flow_order: number | null;
  routing_validation_mode: "WARNING" | "HARD";
  status: string;
};

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("master_item.view");
  const canWrite = access.permissionCodes.includes("master_item.write");
  const q = await searchParams;
  const projectId = Number(param(q, "project", "0")) || 0;
  const productId = Number(param(q, "product", "0")) || 0;
  const s = await createClient();

  const [pr, ppr] = await Promise.all([
    s.from("projects").select("id,project_code,name,status").order("name").limit(300),
    s.from("project_products").select("id,project_id,product_code,name,status").eq("status", "AKTIF").order("name").limit(1000),
  ]);
  if (pr.error) throw new Error(pr.error.message);
  if (ppr.error) throw new Error(ppr.error.message);

  const projects = pr.data ?? [];
  const products = ppr.data ?? [];
  const productOptions = projectId ? products.filter((x: any) => x.project_id === projectId) : products;

  let items: WorkItem[] = [];
  let deps: any[] = [];
  let progress: any[] = [];

  if (productId) {
    const [ir, dr, gr] = await Promise.all([
      s.from("work_items")
        .select("id,project_id,product_id,name,qty_per_product,unit,display_order,flow_mode,flow_order,routing_validation_mode,status")
        .eq("product_id", productId)
        .eq("status", "AKTIF")
        .order("display_order")
        .order("id"),
      s.from("work_item_dependencies")
        .select("id,product_id,predecessor_work_item_id,successor_work_item_id,dependency_type,validation_mode,enforce_from,status,notes,opening_consumed_equivalent,source_mode")
        .eq("product_id", productId)
        .order("id"),
      s.rpc("smpt_master_item_equivalent_progress", { p_product_id: productId }),
    ]);
    const e = [ir.error, dr.error, gr.error].find(Boolean);
    if (e) throw new Error(e.message);
    items = (ir.data ?? []) as WorkItem[];
    deps = dr.data ?? [];
    progress = gr.data ?? [];
  }

  const itemMap = new Map(items.map((x) => [x.id, x]));
  const progressMap = new Map(progress.map((x: any) => [x.work_item_id, x]));
  const autoDeps = deps.filter((x) => x.source_mode === "AUTO_LINEAR" && x.status === "AKTIF");
  const specialDeps = deps.filter((x) => x.source_mode !== "AUTO_LINEAR");
  const specialItems = items.filter((x) => x.flow_mode === "KHUSUS");

  return (
    <PageShell
      eyebrow="Master Produksi"
      title="Alur Item Pekerjaan"
      description="Untuk alur normal, user cukup pilih MANDIRI atau BERANTAI + Nomor Alur. Routing manual hanya dipakai untuk CABANG / PARALLEL / JOIN."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      <Flow>
        MANDIRI = tidak dibandingkan dengan item lain. BERANTAI = sistem otomatis membuat 1 → 2 → 3 berdasarkan Nomor Alur. KHUSUS = gunakan hanya jika alurnya bercabang, parallel, atau bergabung kembali.
      </Flow>

      <Card title="Pilih Produk/Tas">
        <form method="get" className="grid gap-3 md:grid-cols-3">
          <Field label="Proyek">
            <select name="project" defaultValue={projectId || ""} className={inputClass}>
              <option value="">Pilih proyek</option>
              {projects.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Produk/Tas">
            <select name="product" defaultValue={productId || ""} className={inputClass} required>
              <option value="">Pilih Produk/Tas</option>
              {productOptions.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <div><button className={buttonClass}>Buka Alur</button></div>
        </form>
      </Card>

      {productId ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Item Aktif" value={items.length} />
            <Metric label="Mandiri" value={items.filter((x) => x.flow_mode === "MANDIRI").length} />
            <Metric label="Berantai" value={items.filter((x) => x.flow_mode === "BERANTAI").length} />
            <Metric label="Khusus" value={items.filter((x) => x.flow_mode === "KHUSUS").length} />
          </div>

          <Card title="Atur Tipe Alur Item">
            {items.length === 0 ? <Empty>Belum ada Item Pekerjaan untuk Produk/Tas ini.</Empty> : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Item</Th><Th>Qty/Produk</Th><Th>Qty Sah</Th><Th>Equivalent</Th>
                    <Th>Tipe Alur</Th><Th>No. Alur</Th><Th>Validasi</Th><Th>Aksi</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((x) => {
                    const p = progressMap.get(x.id) as any;
                    return <tr key={x.id}>
                      <Td><b>{x.name}</b></Td>
                      <Td>{qty(x.qty_per_product)} {x.unit}</Td>
                      <Td>{qty(p?.qty_sah ?? 0)}</Td>
                      <Td>{qty(p?.equivalent_product ?? 0)}</Td>
                      <Td><Badge>{x.flow_mode}</Badge></Td>
                      <Td>{x.flow_order ?? "-"}</Td>
                      <Td><Badge>{x.routing_validation_mode}</Badge></Td>
                      <Td>{canWrite ? (
                        <form action={saveWorkItemFlow} className="flex min-w-[430px] flex-wrap gap-2">
                          <input type="hidden" name="work_item_id" value={x.id} />
                          <input type="hidden" name="return_project" value={projectId} />
                          <input type="hidden" name="return_product" value={productId} />
                          <select name="flow_mode" defaultValue={x.flow_mode} className={`${inputClass} w-32`}>
                            <option value="MANDIRI">MANDIRI</option>
                            <option value="BERANTAI">BERANTAI</option>
                            <option value="KHUSUS">KHUSUS</option>
                          </select>
                          <input
                            name="flow_order"
                            type="number"
                            min="1"
                            defaultValue={x.flow_order ?? ""}
                            placeholder="No. alur"
                            className={`${inputClass} w-28`}
                          />
                          <select name="validation_mode" defaultValue={x.routing_validation_mode} className={`${inputClass} w-32`}>
                            <option value="WARNING">WARNING</option>
                            <option value="HARD">HARD</option>
                          </select>
                          <button className={buttonClass}>Simpan Alur</button>
                        </form>
                      ) : "-"}</Td>
                    </tr>;
                  })}
                </tbody>
              </TableWrap>
            )}
          </Card>

          <Card title="Alur Berantai Otomatis">
            {autoDeps.length === 0 ? (
              <Empty>Belum ada alur BERANTAI. Ubah item yang memang berantai menjadi BERANTAI dan isi Nomor Alur.</Empty>
            ) : (
              <TableWrap>
                <thead><tr><Th>Alur</Th><Th>Predecessor</Th><Th>→</Th><Th>Successor</Th><Th>Validasi</Th><Th>Available WIP</Th></tr></thead>
                <tbody>{autoDeps.map((d: any) => <tr key={d.id}>
                  <Td>{itemMap.get(d.predecessor_work_item_id)?.flow_order ?? "-"} → {itemMap.get(d.successor_work_item_id)?.flow_order ?? "-"}</Td>
                  <Td>{itemMap.get(d.predecessor_work_item_id)?.name || `#${d.predecessor_work_item_id}`}</Td>
                  <Td>→</Td>
                  <Td>{itemMap.get(d.successor_work_item_id)?.name || `#${d.successor_work_item_id}`}</Td>
                  <Td><Badge>{d.validation_mode}</Badge></Td>
                  <Td>Otomatis dihitung saat Checker</Td>
                </tr>)}</tbody>
              </TableWrap>
            )}
          </Card>

          <Flow>
            Contoh: Alur 5 sudah menghasilkan 800 equivalent produk. Maka Alur 6 maksimal 800 equivalent. WARNING tetap menyimpan dan mencatat anomaly; HARD menolak kelebihan untuk transaksi baru.
          </Flow>

          {canWrite ? (
            <Card title="Routing Khusus — hanya Cabang / Parallel / Join">
              {specialItems.length < 2 ? (
                <Empty>Untuk routing khusus, ubah minimal dua Item menjadi KHUSUS terlebih dahulu.</Empty>
              ) : (
                <form action={saveDependency} className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <input type="hidden" name="product_id" value={productId} />
                  <input type="hidden" name="return_project" value={projectId} />
                  <input type="hidden" name="return_product" value={productId} />
                  <Field label="Predecessor">
                    <select name="predecessor_work_item_id" required className={inputClass}>
                      <option value="">Pilih Item KHUSUS</option>
                      {specialItems.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Successor">
                    <select name="successor_work_item_id" required className={inputClass}>
                      <option value="">Pilih Item KHUSUS</option>
                      {specialItems.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Tipe">
                    <select name="dependency_type" className={inputClass}>
                      <option value="SEQUENTIAL">SEQUENTIAL</option>
                      <option value="JOIN">JOIN</option>
                      <option value="OPTIONAL">OPTIONAL</option>
                    </select>
                  </Field>
                  <Field label="Validasi">
                    <select name="validation_mode" className={inputClass}>
                      <option value="WARNING">WARNING</option>
                      <option value="HARD">HARD</option>
                    </select>
                  </Field>
                  <Field label="Catatan"><input name="notes" className={inputClass} /></Field>
                  <div><button className={buttonClass}>Simpan Routing Khusus</button></div>
                </form>
              )}
            </Card>
          ) : null}

          <Card title="Riwayat Routing Khusus">
            {specialDeps.length === 0 ? <Empty>Belum ada Routing Khusus.</Empty> : (
              <TableWrap>
                <thead><tr><Th>Predecessor</Th><Th>→</Th><Th>Successor</Th><Th>Tipe</Th><Th>Mode</Th><Th>Status</Th><Th>Berlaku Sejak</Th><Th>Aksi</Th></tr></thead>
                <tbody>{specialDeps.map((d: any) => <tr key={d.id}>
                  <Td>{itemMap.get(d.predecessor_work_item_id)?.name || `#${d.predecessor_work_item_id}`}</Td>
                  <Td>→</Td>
                  <Td>{itemMap.get(d.successor_work_item_id)?.name || `#${d.successor_work_item_id}`}</Td>
                  <Td>{d.dependency_type}</Td>
                  <Td><Badge>{d.validation_mode}</Badge></Td>
                  <Td>{d.status}</Td>
                  <Td>{text(d.enforce_from).slice(0, 19).replace("T", " ")}</Td>
                  <Td>{canWrite && d.status === "AKTIF" ? (
                    <form action={deactivateDependency}>
                      <input type="hidden" name="dependency_id" value={d.id} />
                      <input type="hidden" name="return_project" value={projectId} />
                      <input type="hidden" name="return_product" value={productId} />
                      <button className={dangerClass}>Nonaktifkan</button>
                    </form>
                  ) : "-"}</Td>
                </tr>)}</tbody>
              </TableWrap>
            )}
          </Card>

          <Card title="Equivalent Progress">
            {progress.length === 0 ? <Empty>Belum ada hasil produksi.</Empty> : (
              <TableWrap>
                <thead><tr><Th>Item</Th><Th>Qty Sah</Th><Th>Qty/Produk</Th><Th>Equivalent Produk</Th><Th>Progress</Th><Th>Over</Th></tr></thead>
                <tbody>{items.map((x) => {
                  const p = progressMap.get(x.id) as any;
                  return <tr key={x.id}>
                    <Td>{x.name}</Td>
                    <Td>{qty(p?.qty_sah ?? 0)}</Td>
                    <Td>{qty(x.qty_per_product)}</Td>
                    <Td>{qty(p?.equivalent_product ?? 0)}</Td>
                    <Td>{qty(p?.progress_percent ?? 0)}%</Td>
                    <Td>{n(p?.over_equivalent) > 0 ? qty(p?.over_equivalent) : "-"}</Td>
                  </tr>;
                })}</tbody>
              </TableWrap>
            )}
          </Card>
        </>
      ) : null}
    </PageShell>
  );
}
