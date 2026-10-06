const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

async function run() {
  await s.auth.signInWithPassword({ email: 'dandimardani8@gmail.com', password: 'smptdev123@' });

  const { data: fgList } = await s.from('finished_goods').select('id, name');
  const fgMap = new Map(fgList.map(f => [f.name, f.id]));

  const transfers = [
    { name: "ISIAN KOPER HAJI 'JKG'", qty: 10298, date: '2026-03-15', code: 'A001', notes: 'Surat Jalan Pengiriman Isian Koper Haji JKG ke Pabrik Mitra MR WU (Dadap)' },
    { name: "ISIAN KOPER HAJI 'JKS'", qty: 12218, date: '2026-03-18', code: 'A002', notes: 'Surat Jalan Pengiriman Isian Koper Haji JKS ke Pabrik Mitra MR WU (Dadap)' },
    { name: "ISIAN KOPER HAJI 'GARUDA'", qty: 5468, date: '2026-03-25', code: 'A021', notes: 'Surat Jalan Pengiriman Isian Koper Haji Garuda ke Pabrik Mitra MR WU (Dadap)' },
    { name: 'HANGTAG JKG', qty: 10300, date: '2026-02-23', code: 'A003', notes: 'Pengiriman Aksesoris Hangtag JKG ke Pabrik Mitra MR WU (Dadap)' },
    { name: 'HANGTAG JKS', qty: 12320, date: '2026-02-23', code: 'A004', notes: 'Pengiriman Aksesoris Hangtag JKS ke Pabrik Mitra MR WU (Dadap)' },
    { name: 'PROSEDUR KLAIM KOPER', qty: 23000, date: '2026-02-25', code: 'A005', notes: 'Pengiriman Dokumen Prosedur Klaim Koper ke Pabrik Mitra MR WU (Dadap)' },
    { name: 'TALI TIES', qty: 29000, date: '2026-02-26', code: 'A006', notes: 'Pengiriman Aksesoris Tali Ties ke Pabrik Mitra MR WU (Dadap)' },
    { name: 'LOGO AYBE', qty: 20000, date: '2026-03-02', code: 'A007', notes: 'Pengiriman Aksesoris Logo AYBE ke Pabrik Mitra MR WU (Dadap)' },
    { name: 'TALI TIES KUNING SEGEL', qty: 23000, date: '2026-03-05', code: 'A008', notes: 'Pengiriman Aksesoris Tali Ties Kuning Segel ke Pabrik Mitra MR WU (Dadap)' },
    { name: 'STEMPEL JKG/JKS', qty: 2, date: '2026-03-10', code: 'A009', notes: 'Pengiriman Perlengkapan Stempel JKG/JKS ke Pabrik Mitra MR WU (Dadap)' },
    { name: 'HANGTAG BTJ', qty: 5600, date: '2026-03-14', code: 'A018', notes: 'Pengiriman Aksesoris Hangtag BTJ ke Pabrik Mitra MR WU (Dadap)' },
    { name: 'BOOKLET GARUDA', qty: 5500, date: '2026-03-16', code: 'A019', notes: 'Pengiriman Dokumen Booklet Garuda ke Pabrik Mitra MR WU (Dadap)' },
  ];

  const sourceLocId = 1; // PUSAT
  const destLocId = 2; // Pabrik Mitra MR WU (Dadap)

  for (const t of transfers) {
    const fgId = fgMap.get(t.name);
    if (!fgId) {
      console.error('FG not found:', t.name);
      continue;
    }

    const { data: trfId, error: trfErr } = await s.rpc('transfer_finished_good', {
      p_date: t.date,
      p_finished_good_id: fgId,
      p_source_location_id: sourceLocId,
      p_destination_location_id: destLocId,
      p_quantity: t.qty,
      p_notes: `${t.code} · ${t.notes}`
    });

    console.log(`Transferred ${t.name} (${t.qty}): ID=${trfId}`, trfErr);
  }

  // Cek daftar transfer
  const { data: allTransfers } = await s.from('finished_goods_transfers').select('id, transfer_code, transfer_date, finished_good_id, quantity, notes');
  console.log('Total Transfers recorded:', allTransfers?.length);
  console.log('Sample transfers:', allTransfers?.slice(0, 5));
}

run();
