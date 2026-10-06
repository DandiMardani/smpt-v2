"use client";

import { useState } from "react";
import { confirmTransferReceiptAction } from "@/lib/final/actions";
import { compressImage } from "@/lib/utils/image-compression";

type Props = {
  transfer: {
    id: number;
    transfer_code: string;
    document_no?: string | null;
    transfer_date: string;
    quantity: number;
    notes?: string | null;
    finished_good_name: string;
    source_location_name: string;
    destination_location_name: string;
    delivery_status: string;
    received_qty?: number | null;
    reject_qty?: number | null;
    damaged_qty?: number | null;
    received_notes?: string | null;
    surat_jalan_photo_url?: string | null;
  };
  returnPath?: string;
  canConfirm: boolean;
};

export function MrWuTransferConfirmModal({ transfer, returnPath = "/dashboard/mitraMrWu", canConfirm }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(transfer.surat_jalan_photo_url || null);
  const [isUploading, setIsUploading] = useState(false);
  const [receivedQty, setReceivedQty] = useState<number>(Number(transfer.received_qty ?? transfer.quantity));
  const [rejectQty, setRejectQty] = useState<number>(Number(transfer.reject_qty ?? 0));
  const [damagedQty, setDamagedQty] = useState<number>(Number(transfer.damaged_qty ?? 0));
  const [notes, setNotes] = useState<string>(transfer.received_notes || "");
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    setIsUploading(true);
    try {
      // Kompres otomatis foto agar ukurannya kecil (~100-200KB) dan hemat storage/database
      const file = await compressImage(rawFile, 1280, 0.75);

      const fd = new FormData();
      fd.append("file", file);
      fd.append("transfer_id", String(transfer.id));

      const res = await fetch("/api/upload/surat-jalan", {
        method: "POST",
        body: fd,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengunggah foto surat jalan.");

      setPhotoUrl(json.photoUrl);
    } catch (err: any) {
      alert("Error upload: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const isConfirmed = transfer.delivery_status === "DITERIMA";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {photoUrl ? (
          <button
            type="button"
            onClick={() => setShowPhotoViewer(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-xs transition hover:bg-emerald-100"
          >
            📸 Lihat Foto SJ
          </button>
        ) : null}

        {canConfirm ? (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold shadow-xs transition ${
              isConfirmed
                ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                : "border border-amber-400 bg-amber-500 text-white hover:bg-amber-600 animate-pulse"
            }`}
          >
            {isConfirmed ? "✏️ Edit Konfirmasi / Foto SJ" : "📥 Konfirmasi Penerimaan & Foto SJ"}
          </button>
        ) : null}
      </div>

      {/* Confirmation & Photo Upload Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="relative max-h-[92vh] max-w-xl w-full rounded-2xl bg-white p-6 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-base">
                  Konfirmasi Penerimaan Barang di MR WU
                </h3>
                <p className="text-xs text-gray-500">
                  {transfer.document_no ? `Surat Jalan: ${transfer.document_no} · ` : ""}
                  Ref: {transfer.transfer_code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Delivery Info Recap */}
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Barang:</span>
                <span className="font-bold text-gray-900">{transfer.finished_good_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tujuan Lokasi MR WU:</span>
                <span className="font-semibold text-blue-700">{transfer.destination_location_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Qty Dikirim dari Pusat:</span>
                <span className="font-black text-gray-900">{transfer.quantity.toLocaleString("id-ID")} Unit/Pcs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tanggal Pengiriman:</span>
                <span className="text-gray-800">{transfer.transfer_date}</span>
              </div>
            </div>

            {/* Form */}
            <form action={confirmTransferReceiptAction} className="mt-4 space-y-4">
              <input type="hidden" name="transfer_id" value={transfer.id} />
              <input type="hidden" name="return_path" value={returnPath} />
              <input type="hidden" name="surat_jalan_photo_url" value={photoUrl || ""} />

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Qty Diterima Baik <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="received_qty"
                    min="0"
                    step="any"
                    required
                    value={receivedQty}
                    onChange={(e) => setReceivedQty(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-bold text-gray-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Qty Reject (Cacat)
                  </label>
                  <input
                    type="number"
                    name="reject_qty"
                    min="0"
                    step="any"
                    value={rejectQty}
                    onChange={(e) => setRejectQty(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Qty Rusak (Patah/dll)
                  </label>
                  <input
                    type="number"
                    name="damaged_qty"
                    min="0"
                    step="any"
                    value={damagedQty}
                    onChange={(e) => setDamagedQty(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Catatan Penerima MR WU
                </label>
                <input
                  type="text"
                  name="received_notes"
                  placeholder="Contoh: Diterima oleh Pak Budi, kondisi segel kardus utuh"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Photo Section */}
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 p-4">
                <label className="block text-xs font-bold text-gray-800 mb-1">
                  📸 Foto Fisik Surat Jalan (Wajib/Disarankan)
                </label>
                <p className="text-[11px] text-gray-500 mb-3">
                  Foto dokumen surat jalan yang sudah ada tanda tangan sopir & cap/stempel penerima di MR WU
                </p>

                {photoUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    <img
                      src={photoUrl}
                      alt="Surat Jalan Preview"
                      className="max-h-48 rounded-lg border border-gray-300 object-contain shadow-xs"
                    />
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer text-xs font-semibold text-sky-600 hover:underline">
                        🔄 Ganti Foto
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={handleFileUpload}
                          disabled={isUploading}
                        />
                      </label>
                      <span className="text-gray-300">·</span>
                      <button
                        type="button"
                        onClick={() => setPhotoUrl(null)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Hapus Foto
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4">
                    <label className="inline-flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-800 shadow-xs transition hover:bg-sky-100">
                      {isUploading ? (
                        <>
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Sedang Mengunggah Foto…
                        </>
                      ) : (
                        <>
                          <span className="text-xl">📷</span>
                          <span>Ambil Foto Surat Jalan / Pilih Gambar</span>
                          <span className="text-[10px] font-normal text-sky-600">Mendukung kamera HP langsung</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handleFileUpload}
                            disabled={isUploading}
                          />
                        </>
                      )}
                    </label>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  ✅ Simpan Konfirmasi Penerimaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Standalone Full Photo Viewer */}
      {showPhotoViewer && photoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="relative max-h-[90vh] max-w-2xl w-full rounded-2xl bg-white p-5 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">
                  Foto Surat Jalan Fisik: {transfer.document_no || transfer.transfer_code}
                </h3>
                <p className="text-xs text-gray-500">{transfer.finished_good_name} ➔ {transfer.destination_location_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPhotoViewer(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-auto flex items-center justify-center rounded-xl bg-gray-950 p-2">
              <img
                src={photoUrl}
                alt="Surat Jalan Fisik"
                className="max-h-[70vh] w-auto object-contain rounded-lg"
              />
            </div>

            <div className="mt-4 flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
              <a
                href={photoUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Buka Tab Baru ↗
              </a>
              <button
                type="button"
                onClick={() => setShowPhotoViewer(false)}
                className="rounded-xl bg-gray-900 px-4 py-1.5 font-semibold text-white hover:bg-gray-800"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
