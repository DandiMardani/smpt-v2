import {
  Badge,
  Card,
  Empty,
  Field,
  Flow,
  Notice,
  PageShell,
  ReadOnly,
  TableWrap,
  Td,
  Th,
  buttonClass,
  inputClass,
} from "@/components/final/final-ui";
import { requireAnyPermission } from "@/lib/access/current-user";
import { money, param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Props = { searchParams: Promise<SearchParams> };

type WarungNote = {
  id: number;
  worker_id: number;
  amount: number;
  paid_amount: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  warung_name: string | null;
  category: string;
};

type WorkerData = {
  id: number;
  worker_code: string;
  name: string;
  pay_system: string;
  department: string | null;
  position: string | null;
};

export default async function Page({ searchParams }: Props) {
  const access = await requireAnyPermission(["payroll.view", "payroll.write", "pekerjaan_saya.view"]);
  const canWrite = access.permissionCodes.includes("payroll.write");
  const q = await searchParams;
  const activeWorkerId = q.worker_id ? Number(q.worker_id) : null;
  const editNoteId = q.edit_id ? Number(q.edit_id) : null;

  const supabase = await createClient();

  // --- SERVER ACTION: TAMBAH NOTA WARUNG BARU ---
  async function createWarungNote(formData: FormData) {
    "use server";
    const workerId = Number(formData.get("worker_id"));
    const amount = Number(formData.get("amount") || 0);
    const warungName = String(formData.get("warung_name") || "Dandi Store");
    const notes = String(formData.get("notes") || "");
    const dateInput = String(formData.get("note_date") || "");

    const client = await createClient();
    const payload: any = {
      worker_id: workerId,
      amount,
      paid_amount: 0,
      category: "KASBON_WARUNG",
      warung_name: warungName,
      status: "AKTIF",
      notes: notes || "Kasbon Warung",
    };

    if (dateInput) {
      payload.created_at = new Date(dateInput).toISOString();
    }

    await client.from("cash_advances").insert(payload);
    revalidatePath("/dashboard/warung");
  }

  // --- SERVER ACTION: EDIT NOTA (HANYA NOTA AKTIF) ---
  async function updateWarungNote(formData: FormData) {
    "use server";
    const noteId = Number(formData.get("note_id"));
    const amount = Number(formData.get("amount") || 0);
    const notes = String(formData.get("notes") || "");
    const warungName = String(formData.get("warung_name") || "Dandi Store");

    const client = await createClient();
    // Validasi ganda: jangan izinkan update jika sudah LUNAS
    const { data: existing } = await client
      .from("cash_advances")
      .select("status")
      .eq("id", noteId)
      .single();

    if (existing?.status === "LUNAS") {
      throw new Error("Nota yang sudah LUNAS terkunci dan tidak dapat diubah.");
    }

    await client
      .from("cash_advances")
      .update({
        amount,
        notes,
        warung_name: warungName,
      })
      .eq("id", noteId)
      .eq("status", "AKTIF");

    revalidatePath("/dashboard/warung");
  }

  // --- SERVER ACTION: HAPUS NOTA (HANYA NOTA AKTIF) ---
  async function deleteWarungNote(formData: FormData) {
    "use server";
    const noteId = Number(formData.get("note_id"));
    const client = await createClient();

    // Validasi ganda: nota lunas tidak boleh dihapus
    const { data: existing } = await client
      .from("cash_advances")
      .select("status")
      .eq("id", noteId)
      .single();

    if (existing?.status === "LUNAS") {
      throw new Error("Nota yang sudah LUNAS terkunci sebagai arsip pembukuan.");
    }

    await client.from("cash_advances").delete().eq("id", noteId).eq("status", "AKTIF");
    revalidatePath("/dashboard/warung");
  }

  // Tarik data pekerja & riwayat kasbon warung
  const [workersResult, notesResult] = await Promise.all([
    supabase
      .from("workers")
      .select("id, worker_code, name, pay_system, department, position")
      .order("name", { ascending: true }),
    supabase
      .from("cash_advances")
      .select("*")
      .eq("category", "KASBON_WARUNG")
      .order("created_at", { ascending: false }),
  ]);

  if (workersResult.error) throw new Error(workersResult.error.message);
  if (notesResult.error) throw new Error(notesResult.error.message);

  const workers = (workersResult.data ?? []) as WorkerData[];
  const allNotes = (notesResult.data ?? []) as WarungNote[];

  // Pemetaan per pekerja
  const notesByWorker = new Map<number, WarungNote[]>();
  const activeDebtByWorker = new Map<number, number>();
  const totalDebtByWorker = new Map<number, number>();

  for (const n of allNotes) {
    const arr = notesByWorker.get(n.worker_id) || [];
    arr.push(n);
    notesByWorker.set(n.worker_id, arr);

    const sisa = Math.max(0, Number(n.amount || 0) - Number(n.paid_amount || 0));
    if (n.status === "AKTIF") {
      activeDebtByWorker.set(n.worker_id, (activeDebtByWorker.get(n.worker_id) || 0) + sisa);
    }
    totalDebtByWorker.set(n.worker_id, (totalDebtByWorker.get(n.worker_id) || 0) + Number(n.amount || 0));
  }

  // Pekerja terpilih untuk modal rincian riwayat
  const activeWorker = workers.find((w) => w.id === activeWorkerId) || null;
  const activeWorkerNotes = activeWorkerId ? notesByWorker.get(activeWorkerId) || [] : [];
  const editingNote = editNoteId ? allNotes.find((n) => n.id === editNoteId) || null : null;

  return (
    <PageShell
      eyebrow="Kasbon & Pinjaman"
      title="Pusat Kasbon Warung"
      description="Pencatatan nota belanja harian pekerja di Dandi Store. Nota yang telah lunas via payroll otomatis dikunci permanen."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      {/* Ringkasan Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400">Total Transaksi Nota</span>
          <div className="text-xl sm:text-2xl font-black text-slate-800">{allNotes.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400">Nota Aktif (Hutang)</span>
          <div className="text-xl sm:text-2xl font-black text-rose-600">
            {allNotes.filter((n) => n.status === "AKTIF").length}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400">Nota Lunas Terkunci</span>
          <div className="text-xl sm:text-2xl font-black text-emerald-600">
            {allNotes.filter((n) => n.status === "LUNAS").length}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400">Total Tagihan Berjalan</span>
          <div className="text-xl sm:text-2xl font-black text-amber-600">
            {money(Array.from(activeDebtByWorker.values()).reduce((a, b) => a + b, 0))}
          </div>
        </div>
      </div>

      {/* Daftar Rekap Kasbon per Pekerja */}
      <Card title="Rekapitulasi Kasbon Warung Pekerja">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-3">Pekerja</th>
                <th className="px-3.5 py-3">Sistem Upah</th>
                <th className="px-3.5 py-3 text-right">Nota Aktif</th>
                <th className="px-3.5 py-3 text-right">Total Akumulasi</th>
                <th className="px-3.5 py-3 text-right text-rose-600">Sisa Tagihan (Aktif)</th>
                <th className="px-3.5 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workers.map((w) => {
                const sisaHutang = activeDebtByWorker.get(w.id) || 0;
                const totalHutang = totalDebtByWorker.get(w.id) || 0;
                const workerNotes = notesByWorker.get(w.id) || [];
                const activeCount = workerNotes.filter((n) => n.status === "AKTIF").length;

                return (
                  <tr key={w.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-3.5 py-2.5 font-bold text-slate-900">
                      <div>{w.name}</div>
                      <div className="text-[10px] font-normal text-slate-400">{w.worker_code} • {w.position || "Staff"}</div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        w.pay_system === "BULANAN" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}>
                        {w.pay_system}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-medium">
                      {activeCount > 0 ? (
                        <span className="font-bold text-rose-600">{activeCount} nota</span>
                      ) : (
                        <span className="text-slate-400">0 nota</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-medium text-slate-600">
                      {money(totalHutang)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-black text-rose-700 bg-rose-50/30">
                      {money(sisaHutang)}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      <a
                        href={`/dashboard/warung?worker_id=${w.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50"
                      >
                        👁️ Rincian Nota
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL POPUP RINCIAN RIWAYAT NOTA WARUNG (SESUAI GAMBAR) */}
      {activeWorker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900">{activeWorker.name}</h3>
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    {activeWorker.worker_code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Rincian Riwayat Nota di Dandi Store</p>
              </div>
              <a
                href="/dashboard/warung"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
              >
                ✕
              </a>
            </div>

            {/* List Nota */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeWorkerNotes.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Belum ada riwayat nota tercatat untuk pekerja ini.
                </div>
              ) : (
                activeWorkerNotes.map((item) => {
                  const isLunas = item.status === "LUNAS";
                  const sisa = Math.max(0, Number(item.amount || 0) - Number(item.paid_amount || 0));
                  const dateStr = item.created_at
                    ? new Date(item.created_at).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }) + " WIB"
                    : "-";

                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-3.5 transition ${
                        isLunas
                          ? "border-emerald-100 bg-slate-50/80"
                          : "border-slate-200 bg-white shadow-xs"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-slate-800">{dateStr}</div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            Keterangan: {item.notes || "Kasbon Warung"}
                          </div>
                          <div className="mt-2">
                            {isLunas ? (
                              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                                LUNAS
                              </span>
                            ) : (
                              <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                                BELUM LUNAS
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Tampilan Total & Sisa: Lunas = Rp 0 */}
                        <div className="text-right shrink-0">
                          <div className="text-xs text-slate-400">Total: {money(item.amount)}</div>
                          {isLunas ? (
                            <div className="text-xs font-black text-emerald-600 mt-0.5">
                              Sisa: Rp 0 (Lunas)
                            </div>
                          ) : (
                            <div className="text-xs font-black text-rose-600 mt-0.5">
                              Sisa: {money(sisa)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Aksi: Kunci permanen jika sudah LUNAS */}
                      <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-2.5">
                        {!isLunas ? (
                          <div className="flex items-center gap-2">
                            {canWrite && (
                              <>
                                <a
                                  href={`/dashboard/warung?worker_id=${activeWorker.id}&edit_id=${item.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  ✏️ Edit
                                </a>
                                <form action={deleteWarungNote}>
                                  <input type="hidden" name="note_id" value={item.id} />
                                  <button
                                    type="submit"
                                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  >
                                    🗑️ Hapus
                                  </button>
                                </form>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-semibold italic text-slate-400">
                            🔒 Terkunci (Arsip Pembukuan)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Modal: Tambah Nota Baru */}
            {canWrite && (
              <div className="border-t border-slate-100 p-4 bg-white">
                <details className="group">
                  <summary className="list-none w-full cursor-pointer rounded-xl bg-orange-600 py-3 text-center text-xs font-bold text-white shadow-sm hover:bg-orange-700 active:scale-[0.99] transition">
                    + Catat Nota Baru untuk {activeWorker.name}
                  </summary>
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <form action={createWarungNote} className="space-y-2.5 text-left">
                      <input type="hidden" name="worker_id" value={activeWorker.id} />
                      <input type="hidden" name="warung_name" value="Dandi Store" />
                      <div>
                        <label className="text-[11px] font-bold text-slate-600">Nominal Nota (Rp)</label>
                        <input
                          name="amount"
                          type="number"
                          required
                          placeholder="Contoh: 50000"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600">Tanggal Nota</label>
                        <input
                          name="note_date"
                          type="datetime-local"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600">Keterangan / Rincian Barang</label>
                        <input
                          name="notes"
                          type="text"
                          placeholder="Rokok, kopi, makan siang, dll."
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full rounded-xl bg-slate-900 py-2 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        Simpan Nota Baru
                      </button>
                    </form>
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL FORM EDIT NOTA AKTIF */}
      {editingNote && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h4 className="text-sm font-bold text-slate-900 mb-3">Edit Nota Kasbon #{editingNote.id}</h4>
            <form action={updateWarungNote} className="space-y-3">
              <input type="hidden" name="note_id" value={editingNote.id} />
              <div>
                <label className="text-[11px] font-bold text-slate-600">Nominal (Rp)</label>
                <input
                  name="amount"
                  type="number"
                  defaultValue={editingNote.amount}
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600">Keterangan</label>
                <input
                  name="notes"
                  type="text"
                  defaultValue={editingNote.notes || ""}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <a
                  href={`/dashboard/warung?worker_id=${editingNote.worker_id}`}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </a>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
