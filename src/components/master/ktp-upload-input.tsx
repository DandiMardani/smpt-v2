"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

type KtpUploadInputProps = {
  existingUrl?: string | null;
};

// Fungsi kompresi gambar otomatis di browser (Client-Side)
async function compressImage(file: File, maxWidth = 1200, quality = 0.75): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        // Skala proporsional jika resolusi melebihi maxWidth
        if (width > height && width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else if (height > maxWidth) {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const cleanName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            const compressed = new File([blob], cleanName, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(compressed);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

function formatBytes(bytes: number): string {
  const kb = bytes / 1024;
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(1)} MB`;
  }
  return `${Math.round(kb)} KB`;
}

export function KtpUploadInput({ existingUrl }: KtpUploadInputProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(existingUrl || null);
  const [isNewFile, setIsNewFile] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [originalSizeStr, setOriginalSizeStr] = useState<string>("");
  const [compressedSizeStr, setCompressedSizeStr] = useState<string>("");
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

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>, source: "camera" | "gallery") => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    // Bersihkan input lainnya agar hanya 1 file yang terkirim di FormData
    if (source === "camera" && galleryInputRef.current) {
      galleryInputRef.current.value = "";
    } else if (source === "gallery" && cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }

    setIsCompressing(true);

    try {
      // 1. Kompresi gambar secara otomatis
      const compressedFile = await compressImage(rawFile, 1200, 0.75);

      // 2. Suntikkan file hasil kompresi ke input element menggunakan DataTransfer
      if (typeof DataTransfer !== "undefined") {
        const dt = new DataTransfer();
        dt.items.add(compressedFile);
        e.target.files = dt.files;
      }

      // 3. Update preview dengan file yang sudah terkompresi
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }

      const objectUrl = URL.createObjectURL(compressedFile);
      setPreviewUrl(objectUrl);
      setIsNewFile(true);
      setFileName(compressedFile.name);
      setOriginalSizeStr(formatBytes(rawFile.size));
      setCompressedSizeStr(formatBytes(compressedFile.size));
    } catch (err) {
      console.error("Gagal mengompres gambar:", err);
      // Fallback ke file mentah jika ada error
      const objectUrl = URL.createObjectURL(rawFile);
      setPreviewUrl(objectUrl);
      setIsNewFile(true);
      setFileName(rawFile.name);
      setCompressedSizeStr(formatBytes(rawFile.size));
    } finally {
      setIsCompressing(false);
    }
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
    setOriginalSizeStr("");
    setCompressedSizeStr("");
  };

  return (
    <div className="space-y-2">
      {/* Hidden Inputs untuk Server Action */}
      <input type="hidden" name="existing_ktp_photo_url" value={existingUrl || ""} />

      {/* Input Kamera Langsung */}
      <input
        ref={cameraInputRef}
        type="file"
        name="ktp_photo"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileChange(e, "camera")}
      />

      {/* Input File Galeri */}
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
                {isCompressing ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200 animate-pulse">
                    ⚙️ Mengompres Foto Otomatis...
                  </span>
                ) : isNewFile ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                    ✨ Foto Siap (Terkompres Otomatis)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                    ✓ KTP Tersimpan di Sistem
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-500">
                {isNewFile ? (
                  <>
                    <p className="font-medium text-slate-700 truncate max-w-xs">{fileName}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Ukuran:{" "}
                      {originalSizeStr ? (
                        <span className="line-through text-slate-400 mr-1">{originalSizeStr}</span>
                      ) : null}
                      <b className="text-emerald-700">{compressedSizeStr}</b> (Optimal & Tajam)
                    </p>
                  </>
                ) : (
                  <p>Foto KTP pekerja sudah terverifikasi dan aktif di sistem.</p>
                )}
              </div>

              {/* Tombol Ambil Ulang / Ganti */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCameraClick}
                  disabled={isCompressing}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition shadow-2xs disabled:opacity-50"
                >
                  📸 Foto Ulang (Kamera)
                </button>
                <button
                  type="button"
                  onClick={handleGalleryClick}
                  disabled={isCompressing}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
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
            Foto dari kamera otomatis diperkecil agar hemat kuota tanpa mengurangi ketajaman NIK dan teks KTP.
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleCameraClick}
              disabled={isCompressing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-xs active:scale-95 disabled:opacity-50"
            >
              📸 Buka Kamera HP
            </button>
            <button
              type="button"
              onClick={handleGalleryClick}
              disabled={isCompressing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs active:scale-95 disabled:opacity-50"
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
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                    Ukuran Optimal ({compressedSizeStr})
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
