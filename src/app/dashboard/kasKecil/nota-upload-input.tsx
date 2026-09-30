"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

async function compressImageToBase64(file: File, maxWidth = 1000, quality = 0.75): Promise<{ file: File; base64: string }> {
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
        if (!ctx) {
          return resolve({ file, base64: event.target?.result as string });
        }

        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL("image/jpeg", quality);

        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve({ file, base64 });
            const cleanName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            const compFile = new File([blob], cleanName, { type: "image/jpeg", lastModified: Date.now() });
            resolve({ file: compFile, base64 });
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve({ file, base64: event.target?.result as string });
    };
    reader.onerror = () => resolve({ file, base64: "" });
  });
}

export function NotaUploadInput() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string>("");
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
      const { file: compressedFile, base64 } = await compressImageToBase64(rawFile, 1000, 0.75);

      if (typeof DataTransfer !== "undefined") {
        try {
          const dt = new DataTransfer();
          dt.items.add(compressedFile);
          e.target.files = dt.files;
        } catch {}
      }

      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(base64 || URL.createObjectURL(compressedFile));
      setBase64Data(base64);
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
    setBase64Data("");
    setFileName("");
    setFileSize("");
  };

  return (
    <div className="space-y-1.5">
      {/* Input hidden untuk mengirim data base64 secara langsung */}
      <input type="hidden" name="receipt_base64" value={base64Data} />

      {/* Input file kamera dan galeri diseragamkan memakai nama receipt_file */}
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
        name="receipt_file"
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
              ✓ Siap Disimpan ({fileSize})
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] text-rose-600 hover:underline font-semibold"
            >
              Hapus / Ganti Foto
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
          {isCompressing && (
            <span className="text-[11px] text-slate-400 animate-pulse">Memproses foto...</span>
          )}
        </div>
      )}
    </div>
  );
}
