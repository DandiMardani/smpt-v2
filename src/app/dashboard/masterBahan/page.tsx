import {
  EmptyState,
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  Pagination,
  primaryButtonClass,
  ReadOnlyBanner,
  secondaryButtonClass,
  SectionCard,
  selectClass,
  StatusBadge,
} from "@/components/master/master-ui";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  cleanSearch,
  pageRange,
  param,
  positivePage,
  type SearchParams,
  totalPages,
} from "@/lib/master/page-utils";
import { createMaterial, updateMaterial } from "./actions";

const UNIT_OPTIONS = [
  "Meter",
  "Yard",
  "Pcs",
  "Kg",
  "Gram",
  "Liter",
  "Ml",
  "Roll",
  "Lembar",
  "Batang",
  "Set",
  "Pasang",
  "Box",
  "Karung",
] as const;

const CATEGORY_OPTIONS = ["Kain", "Aksesoris", "Benang", "Kemasan", "Lainnya"] as const;
const CALCULATION_TYPES = [
  ["SHEET", "Kain / lembaran"],
  ["LENGTH", "Bahan panjang"],
  ["PCS", "Material PCS"],
  ["ROLL_LENGTH", "Roll berbasis panjang"],
] as const;

type MaterialRow = {
  id: number;
  material_code: string;
  name: string;
  standard_unit: string;
  category: string;
  status: string;
  calculation_type: string;
  lot_tracking_mode: string;
};

type Props = { searchParams: Promise<SearchParams> };

export default async function MasterBahanPage({ searchParams }: Props) {
  const access = await requirePermission("master_bahan.view");
  const canWrite = access.permissionCodes.includes("master_bahan.write");
  const params = await searchParams;
  const q = cleanSearch(param(params, "q"));
  const statusFilter = param(params, "status");
  const page = positivePage(param(params, "page", "1"));
  const { from, to } = pageRange(page);

  const supabase = await createClient();
  let query = supabase
    .from("materials")
    .select("id, material_code, name, standard_unit, category, status, calculation_type, lot_tracking_mode", { count: "exact" })
    .order("name", { ascending: true })
    .range(from, to);

  if (q) {
    query = query.or(`material_code.ilike.%${q}%,name.ilike.%${q}%,category.ilike.%${q}%`);
  }
  if (["AKTIF", "NONAKTIF"].includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`Master Bahan gagal dimuat: ${error.message}`);
  const rows = (data ?? []) as MaterialRow[];
  const pages = totalPages(count ?? 0);

  return (
    <MasterPageShell
      eyebrow="Master Data"
      title="Master Bahan"
      description="Referensi bahan fisik untuk kebutuhan/BOM dan alur stok. ID BHN tetap dihasilkan database secara aman untuk akses bersamaan."
    >
      <Notice success={param(params, "success")} error={param(params, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {canWrite ? (
        <SectionCard title="Tambah Bahan">
          <form action={createMaterial} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Nama Bahan"><input name="name" required className={inputClass} /></Field>
            <Field label="Satuan Standar">
              <select name="standard_unit" required defaultValue="" className={selectClass}>
                <option value="" disabled>Pilih satuan</option>
                {UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </Field>
            <Field label="Kategori">
              <select name="category" required defaultValue="" className={selectClass}>
                <option value="" disabled>Pilih kategori</option>
                {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </Field>
            <Field label="Tipe Kalkulasi" hint="Dipakai Kalkulator Kebutuhan Bahan.">
              <select name="calculation_type" defaultValue="LENGTH" className={selectClass}>
                {CALCULATION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue="AKTIF" className={selectClass}>
                <option value="AKTIF">AKTIF</option>
                <option value="NONAKTIF">TIDAK AKTIF</option>
              </select>
            </Field>
            <div className="md:col-span-2 xl:col-span-4"><button type="submit" className={primaryButtonClass}>Simpan Bahan</button></div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Daftar Bahan" description={`${count ?? 0} bahan ditemukan`}>
        <form method="get" className="mb-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
          <input name="q" defaultValue={q} placeholder="Cari ID, nama, atau kategori..." className={inputClass} />
          <select name="status" defaultValue={statusFilter} className={selectClass}>
            <option value="">Semua status</option>
            <option value="AKTIF">AKTIF</option>
            <option value="NONAKTIF">TIDAK AKTIF</option>
          </select>
          <button type="submit" className={secondaryButtonClass}>Filter</button>
        </form>

        {rows.length === 0 ? <EmptyState text="Belum ada bahan pada filter ini." /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((row) => (
              <details key={row.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-bold text-slate-900 text-sm">{row.name}</p><p className="mt-1 text-xs text-slate-500">{row.material_code} · {row.category} · {row.standard_unit} · {row.calculation_type}{row.lot_tracking_mode !== "NONE" ? ` · ${row.lot_tracking_mode}` : ""}</p></div>
                    <StatusBadge status={row.status} />
                  </div>
                </summary>
                {canWrite ? (
                  <form action={updateMaterial} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                    <input type="hidden" name="id" value={row.id} />
                    <Field label="Nama Bahan"><input name="name" required defaultValue={row.name} className={inputClass} /></Field>
                    <Field label="Satuan Standar">
                      <select name="standard_unit" required defaultValue={row.standard_unit} className={selectClass}>
                        {!UNIT_OPTIONS.includes(row.standard_unit as (typeof UNIT_OPTIONS)[number]) ? <option value={row.standard_unit}>{row.standard_unit}</option> : null}
                        {UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    </Field>
                    <Field label="Kategori">
                      <select name="category" required defaultValue={row.category} className={selectClass}>
                        {!CATEGORY_OPTIONS.includes(row.category as (typeof CATEGORY_OPTIONS)[number]) ? <option value={row.category}>{row.category}</option> : null}
                        {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </Field>
                    <Field label="Tipe Kalkulasi">
                      <select name="calculation_type" defaultValue={row.calculation_type || "LENGTH"} className={selectClass}>
                        {CALCULATION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </Field>
                    <Field label="Status"><select name="status" defaultValue={row.status} className={selectClass}><option value="AKTIF">AKTIF</option><option value="NONAKTIF">TIDAK AKTIF</option></select></Field>
                    <div className="sm:col-span-2"><button type="submit" className={primaryButtonClass}>Simpan Perubahan</button></div>
                  </form>
                ) : null}
              </details>
            ))}
          </div>
        )}

        <Pagination
          page={page}
          total={pages}
          basePath="/dashboard/masterBahan"
          params={{ ...(q ? { q } : {}), ...(statusFilter ? { status: statusFilter } : {}) }}
        />
      </SectionCard>
    </MasterPageShell>
  );
}
