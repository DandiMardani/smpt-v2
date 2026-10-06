"use client";

import { useState, useTransition } from "react";
import {
  createEmbarkationIssueAction,
  updateEmbarkationIssueReturnAction,
  deleteEmbarkationIssueAction,
} from "@/lib/final/actions";

export type ParsedIssueRow = {
  id: number;
  code: string;
  no: number;
  daerah: string;
  embarkasi: string;
  tambahan_set: number;
  koper_bagasi: number;
  koper_kabin: number;
  kardus: number;
  paket_isian: number;
  cover_bagasi: number;
  cover_kabin: number;
  tas_pasport: number;
  tas_ransel: number;
  hangtag: number;
  logo_kemenag: number;
  logo_aybe: number;
  logo_saudi: number;
  sticker: number;
  tgl_kirim: string;
  no_dokumen: string;
  keterangan: string;
  status: string;
  resolution?: string;
};

export type ShipmentOption = {
  id: number;
  shipment_code: string;
  status: string;
  shipment_date: string;
  document_no?: string;
};

type Props = {
  initialRows: ParsedIssueRow[];
  shipments: ShipmentOption[];
  canWrite: boolean;
};

const ITEM_OPTIONS = [
  { group: "Koper Haji", key: "koper_bagasi", label: "Koper Bagasi 24\"" },
  { group: "Koper Haji", key: "koper_kabin", label: "Koper Kabin 20\"" },
  { group: "Koper Haji", key: "tambahan_set", label: "1 SET Lengkap Koper Haji (Bagasi + Kabin + Tas)" },
  { group: "Perlengkapan Barang Jadi Haji", key: "cover_bagasi", label: "Cover / Sarung Koper Bagasi 24\"" },
  { group: "Perlengkapan Barang Jadi Haji", key: "cover_kabin", label: "Cover / Sarung Koper Kabin 20\"" },
  { group: "Perlengkapan Barang Jadi Haji", key: "tas_pasport", label: "Tas Paspor Haji" },
  { group: "Perlengkapan Barang Jadi Haji", key: "tas_ransel", label: "Tas Ransel Haji" },
  { group: "Perlengkapan Barang Jadi Haji", key: "kardus", label: "Kardus / Box Packing Koper" },
  { group: "Perlengkapan Barang Jadi Haji", key: "paket_isian", label: "Paket Isian Koper Haji" },
  { group: "Perlengkapan Barang Jadi Haji", key: "sticker", label: "Sticker Koper Haji" },
  { group: "Perlengkapan Barang Jadi Haji", key: "hangtag", label: "Hangtag Koper" },
  { group: "Perlengkapan Barang Jadi Haji", key: "logo_kemenag", label: "Logo Kemenag" },
  { group: "Perlengkapan Barang Jadi Haji", key: "logo_aybe", label: "Logo AYBE" },
  { group: "Perlengkapan Barang Jadi Haji", key: "logo_saudi", label: "Logo Saudi" },
];

export default function RejectEmbarkasiClient({ initialRows, shipments, canWrite }: Props) {
  const [selectedEmb, setSelectedEmb] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [updatingRow, setUpdatingRow] = useState<ParsedIssueRow | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form states
  const [embarkasi, setEmbarkasi] = useState("JKS");
  const [daerah, setDaerah] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [issueType, setIssueType] = useState("REJECT");
  const [selectedItemKey, setSelectedItemKey] = useState("koper_bagasi");
  const [quantity, setQuantity] = useState<number>(1);
  const [keterangan, setKeterangan] = useState("");
  const [isDirectReturn, setIsDirectReturn] = useState(true);
  const [noDokumenReturn, setNoDokumenReturn] = useState("");
  const [tglKirimReturn, setTglKirimReturn] = useState(new Date().toISOString().slice(0, 10));
  const [returnStatus, setReturnStatus] = useState("SELESAI");

  // Filter rows
  const filteredRows = initialRows.filter((r) => {
    if (selectedEmb === "JKS" && r.embarkasi !== "JKS") return false;
    if (selectedEmb === "JKG" && (r.embarkasi !== "JKG" || r.daerah.includes("LAMPUNG"))) return false;
    if (selectedEmb === "LAMPUNG" && !r.daerah.includes("LAMPUNG")) return false;

    if (statusFilter === "PROSES" && r.status === "SELESAI") return false;
    if (statusFilter === "SELESAI" && r.status !== "SELESAI") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        r.daerah.toLowerCase().includes(q) ||
        r.no_dokumen.toLowerCase().includes(q) ||
        r.keterangan.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // Calculate totals
  const totSet = filteredRows.reduce((a, b) => a + b.tambahan_set, 0);
  const totKoper = filteredRows.reduce((a, b) => a + b.koper_bagasi + b.koper_kabin, 0);
  const totTas = filteredRows.reduce((a, b) => a + b.tas_pasport + b.tas_ransel, 0);
  const totCover = filteredRows.reduce((a, b) => a + b.cover_bagasi + b.cover_kabin, 0);
  const totIsian = filteredRows.reduce((a, b) => a + b.paket_isian, 0);
  const totKardus = filteredRows.reduce((a, b) => a + b.kardus, 0);
  const totAksesoris = filteredRows.reduce(
    (a, b) => a + b.sticker + b.logo_aybe + b.hangtag + b.logo_kemenag + b.logo_saudi,
    0
  );

  const pendingReturnCount = initialRows.filter((r) => r.status !== "SELESAI").length;

  const handleDelete = (id: number, code: string, daerah: string) => {
    if (!window.confirm(`Yakin ingin menghapus catatan reject ${code} (${daerah})?`)) return;
    const fd = new FormData();
    fd.append("issue_id", String(id));
    startTransition(async () => {
      await deleteEmbarkationIssueAction(fd);
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <p className="text-[11px] font-bold text-slate-500">Total Kasus Klaim</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{filteredRows.length} Dokumen</p>
        </div>
        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-3.5 shadow-2xs">
          <p className="text-[11px] font-bold text-purple-700">Set Lengkap</p>
          <p className="mt-1 text-2xl font-black text-purple-900">{totSet} SET</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3.5 shadow-2xs">
          <p className="text-[11px] font-bold text-blue-700">Koper (Bagasi/Kabin)</p>
          <p className="mt-1 text-2xl font-black text-blue-900">{totKoper} Unit</p>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-3.5 shadow-2xs">
          <p className="text-[11px] font-bold text-indigo-700">Tas (Paspor/Ransel)</p>
          <p className="mt-1 text-2xl font-black text-indigo-900">{totTas} Unit</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-2xs">
          <p className="text-[11px] font-bold text-emerald-700">Cover & Kardus</p>
          <p className="mt-1 text-2xl font-black text-emerald-900">{totCover + totKardus} Pcs</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5 shadow-2xs">
          <p className="text-[11px] font-bold text-amber-700">Isian & Aksesoris</p>
          <p className="mt-1 text-2xl font-black text-amber-900">{totIsian + totAksesoris} Pcs</p>
        </div>
      </div>

      {/* 2. Filter & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Tab Wilayah */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setSelectedEmb("ALL")}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedEmb === "ALL" ? "bg-slate-900 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Semua Wilayah ({initialRows.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedEmb("JKS")}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedEmb === "JKS" ? "bg-blue-600 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Bekasi & Jabar - JKS ({initialRows.filter((r) => r.embarkasi === "JKS").length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedEmb("JKG")}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedEmb === "JKG" ? "bg-emerald-600 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Jakarta - JKG ({initialRows.filter((r) => r.embarkasi === "JKG" && !r.daerah.includes("LAMPUNG")).length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedEmb("LAMPUNG")}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedEmb === "LAMPUNG" ? "bg-purple-600 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Lampung ({initialRows.filter((r) => r.daerah.includes("LAMPUNG")).length})
            </button>
          </div>

          {/* Search box */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari daerah, no surat, atau catatan..."
            className="w-48 sm:w-60 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-md transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <span>{showAddForm ? "✕ Tutup Form" : "＋ Catat Reject & Return Baru"}</span>
          </button>
        )}
      </div>

      {/* 3. Form Input Reject & Return (Collapsible & Intuitive) */}
      {showAddForm && canWrite && (
        <div className="rounded-3xl border-2 border-blue-400 bg-gradient-to-b from-blue-50/60 via-white to-white p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <span>📦</span>
              <span>Formulir Pencatatan Barang Reject & Pengiriman Return Pengganti</span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Catat barang cacat/rusak/kekurangan fisik dari asrama haji, lalu tentukan surat jalan pengganti (return).
            </p>
          </div>

          <form action={createEmbarkationIssueAction} className="space-y-4">
            {/* Bagian 1: Data Kerusakan / Reject */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
              <span className="text-[11px] font-black uppercase tracking-wider text-rose-600 flex items-center gap-1">
                <span>🔴</span>
                <span>Tahap 1: Laporan Barang Reject / Kekurangan Fisik</span>
              </span>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Embarkasi Tujuan</label>
                  <select
                    name="embarkasi"
                    value={embarkasi}
                    onChange={(e) => setEmbarkasi(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="JKS">JKS (Bekasi & Jawa Barat)</option>
                    <option value="JKG">JKG (DKI Jakarta & Banten)</option>
                    <option value="LAMPUNG">LAMPUNG (Asrama Haji Lampung)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Daerah / Wilayah / Kloter</label>
                  <input
                    name="daerah"
                    required
                    value={daerah}
                    onChange={(e) => setDaerah(e.target.value)}
                    placeholder="Contoh: BEKASI / BANDUNG, JAKARTA BARAT..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Surat Jalan Asal (Opsional)</label>
                  <select
                    name="shipment_id"
                    value={shipmentId}
                    onChange={(e) => setShipmentId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="">-- Pilih Surat Jalan Asal --</option>
                    {shipments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.shipment_code} · {s.shipment_date} ({s.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Jenis Masalah / Klaim</label>
                  <select
                    name="issue_type"
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="REJECT">REJECT (Cacat / Tukar Fisik)</option>
                    <option value="RUSAK">RUSAK (Kerusakan / Pecah)</option>
                    <option value="KURANG">KURANG (Kekurangan Fisik)</option>
                    <option value="LAINNYA">LAINNYA (Hilang / Kebakaran / Mutasi)</option>
                  </select>
                </div>
              </div>

              {/* Item Dropdown & Qty */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Pilih Barang yang Reject / Di-return
                  </label>
                  <select
                    name="item_key"
                    value={selectedItemKey}
                    onChange={(e) => setSelectedItemKey(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                  >
                    <optgroup label="── KOPER HAJI ──">
                      {ITEM_OPTIONS.filter((o) => o.group === "Koper Haji").map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="── PERLENGKAPAN BARANG JADI HAJI ──">
                      {ITEM_OPTIONS.filter((o) => o.group === "Perlengkapan Barang Jadi Haji").map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Jumlah Unit (Qty)</label>
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Penyebab & Rincian Keterangan</label>
                <input
                  name="keterangan"
                  required
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Contoh: Roda pecah saat bongkar muat, Resleting robek, Mutasi kloter 12..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Bagian 2: Pengiriman Return Pengganti (Kirim Lagi) */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                  <span>🚚</span>
                  <span>Tahap 2: Pengiriman Return Pengganti (Kirim Lagi ke Embarkasi)</span>
                </span>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={isDirectReturn}
                    onChange={(e) => {
                      setIsDirectReturn(e.target.checked);
                      if (!e.target.checked) {
                        setReturnStatus("PROSES");
                      } else {
                        setReturnStatus("SELESAI");
                      }
                    }}
                    className="h-4 w-4 rounded accent-emerald-600"
                  />
                  <span>Barang pengganti sudah/sedang langsung dikirim</span>
                </label>
              </div>

              {isDirectReturn ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      No. Surat Jalan Return / Pengganti
                    </label>
                    <input
                      name="no_dokumen"
                      value={noDokumenReturn}
                      onChange={(e) => setNoDokumenReturn(e.target.value)}
                      placeholder="Contoh: SJ-RET-001 atau No Surat"
                      className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Tanggal Kirim Return Pengganti
                    </label>
                    <input
                      name="tgl_kirim"
                      type="date"
                      value={tglKirimReturn}
                      onChange={(e) => setTglKirimReturn(e.target.value)}
                      className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Status Penggantian</label>
                    <select
                      name="status"
                      value={returnStatus}
                      onChange={(e) => setReturnStatus(e.target.value)}
                      className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-900 outline-none focus:border-emerald-500"
                    >
                      <option value="SELESAI">SELESAI (Sudah Masuk Embarkasi)</option>
                      <option value="DIKIRIM">DIKIRIM (Dalam Perjalanan Return)</option>
                      <option value="PROSES">PROSES (Menunggu Pengganti)</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  <span>⏳ Status akan disimpan sebagai <b>PROSES</b>. Anda dapat mencatat surat jalan return penggantinya nanti setelah barang dikirim.</span>
                  <input type="hidden" name="status" value="PROSES" />
                  <input type="hidden" name="no_dokumen" value="-" />
                  <input type="hidden" name="tgl_kirim" value="-" />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-black text-white shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isPending ? "Menyimpan..." : "💾 Simpan Catatan Reject & Return"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Modal / Drawer Update Pengiriman Return Pengganti */}
      {updatingRow && canWrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  Kirim Return Pengganti: {updatingRow.code}
                </h4>
                <p className="text-xs text-slate-500">
                  Daerah: <b>{updatingRow.daerah}</b> ({updatingRow.embarkasi})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUpdatingRow(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              action={async (fd) => {
                await updateEmbarkationIssueReturnAction(fd);
                setUpdatingRow(null);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="issue_id" value={updatingRow.id} />

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  No. Dokumen / Surat Jalan Return Pengganti
                </label>
                <input
                  name="no_dokumen"
                  defaultValue={updatingRow.no_dokumen !== "-" ? updatingRow.no_dokumen : ""}
                  required
                  placeholder="Contoh: SJ-RET-2026-004..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tanggal Pengiriman Return
                </label>
                <input
                  name="tgl_kirim"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Status Penggantian
                </label>
                <select
                  name="status"
                  defaultValue="SELESAI"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-emerald-900 outline-none focus:border-blue-500"
                >
                  <option value="SELESAI">✓ SELESAI (Sudah Diterima Masuk Embarkasi)</option>
                  <option value="DIKIRIM">🚚 DIKIRIM (Dalam Perjalanan Return)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUpdatingRow(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2 text-xs font-black text-white shadow-md cursor-pointer"
                >
                  ✓ Simpan Pengiriman Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Tabel Rekapitulasi Reject & Return */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3.5">
          <div>
            <h4 className="text-sm font-black text-slate-900">
              Rekapitulasi Penggantian & Kekurangan Saudi 2026 ({filteredRows.length} Dokumen)
            </h4>
            <p className="text-[11px] text-slate-500">
              Riwayat komprehensif barang cacat/rusak dan pengiriman return penggantinya.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                statusFilter === "ALL" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Semua ({initialRows.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("PROSES")}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                statusFilter === "PROSES" ? "bg-amber-500 text-white shadow-2xs" : "text-amber-700 hover:text-amber-900"
              }`}
            >
              Perlu Return ({pendingReturnCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("SELESAI")}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                statusFilter === "SELESAI" ? "bg-emerald-600 text-white shadow-2xs" : "text-emerald-700 hover:text-emerald-900"
              }`}
            >
              Selesai Masuk ({initialRows.filter((r) => r.status === "SELESAI").length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-black text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-3 text-center w-12">No</th>
                <th className="py-3 px-3">Daerah / Embarkasi</th>
                <th className="py-3 px-3">Surat Jalan Return</th>
                <th className="py-3 px-3">Tgl Kirim</th>
                <th className="py-3 px-3">Rincian Barang Reject / Return</th>
                <th className="py-3 px-3">Penyebab / Keterangan</th>
                <th className="py-3 px-3">Status Penggantian</th>
                {canWrite && <th className="py-3 px-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Tidak ada data barang reject/return yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const isDone = r.status === "SELESAI";
                  const isSent = r.status === "DIKIRIM";

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-3 text-center font-bold text-slate-400">{r.no}</td>

                      <td className="py-3 px-3">
                        <div className="font-extrabold text-slate-900">{r.daerah}</div>
                        <div className="mt-0.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black border ${
                              r.embarkasi === "JKS"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : r.embarkasi === "LAMPUNG" || r.daerah.includes("LAMPUNG")
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {r.embarkasi}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                          {r.no_dokumen !== "-" ? r.no_dokumen : "Tanpa Surat Jalan"}
                        </span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-semibold">{r.tgl_kirim}</td>

                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1 max-w-sm">
                          {r.tambahan_set > 0 && (
                            <span className="bg-purple-100 text-purple-900 border border-purple-200 text-[11px] font-bold px-2 py-0.5 rounded-md">
                              {r.tambahan_set} SET Lengkap
                            </span>
                          )}
                          {r.koper_bagasi > 0 && (
                            <span className="bg-blue-100 text-blue-900 border border-blue-200 text-[11px] font-bold px-2 py-0.5 rounded-md">
                              {r.koper_bagasi} Koper Bagasi 24"
                            </span>
                          )}
                          {r.koper_kabin > 0 && (
                            <span className="bg-sky-100 text-sky-900 border border-sky-200 text-[11px] font-bold px-2 py-0.5 rounded-md">
                              {r.koper_kabin} Koper Kabin 20"
                            </span>
                          )}
                          {r.cover_bagasi > 0 && (
                            <span className="bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-semibold px-2 py-0.5 rounded-md">
                              {r.cover_bagasi} Cover Bagasi
                            </span>
                          )}
                          {r.cover_kabin > 0 && (
                            <span className="bg-teal-100 text-teal-900 border border-teal-200 text-[11px] font-semibold px-2 py-0.5 rounded-md">
                              {r.cover_kabin} Cover Kabin
                            </span>
                          )}
                          {r.tas_pasport > 0 && (
                            <span className="bg-indigo-100 text-indigo-900 border border-indigo-200 text-[11px] font-semibold px-2 py-0.5 rounded-md">
                              {r.tas_pasport} Tas Paspor
                            </span>
                          )}
                          {r.tas_ransel > 0 && (
                            <span className="bg-violet-100 text-violet-900 border border-violet-200 text-[11px] font-semibold px-2 py-0.5 rounded-md">
                              {r.tas_ransel} Tas Ransel
                            </span>
                          )}
                          {r.kardus > 0 && (
                            <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-semibold px-2 py-0.5 rounded-md">
                              {r.kardus} Kardus
                            </span>
                          )}
                          {r.paket_isian > 0 && (
                            <span className="bg-pink-100 text-pink-900 border border-pink-200 text-[11px] font-semibold px-2 py-0.5 rounded-md">
                              {r.paket_isian} Paket Isian
                            </span>
                          )}
                          {r.sticker > 0 && (
                            <span className="bg-yellow-100 text-yellow-900 border border-yellow-200 text-[11px] font-semibold px-2 py-0.5 rounded-md">
                              {r.sticker} Sticker Koper
                            </span>
                          )}
                          {r.hangtag > 0 && (
                            <span className="bg-slate-100 text-slate-800 text-[11px] px-2 py-0.5 rounded-md">
                              {r.hangtag} Hangtag
                            </span>
                          )}
                          {r.logo_kemenag > 0 && (
                            <span className="bg-slate-100 text-slate-800 text-[11px] px-2 py-0.5 rounded-md">
                              {r.logo_kemenag} Logo Kemenag
                            </span>
                          )}
                          {r.logo_aybe > 0 && (
                            <span className="bg-slate-100 text-slate-800 text-[11px] px-2 py-0.5 rounded-md">
                              {r.logo_aybe} Logo AYBE
                            </span>
                          )}
                          {r.logo_saudi > 0 && (
                            <span className="bg-slate-100 text-slate-800 text-[11px] px-2 py-0.5 rounded-md">
                              {r.logo_saudi} Logo Saudi
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`text-xs font-bold ${
                            r.keterangan.includes("HILANG") || r.keterangan.includes("KEBAKARAN")
                              ? "text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md inline-block"
                              : r.keterangan.includes("MUTASI")
                              ? "text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md inline-block"
                              : "text-slate-700"
                          }`}
                        >
                          {r.keterangan}
                        </span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-black text-emerald-800 border border-emerald-300">
                            ✓ MASUK EMBERKASI
                          </span>
                        ) : isSent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-black text-blue-800 border border-blue-300">
                            🚚 DIKIRIM (RETURN)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-black text-amber-800 border border-amber-300 animate-pulse">
                            ⏳ PROSES PENGGANTIAN
                          </span>
                        )}
                      </td>

                      {canWrite && (
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isDone && (
                              <button
                                type="button"
                                onClick={() => setUpdatingRow(r)}
                                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs transition active:scale-95 cursor-pointer"
                              >
                                Kirim Return ➔
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelete(r.id, r.code, r.daerah)}
                              className="rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 px-2 py-1 text-xs font-bold text-rose-600 transition cursor-pointer"
                              title="Hapus baris ini"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
