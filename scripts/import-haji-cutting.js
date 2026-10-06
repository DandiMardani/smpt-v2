const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const COMPONENTS = [
  // TAS PASPOR (product_id: 3)
  { code: 'A001', name: 'BADAN 2X 03', product_id: 3, qty_per_product: 2, unit: 'PCS', color: 'ABU', target_total: 45200 },
  { code: 'A002', name: 'TUTUP 2X 03', product_id: 3, qty_per_product: 2, unit: 'PCS', color: 'ABU', target_total: 45200 },
  { code: 'A003', name: 'PIYEN PANTAT 03', product_id: 3, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A004', name: 'MULUTAN 2X 03', product_id: 3, qty_per_product: 2, unit: 'PCS', color: 'ABU', target_total: 45200 },
  { code: 'A005', name: 'MIKA 03', product_id: 3, qty_per_product: 2, unit: 'PCS', color: 'BENING', target_total: 45200 },
  { code: 'A006', name: 'JARING 03', product_id: 3, qty_per_product: 1, unit: 'PCS', color: 'HITAM', target_total: 22600 },
  { code: 'A007', name: 'LAPIS BADAN 2X 03', product_id: 3, qty_per_product: 2, unit: 'PCS', color: 'ABU', target_total: 45200 },
  { code: 'A008', name: 'LAPIS PIYEN 03', product_id: 3, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A009', name: 'LAPIS MULUTAN 2X 03', product_id: 3, qty_per_product: 2, unit: 'PCS', color: 'ABU', target_total: 45200 },

  // TAS RANSEL (product_id: 4)
  { code: 'A010', name: 'BADAN BELAKANG 04', product_id: 4, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A011', name: 'BADAN ATAS 04', product_id: 4, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A012', name: 'MULUTAN 04', product_id: 4, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A013', name: 'KANTONG DEPAN 2X 04', product_id: 4, qty_per_product: 2, unit: 'PCS', color: 'ABU', target_total: 45200 },
  { code: 'A014', name: 'SAMBUNGAN KANTONG DEPAN 2X 04', product_id: 4, qty_per_product: 2, unit: 'PCS', color: 'ABU', target_total: 45200 },
  { code: 'A015', name: 'SAMBUNGAN TALI PUNDAK 4X 04', product_id: 4, qty_per_product: 4, unit: 'PCS', color: 'ABU', target_total: 90400 },
  { code: 'A016', name: 'SEGITIGA 2X 04', product_id: 4, qty_per_product: 2, unit: 'PCS', color: 'ABU', target_total: 45200 },
  { code: 'A017', name: 'SAMBUNGAN KANTONG 04', product_id: 4, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A018', name: 'BADAN BAWAH 04', product_id: 4, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A019', name: 'PIYEN SAMPING A 04', product_id: 4, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A020', name: 'PIYEN SAMPING B 04', product_id: 4, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A021', name: 'MIKA 04', product_id: 4, qty_per_product: 1, unit: 'PCS', color: 'BENING', target_total: 22600 },
  { code: 'A022', name: 'JARING 2X 04', product_id: 4, qty_per_product: 2, unit: 'PCS', color: 'HITAM', target_total: 45200 },

  // LAPISAN HAJI 01 - 18 INCH (product_id: 1)
  { code: 'A023', name: 'KANTONG 01', product_id: 1, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A024', name: 'BADAN DEPAN 01', product_id: 1, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A025', name: 'BADAN BELAKANG 2X 01', product_id: 1, qty_per_product: 2, unit: 'PCS', color: 'ABU', target_total: 45200 },
  { code: 'A026', name: 'SAYAP 01', product_id: 1, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A027', name: 'JARING 01', product_id: 1, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },

  // LAPISAN HAJI 02 - 26 INCH (product_id: 2)
  { code: 'A028', name: 'KANTONG 02', product_id: 2, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A029', name: 'BADAN DEPAN 02', product_id: 2, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A030', name: 'BADAN BELAKANG 2X 02', product_id: 2, qty_per_product: 2, unit: 'PCS', color: 'ABU', target_total: 45200 },
  { code: 'A031', name: 'SAYAP 02', product_id: 2, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
  { code: 'A032', name: 'JARING 02', product_id: 2, qty_per_product: 1, unit: 'PCS', color: 'ABU', target_total: 22600 },
];

const DAILY_LOGS = [
  // Selasa, 03 Februari 2026
  { date: '2026-02-03', item: 'BADAN 2X 03', qty: 7020 },
  { date: '2026-02-03', item: 'TUTUP 2X 03', qty: 7020 },
  { date: '2026-02-03', item: 'MULUTAN 2X 03', qty: 7475 },
  { date: '2026-02-03', item: 'PIYEN PANTAT 03', qty: 3575 },
  { date: '2026-02-03', item: 'LAPIS BADAN 2X 03', qty: 35750 },
  { date: '2026-02-03', item: 'LAPIS PIYEN 03', qty: 18000 },
  { date: '2026-02-03', item: 'LAPIS MULUTAN 2X 03', qty: 42000 },
  { date: '2026-02-03', item: 'JARING 2X 04', qty: 22550 },
  { date: '2026-02-03', item: 'JARING 03', qty: 22800 },
  { date: '2026-02-03', item: 'MIKA 03', qty: 15000 },
  { date: '2026-02-03', item: 'KANTONG 01', qty: 10000 },
  { date: '2026-02-03', item: 'BADAN DEPAN 01', qty: 5000 },
  { date: '2026-02-03', item: 'BADAN BELAKANG 2X 01', qty: 10000 },
  { date: '2026-02-03', item: 'KANTONG 02', qty: 10000 },
  { date: '2026-02-03', item: 'BADAN DEPAN 02', qty: 5000 },
  { date: '2026-02-03', item: 'BADAN BELAKANG 2X 02', qty: 10000 },
  { date: '2026-02-03', item: 'JARING 01', qty: 10000 },
  { date: '2026-02-03', item: 'JARING 02', qty: 10000 },
  { date: '2026-02-03', item: 'BADAN BELAKANG 04', qty: 2600 },
  { date: '2026-02-03', item: 'SAMBUNGAN KANTONG 04', qty: 2400 },
  { date: '2026-02-03', item: 'KANTONG DEPAN 2X 04', qty: 2300 },
  { date: '2026-02-03', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 2500 },
  { date: '2026-02-03', item: 'BADAN ATAS 04', qty: 2400 },
  { date: '2026-02-03', item: 'PIYEN SAMPING A 04', qty: 2400 },
  { date: '2026-02-03', item: 'PIYEN SAMPING B 04', qty: 2400 },
  { date: '2026-02-03', item: 'SEGITIGA 2X 04', qty: 6200 },
  { date: '2026-02-03', item: 'MULUTAN 04', qty: 1900 },
  { date: '2026-02-03', item: 'BADAN BAWAH 04', qty: 1400 },
  { date: '2026-02-03', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 1500 },

  // Selasa, 3 Februari 2026 (batch 2)
  { date: '2026-02-03', item: 'BADAN 2X 03', qty: 3402 },
  { date: '2026-02-03', item: 'TUTUP 2X 03', qty: 3591 },
  { date: '2026-02-03', item: 'MULUTAN 2X 03', qty: 4158 },
  { date: '2026-02-03', item: 'PIYEN PANTAT 03', qty: 1810 },
  { date: '2026-02-03', item: 'MIKA 03', qty: 11500 },
  { date: '2026-02-03', item: 'MIKA 04', qty: 12000 },

  // Kamis, 5 Februari 2026
  { date: '2026-02-05', item: 'MIKA 04', qty: 10800 },
  { date: '2026-02-05', item: 'MIKA 03', qty: 5500 },
  { date: '2026-02-05', item: 'BADAN BELAKANG 04', qty: 2000 },
  { date: '2026-02-05', item: 'BADAN ATAS 04', qty: 1800 },
  { date: '2026-02-05', item: 'SAMBUNGAN KANTONG 04', qty: 1800 },
  { date: '2026-02-05', item: 'KANTONG DEPAN 2X 04', qty: 3600 },
  { date: '2026-02-05', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 6000 },
  { date: '2026-02-05', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 3200 },
  { date: '2026-02-05', item: 'PIYEN SAMPING A 04', qty: 2000 },
  { date: '2026-02-05', item: 'PIYEN SAMPING B 04', qty: 2000 },
  { date: '2026-02-05', item: 'SEGITIGA 2X 04', qty: 3200 },
  { date: '2026-02-05', item: 'BADAN BAWAH 04', qty: 2800 },
  { date: '2026-02-05', item: 'MULUTAN 04', qty: 2200 },

  // Jumat, 06 Februari 2026
  { date: '2026-02-06', item: 'BADAN 2X 03', qty: 7085 },
  { date: '2026-02-06', item: 'TUTUP 2X 03', qty: 7410 },
  { date: '2026-02-06', item: 'PIYEN PANTAT 03', qty: 3770 },
  { date: '2026-02-06', item: 'MULUTAN 2X 03', qty: 6175 },

  // Sabtu, 07 Februari 2026
  { date: '2026-02-07', item: 'BADAN BELAKANG 04', qty: 2200 },
  { date: '2026-02-07', item: 'BADAN ATAS 04', qty: 2000 },
  { date: '2026-02-07', item: 'SAMBUNGAN KANTONG 04', qty: 2000 },
  { date: '2026-02-07', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 7300 },
  { date: '2026-02-07', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 3200 },
  { date: '2026-02-07', item: 'KANTONG DEPAN 2X 04', qty: 3200 },
  { date: '2026-02-07', item: 'SEGITIGA 2X 04', qty: 6200 },
  { date: '2026-02-07', item: 'MULUTAN 04', qty: 2100 },
  { date: '2026-02-07', item: 'PIYEN SAMPING A 04', qty: 1800 },
  { date: '2026-02-07', item: 'PIYEN SAMPING B 04', qty: 1800 },

  // Minggu, 08 Februari 2026
  { date: '2026-02-08', item: 'BADAN 2X 03', qty: 4200 },
  { date: '2026-02-08', item: 'TUTUP 2X 03', qty: 4520 },
  { date: '2026-02-08', item: 'PIYEN PANTAT 03', qty: 2040 },
  { date: '2026-02-08', item: 'MULUTAN 2X 03', qty: 4240 },
  { date: '2026-02-08', item: 'MIKA 03', qty: 14000 },

  // Senin, 09 Februari 2026
  { date: '2026-02-09', item: 'BADAN BELAKANG 04', qty: 2100 },
  { date: '2026-02-09', item: 'KANTONG DEPAN 2X 04', qty: 3600 },
  { date: '2026-02-09', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 3100 },
  { date: '2026-02-09', item: 'SAMBUNGAN KANTONG 04', qty: 2100 },
  { date: '2026-02-09', item: 'PIYEN SAMPING A 04', qty: 2100 },
  { date: '2026-02-09', item: 'PIYEN SAMPING B 04', qty: 2100 },
  { date: '2026-02-09', item: 'SEGITIGA 2X 04', qty: 3400 },
  { date: '2026-02-09', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 4000 },
  { date: '2026-02-09', item: 'MULUTAN 04', qty: 1400 },
  { date: '2026-02-09', item: 'BADAN ATAS 04', qty: 2100 },

  // Rabu, 11 Februari 2026
  { date: '2026-02-11', item: 'JARING 2X 04', qty: 21252 },
  { date: '2026-02-11', item: 'BADAN BELAKANG 04', qty: 2200 },
  { date: '2026-02-11', item: 'KANTONG DEPAN 2X 04', qty: 5000 },
  { date: '2026-02-11', item: 'SAMBUNGAN KANTONG 04', qty: 2000 },
  { date: '2026-02-11', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 4100 },
  { date: '2026-02-11', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 4000 },
  { date: '2026-02-11', item: 'BADAN BAWAH 04', qty: 2400 },
  { date: '2026-02-11', item: 'PIYEN SAMPING A 04', qty: 1500 },
  { date: '2026-02-11', item: 'PIYEN SAMPING B 04', qty: 1500 },
  { date: '2026-02-11', item: 'MULUTAN 04', qty: 2000 },
  { date: '2026-02-11', item: 'SEGITIGA 2X 04', qty: 3000 },
  { date: '2026-02-11', item: 'BADAN BAWAH 04', qty: 2400, notes: 'potongan senin' },
  { date: '2026-02-11', item: 'BADAN ATAS 04', qty: 2000 },

  // Kamis, 12 Februari 2026
  { date: '2026-02-12', item: 'BADAN 2X 03', qty: 6300 },
  { date: '2026-02-12', item: 'PIYEN PANTAT 03', qty: 3220 },
  { date: '2026-02-12', item: 'MULUTAN 2X 03', qty: 5670 },
  { date: '2026-02-12', item: 'TUTUP 2X 03', qty: 6790 },
  { date: '2026-02-12', item: 'BADAN 2X 03', qty: 6549 },
  { date: '2026-02-12', item: 'PIYEN PANTAT 03', qty: 2773 },
  { date: '2026-02-12', item: 'MULUTAN 2X 03', qty: 6372 },
  { date: '2026-02-12', item: 'TUTUP 2X 03', qty: 3363 },

  // Jumat, 13 Februari 2026
  { date: '2026-02-13', item: 'BADAN ATAS 04', qty: 4200 },
  { date: '2026-02-13', item: 'SAMBUNGAN KANTONG 04', qty: 900 },
  { date: '2026-02-13', item: 'BADAN BAWAH 04', qty: 2100 },
  { date: '2026-02-13', item: 'MULUTAN 04', qty: 1600 },
  { date: '2026-02-13', item: 'KANTONG DEPAN 2X 04', qty: 5400 },
  { date: '2026-02-13', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 9200 },
  { date: '2026-02-13', item: 'SEGITIGA 2X 04', qty: 3800 },
  { date: '2026-02-13', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 6700 },
  { date: '2026-02-13', item: 'BADAN BELAKANG 04', qty: 1000 },
  { date: '2026-02-13', item: 'PIYEN SAMPING A 04', qty: 1600 },
  { date: '2026-02-13', item: 'PIYEN SAMPING B 04', qty: 1600 },
  { date: '2026-02-13', item: 'BADAN BELAKANG 04', qty: 1600 },
  { date: '2026-02-13', item: 'KANTONG DEPAN 2X 04', qty: 3600 },
  { date: '2026-02-13', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 3700 },
  { date: '2026-02-13', item: 'PIYEN SAMPING A 04', qty: 1000 },
  { date: '2026-02-13', item: 'PIYEN SAMPING B 04', qty: 1000 },
  { date: '2026-02-13', item: 'SAMBUNGAN KANTONG 04', qty: 1400 },
  { date: '2026-02-13', item: 'BADAN ATAS 04', qty: 1400 },
  { date: '2026-02-13', item: 'SEGITIGA 2X 04', qty: 3200 },
  { date: '2026-02-13', item: 'BADAN BAWAH 04', qty: 2000 },
  { date: '2026-02-13', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 2200 },
  { date: '2026-02-13', item: 'MULUTAN 04', qty: 2000 },

  // Sabtu, 14 Februari 2026
  { date: '2026-02-14', item: 'BADAN BELAKANG 04', qty: 2200 },
  { date: '2026-02-14', item: 'BADAN ATAS 04', qty: 2000 },
  { date: '2026-02-14', item: 'SAMBUNGAN KANTONG 04', qty: 2000 },
  { date: '2026-02-14', item: 'KANTONG DEPAN 2X 04', qty: 3200 },
  { date: '2026-02-14', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 3200 },
  { date: '2026-02-14', item: 'PIYEN SAMPING A 04', qty: 1600 },
  { date: '2026-02-14', item: 'PIYEN SAMPING B 04', qty: 1600 },
  { date: '2026-02-14', item: 'SEGITIGA 2X 04', qty: 3900 },
  { date: '2026-02-14', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 9300 },
  { date: '2026-02-14', item: 'BADAN BAWAH 04', qty: 2400 },
  { date: '2026-02-14', item: 'MULUTAN 04', qty: 2000 },
  { date: '2026-02-14', item: 'LAPIS BADAN 2X 03', qty: 9750 },
  { date: '2026-02-14', item: 'LAPIS PIYEN 03', qty: 4800 },
  { date: '2026-02-14', item: 'LAPIS MULUTAN 2X 03', qty: 3750 },

  // Senin, 16 Februari 2026
  { date: '2026-02-16', item: 'BADAN BELAKANG 04', qty: 2000 },
  { date: '2026-02-16', item: 'BADAN ATAS 04', qty: 1900 },
  { date: '2026-02-16', item: 'SAMBUNGAN KANTONG 04', qty: 1900 },
  { date: '2026-02-16', item: 'KANTONG DEPAN 2X 04', qty: 3000 },
  { date: '2026-02-16', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 3000 },
  { date: '2026-02-16', item: 'BADAN BAWAH 04', qty: 1200 },
  { date: '2026-02-16', item: 'SEGITIGA 2X 04', qty: 2900 },
  { date: '2026-02-16', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 3500 },
  { date: '2026-02-16', item: 'MULUTAN 04', qty: 1200 },
  { date: '2026-02-16', item: 'PIYEN SAMPING A 04', qty: 900 },
  { date: '2026-02-16', item: 'PIYEN SAMPING B 04', qty: 900 },

  // Selasa, 17 Februari 2026
  { date: '2026-02-17', item: 'BADAN BELAKANG 04', qty: 2000 },
  { date: '2026-02-17', item: 'SAMBUNGAN KANTONG 04', qty: 3000 },
  { date: '2026-02-17', item: 'KANTONG DEPAN 2X 04', qty: 3000 },
  { date: '2026-02-17', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 3000 },
  { date: '2026-02-17', item: 'MULUTAN 04', qty: 3000 },
  { date: '2026-02-17', item: 'BADAN BAWAH 04', qty: 2400 },
  { date: '2026-02-17', item: 'PIYEN SAMPING A 04', qty: 1800 },
  { date: '2026-02-17', item: 'PIYEN SAMPING B 04', qty: 1800 },
  { date: '2026-02-17', item: 'SEGITIGA 2X 04', qty: 3800 },
  { date: '2026-02-17', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 9600 },
  { date: '2026-02-17', item: 'JARING 2X 04', qty: 1500 },
  { date: '2026-02-17', item: 'BADAN BELAKANG 04', qty: 2200 },
  { date: '2026-02-17', item: 'BADAN ATAS 04', qty: 2800 },
  { date: '2026-02-17', item: 'SAMBUNGAN KANTONG 04', qty: 2000 },
  { date: '2026-02-17', item: 'KANTONG DEPAN 2X 04', qty: 3800 },
  { date: '2026-02-17', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 4000 },
  { date: '2026-02-17', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 6100 },
  { date: '2026-02-17', item: 'SEGITIGA 2X 04', qty: 1800 },
  { date: '2026-02-17', item: 'BADAN BAWAH 04', qty: 1500 },
  { date: '2026-02-17', item: 'MULUTAN 04', qty: 2000 },
  { date: '2026-02-17', item: 'PIYEN SAMPING A 04', qty: 1300 },
  { date: '2026-02-17', item: 'PIYEN SAMPING B 04', qty: 1300 },

  // Kamis, 19 Februari 2026
  { date: '2026-02-19', item: 'BADAN 2X 03', qty: 7140 },
  { date: '2026-02-19', item: 'MULUTAN 2X 03', qty: 6650 },
  { date: '2026-02-19', item: 'PIYEN PANTAT 03', qty: 3640 },
  { date: '2026-02-19', item: 'TUTUP 2X 03', qty: 7980 },
  { date: '2026-02-19', item: 'BADAN BELAKANG 04', qty: 500 },
  { date: '2026-02-19', item: 'SAMBUNGAN KANTONG 04', qty: 1100 },
  { date: '2026-02-19', item: 'KANTONG DEPAN 2X 04', qty: 5700 },
  { date: '2026-02-19', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 5300 },
  { date: '2026-02-19', item: 'SEGITIGA 2X 04', qty: 4000 },
  { date: '2026-02-19', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 10800 },
  { date: '2026-02-19', item: 'MULUTAN 04', qty: 1000 },
  { date: '2026-02-19', item: 'PIYEN SAMPING A 04', qty: 4000 },
  { date: '2026-02-19', item: 'PIYEN SAMPING B 04', qty: 4000 },
  { date: '2026-02-19', item: 'BADAN ATAS 04', qty: 100 },
  { date: '2026-02-19', item: 'BADAN BAWAH 04', qty: 2000 },

  // Sabtu, 21 Februari 2026
  { date: '2026-02-21', item: 'BADAN 2X 03', qty: 3600 },
  { date: '2026-02-21', item: 'MULUTAN 2X 03', qty: 4650 },
  { date: '2026-02-21', item: 'PIYEN PANTAT 03', qty: 1850 },
  { date: '2026-02-21', item: 'TUTUP 2X 03', qty: 4600 },
  { date: '2026-02-21', item: 'SAMBUNGAN KANTONG DEPAN 2X 04', qty: 400 },
  { date: '2026-02-21', item: 'SAMBUNGAN TALI PUNDAK 4X 04', qty: 18000 },
  { date: '2026-02-21', item: 'PIYEN SAMPING A 04', qty: 600 },
  { date: '2026-02-21', item: 'PIYEN SAMPING B 04', qty: 600 },
  { date: '2026-02-21', item: 'MULUTAN 04', qty: 200 },
];

async function run() {
  await supabase.auth.signInWithPassword({ email: 'dandimardani8@gmail.com', password: 'smptdev123@' });
  console.log('Logged in successfully.');

  const projectId = 1; // PRJ-HAJI-2026

  // 0. Update target production on project_products to 23,000 (covers 22,600 + cutting buffer)
  const { error: targetErr } = await supabase
    .from('project_products')
    .update({ target_production: 23000 })
    .eq('project_id', projectId);
  if (targetErr) console.error('Failed to update target_production:', targetErr.message);
  else console.log('Updated target_production to 23,000 for Proyek Haji products.');

  // 1. Ambil atau Simpan Cutting Components
  const compMap = new Map();
  const { data: existingComps } = await supabase
    .from('cutting_components')
    .select('id, component_code, name, product_id')
    .eq('project_id', projectId);

  (existingComps || []).forEach(c => compMap.set(c.name.trim().toUpperCase(), c));

  console.log(`Found ${compMap.size} existing components in Project ${projectId}.`);

  for (const c of COMPONENTS) {
    const key = c.name.trim().toUpperCase();
    if (!compMap.has(key)) {
      const { data, error } = await supabase.rpc('save_cutting_component', {
        p_component_id: null,
        p_project_id: projectId,
        p_product_id: c.product_id,
        p_name: c.name,
        p_qty_per_product: c.qty_per_product,
        p_unit: c.unit,
        p_color: c.color,
        p_notes: `Kode Pola: ${c.code} | Target: ${c.target_total} pcs`,
        p_status: 'AKTIF'
      });
      if (error) {
        console.error(`Failed to save component ${c.name}:`, error.message);
      } else {
        const compId = typeof data === 'number' ? data : (data?.id || data);
        compMap.set(key, { id: compId, name: c.name, product_id: c.product_id });
        console.log(`Saved component ${c.code}: ${c.name} (ID: ${compId})`);
      }
    }
  }

  // Refresh components map
  const { data: allComps } = await supabase
    .from('cutting_components')
    .select('id, component_code, name, product_id')
    .eq('project_id', projectId);
  (allComps || []).forEach(c => compMap.set(c.name.trim().toUpperCase(), c));

  // 2. Insert Daily Cutting Results
  console.log(`\nInserting ${DAILY_LOGS.length} daily cutting results...`);
  let inserted = 0;
  for (const log of DAILY_LOGS) {
    const comp = compMap.get(log.item.trim().toUpperCase());
    if (!comp) {
      console.warn(`Component not found for item: "${log.item}"`);
      continue;
    }

    const { error } = await supabase.rpc('record_cutting_result', {
      p_result_date: log.date,
      p_cutting_component_id: comp.id,
      p_good_qty: log.qty,
      p_reject_qty: 0,
      p_officer: 'Tim Potong Meja Haji',
      p_notes: log.notes || `Input harian cutting ${log.item} (${log.qty} pcs)`
    });

    if (error) {
      console.error(`Error recording result for ${log.item} on ${log.date}:`, error.message);
    } else {
      inserted++;
    }
  }

  console.log(`\nSUCCESS: Successfully processed ${inserted} of ${DAILY_LOGS.length} cutting daily results!`);
}

run();
