"use client";

import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/master/page-utils";

type SablonSummaryRow = {
  code: string;
  name: string;
  variant: "HAJI" | "GARUDA";
  stockCut: number | null;
  sentToSablon: number;
  returnedFromSablon: number;
  remainingInSablon: number;
  unit: string;
  notes?: string;
};

type AccessoryRow = {
  code: string;
  name: string;
  receivedQty: number;
  issuedToMrWuQty: number;
  remainingAtBuaran: number;
  unit: string;
  notes?: string;
};

type LogEntry = {
  id: string;
  date: string;
  code: string;
  name: string;
  qty: number;
  notes?: string;
  category: "KAIN_SABLON" | "AKSESORIS" | "GRD";
};

// Data Master Rekap Subkon Sablon
const SABLON_SUMMARY: SablonSummaryRow[] = [
  {
    code: "A005",
    name: "MIKA 03",
    variant: "HAJI",
    stockCut: 46000,
    sentToSablon: 23100,
    returnedFromSablon: 23370,
    remainingInSablon: 270,
    unit: "PCS",
    notes: "Tas Paspor 2026 (1 sisi sablon, 1 sisi polos)",
  },
  {
    code: "A002",
    name: "TUTUP KANTONG 03",
    variant: "HAJI",
    stockCut: 45274,
    sentToSablon: 22710,
    returnedFromSablon: 22924,
    remainingInSablon: 214,
    unit: "PCS",
    notes: "Tas Paspor 2026 (1 sisi sablon)",
  },
  {
    code: "A011",
    name: "BADAN 04",
    variant: "HAJI",
    stockCut: 22700,
    sentToSablon: 22800,
    returnedFromSablon: 22683,
    remainingInSablon: -117,
    unit: "PCS",
    notes: "Tas Ransel 2026",
  },
  {
    code: "A013",
    name: "KANTONG 04",
    variant: "HAJI",
    stockCut: 45400,
    sentToSablon: 22800,
    returnedFromSablon: 22951,
    remainingInSablon: 151,
    unit: "PCS",
    notes: "Tas Ransel 2026",
  },
  {
    code: "A014",
    name: "TUTUP KANTONG 03 GRD",
    variant: "GARUDA",
    stockCut: null,
    sentToSablon: 5600,
    returnedFromSablon: 5550,
    remainingInSablon: -50,
    unit: "PCS",
    notes: "Pesanan Khusus Garuda (Tersendiri)",
  },
  {
    code: "A015",
    name: "KANTONG 04 GRD",
    variant: "GARUDA",
    stockCut: null,
    sentToSablon: 5380,
    returnedFromSablon: 5644,
    remainingInSablon: 264,
    unit: "PCS",
    notes: "Pesanan Khusus Garuda (Tersendiri)",
  },
  {
    code: "A016",
    name: "BADAN 04 GRD",
    variant: "GARUDA",
    stockCut: null,
    sentToSablon: 4024,
    returnedFromSablon: 5600,
    remainingInSablon: 1576,
    unit: "PCS",
    notes: "Pesanan Khusus Garuda (Tersendiri)",
  },
  {
    code: "A017",
    name: "MIKA 03 GRD",
    variant: "GARUDA",
    stockCut: null,
    sentToSablon: 0,
    returnedFromSablon: 5542,
    remainingInSablon: 5542,
    unit: "PCS",
    notes: "Pesanan Khusus Garuda (Beli Jadi)",
  },
];

// Data Master Aksesoris Beli Jadi (Buaran ➔ Mr Wu)
const ACCESSORIES_SUMMARY: AccessoryRow[] = [
  {
    code: "A004",
    name: "HANGTAG JKS",
    receivedQty: 12305,
    issuedToMrWuQty: 12320,
    remainingAtBuaran: -15,
    unit: "PCS",
    notes: "Embarkasi Jakarta-Surabaya ➔ Transfer ke Lokasi MR WU",
  },
  {
    code: "A003",
    name: "HANGTAG JKG",
    receivedQty: 10300,
    issuedToMrWuQty: 10300,
    remainingAtBuaran: 0,
    unit: "PCS",
    notes: "Embarkasi Jakarta-Garuda ➔ Transfer ke Lokasi MR WU",
  },
  {
    code: "A007",
    name: "LOGO AYBE",
    receivedQty: 20015,
    issuedToMrWuQty: 20000,
    remainingAtBuaran: 15,
    unit: "PCS",
    notes: "Logo Bordir/Cetak ➔ Transfer ke Lokasi MR WU",
  },
  {
    code: "A018",
    name: "HANGTAG BTJ",
    receivedQty: 5600,
    issuedToMrWuQty: 5600,
    remainingAtBuaran: 0,
    unit: "PCS",
    notes: "Embarkasi Banda Aceh ➔ Transfer ke Lokasi MR WU",
  },
  {
    code: "A019",
    name: "BOOKLET GARUDA",
    receivedQty: 5510,
    issuedToMrWuQty: 5500,
    remainingAtBuaran: 10,
    unit: "PCS",
    notes: "Buku Panduan Jamaah ➔ Transfer ke Lokasi MR WU",
  },
  {
    code: "A020",
    name: "SERAH TERIMA BARANG",
    receivedQty: 1,
    issuedToMrWuQty: 0,
    remainingAtBuaran: 1,
    unit: "SET",
    notes: "Dokumen Berita Acara Serah Terima",
  },
];

// Log Barang Masuk (Hasil Sablon & Aksesoris dari Subkon)
const LOG_MASUK: LogEntry[] = [
  { id: "M01", date: "2026-02-04", code: "A005", name: "MIKA 03", qty: 8500, category: "KAIN_SABLON" },
  { id: "M02", date: "2026-02-04", code: "A002", name: "TUTUP KANTONG 03", qty: 1500, category: "KAIN_SABLON" },
  { id: "M03", date: "2026-02-04", code: "A005", name: "MIKA 03", qty: 1000, category: "KAIN_SABLON" },
  { id: "M04", date: "2026-02-04", code: "A002", name: "TUTUP KANTONG 03", qty: 1000, category: "KAIN_SABLON" },
  { id: "M05", date: "2026-02-05", code: "A002", name: "TUTUP KANTONG 03", qty: 1000, category: "KAIN_SABLON" },
  { id: "M06", date: "2026-02-05", code: "A005", name: "MIKA 03", qty: 2000, category: "KAIN_SABLON" },
  { id: "M07", date: "2026-02-05", code: "A011", name: "BADAN 04", qty: 500, category: "KAIN_SABLON" },
  { id: "M08", date: "2026-02-05", code: "A013", name: "KANTONG 04", qty: 1700, category: "KAIN_SABLON" },
  { id: "M09", date: "2026-02-05", code: "A011", name: "BADAN 04", qty: 1000, category: "KAIN_SABLON" },
  { id: "M10", date: "2026-02-05", code: "A013", name: "KANTONG 04", qty: 570, category: "KAIN_SABLON" },
  { id: "M11", date: "2026-02-05", code: "A005", name: "MIKA 03", qty: 1000, category: "KAIN_SABLON" },
  { id: "M12", date: "2026-02-06", code: "A005", name: "MIKA 03", qty: 1500, category: "KAIN_SABLON" },
  { id: "M13", date: "2026-02-06", code: "A002", name: "TUTUP KANTONG 03", qty: 1000, category: "KAIN_SABLON" },
  { id: "M14", date: "2026-02-06", code: "A011", name: "BADAN 04", qty: 700, category: "KAIN_SABLON" },
  { id: "M15", date: "2026-02-06", code: "A005", name: "MIKA 03", qty: 1500, category: "KAIN_SABLON" },
  { id: "M16", date: "2026-02-06", code: "A002", name: "TUTUP KANTONG 03", qty: 800, category: "KAIN_SABLON" },
  { id: "M17", date: "2026-02-06", code: "A011", name: "BADAN 04", qty: 800, category: "KAIN_SABLON" },
  { id: "M18", date: "2026-02-07", code: "A011", name: "BADAN 04", qty: 700, category: "KAIN_SABLON" },
  { id: "M19", date: "2026-02-07", code: "A013", name: "KANTONG 04", qty: 1000, category: "KAIN_SABLON" },
  { id: "M20", date: "2026-02-08", code: "A002", name: "TUTUP KANTONG 03", qty: 2000, category: "KAIN_SABLON" },
  { id: "M21", date: "2026-02-08", code: "A011", name: "BADAN 04", qty: 300, category: "KAIN_SABLON" },
  { id: "M22", date: "2026-02-08", code: "A002", name: "TUTUP KANTONG 03", qty: 1600, category: "KAIN_SABLON" },
  { id: "M23", date: "2026-02-09", code: "A011", name: "BADAN 04", qty: 2000, category: "KAIN_SABLON" },
  { id: "M24", date: "2026-02-09", code: "A013", name: "KANTONG 04", qty: 1000, category: "KAIN_SABLON" },
  { id: "M25", date: "2026-02-10", code: "A005", name: "MIKA 03", qty: 2000, category: "KAIN_SABLON" },
  { id: "M26", date: "2026-02-10", code: "A002", name: "TUTUP KANTONG 03", qty: 2000, category: "KAIN_SABLON" },
  { id: "M27", date: "2026-02-10", code: "A013", name: "KANTONG 04", qty: 1500, category: "KAIN_SABLON" },
  { id: "M28", date: "2026-02-11", code: "A005", name: "MIKA 03", qty: 3000, category: "KAIN_SABLON" },
  { id: "M29", date: "2026-02-11", code: "A013", name: "KANTONG 04", qty: 1500, category: "KAIN_SABLON" },
  { id: "M30", date: "2026-02-11", code: "A011", name: "BADAN 04", qty: 900, category: "KAIN_SABLON" },
  { id: "M31", date: "2026-02-11", code: "A011", name: "BADAN 04", qty: 1100, category: "KAIN_SABLON" },
  { id: "M32", date: "2026-02-11", code: "A013", name: "KANTONG 04", qty: 1000, category: "KAIN_SABLON" },
  { id: "M33", date: "2026-02-11", code: "A005", name: "MIKA 03", qty: 1000, category: "KAIN_SABLON" },
  { id: "M34", date: "2026-02-12", code: "A005", name: "MIKA 03", qty: 1870, category: "KAIN_SABLON" },
  { id: "M35", date: "2026-02-12", code: "A011", name: "BADAN 04", qty: 500, category: "KAIN_SABLON" },
  { id: "M36", date: "2026-02-12", code: "A013", name: "KANTONG 04", qty: 2000, category: "KAIN_SABLON" },
  { id: "M37", date: "2026-02-13", code: "A011", name: "BADAN 04", qty: 1500, category: "KAIN_SABLON" },
  { id: "M38", date: "2026-02-13", code: "A013", name: "KANTONG 04", qty: 1000, category: "KAIN_SABLON" },
  { id: "M39", date: "2026-02-13", code: "A002", name: "TUTUP KANTONG 03", qty: 1000, category: "KAIN_SABLON" },
  { id: "M40", date: "2026-02-14", code: "A002", name: "TUTUP KANTONG 03", qty: 1200, category: "KAIN_SABLON" },
  { id: "M41", date: "2026-02-15", code: "A002", name: "TUTUP KANTONG 03", qty: 3500, category: "KAIN_SABLON" },
  { id: "M42", date: "2026-02-15", code: "A013", name: "KANTONG 04", qty: 1500, category: "KAIN_SABLON" },
  { id: "M43", date: "2026-02-15", code: "A002", name: "TUTUP KANTONG 03", qty: 1000, category: "KAIN_SABLON" },
  { id: "M44", date: "2026-02-16", code: "A002", name: "TUTUP KANTONG 03", qty: 96, category: "KAIN_SABLON" },
  { id: "M45", date: "2026-02-16", code: "A013", name: "KANTONG 04", qty: 1500, category: "KAIN_SABLON" },
  { id: "M46", date: "2026-02-16", code: "A011", name: "BADAN 04", qty: 500, category: "KAIN_SABLON" },
  { id: "M47", date: "2026-02-16", code: "A011", name: "BADAN 04", qty: 1500, category: "KAIN_SABLON" },
  { id: "M48", date: "2026-02-17", code: "A011", name: "BADAN 04", qty: 2000, category: "KAIN_SABLON" },
  { id: "M49", date: "2026-02-17", code: "A013", name: "KANTONG 04", qty: 1500, category: "KAIN_SABLON" },
  { id: "M50", date: "2026-02-18", code: "A011", name: "BADAN 04", qty: 1000, category: "KAIN_SABLON" },
  { id: "M51", date: "2026-02-18", code: "A013", name: "KANTONG 04", qty: 500, category: "KAIN_SABLON" },
  { id: "M52", date: "2026-02-19", code: "A011", name: "BADAN 04", qty: 2500, category: "KAIN_SABLON" },
  { id: "M53", date: "2026-02-19", code: "A013", name: "KANTONG 04", qty: 1500, category: "KAIN_SABLON" },
  { id: "M54", date: "2026-02-19", code: "A004", name: "HANGTAG JKS", qty: 2200, category: "AKSESORIS" },
  { id: "M55", date: "2026-02-19", code: "A003", name: "HANGTAG JKG", qty: 6200, category: "AKSESORIS" },
  { id: "M56", date: "2026-02-19", code: "A011", name: "BADAN 04", qty: 2000, category: "KAIN_SABLON" },
  { id: "M57", date: "2026-02-19", code: "A013", name: "KANTONG 04", qty: 4000, category: "KAIN_SABLON" },
  { id: "M58", date: "2026-02-20", code: "A011", name: "BADAN 04", qty: 2500, category: "KAIN_SABLON" },
  { id: "M59", date: "2026-02-20", code: "A013", name: "KANTONG 04", qty: 1000, category: "KAIN_SABLON" },
  { id: "M60", date: "2026-02-20", code: "A011", name: "BADAN 04", qty: 483, category: "KAIN_SABLON" },
  { id: "M61", date: "2026-02-20", code: "A004", name: "HANGTAG JKS", qty: 2400, category: "AKSESORIS" },
  { id: "M62", date: "2026-02-20", code: "A003", name: "HANGTAG JKG", qty: 2400, category: "AKSESORIS" },
  { id: "M63", date: "2026-02-21", code: "A002", name: "TUTUP KANTONG 03", qty: 2500, category: "KAIN_SABLON" },
  { id: "M64", date: "2026-02-21", code: "A013", name: "KANTONG 04", qty: 81, category: "KAIN_SABLON" },
  { id: "M65", date: "2026-02-23", code: "A002", name: "TUTUP KANTONG 03", qty: 2125, category: "KAIN_SABLON" },
  { id: "M66", date: "2026-02-23", code: "A011", name: "BADAN 04", qty: 100, category: "KAIN_SABLON" },
  { id: "M67", date: "2026-02-23", code: "A004", name: "HANGTAG JKS", qty: 7705, category: "AKSESORIS" },
  { id: "M68", date: "2026-02-23", code: "A003", name: "HANGTAG JKG", qty: 1700, category: "AKSESORIS" },
  { id: "M69", date: "2026-02-23", code: "A007", name: "LOGO AYBE", qty: 1500, category: "AKSESORIS" },
  { id: "M70", date: "2026-02-24", code: "A002", name: "TUTUP KANTONG 03", qty: 333, category: "KAIN_SABLON" },
  { id: "M71", date: "2026-02-24", code: "A007", name: "LOGO AYBE", qty: 2100, category: "AKSESORIS" },
  { id: "M72", date: "2026-02-25", code: "A007", name: "LOGO AYBE", qty: 2000, category: "AKSESORIS" },
  { id: "M73", date: "2026-02-27", code: "A007", name: "LOGO AYBE", qty: 4400, category: "AKSESORIS" },
  { id: "M74", date: "2026-03-01", code: "A007", name: "LOGO AYBE", qty: 3000, category: "AKSESORIS" },
  { id: "M75", date: "2026-03-02", code: "A007", name: "LOGO AYBE", qty: 2000, category: "AKSESORIS" },
  { id: "M76", date: "2026-03-04", code: "A002", name: "TUTUP KANTONG 03", qty: 100, category: "KAIN_SABLON" },
  { id: "M77", date: "2026-03-04", code: "A011", name: "BADAN 04", qty: 100, category: "KAIN_SABLON" },
  { id: "M78", date: "2026-03-04", code: "A013", name: "KANTONG 04", qty: 100, category: "KAIN_SABLON" },
  { id: "M79", date: "2026-03-04", code: "A007", name: "LOGO AYBE", qty: 2000, category: "AKSESORIS" },
  { id: "M80", date: "2026-03-05", code: "A007", name: "LOGO AYBE", qty: 3015, category: "AKSESORIS" },
  { id: "M81", date: "2026-03-10", code: "A016", name: "BADAN 04 GRD", qty: 500, category: "GRD" },
  { id: "M82", date: "2026-03-10", code: "A015", name: "KANTONG 04 GRD", qty: 1500, category: "GRD" },
  { id: "M83", date: "2026-03-10", code: "A017", name: "MIKA 03 GRD", qty: 800, category: "GRD" },
  { id: "M84", date: "2026-03-10", code: "A016", name: "BADAN 04 GRD", qty: 700, category: "GRD" },
  { id: "M85", date: "2026-03-10", code: "A014", name: "TUTUP KANTONG 03 GRD", qty: 800, category: "GRD" },
  { id: "M86", date: "2026-03-11", code: "A014", name: "TUTUP KANTONG 03 GRD", qty: 500, category: "GRD" },
  { id: "M87", date: "2026-03-11", code: "A017", name: "MIKA 03 GRD", qty: 1270, category: "GRD" },
  { id: "M88", date: "2026-03-11", code: "A016", name: "BADAN 04 GRD", qty: 1000, category: "GRD" },
  { id: "M89", date: "2026-03-11", code: "A015", name: "KANTONG 04 GRD", qty: 1000, category: "GRD" },
  { id: "M90", date: "2026-03-12", code: "A016", name: "BADAN 04 GRD", qty: 1000, category: "GRD" },
  { id: "M91", date: "2026-03-12", code: "A015", name: "KANTONG 04 GRD", qty: 1000, category: "GRD" },
  { id: "M92", date: "2026-03-12", code: "A018", name: "HANGTAG BTJ", qty: 1000, category: "AKSESORIS" },
  { id: "M93", date: "2026-03-12", code: "A019", name: "BOOKLET GARUDA", qty: 1000, category: "AKSESORIS" },
  { id: "M94", date: "2026-03-12", code: "A020", name: "SERAH TERIMA BARANG", qty: 1, category: "AKSESORIS" },
  { id: "M95", date: "2026-03-12", code: "A015", name: "KANTONG 04 GRD", qty: 2144, category: "GRD" },
  { id: "M96", date: "2026-03-12", code: "A016", name: "BADAN 04 GRD", qty: 1000, category: "GRD" },
  { id: "M97", date: "2026-03-12", code: "A014", name: "TUTUP KANTONG 03 GRD", qty: 1500, category: "GRD" },
  { id: "M98", date: "2026-03-13", code: "A016", name: "BADAN 04 GRD", qty: 1000, category: "GRD" },
  { id: "M99", date: "2026-03-13", code: "A014", name: "TUTUP KANTONG 03 GRD", qty: 1500, category: "GRD" },
  { id: "M100", date: "2026-03-14", code: "A017", name: "MIKA 03 GRD", qty: 1800, category: "GRD" },
  { id: "M101", date: "2026-03-14", code: "A019", name: "BOOKLET GARUDA", qty: 2250, category: "AKSESORIS" },
  { id: "M102", date: "2026-03-14", code: "A018", name: "HANGTAG BTJ", qty: 4600, category: "AKSESORIS" },
  { id: "M103", date: "2026-03-14", code: "A017", name: "MIKA 03 GRD", qty: 688, category: "GRD" },
  { id: "M104", date: "2026-03-15", code: "A014", name: "TUTUP KANTONG 03 GRD", qty: 1250, category: "GRD" },
  { id: "M105", date: "2026-03-15", code: "A016", name: "BADAN 04 GRD", qty: 400, category: "GRD" },
  { id: "M106", date: "2026-03-16", code: "A017", name: "MIKA 03 GRD", qty: 950, category: "GRD" },
  { id: "M107", date: "2026-03-16", code: "A019", name: "BOOKLET GARUDA", qty: 1850, category: "AKSESORIS" },
  { id: "M108", date: "2026-03-16", code: "A002", name: "TUTUP KANTONG 03", qty: 170, category: "KAIN_SABLON" },
  { id: "M109", date: "2026-03-31", code: "A019", name: "BOOKLET GARUDA", qty: 400, category: "AKSESORIS" },
  { id: "M110", date: "2026-04-04", code: "A017", name: "MIKA 03 GRD", qty: 34, category: "GRD" },
  { id: "M111", date: "2026-04-04", code: "A019", name: "BOOKLET GARUDA", qty: 10, category: "AKSESORIS" },
];

// Log Barang Keluar (Kirim Bahan Potongan ke Subkon Sablon)
const LOG_KELUAR: LogEntry[] = [
  { id: "K01", date: "2026-02-02", code: "A005", name: "MIKA 03", qty: 16000, category: "KAIN_SABLON" },
  { id: "K02", date: "2026-02-02", code: "A002", name: "TUTUP KANTONG 03", qty: 5395, category: "KAIN_SABLON" },
  { id: "K03", date: "2026-02-03", code: "A011", name: "BADAN 04", qty: 2400, category: "KAIN_SABLON" },
  { id: "K04", date: "2026-02-03", code: "A013", name: "KANTONG 04", qty: 2300, category: "KAIN_SABLON" },
  { id: "K05", date: "2026-02-05", code: "A011", name: "BADAN 04", qty: 1800, category: "KAIN_SABLON" },
  { id: "K06", date: "2026-02-05", code: "A013", name: "KANTONG 04", qty: 1000, category: "KAIN_SABLON" },
  { id: "K07", date: "2026-02-06", code: "A002", name: "TUTUP KANTONG 03", qty: 3575, category: "KAIN_SABLON" },
  { id: "K08", date: "2026-02-07", code: "A013", name: "KANTONG 04", qty: 2000, category: "KAIN_SABLON" },
  { id: "K09", date: "2026-02-07", code: "A011", name: "BADAN 04", qty: 2000, category: "KAIN_SABLON" },
  { id: "K10", date: "2026-02-08", code: "A005", name: "MIKA 03", qty: 2100, category: "KAIN_SABLON" },
  { id: "K11", date: "2026-02-08", code: "A002", name: "TUTUP KANTONG 03", qty: 2000, category: "KAIN_SABLON" },
  { id: "K12", date: "2026-02-09", code: "A005", name: "MIKA 03", qty: 5000, category: "KAIN_SABLON" },
  { id: "K13", date: "2026-02-09", code: "A011", name: "BADAN 04", qty: 2100, category: "KAIN_SABLON" },
  { id: "K14", date: "2026-02-09", code: "A013", name: "KANTONG 04", qty: 3000, category: "KAIN_SABLON" },
  { id: "K15", date: "2026-02-11", code: "A013", name: "KANTONG 04", qty: 3000, category: "KAIN_SABLON" },
  { id: "K16", date: "2026-02-11", code: "A011", name: "BADAN 04", qty: 2000, category: "KAIN_SABLON" },
  { id: "K17", date: "2026-02-12", code: "A002", name: "TUTUP KANTONG 03", qty: 7140, category: "KAIN_SABLON" },
  { id: "K18", date: "2026-02-13", code: "A011", name: "BADAN 04", qty: 3000, category: "KAIN_SABLON" },
  { id: "K19", date: "2026-02-13", code: "A013", name: "KANTONG 04", qty: 3000, category: "KAIN_SABLON" },
  { id: "K20", date: "2026-02-15", code: "A011", name: "BADAN 04", qty: 4600, category: "KAIN_SABLON" },
  { id: "K21", date: "2026-02-16", code: "A011", name: "BADAN 04", qty: 1900, category: "KAIN_SABLON" },
  { id: "K22", date: "2026-02-16", code: "A013", name: "KANTONG 04", qty: 4000, category: "KAIN_SABLON" },
  { id: "K23", date: "2026-02-17", code: "A013", name: "KANTONG 04", qty: 4500, category: "KAIN_SABLON" },
  { id: "K24", date: "2026-02-18", code: "A011", name: "BADAN 04", qty: 2800, category: "KAIN_SABLON" },
  { id: "K25", date: "2026-02-19", code: "A002", name: "TUTUP KANTONG 03", qty: 4600, category: "KAIN_SABLON" },
  { id: "K26", date: "2026-02-19", code: "A011", name: "BADAN 04", qty: 100, category: "KAIN_SABLON" },
  { id: "K27", date: "2026-02-21", code: "A011", name: "BADAN 04", qty: 100, category: "KAIN_SABLON" },
  { id: "K28", date: "2026-03-07", code: "A014", name: "TUTUP KANTONG 03 GRD", qty: 5600, category: "GRD" },
  { id: "K29", date: "2026-03-07", code: "A015", name: "KANTONG 04 GRD", qty: 5380, category: "GRD" },
  { id: "K30", date: "2026-03-07", code: "A016", name: "BADAN 04 GRD", qty: 4024, category: "GRD" },
];

export function SablonSubkonMonitoring() {
  const [activeTab, setActiveTab] = useState<"REKAP_SABLON" | "AKSESORIS" | "LOG_MASUK" | "LOG_KELUAR">("REKAP_SABLON");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCode, setFilterCode] = useState("ALL");

  // Summary Metrics
  const totalSentKain = useMemo(() => SABLON_SUMMARY.reduce((acc, r) => acc + r.sentToSablon, 0), []);
  const totalReturnedKain = useMemo(() => SABLON_SUMMARY.reduce((acc, r) => acc + r.returnedFromSablon, 0), []);
  const totalAccessoryReceived = useMemo(() => ACCESSORIES_SUMMARY.reduce((acc, r) => acc + r.receivedQty, 0), []);
  const totalAccessoryMrWu = useMemo(() => ACCESSORIES_SUMMARY.reduce((acc, r) => acc + r.issuedToMrWuQty, 0), []);

  const filteredLogMasuk = useMemo(() => {
    return LOG_MASUK.filter((l) => {
      if (filterCode !== "ALL" && l.code !== filterCode) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q) || l.date.includes(q);
      }
      return true;
    });
  }, [filterCode, searchTerm]);

  const filteredLogKeluar = useMemo(() => {
    return LOG_KELUAR.filter((l) => {
      if (filterCode !== "ALL" && l.code !== filterCode) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q) || l.date.includes(q);
      }
      return true;
    });
  }, [filterCode, searchTerm]);

  return (
    <div className="space-y-4">
      {/* 4 KARTU METRIK UTAMA */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 p-4 shadow-2xs">
          <span className="text-xs font-semibold text-blue-900 block">Kain Dikirim ke Sablon</span>
          <p className="mt-1 text-2xl font-black text-blue-700 font-mono">
            {formatNumber(totalSentKain)} <span className="text-xs font-normal text-slate-500">pcs</span>
          </p>
          <span className="text-[11px] text-slate-500 mt-1 block">Haji 2026 + Garuda</span>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 p-4 shadow-2xs">
          <span className="text-xs font-semibold text-emerald-900 block">Hasil Sablon Diterima</span>
          <p className="mt-1 text-2xl font-black text-emerald-700 font-mono">
            {formatNumber(totalReturnedKain)} <span className="text-xs font-normal text-slate-500">pcs</span>
          </p>
          <span className="text-[11px] text-emerald-700 mt-1 block font-semibold">✅ Siap masuk produksi</span>
        </div>

        <div className="rounded-2xl border border-purple-200/80 bg-gradient-to-br from-purple-50/80 to-fuchsia-50/40 p-4 shadow-2xs">
          <span className="text-xs font-semibold text-purple-900 block">Aksesoris Buaran Masuk</span>
          <p className="mt-1 text-2xl font-black text-purple-700 font-mono">
            {formatNumber(totalAccessoryReceived)} <span className="text-xs font-normal text-slate-500">pcs</span>
          </p>
          <span className="text-[11px] text-slate-500 mt-1 block">Hangtag, Logo, Booklet</span>
        </div>

        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-orange-50/40 p-4 shadow-2xs">
          <span className="text-xs font-semibold text-amber-900 block">Transfer ke Pabrik Mitra MR WU</span>
          <p className="mt-1 text-2xl font-black text-amber-700 font-mono">
            {formatNumber(totalAccessoryMrWu)} <span className="text-xs font-normal text-slate-500">pcs</span>
          </p>
          <span className="text-[11px] text-amber-800 mt-1 block font-semibold">Pabrik Rekanan Kerjasama</span>
        </div>
      </div>

      {/* HEADER NAVIGASI TAB */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => { setActiveTab("REKAP_SABLON"); setSearchTerm(""); setFilterCode("ALL"); }}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs ${
              activeTab === "REKAP_SABLON"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            🎨 Rekap Stok di Sablon ({SABLON_SUMMARY.length})
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("AKSESORIS"); setSearchTerm(""); setFilterCode("ALL"); }}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs ${
              activeTab === "AKSESORIS"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            🏷️ Aksesoris Buaran ➔ Pabrik Mitra MR WU ({ACCESSORIES_SUMMARY.length})
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("LOG_MASUK"); setSearchTerm(""); setFilterCode("ALL"); }}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs ${
              activeTab === "LOG_MASUK"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            📥 Log Barang Masuk ({LOG_MASUK.length})
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("LOG_KELUAR"); setSearchTerm(""); setFilterCode("ALL"); }}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs ${
              activeTab === "LOG_KELUAR"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            📤 Log Bahan Keluar ({LOG_KELUAR.length})
          </button>
        </div>

        {/* Toolbar Search / Filter */}
        {(activeTab === "LOG_MASUK" || activeTab === "LOG_KELUAR") && (
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Cari tanggal / kode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
            />
            <select
              value={filterCode}
              onChange={(e) => setFilterCode(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Semua Item</option>
              <option value="A005">A005 · MIKA 03</option>
              <option value="A002">A002 · TUTUP KANTONG 03</option>
              <option value="A011">A011 · BADAN 04</option>
              <option value="A013">A013 · KANTONG 04</option>
              <option value="A014">A014 · TUTUP KANTONG GRD</option>
              <option value="A015">A015 · KANTONG GRD</option>
              <option value="A016">A016 · BADAN GRD</option>
              <option value="A017">A017 · MIKA GRD</option>
              <option value="A004">A004 · HANGTAG JKS</option>
              <option value="A003">A003 · HANGTAG JKG</option>
              <option value="A007">A007 · LOGO AYBE</option>
              <option value="A018">A018 · HANGTAG BTJ</option>
              <option value="A019">A019 · BOOKLET GARUDA</option>
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: REKAP BAHAN SABLON (KAIN POTONGAN & GRD) */}
      {activeTab === "REKAP_SABLON" && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
                  <th className="p-3">Kode</th>
                  <th className="p-3">Nama Barang / Pola</th>
                  <th className="p-3">Kategori</th>
                  <th className="p-3 text-right">Stok Terpotong (Cutting)</th>
                  <th className="p-3 text-right">Bahan Keluar (ke Sablon)</th>
                  <th className="p-3 text-right">Hasil Sablon (Masuk)</th>
                  <th className="p-3 text-right">Tersisa di Sablon</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {SABLON_SUMMARY.map((r) => {
                  const isDone = r.returnedFromSablon >= r.sentToSablon;
                  const isGaruda = r.variant === "GARUDA";

                  return (
                    <tr key={r.code} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-mono font-bold text-blue-700">{r.code}</td>
                      <td className="p-3">
                        <b className="text-slate-900 font-semibold">{r.name}</b>
                        {r.notes ? <p className="text-[11px] text-slate-500 mt-0.5">{r.notes}</p> : null}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                            isGaruda
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-blue-50 text-blue-800 border-blue-200"
                          }`}
                        >
                          {isGaruda ? "GARUDA (TERPISAH)" : "HAJI 2026"}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600">
                        {r.stockCut ? `${formatNumber(r.stockCut)} ${r.unit}` : "-"}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-800">
                        {formatNumber(r.sentToSablon)} {r.unit}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-emerald-700">
                        {formatNumber(r.returnedFromSablon)} {r.unit}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        <span className={r.remainingInSablon < 0 ? "text-rose-600" : "text-blue-700"}>
                          {r.remainingInSablon > 0 ? `+${formatNumber(r.remainingInSablon)}` : formatNumber(r.remainingInSablon)} {r.unit}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {isDone ? (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            SELESAI
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                            PROSES
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900 shadow-2xs">
            <b className="font-bold block mb-1">💡 Catatan Alur Potongan ke Sablon:</b>
            <p className="text-slate-600">
              Komponen `MIKA 03`, `TUTUP KANTONG 03`, dan `KANTONG 04` memiliki rasio potong 2x per tas (~45.000 pcs), namun yang dikirim ke Sablon adalah tepat separuhnya (~22.800 pcs) karena hanya 1 sisi bagian luar yang disablon logo, sedangkan 1 sisi lainnya tetap polos masuk langsung ke perakitan.
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: AKSESORIS / BARANG JADI BUARAN & MR WU */}
      {activeTab === "AKSESORIS" && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
                  <th className="p-3">Kode</th>
                  <th className="p-3">Nama Barang / Aksesoris</th>
                  <th className="p-3 text-right">Barang Masuk (dari Buaran)</th>
                  <th className="p-3 text-right">Transfer Keluar (Pabrik Mitra MR WU)</th>
                  <th className="p-3 text-right">Tersisa di Buaran</th>
                  <th className="p-3">Keterangan Alur</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ACCESSORIES_SUMMARY.map((r) => {
                  const isBalanceZero = r.remainingAtBuaran === 0;

                  return (
                    <tr key={r.code} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-mono font-bold text-purple-700">{r.code}</td>
                      <td className="p-3">
                        <b className="text-slate-900 font-semibold">{r.name}</b>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-purple-700">
                        {formatNumber(r.receivedQty)} {r.unit}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-amber-700">
                        {r.issuedToMrWuQty > 0 ? `${formatNumber(r.issuedToMrWuQty)} ${r.unit}` : "-"}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        <span className={r.remainingAtBuaran < 0 ? "text-rose-600" : isBalanceZero ? "text-slate-400" : "text-emerald-700"}>
                          {formatNumber(r.remainingAtBuaran)} {r.unit}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">{r.notes}</td>
                      <td className="p-3 text-center">
                        {isBalanceZero ? (
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">
                            SEIMBANG (0)
                          </span>
                        ) : r.remainingAtBuaran > 0 ? (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            ADA SISA
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                            SELISIH (-15)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4 text-xs text-purple-950 shadow-2xs">
            <b className="font-bold block mb-1">🏷️ Informasi Alur Barang Jadi (Supplier Sablon Buaran):</b>
            <p className="text-slate-600">
              Barang aksesoris cetak di atas dipesan jadi langsung dari supplier sablon di Buaran. Begitu masuk, barang dialirkan ke <b>Pabrik Mitra Kerja Sama (MR WU)</b> untuk proses kelengkapan dan perakitan tas.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: LOG BARANG MASUK DARI SUBKON */}
      {activeTab === "LOG_MASUK" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Ditemukan <b>{filteredLogMasuk.length}</b> transaksi penerimaan dari subkon</span>
            <span>
              Total Diterima:{" "}
              <b className="font-mono text-emerald-700">
                {formatNumber(filteredLogMasuk.reduce((acc, l) => acc + l.qty, 0))} pcs
              </b>
            </span>
          </div>

          <div className="max-h-[500px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr className="border-b border-slate-200 font-bold text-slate-700">
                  <th className="p-2.5">No</th>
                  <th className="p-2.5">Tanggal</th>
                  <th className="p-2.5">Kode</th>
                  <th className="p-2.5">Nama Barang / Item</th>
                  <th className="p-2.5">Kategori</th>
                  <th className="p-2.5 text-right">Jumlah Masuk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogMasuk.map((l, idx) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition">
                    <td className="p-2.5 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                    <td className="p-2.5 font-medium text-slate-800">{l.date}</td>
                    <td className="p-2.5 font-mono font-bold text-blue-700">{l.code}</td>
                    <td className="p-2.5 font-semibold text-slate-900">{l.name}</td>
                    <td className="p-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.2 text-[9px] font-bold border ${
                          l.category === "AKSESORIS"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : l.category === "GRD"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}
                      >
                        {l.category}
                      </span>
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-emerald-700">
                      +{formatNumber(l.qty)} PCS
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LOG BAHAN KELUAR KE SUBKON */}
      {activeTab === "LOG_KELUAR" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Ditemukan <b>{filteredLogKeluar.length}</b> transaksi pengiriman bahan potongan</span>
            <span>
              Total Terkirim:{" "}
              <b className="font-mono text-blue-700">
                {formatNumber(filteredLogKeluar.reduce((acc, l) => acc + l.qty, 0))} pcs
              </b>
            </span>
          </div>

          <div className="max-h-[500px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr className="border-b border-slate-200 font-bold text-slate-700">
                  <th className="p-2.5">No</th>
                  <th className="p-2.5">Tanggal</th>
                  <th className="p-2.5">Kode</th>
                  <th className="p-2.5">Nama Barang / Item</th>
                  <th className="p-2.5">Kategori</th>
                  <th className="p-2.5 text-right">Jumlah Keluar ke Sablon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogKeluar.map((l, idx) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition">
                    <td className="p-2.5 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                    <td className="p-2.5 font-medium text-slate-800">{l.date}</td>
                    <td className="p-2.5 font-mono font-bold text-amber-700">{l.code}</td>
                    <td className="p-2.5 font-semibold text-slate-900">{l.name}</td>
                    <td className="p-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.2 text-[9px] font-bold border ${
                          l.category === "GRD"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}
                      >
                        {l.category}
                      </span>
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-amber-800">
                      -{formatNumber(l.qty)} PCS
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
