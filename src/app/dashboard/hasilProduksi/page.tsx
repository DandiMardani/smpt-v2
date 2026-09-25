import {
  Badge,
  Card,
  Empty,
  Field,
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
import { money, qty } from "@/lib/final/final-utils";
import { param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { cancelManualResultAction, recordManualResultAction } from "./actions";
import { ManualResultFields } from "./manual-result-fields";

type Progress = {
  project_id: number;
  product_id: number;
  work_item_id: number;
  work_item_name: string;
  unit: string;
  qty_per_product: number | string;
  display_order: number;
  routing_validation_mode: string;
  target_production: number | string;
  qty_sah: number | string;
  qty_sah_today: number | string;
  target_raw_qty: number | string;
  equivalent_product: number | string;
  equivalent_today: number | string;
  remaining_equivalent: number | string;
  over_equivalent: number | string;
  progress_percent: number | string;
};
type Anomaly = {
  id: number;
  anomaly_code: string;
  anomaly_type: string;
  severity: string;
  project_id: number | null;
  product_id: number | null;
  work_item_id: number | null;
  available_equivalent: number | string | null;
  attempted_equivalent: number | string | null;
  excess_equivalent: number | string | null;
  status: string;
  detected_at: string;
};
type ProjectRef = { id: number; project_code: string; name: string; status: string };
type ProductRef = { id: number; project_id: number; product_code: string; name: string; status: string };
type WorkItemRef = {
  id: number;
  project_id: number;
  product_id: number | null;
  item_code: string;
  name: string;
  unit: string;
  proposed_price: number | string;
  executor_scope: string;
  submission_category: string;
  status: string;
};
type WorkerRef = {
  id: number;
  worker_code: string;
  name: string;
  department: string | null;
  position: string | null;
  pay_system: string | null;
  status: string;
};
type ManualResult = {
  id: number;
  result_code: string;
  result_date: string;
  project_name_snapshot: string;
  product_name_snapshot: string;
  work_item_name_snapshot: string;
  worker_name_snapshot: string;
  worker_pay_system_snapshot: string;
  qty_good: number | string;
  operator_price_snapshot: number | string;
  submission_price_snapshot: number | string;
  operator_value: number | string;
  submission_value: number | string;
  reason: string;
  status: string;
  created_by_email_snapshot: string;
  created_at: string;
  cancelled_by_email_snapshot: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("hasil_produksi.view");
  const canWrite = access.permissionCodes.includes("hasil_produksi.write");
  const q = await searchParams;
  const s = await createClient();

  const [progressResult, projectResult, productResult, anomalyResult, orderResult, workItemResult, workerResult, manualResult] = await Promise.all([
    s.rpc("smpt_get_equivalent_progress", { p_project_id: null, p_product_id: null }),
    s.from("projects").select("id,project_code,name,status").order("name").limit(300),
    s.from("project_products").select("id,project_id,product_code,name,status").order("name").limit(1000),
    s.from("production_anomalies").select("id,anomaly_code,anomaly_type,severity,project_id,product_id,work_item_id,available_equivalent,attempted_equivalent,excess_equivalent,status,detected_at").neq("status", "RESOLVED").order("detected_at", { ascending: false }).limit(150),
    s.from("production_orders").select("id,status").neq("status", "DIBATALKAN").limit(500),
    s.from("work_items").select("id,project_id,product_id,item_code,name,unit,proposed_price,executor_scope,submission_category,status").eq("status", "AKTIF").order("name").limit(1500),
    s.from("workers").select("id,worker_code,name,department,position,pay_system,status").eq("status", "AKTIF").ilike("pay_system", "HARIAN").order("name").limit(1000),
    s.from("production_manual_results").select("id,result_code,result_date,project_name_snapshot,product_name_snapshot,work_item_name_snapshot,worker_name_snapshot,worker_pay_system_snapshot,qty_good,operator_price_snapshot,submission_price_snapshot,operator_value,submission_value,reason,status,created_by_email_snapshot,created_at,cancelled_by_email_snapshot,cancelled_at,cancellation_reason").order("id", { ascending: false }).limit(150),
  ]);

  const error = [
    progressResult.error,
    projectResult.error,
    productResult.error,
    anomalyResult.error,
    orderResult.error,
    workItemResult.error,
    workerResult.error,
    manualResult.error,
  ].find(Boolean);
  if (error) throw new Error(error.message);

  const rows = (Array.isArray(progressResult.data) ? progressResult.data : []) as Progress[];
  const anomalies = (anomalyResult.data ?? []) as Anomaly[];
  const projects = (projectResult.data ?? []) as ProjectRef[];
  const products = (productResult.data ?? []) as ProductRef[];
  const workItems = (workItemResult.data ?? []) as WorkItemRef[];
  const workers = (workerResult.data ?? []) as WorkerRef[];
  const manualResults = (manualResult.data ?? []) as ManualResult[];

  const projectMap = new Map(projects.map((item) => [item.id, item.name]));
  const productMap = new Map(products.map((item) => [item.id, item.name]));
  const byProduct = new Map<string, Progress[]>();
  for (const row of rows) {
    const key = `${row.project_id}:${row.product_id}`;
    const list = byProduct.get(key) ?? [];
    list.push(row);
    byProduct.set(key, list);
  }

  const totalEquivalent = rows.reduce((sum, row) => sum + Number(row.equivalent_product || 0), 0);
  const todayEquivalent = rows.reduce((sum, row) => sum + Number(row.equivalent_today || 0), 0);
  const activeSpk = (orderResult.data ?? []).filter((item) => item.status === "AKTIF").length;

  const inputProjects = projects
    .filter((item) => !["SELESAI", "NONAKTIF", "BATAL", "DIBATALKAN"].includes(String(item.status).toUpperCase()))
    .map((item) => ({ id: item.id, code: item.project_code, name: item.name }));
  const inputProducts = products
    .filter((item) => item.status === "AKTIF")
    .map((item) => ({ id: item.id, projectId: item.project_id, code: item.product_code, name: item.name }));
  const inputItems = workItems.map((item) => ({
      id: item.id,
      projectId: item.project_id,
      productId: item.product_id,
      code: item.item_code,
      name: item.name,
      unit: item.unit,
      proposedPrice: Number(item.proposed_price || 0),
      executorScope: item.executor_scope,
      submissionCategory: item.submission_category,
      eligible: ["PEKERJA_HARIAN", "KEDUANYA"].includes(item.executor_scope) && item.submission_category === "BORONGAN",
    }));
  const inputWorkers = workers.map((worker) => ({
    id: worker.id,
    code: worker.worker_code,
    name: worker.name,
    department: worker.department,
    position: worker.position,
  }));

  return (
    <PageShell
      eyebrow="Produksi"
      title="Hasil Produksi"
      description="Progress Item memakai Equivalent Product = Qty Sah ÷ Qty per Produk. Qty Sah dapat berasal dari Checker SPK atau hasil manual HARIAN yang diaudit; payroll HARIAN tetap berbasis Absensi."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      {canWrite ? (
        <Card title="Input Hasil Pekerjaan HARIAN → Pengajuan BORONGAN">
          <p className="mb-4 text-sm leading-6 text-slate-300">
            Khusus Item yang dikonfigurasi PEKERJA HARIAN/KEDUANYA + kategori BORONGAN. Qty masuk progress produksi. Untuk pekerja HARIAN, Nilai Operator selalu 0; Nilai Pengajuan = Qty Hasil × Harga Pengajuan snapshot.
          </p>
          <form action={recordManualResultAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Tanggal Hasil"><input name="result_date" type="date" required className={inputClass} /></Field>
            <ManualResultFields projects={inputProjects} products={inputProducts} items={inputItems} workers={inputWorkers} />
            <Field label="Qty Hasil"><input name="qty" type="number" min="0.0001" step="0.0001" required className={inputClass} /></Field>
            <Field label="Alasan / Catatan Audit"><input name="reason" required maxLength={500} className={inputClass} placeholder="Wajib: sumber/verifikasi hasil" /></Field>
            <div className="flex items-end"><button type="submit" className={buttonClass}>Simpan Hasil</button></div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Equivalent Produk" value={qty(totalEquivalent)} />
        <Metric label="Equivalent Hari Ini" value={qty(todayEquivalent)} />
        <Metric label="SPK Aktif" value={activeSpk} />
        <Metric label="Anomaly Terbuka" value={anomalies.length} />
      </div>

      <Card title="Progress Proyek → Produk → Item">
        {byProduct.size === 0 ? <Empty>Belum ada progress produksi.</Empty> : (
          <div className="space-y-4">
            {[...byProduct.entries()].map(([key, items]) => {
              const first = items[0];
              const productEq = items.length ? Math.min(...items.map((item) => Number(item.equivalent_product || 0))) : 0;
              const target = Number(first.target_production || 0);
              return (
                <div key={key} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <b className="font-bold text-slate-900">{projectMap.get(first.project_id) || `Project #${first.project_id}`} → {productMap.get(first.product_id) || `Produk #${first.product_id}`}</b>
                      <p className="text-xs text-slate-500 mt-0.5">Progress produk konservatif mengikuti equivalent item terendah: {qty(productEq)} / {qty(target)}</p>
                    </div>
                    <Badge>{target > 0 ? `${qty((productEq / target) * 100)}%` : `${qty(productEq)} eq`}</Badge>
                  </div>
                  <TableWrap>
                    <thead><tr><Th>Item</Th><Th>Qty/Produk</Th><Th>Target Raw</Th><Th>Qty Sah</Th><Th>Equivalent</Th><Th>Hari Ini</Th><Th>Sisa Eq</Th><Th>Over Eq</Th><Th>Progress</Th><Th>Mode</Th></tr></thead>
                    <tbody>{items.map((item) => <tr key={item.work_item_id}><Td>{item.work_item_name}</Td><Td>{qty(item.qty_per_product)}</Td><Td>{qty(item.target_raw_qty)} {item.unit}</Td><Td>{qty(item.qty_sah)} {item.unit}</Td><Td><b>{qty(item.equivalent_product)}</b></Td><Td>{qty(item.equivalent_today)}</Td><Td>{qty(item.remaining_equivalent)}</Td><Td>{qty(item.over_equivalent)}</Td><Td>{qty(item.progress_percent)}%</Td><Td><Badge>{item.routing_validation_mode}</Badge></Td></tr>)}</tbody>
                  </TableWrap>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Audit Hasil Manual HARIAN">
        {manualResults.length === 0 ? <Empty>Belum ada hasil manual HARIAN.</Empty> : (
          <TableWrap>
            <thead><tr><Th>Kode / Tanggal</Th><Th>Scope</Th><Th>Pekerja</Th><Th>Qty</Th><Th>Harga Snapshot</Th><Th>Nilai Operator</Th><Th>Nilai Pengajuan</Th><Th>Audit</Th><Th>Status / Aksi</Th></tr></thead>
            <tbody>
              {manualResults.map((item) => (
                <tr key={item.id}>
                  <Td><b>{item.result_code}</b><br /><span className="text-xs text-slate-500">{item.result_date}</span></Td>
                  <Td><span className="block max-w-xs whitespace-normal">{item.project_name_snapshot} → {item.product_name_snapshot}<br />{item.work_item_name_snapshot}</span></Td>
                  <Td>{item.worker_name_snapshot}<br /><span className="text-xs text-slate-500">{item.worker_pay_system_snapshot}</span></Td>
                  <Td>{qty(item.qty_good)}</Td>
                  <Td>Op {money(item.operator_price_snapshot)}<br />Pengajuan {money(item.submission_price_snapshot)}</Td>
                  <Td>{money(item.operator_value)}</Td>
                  <Td><b>{money(item.submission_value)}</b></Td>
                  <Td><span className="block max-w-sm whitespace-normal text-xs">{item.reason}<br />Input: {item.created_by_email_snapshot} · {String(item.created_at).slice(0, 19).replace("T", " ")}{item.cancelled_at ? <><br />Batal: {item.cancelled_by_email_snapshot || "-"} · {String(item.cancelled_at).slice(0, 19).replace("T", " ")} · {item.cancellation_reason}</> : null}</span></Td>
                  <Td>
                    <Badge>{item.status}</Badge>
                    {canWrite && item.status === "AKTIF" ? (
                      <form action={cancelManualResultAction} className="mt-2 space-y-2">
                        <input type="hidden" name="result_id" value={item.id} />
                        <input name="cancellation_reason" required maxLength={300} className={inputClass} placeholder="Alasan batal" />
                        <button className={dangerClass}>Batalkan</button>
                      </form>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card title="Routing / WIP Anomaly">
        {anomalies.length === 0 ? <Empty>Tidak ada anomaly routing terbuka.</Empty> : (
          <TableWrap>
            <thead><tr><Th>Kode</Th><Th>Waktu</Th><Th>Scope</Th><Th>Tipe</Th><Th>Severity</Th><Th>Available Eq</Th><Th>Attempted Eq</Th><Th>Excess</Th><Th>Status</Th></tr></thead>
            <tbody>{anomalies.map((item) => <tr key={item.id}><Td>{item.anomaly_code}</Td><Td>{String(item.detected_at).slice(0, 19).replace("T", " ")}</Td><Td>{item.project_id ? projectMap.get(item.project_id) : "-"} · {item.product_id ? productMap.get(item.product_id) : "-"}</Td><Td>{item.anomaly_type}</Td><Td><Badge>{item.severity}</Badge></Td><Td>{qty(item.available_equivalent)}</Td><Td>{qty(item.attempted_equivalent)}</Td><Td>{qty(item.excess_equivalent)}</Td><Td>{item.status}</Td></tr>)}</tbody>
          </TableWrap>
        )}
      </Card>
    </PageShell>
  );
}
