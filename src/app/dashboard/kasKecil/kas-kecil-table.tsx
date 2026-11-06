"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Empty, TableWrap, Td, Th } from "@/components/final/final-ui";
import { money } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/client";
import { deletePettyCashAction } from "@/lib/final/actions";
import { toast } from "@/components/ui/toast";
import type { PettyCashItem } from "./export-kas-kecil";

interface KasKecilTableProps {
  initialTransactions: PettyCashItem[];
  can: boolean;
}

export function KasKecilTable({ initialTransactions, can }: KasKecilTableProps) {
  const router = useRouter();

  // Local state untuk daftar transaksi kas kecil
  const [transactions, setTransactions] = useState<PettyCashItem[]>(() => {
    const active = initialTransactions.filter((x) => x.status === "AKTIF");
    const uniqueMap = new Map<number, PettyCashItem>();
    for (const item of active) {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    }
    return Array.from(uniqueMap.values());
  });

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sinkronisasi data awal dengan dedup unik id dan filter status AKTIF
  useEffect(() => {
    const active = initialTransactions.filter((x) => x.status === "AKTIF");
    const uniqueMap = new Map<number, PettyCashItem>();
    for (const item of active) {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    }
    setTransactions(Array.from(uniqueMap.values()));
  }, [initialTransactions]);

  // Rombak total fungsi handleDelete: Menghapus logic optimistic update,
  // menunggu konfirmasi sukses dari server/Supabase sebelum mengubah local state
  const handleDelete = async (id: number, code: string) => {
    // 1. Munculkan dialog konfirmasi
    if (!window.confirm(`Apakah Anda yakin ingin menghapus transaksi ${code}?`)) {
      return;
    }

    setDeletingId(id);
    setErrorMessage(null);

    try {
      const supabase = createClient();

      // 2. Jalankan aksi update Supabase (ubah status jadi "DIBATALKAN")
      const { data, error: sbError } = await supabase
        .from("petty_cash_transactions")
        .update({ status: "DIBATALKAN" })
        .eq("id", id)
        .select();

      // 3. TUNGGU (await) proses tersebut selesai dan pastikan tidak ada error
      if (sbError) {
        throw new Error(sbError.message || "Gagal memperbarui status transaksi di database.");
      }

      // Jika data kosong (tidak ada baris yang ter-update oleh client), fallback ke Server Action
      if (!data || data.length === 0) {
        const formData = new FormData();
        formData.append("id", String(id));
        await deletePettyCashAction(formData);
      }

      // 5. Jika sukses (tanpa error):
      // Baru munculkan toast.success, hapus dari local state, lalu panggil router.refresh()
      toast.success(`Transaksi ${code} berhasil dihapus.`);
      setTransactions((prev) => prev.filter((item) => item.id !== id));
      router.refresh();
    } catch (err: unknown) {
      // 4. Jika error / gagal: JANGAN ubah UI (state lokal tidak dihapus).
      // Tangkap error-nya, dan munculkan toast.error serta alert merah.
      console.error("Gagal menghapus transaksi kas kecil:", err);
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menghapus transaksi.";

      // Khusus penanganan NEXT_REDIRECT dari Server Action (redirect internal Next.js)
      if (msg.includes("NEXT_REDIRECT")) {
        toast.success(`Transaksi ${code} berhasil dihapus.`);
        setTransactions((prev) => prev.filter((item) => item.id !== id));
        router.refresh();
        return;
      }

      setErrorMessage(msg);
      toast.error(`Gagal menghapus transaksi: ${msg}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Alert Merah jika terjadi error saat aksi penghapusan */}
      {errorMessage && (
        <div className="flex items-center justify-between rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 shadow-2xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">⛔</span>
            <span>
              <b>Gagal menghapus transaksi:</b> {errorMessage}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-600 hover:text-rose-800 font-bold ml-2 cursor-pointer"
            title="Tutup pesan error"
          >
            ✕
          </button>
        </div>
      )}

      <TableWrap>
        <thead>
          <tr>
            <Th>Kode</Th>
            <Th>Tanggal</Th>
            <Th>Arah</Th>
            <Th>Kategori</Th>
            <Th>Nominal</Th>
            <Th>Bukti Nota</Th>
            <Th>Status</Th>
            {can ? <Th className="text-right">Aksi</Th> : null}
          </tr>
        </thead>
        <tbody>
          {transactions.length === 0 ? (
            <tr>
              <Td colSpan={8}>
                <Empty>Belum ada transaksi kas kecil.</Empty>
              </Td>
            </tr>
          ) : (
            transactions.map((x) => (
              <tr
                key={x.id}
                className={`transition hover:bg-slate-50/60 ${
                  deletingId === x.id ? "opacity-40 pointer-events-none" : ""
                }`}
              >
                <Td className="font-mono font-semibold">{x.transaction_code}</Td>
                <Td>{x.transaction_date}</Td>
                <Td>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      x.direction === "MASUK"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {x.direction}
                  </span>
                </Td>
                <Td>{x.category}</Td>
                <Td className="font-mono font-semibold">{money(x.amount)}</Td>
                <Td>
                  {x.receipt_url ? (
                    <a
                      href={x.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition"
                    >
                      🧾 Lihat
                    </a>
                  ) : (
                    <span className="text-slate-400 text-xs">-</span>
                  )}
                </Td>
                <Td>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700">
                    {x.status}
                  </span>
                </Td>
                {can ? (
                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(x.id, x.transaction_code)}
                      disabled={deletingId === x.id}
                      className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {deletingId === x.id ? (
                        <span className="flex items-center gap-1">
                          <span className="h-3 w-3 border-2 border-rose-600/30 border-t-rose-600 rounded-full animate-spin" />
                          <span>Menghapus...</span>
                        </span>
                      ) : (
                        "Hapus"
                      )}
                    </button>
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
