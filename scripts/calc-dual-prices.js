const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

// Master data tarif untuk Paspor & Ransel
// Paspor:
const pasporTarif = {
  37: { name: 'TP01 - PASANG SELETING MIKA KANTONG DEPAN 03', opPrice: 100, propPrice: 200 },
  38: { name: 'TP02 - PASANG SELETING MIKA KANTONG BELAKANG 03', opPrice: 100, propPrice: 200 },
  39: { name: 'TP03 - TEMPEL KANTONG BADAN DEPAN 03', opPrice: 75, propPrice: 175 },
  40: { name: 'TP04 - TEMPEL KANTONG BADAN BELAKANG 03', opPrice: 75, propPrice: 175 },
  41: { name: 'TP05 - PASANG LAPISAN BDN DPN + JAHIT MIKA + TALI 03', opPrice: 175, propPrice: 275 },
  42: { name: 'TP06 - BUNGKUS JARING 03', opPrice: 70, propPrice: 170 },
  43: { name: 'TP07 - PASANG JARING LAPISAN BADAN BLKNG 03', opPrice: 75, propPrice: 175 },
  44: { name: 'TP08 - PASANG LAPISAN BDN BLKNG + JAHIT MIKA 03', opPrice: 175, propPrice: 275 },
  46: { name: 'TP10 - REMPEL PIYEN + LAPISAN PIYEN 03', opPrice: 50, propPrice: 120 },
  47: { name: 'TP11 - SAMBUNG PIYEN + MULUT + WEBBING 03', opPrice: 250, propPrice: 350 },
  50: { name: 'TP14 - JAHIT TUTUP + TALI KUNCI SODOK 03', opPrice: 190, propPrice: 290 },
  51: { name: 'TP15 - STIK TUTUP 03', opPrice: 200, propPrice: 300 },
  52: { name: 'TP16 - TEMPEL TUTUP KEBADAN BELAKANG 03', opPrice: 50, propPrice: 150 },
  56: { name: 'TP20 - PASANG RING JALAN 03', opPrice: 30, propPrice: 130 },
  57: { name: 'TP21 - JAHIT WEBBING RING JALAN 03', opPrice: 50, propPrice: 150 },
  60: { name: 'TP24 - SETEL BADAN DEPAN + BUNGKUS 03', opPrice: 700, propPrice: 800 },
  61: { name: 'TP25 - SETEL BADAN BELAKANG + BUNGKUS 03', opPrice: 700, propPrice: 800 },
  65: { name: 'TP29 - TEKUK MULUT SLETING X2 03', opPrice: 80, propPrice: 80 },
  66: { name: 'TP30 - JAHIT SLETING MULUT 03', opPrice: 150, propPrice: 150 }
};

// Ransel:
const ranselTarif = {
  68: { name: 'RN01 - PASANG STOPAN SLETING 04', opPrice: 60, propPrice: 160 },
  69: { name: 'RN02 - PASANG SELETING SAMBUNGAN KANTONG 04', opPrice: 225, propPrice: 325 },
  70: { name: 'RN03 - PASANG SELETING KANTONG 04', opPrice: 225, propPrice: 325 },
  71: { name: 'RN04 - PONCOT KANTONG 04 2X', opPrice: 160, propPrice: 260 },
  72: { name: 'RN05 - JAHIT KELILING KANTONG 04', opPrice: 100, propPrice: 200 },
  76: { name: 'RN09 - TEMPEL KANTONG + GANTUNGAN 04', opPrice: 400, propPrice: 500 },
  77: { name: 'RN10 - SAMBUNG BADAN DEPAN + BUNGKUS 04 2X', opPrice: 125, propPrice: 225 },
  79: { name: 'RN12 - BUNGKUS JARING 04 2X', opPrice: 100, propPrice: 200 },
  80: { name: 'RN13 - TEMPEL JARING 04 2X', opPrice: 150, propPrice: 250 },
  82: { name: 'RN15 - TEMPEL MIKA 04', opPrice: 150, propPrice: 250 },
  84: { name: 'RN17 - BUAT SEGITIGA + WEBBING 04 2X', opPrice: 100, propPrice: 200 },
  85: { name: 'RN18 - PASANG RING JALAN 04 2X', opPrice: 30, propPrice: 130 },
  86: { name: 'RN19 - JAHIT RING JALAN 04 2X', opPrice: 50, propPrice: 150 },
  88: { name: 'RN21 - JAHIT KUPINGAN TALI 04 2X', opPrice: 100, propPrice: 200 },
  90: { name: 'RN23 - TEMPEL TALI BADAN BELAKANG 04', opPrice: 100, propPrice: 200 },
  91: { name: 'RN24 - TEMPEL SEGITIGA 04', opPrice: 100, propPrice: 200 },
  95: { name: 'RN28 - SETEL BADAN BELAKANG + BUNGKUS 04', opPrice: 800, propPrice: 900 }
};

// Data Qty yang diinput:
const pasporData = [
  { op: 'FAISAL TANJUNG', code: 'OP063', id: 37, qty: 209 },
  { op: 'FAISAL TANJUNG', code: 'OP063', id: 39, qty: 210 },
  { op: 'ROHAELI', code: 'OP010', id: 38, qty: 209 },
  { op: 'ROHAELI', code: 'OP010', id: 40, qty: 209 },
  { op: 'ROHAELI', code: 'OP010', id: 42, qty: 200 },
  { op: 'ROHAELI', code: 'OP010', id: 50, qty: 238 },
  { op: 'ROHAELI', code: 'OP010', id: 51, qty: 239 },
  { op: 'ROHAELI', code: 'OP010', id: 52, qty: 209 },
  { op: 'ROHAELI', code: 'OP010', id: 60, qty: 210 },
  { op: 'ROHAELI', code: 'OP010', id: 61, qty: 210 },
  { op: 'RIKA', code: 'OP003', id: 41, qty: 100 },
  { op: 'RIKA', code: 'OP003', id: 43, qty: 209 },
  { op: 'RIKA', code: 'OP003', id: 44, qty: 209 },
  { op: 'NUR ROHMAH', code: 'OP002', id: 41, qty: 100 },
  { op: 'NUR ROHMAH', code: 'OP002', id: 46, qty: 210 },
  { op: 'NUR ROHMAH', code: 'OP002', id: 56, qty: 210 },
  { op: 'NUR ROHMAH', code: 'OP002', id: 57, qty: 210 },
  { op: 'NUR ROHMAH', code: 'OP002', id: 65, qty: 420 },
  { op: 'NUR ROHMAH', code: 'OP002', id: 66, qty: 210 },
  { op: 'HAMIDAH', code: 'OP006', id: 47, qty: 206 }
];

const ranselData = [
  { op: 'ASIAH', code: 'OP005', id: 68, qty: 150 },
  { op: 'ASIAH', code: 'OP005', id: 69, qty: 150 },
  { op: 'ASIAH', code: 'OP005', id: 70, qty: 199 },
  { op: 'ASIAH', code: 'OP005', id: 71, qty: 438 },
  { op: 'ASIAH', code: 'OP005', id: 72, qty: 148 },
  { op: 'ASIAH', code: 'OP005', id: 76, qty: 210 },
  { op: 'HAMIDAH', code: 'OP006', id: 70, qty: 40 },
  { op: 'HAMIDAH', code: 'OP006', id: 71, qty: 40 },
  { op: 'HAMIDAH', code: 'OP006', id: 72, qty: 40 },
  { op: 'HAMIDAH', code: 'OP006', id: 76, qty: 40 },
  { op: 'HAMIDAH', code: 'OP006', id: 77, qty: 320 },
  { op: 'RIKA', code: 'OP003', id: 72, qty: 57 },
  { op: 'RIKA', code: 'OP003', id: 80, qty: 422 },
  { op: 'NUR ROHMAH', code: 'OP002', id: 77, qty: 140 },
  { op: 'NUR ROHMAH', code: 'OP002', id: 79, qty: 400 },
  { op: 'FAISAL TANJUNG', code: 'OP063', id: 82, qty: 22 },
  { op: 'FAISAL TANJUNG', code: 'OP063', id: 84, qty: 22 },
  { op: 'FAISAL TANJUNG', code: 'OP063', id: 85, qty: 22 },
  { op: 'FAISAL TANJUNG', code: 'OP063', id: 86, qty: 22 },
  { op: 'FAISAL TANJUNG', code: 'OP063', id: 88, qty: 22 },
  { op: 'FAISAL TANJUNG', code: 'OP063', id: 90, qty: 22 },
  { op: 'FAISAL TANJUNG', code: 'OP063', id: 91, qty: 22 },
  { op: 'FAISAL TANJUNG', code: 'OP063', id: 95, qty: 28 }
];

console.log('=== 1. PENGAJUAN TAS PASPOR (HARGA PENGAJUAN) ===');
let totPengajuanPaspor = 0;
pasporData.forEach(d => {
  const t = pasporTarif[d.id];
  const val = d.qty * t.propPrice;
  totPengajuanPaspor += val;
});
console.log('Total Pengajuan Tas Paspor:', totPengajuanPaspor.toLocaleString('id-ID'));

console.log('\n=== 2. PENGAJUAN TAS RANSEL (HARGA PENGAJUAN) ===');
let totPengajuanRansel = 0;
ranselData.forEach(d => {
  const t = ranselTarif[d.id];
  const val = d.qty * t.propPrice;
  totPengajuanRansel += val;
});
console.log('Total Pengajuan Tas Ransel:', totPengajuanRansel.toLocaleString('id-ID'));

console.log('\n=== 3. PENGGAJIAN REAL OPERATOR (HARGA OPERATOR - GABUNGAN) ===');
const realPayroll = {};
let grandTotalReal = 0;

pasporData.forEach(d => {
  const t = pasporTarif[d.id];
  const val = d.qty * t.opPrice;
  if (!realPayroll[d.op]) realPayroll[d.op] = { code: d.code, paspor: 0, ransel: 0, total: 0 };
  realPayroll[d.op].paspor += val;
  realPayroll[d.op].total += val;
  grandTotalReal += val;
});

ranselData.forEach(d => {
  const t = ranselTarif[d.id];
  const val = d.qty * t.opPrice;
  if (!realPayroll[d.op]) realPayroll[d.op] = { code: d.code, paspor: 0, ransel: 0, total: 0 };
  realPayroll[d.op].ransel += val;
  realPayroll[d.op].total += val;
  grandTotalReal += val;
});

for (const [name, row] of Object.entries(realPayroll)) {
  console.log(`${row.code} | ${name.padEnd(16)} | Paspor: Rp ${row.paspor.toLocaleString('id-ID').padStart(10)} | Ransel: Rp ${row.ransel.toLocaleString('id-ID').padStart(10)} | Gaji Real: Rp ${row.total.toLocaleString('id-ID').padStart(10)}`);
}

console.log(`\nTOTAL PENGGAJIAN REAL OPERATOR: Rp ${grandTotalReal.toLocaleString('id-ID')}`);
console.log(`TOTAL PENGAJUAN KESELURUHAN (PASPOR + RANSEL): Rp ${(totPengajuanPaspor + totPengajuanRansel).toLocaleString('id-ID')}`);
console.log(`SELISIH / MARGIN KAS JAHIT: Rp ${(totPengajuanPaspor + totPengajuanRansel - grandTotalReal).toLocaleString('id-ID')}`);
