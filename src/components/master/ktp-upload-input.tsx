"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

type KtpUploadInputProps = {
  existingUrl?: string | null;
};

export function KtpUploadInput({ existingUrl }: KtpUploadInputProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(existingUrl || null);
  const [isNewFile, setIsNewFile] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<string>("");
  const [showFullModal, setShowFullModal] = useState(false);

  // Bersihkan object URL saat unmount untuk mencegah memory leak
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const handleGalleryClick = () => {
    galleryInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, source: "camera" | "gallery") => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Bersihkan input lainnya agar hanya 1 file yang terkirim di FormData
    if (source === "camera" && galleryInputRef.current) {
      galleryInputRef.current.value = "";
    } else if (source === "gallery" && cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }

    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setIsNewFile(true);
    setFileName(file.name);

    // Format ukuran file (KB / MB)
    const kb = file.size / 1024;
    setFileSize(kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`);
  };

  const handleReset = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    setPreviewUrl(existingUrl || null);
    setIsNewFile(false);
    setFileName("");
    setFileSize("");
  };

  return (
    <div className="space-y-2">
      {/* Hidden Inputs untuk Server Action */}
      <input type="hidden" name="existing_ktp_photo_url" value={existingUrl || ""} />

      {/* Input Kamera Langsung (membuka kamera belakang HP secara instan) */}
      <input
        ref={cameraInputRef}
        type="file"
        name="ktp_photo"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileChange(e, "camera")}
      />

      {/* Input File Galeri (membuka pemilih file/galeri HP) */}
      <input
        ref={galleryInputRef}
        type="file"
        name="ktp_photo_gallery"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileChange(e, "gallery")}
      />

      {/* Tampilan Ketika Foto Sudah Dipilih atau Sudah Tersimpan */}
      {previewUrl ? (
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 shadow-2xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Thumbnail Preview */}
            <div className="relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Preview KTP"
                className="h-24 w-36 object-cover cursor-pointer hover:scale-105 transition"
                onClick={() => setShowFullModal(true)}
                title="Klik untuk melihat ukuran penuh"
              />
              <button
                type="button"
                onClick={() => setShowFullModal(true)}
                className="absolute bottom-1 right-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs hover:bg-slate-900"
              >
                🔍 Perbesar
              </button>
            </div>

            {/* Info Status & Tombol Aksi */}
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                {isNewFile ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                    ⚡ Foto Baru Dipilih
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                    ✓ KTP Tersimpan di Sistem
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500">
                {isNewFile ? (
                  <>
                    <span className="font-medium text-slate-700">{fileName}</span> ({fileSize})
                    <span className="block text-[11px] text-slate-400">Tekan tombol Simpan di bawah untuk mengunggah.</span>
                  </>
                ) : (
                  <span>Foto KTP pekerja sudah terverifikasi dan aktif di sistem.</span>
                )}
              </p>

              {/* Tombol Ambil Ulang / Ganti */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCameraClick}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition shadow-2xs"
                >
                  📸 Foto Ulang (Kamera)
                </button>
                <button
                  type="button"
                  onClick={handleGalleryClick}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                >
                  📁 Ambil dari Galeri
                </button>
                {isNewFile && existingUrl ? (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-600 transition"
                  >
                    Batal Ubah
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Tampilan Ketika Belum Ada Foto */
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-center transition hover:border-blue-400 hover:bg-blue-50/20">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 text-lg mb-2">
            🪪
          </div>
          <p className="text-xs font-semibold text-slate-700">Lampirkan Foto / Scan KTP</p>
          <p className="text-[11px] text-slate-400 max-w-xs mx-auto mt-0.5">
            Di HP bisa langsung jepret dengan kamera belakang atau pilih file gambar dari Galeri / WhatsApp.
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleCameraClick}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-xs active:scale-95"
            >
              📸 Buka Kamera HP
            </button>
            <button
              type="button"
              onClick={handleGalleryClick}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs active:scale-95"
            >
              📁 Pilih dari Galeri
            </button>
          </div>
        </div>
      )}

      {/* Modal Popup Pratinjau KTP Penuh */}
      {showFullModal && previewUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={() => setShowFullModal(false)}
        >
          <div
            className="relative max-w-2xl w-full rounded-2xl bg-white p-4 shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900">🪪 Pratinjau Foto KTP</span>
                {isNewFile ? (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                    Foto Baru
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setShowFullModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center max-h-[75vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Foto KTP Penuh"
                className="max-h-[75vh] w-auto max-w-full object-contain"
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Buka di Tab Baru ↗
              </a>
              <button
                type="button"
                onClick={() => setShowFullModal(false)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
