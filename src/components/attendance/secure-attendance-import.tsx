"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SecureRow = {
  rowNo: number;
  sheetName: string;
  sheetRow: number;
  idFinger: string;
  kodeKaryawan: string;
  namaRaw: string;
  jabatanRaw: string;
  departemenRaw: string;
  hari: string;
  tanggal: string;
  jamKerja: string;
  kegiatan: string;
  jamMasuk: string;
  jamKeluar: string;
  terlambat: string;
  cepatPulang: string;
  jamEfektif: string;
  lembur: string;
  notes: string;
};

type PreviewRow = SecureRow & {
  workerId?: number | null;
  workerName?: string | null;
  problem: string;
};

type PreviewPayload = {
  total: number;
  matched: number;
  problem: number;
  duplicate: number;
  verifiedProtected: number;
  rows: PreviewRow[];
};

type CommitPayload = {
  importCode?: string;
  rawBaru?: number;
  finalBaru?: number;
  finalUpdate?: number;
  duplikatDilewati?: number;
  belumTerdaftar?: number;
  terverifikasiDilindungi?: number;
  manualDilindungi?: number;
  perluReview?: number;
};

type XlsxLike = {
  read: (buffer: ArrayBuffer, options: Record<string, unknown>) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (
      sheet: unknown,
      options: Record<string, unknown>,
    ) => unknown[][];
  };
  SSF?: {
    parse_date_code?: (value: number) => {
      y?: number;
      m?: number;
      d?: number;
    } | null;
  };
};

declare global {
  interface Window {
    XLSX?: XlsxLike;
  }
}

const SHEET_JS_SOURCES = [
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js",
];

function cell(row: unknown[], index: number) {
  return String(row[index] ?? "").trim();
}

function parseDate(value: unknown, xlsx: XlsxLike) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = xlsx.SSF?.parse_date_code?.(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const text = String(value ?? "").trim();
  if (!text) return "";
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    return `${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
  }
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (match) {
    const yy = Number(match[3]);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return `${year}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
  }
  return "";
}

function parseTime(displayValue: unknown, rawValue: unknown) {
  const text = String(displayValue ?? "").trim();
  const match = text.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?:\s|$)/);
  if (match) return `${String(match[1]).padStart(2, "0")}:${match[2]}`;

  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    const fraction = ((rawValue % 1) + 1) % 1;
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return "";
}

function parseSecureSheet(
  rows: unknown[][],
  rawRows: unknown[][],
  xlsx: XlsxLike,
  sheetName: string,
) {
  const out: SecureRow[] = [];
  let employee: {
    idFinger: string;
    kodeKaryawan: string;
    namaRaw: string;
    jabatanRaw: string;
    departemenRaw: string;
  } | null = null;
  let inTable = false;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const rawRow = rawRows[index] ?? [];
    const first = cell(row, 0);

    if (/^Fingerprint ID$/i.test(first)) {
      employee = {
        idFinger: cell(row, 2),
        kodeKaryawan: "",
        namaRaw: "",
        jabatanRaw: cell(row, 6),
        departemenRaw: "",
      };
      inTable = false;
      continue;
    }

    if (!employee) continue;

    if (/^Kode Karyawan$/i.test(first)) {
      employee.kodeKaryawan = cell(row, 2);
      continue;
    }
    if (/^Nama Karyawan$/i.test(first)) {
      employee.namaRaw = cell(row, 2);
      employee.departemenRaw = cell(row, 6);
      continue;
    }
    if (/^Hari$/i.test(first) && /Tanggal/i.test(cell(row, 1))) {
      inTable = true;
      continue;
    }
    if (!inTable || !first) continue;

    const kegiatan = cell(row, 3);
    if (/^jumlah$/i.test(kegiatan) || /^total$/i.test(first)) continue;

    const rawDate = rawRow[1] !== undefined && rawRow[1] !== "" ? rawRow[1] : row[1];
    const tanggal = parseDate(rawDate, xlsx);
    if (!tanggal) continue;

    out.push({
      rowNo: 0,
      sheetName,
      sheetRow: index + 1,
      ...employee,
      hari: first,
      tanggal,
      jamKerja: cell(row, 2),
      kegiatan,
      jamMasuk: parseTime(row[4], rawRow[4]),
      jamKeluar: parseTime(row[5], rawRow[5]),
      terlambat: cell(row, 6),
      cepatPulang: cell(row, 7),
      jamEfektif: cell(row, 8),
      lembur: cell(row, 9),
      notes: cell(row, 10),
    });
  }

  return out;
}

function loadScript(source: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-smpt-xlsx-src="${source}"]`,
    );
    if (existing) {
      if (window.XLSX) resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Gagal memuat pembaca Excel.")), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.dataset.smptXlsxSrc = source;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Gagal memuat pembaca Excel."));
    document.head.appendChild(script);
  });
}

async function ensureSheetJs() {
  if (window.XLSX) return window.XLSX;
  let lastError: unknown = null;
  for (const source of SHEET_JS_SOURCES) {
    try {
      await loadScript(source);
      if (window.XLSX) return window.XLSX;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Library pembaca Excel tidak dapat dimuat.");
}

async function postImport(payload: Record<string, unknown>) {
  const response = await fetch("/api/attendance/secure-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as { data?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body.data;
}

function problemLabel(problem: string) {
  return problem.replaceAll("_", " ");
}

function problemClass(problem: string) {
  if (problem === "NORMAL") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (problem === "DUPLIKAT" || problem === "SUDAH_TERVERIFIKASI") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function SecureAttendanceImport({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [sourceFile, setSourceFile] = useState("");
  const [rows, setRows] = useState<SecureRow[]>([]);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CommitPayload | null>(null);

  const visibleRows = useMemo(() => preview?.rows.slice(0, 150) ?? [], [preview]);

  if (!canWrite) return null;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError("");
    setResult(null);
    setPreview(null);
    setRows([]);
    setSourceFile(file.name);

    try {
      const xlsx = await ensureSheetJs();
      const buffer = await file.arrayBuffer();
      const workbook = xlsx.read(buffer, { type: "array", cellDates: true });
      const parsed: SecureRow[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const displayRows = xlsx.utils.sheet_to_json(sheet, {
          header: 1,
          raw: false,
          defval: "",
          dateNF: "yyyy-mm-dd",
        });
        const rawRows = xlsx.utils.sheet_to_json(sheet, {
          header: 1,
          raw: true,
          defval: "",
        });
        parsed.push(...parseSecureSheet(displayRows, rawRows, xlsx, sheetName));
      }

      if (!parsed.length) {
        throw new Error(
          "Format Secure tidak dikenali atau tidak ada baris absensi harian di file.",
        );
      }

      parsed.forEach((row, index) => {
        row.rowNo = index + 1;
      });
      setRows(parsed);

      const data = (await postImport({
        mode: "preview",
        sourceFile: file.name,
        rows: parsed,
      })) as PreviewPayload;
      setPreview(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "File tidak dapat diproses.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!rows.length || !sourceFile) return;
    setBusy(true);
    setError("");
    try {
      const data = (await postImport({
        mode: "commit",
        sourceFile,
        rows,
      })) as CommitPayload;
      setResult(data);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900 text-base">Import Secure Fingerprint</h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-500 leading-relaxed">
            File .xls/.xlsx dibaca langsung di browser. Sistem mencocokkan Fingerprint ID ke Master
            Pekerja, menampilkan preview, melindungi data TERVERIFIKASI, dan menyimpan RAW audit + draft untuk review.
          </p>
        </div>
        <input
          type="file"
          accept=".xls,.xlsx"
          onChange={onFile}
          disabled={busy}
          className="max-w-sm rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-700 cursor-pointer"
        />
      </div>

      {busy ? <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs font-medium text-blue-700">Memproses file Secure...</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">{error}</div> : null}

      {preview ? (
        <div className="space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Total", preview.total],
              ["Match Pekerja", preview.matched],
              ["Perlu Dicek", preview.problem],
              ["Duplikat", preview.duplicate],
              ["Terverifikasi", preview.verifiedProtected],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{String(value)}</div>
              </div>
            ))}
          </div>

          <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-2.5">Tanggal</th>
                  <th className="px-3.5 py-2.5">Finger ID</th>
                  <th className="px-3.5 py-2.5">Pekerja</th>
                  <th className="px-3.5 py-2.5">Masuk</th>
                  <th className="px-3.5 py-2.5">Keluar</th>
                  <th className="px-3.5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleRows.map((row) => (
                  <tr key={`${row.sheetName}-${row.sheetRow}-${row.idFinger}`} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2 text-slate-700">{row.tanggal}</td>
                    <td className="px-3.5 py-2 font-mono text-slate-600">{row.idFinger || "-"}</td>
                    <td className="px-3.5 py-2 font-medium text-slate-800">{row.workerName || row.namaRaw || "-"}</td>
                    <td className="px-3.5 py-2 text-slate-600">{row.jamMasuk || "-"}</td>
                    <td className="px-3.5 py-2 text-slate-600">{row.jamKeluar || "-"}</td>
                    <td className="px-3.5 py-2">
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${problemClass(row.problem)}`}>
                        {problemLabel(row.problem)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.rows.length > visibleRows.length ? (
            <p className="text-xs text-slate-400">Preview menampilkan 150 baris pertama dari {preview.rows.length} baris.</p>
          ) : null}

          <button
            type="button"
            onClick={commit}
            disabled={busy || !rows.length}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition"
          >
            Simpan Import Secure
          </button>
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 leading-relaxed font-medium">
          Import {result.importCode || ""} berhasil disimpan. RAW baru {result.rawBaru ?? 0}, absensi baru {result.finalBaru ?? 0}, update {result.finalUpdate ?? 0}, duplikat dilewati {result.duplikatDilewati ?? 0}, ID belum terdaftar {result.belumTerdaftar ?? 0}, data terverifikasi dilindungi {result.terverifikasiDilindungi ?? 0}, manual dilindungi {result.manualDilindungi ?? 0}, perlu review {result.perluReview ?? 0}.
        </div>
      ) : null}
    </section>
  );
}
