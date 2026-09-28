"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

async function compressImage(file: File, maxWidth = 1000, quality = 0.75): Promise<File> {
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
        if (!ctx) return resolve(file);

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            const cleanName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            resolve(new File([blob], cleanName, { type: "image/jpeg", lastModified: Date.now() }));
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

export function NotaUploadInput() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [isCompressing, setIsCompressing] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>, source: "camera" | "gallery") => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    if (source === "camera" && galleryInputRef.current) galleryInputRef.current.value = "";
    if (source === "gallery" && cameraInputRef.current) cameraInputRef.current.value = "";

    setIsCompressing(true);

    try {
      const compressedFile = await compressImage(rawFile, 1000, 0.75);

      if (typeof DataTransfer !== "undefined") {
        const dt = new DataTransfer();
        dt.items.add(compressedFile);
        e.target.files = dt.files;
      }

      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(compressedFile));
      setFileName(compressedFile.name);
      setFileSize(`${Math.round(compressedFile.size / 1024)} KB`);
    } catch {
      setPreviewUrl(URL.createObjectURL(rawFile));
      setFileName(rawFile.name);
      setFileSize(`${Math.round(rawFile.size / 1024)} KB`);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleReset = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    setPreviewUrl(null);
    setFileName("");
    setFileSize("");
  };

  return (
    <div className="space-y-1.5">
      <input
        ref={cameraInputRef}
        type="file"
        name="receipt_file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileChange(e, "camera")}
      />
      <input
        ref={galleryInputRef}
        type="file"
        name="receipt_file_gallery"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileChange(e, "gallery")}
      />

      {previewUrl ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Preview Nota"
            className="h-14 w-16 rounded-lg object-cover border border-slate-200 shrink-0"
          />
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-bold text-slate-800 truncate">{fileName}</p>
            <p className="text-[11px] text-emerald-700 font-semibold">
              ✓ Terkompresi ({fileSize})
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] text-rose-600 hover:underline font-semibold"
            >
              Hapus / Foto Ulang
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isCompressing}
            onClick={() => cameraInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 active:scale-95 disabled:opacity-50"
          >
            📸 Foto Kamera
          </button>
          <button
            type="button"
            disabled={isCompressing}
            onClick={() => galleryInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 disabled:opacity-50"
          >
            📁 Galeri
          </button>
        </div>
      )}
    </div>
  );
}
