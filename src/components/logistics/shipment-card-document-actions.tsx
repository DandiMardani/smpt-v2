"use client";

import { useState } from "react";
import Link from "next/link";
import { compressImage } from "@/lib/utils/image-compression";

type Props = {
  shipmentId: number;
  shipmentCode: string;
  documentNo?: string | null;
  photoUrl?: string | null;
};

export function ShipmentCardDocumentActions({
  shipmentId,
  shipmentCode,
  documentNo,
  photoUrl: initialPhotoUrl,
}: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl || null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    setIsUploading(true);
    try {
      // Kompres otomatis foto agar ukurannya kecil (~100-200KB)
      const file = await compressImage(rawFile, 1280, 0.75);

      const fd = new FormData();
      fd.append("file", file);
      fd.append("shipment_id", String(shipmentId));

      const res = await fetch("/api/upload/surat-jalan", {
        method: "POST",
        body: fd,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengunggah foto");

      setPhotoUrl(json.photoUrl);
      setShowPhotoModal(true);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/dashboard/pengirimanEmbarkasi/${shipmentId}/surat-jalan`}
          target="_blank"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-xs transition hover:bg-gray-50 hover:border-gray-400 select-none"
        >
          📄 Cetak Surat Jalan
        </Link>

        {photoUrl ? (
          <button
            type="button"
            onClick={() => setShowPhotoModal(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs transition hover:bg-emerald-100 select-none"
          >
            📸 Lihat Foto Surat Jalan Fisik
          </button>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-xs transition hover:bg-amber-100 select-none">
            {isUploading ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Mengunggah…
              </>
            ) : (
              <>
                📷 Upload Foto Fisik SJ
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
        )}
      </div>

      {/* Modal Preview Foto */}
      {showPhotoModal && photoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="relative max-h-[90vh] max-w-2xl w-full rounded-2xl bg-white p-5 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">
                  Foto Surat Jalan Fisik: {documentNo || shipmentCode}
                </h3>
                <p className="text-xs text-gray-500">Bukti stempel & tanda tangan basah di asrama haji</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPhotoModal(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-auto flex items-center justify-center rounded-xl bg-gray-950 p-2">
              <img
                src={photoUrl}
                alt="Foto Surat Jalan Fisik"
                className="max-h-[70vh] w-auto object-contain rounded-lg"
              />
            </div>

            <div className="mt-4 flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-sky-600 hover:underline">
                <span>🔄 Ganti / Unggah Ulang Foto</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
              <div className="flex gap-2">
                <a
                  href={photoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Buka Resolusi Penuh ↗
                </a>
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(false)}
                  className="rounded-xl bg-gray-900 px-4 py-1.5 font-semibold text-white hover:bg-gray-800"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
