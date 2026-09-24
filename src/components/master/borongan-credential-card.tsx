"use client";

import { useState } from "react";

type Props = {
  name: string;
  workerCode: string;
  email: string;
  pass: string;
  phone?: string;
};

export function BoronganCredentialCard({ name, workerCode, email, pass, phone }: Props) {
  const [copied, setCopied] = useState(false);
  const [closed, setClosed] = useState(false);

  if (closed) return null;

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";

  const waMessage = [
    `*AKUN SISTEM SMPT V2 - PT KREASI DINAMIKA MAJU BERSAMA*`,
    `=============================`,
    `Halo *${name}*,`,
    `Akun aplikasi Anda telah aktif untuk memantau penugasan SPK dan hasil kerja borongan Anda:`,
    ``,
    `🔗 *Link Login:* ${loginUrl}`,
    `👤 *ID / Username:* ${workerCode} (atau ${email})`,
    `🔑 *Password:* ${pass}`,
    `=============================`,
    `_Simpan pesan ini untuk login di browser HP Anda._`,
  ].join("\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(waMessage).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const cleanPhone = (phone || "").replace(/\D/g, "");
  const normalizedPhone = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone;
  const waUrl = normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(waMessage)}`
    : `https://web.whatsapp.com/send?text=${encodeURIComponent(waMessage)}`;

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-blue-50/30 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-base text-white shadow-xs">
            🎉
          </span>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Akun Login Pekerja Borongan Berhasil Dibuat Otomatis!
            </h3>
            <p className="text-xs text-slate-500">
              Pekerja dapat langsung login menggunakan ID Pekerja atau Email dan Password di bawah ini.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setClosed(true)}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-xs"
          title="Tutup banner"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4 rounded-xl border border-emerald-200/80 bg-white p-3.5 text-xs">
        <div>
          <span className="text-slate-400 font-medium">Nama Pekerja:</span>
          <div className="font-bold text-slate-800">{name}</div>
        </div>
        <div>
          <span className="text-slate-400 font-medium">ID / Username Login:</span>
          <div className="font-bold text-blue-600 font-mono text-sm">{workerCode}</div>
          <div className="text-[10px] text-slate-400">{email}</div>
        </div>
        <div>
          <span className="text-slate-400 font-medium">Password Otomatis:</span>
          <div className="font-bold text-emerald-600 font-mono text-sm bg-emerald-50 inline-block px-2 py-0.5 rounded border border-emerald-200">
            {pass}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Format: Nama + 123</div>
        </div>
        <div>
          <span className="text-slate-400 font-medium">Role Aplikasi:</span>
          <div>
            <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200">
              PEKERJA (BORONGAN)
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
        >
          {copied ? "✅ Kredensial Disalin!" : "📋 Salin Kredensial"}
        </button>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-xs"
        >
          💬 Kirim ke WhatsApp {phone ? `(${phone})` : ""}
        </a>
      </div>
    </div>
  );
}
