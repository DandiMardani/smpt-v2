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

  // 1. Tambah Embarkasi Antara Lampung jika belum ada
  const { data: existingLmp } = await s.from('embarkations').select('id').eq('short_code', 'JKG-LMP');
  let lmpEmbId = existingLmp?.[0]?.id;
  if (!lmpEmbId) {
    const { data: newEmb, error: embErr } = await s.from('embarkations').insert({
      embarkation_code: 'EMB-004',
      short_code: 'JKG-LMP',
      name: 'Embarkasi Antara Lampung (JKG)',
      status: 'AKTIF',
      notes: 'Embarkasi Antara Lampung via JKG'
    }).select('id');
    console.log('Inserted Lampung Embarkation:', newEmb, embErr);
    lmpEmbId = newEmb?.[0]?.id;
  }

  // 2. Buat Target Lampung (5.785 SET)
  const { data: existingTrg } = await s.from('embarkation_targets').select('id').eq('embarkation_id', lmpEmbId);
  let lmpTrgId = existingTrg?.[0]?.id;
  if (!lmpTrgId) {
    const { data: newTrg, error: trgErr } = await s.from('embarkation_targets').insert({
      embarkation_id: lmpEmbId,
      item_kind: 'SET',
      set_id: 1, // ISIAN KOPER HAJI 'JKG'
      target_qty: 5785,
      status: 'AKTIF',
      notes: 'Target Kuota Embarkasi Haji Lampung (5.785 SET)'
    }).select('id');
    console.log('Inserted Lampung Target:', newTrg, trgErr);
    lmpTrgId = newTrg?.[0]?.id;
  }

  console.log('Lampung Target ID:', lmpTrgId);

  // 3. Rekam 7 Pengiriman Lampung
  const jkgLampungShipments = [
    { date: '2026-02-27', qty: 1518, doc: 'SJ-LMP-01' },
    { date: '2026-03-06', qty: 1085, doc: 'SJ-LMP-02' },
    { date: '2026-03-07', qty: 582, doc: 'SJ-LMP-03' },
    { date: '2026-03-10', qty: 1012, doc: 'SJ-LMP-04' },
    { date: '2026-03-11', qty: 1079, doc: 'SJ-LMP-05' },
    { date: '2026-04-08', qty: 457, doc: 'SJ-LMP-06' },
    { date: '2026-04-09', qty: 52, doc: 'SJ-LMP-07' },
  ];

  const sourceLocationId = 2; // Pabrik Mitra MR WU (Dadap)

  for (let i = 0; i < jkgLampungShipments.length; i++) {
    const item = jkgLampungShipments[i];
    const { data: shipId, error: e1 } = await s.rpc('create_embarkation_shipment', {
      p_target_id: lmpTrgId,
      p_date: item.date,
      p_source_location_id: sourceLocationId,
      p_quantity: item.qty,
      p_document_no: item.doc,
      p_driver: 'Ekspedisi Armada Dadap',
      p_vehicle: 'B 92' + (30 + i) + ' WU',
      p_notes: `Pengiriman Distribusi Koper Haji Saudi 2026 - Lampung (${item.qty} SET)`
    });

    if (e1) {
      console.error(`Error creating ${item.doc}:`, e1);
      continue;
    }

    const { error: e2 } = await s.rpc('send_embarkation_shipment', { p_shipment_id: shipId });
    if (e2) {
      console.error(`Error sending ${item.doc}:`, e2);
      continue;
    }

    const { error: e3 } = await s.rpc('receive_embarkation_shipment', {
      p_shipment_id: shipId,
      p_received: item.qty,
      p_reject: 0,
      p_damaged: 0,
      p_missing: 0,
      p_notes: `Tiba lengkap dan diterima dengan baik di Asrama Haji Antara Lampung`
    });

    if (e3) {
      console.error(`Error receiving ${item.doc}:`, e3);
    } else {
      console.log(`[OK] ${item.doc} | Tgl: ${item.date} | Qty: ${item.qty} SET (Lampung)`);
    }
  }

  // Verifikasi seluruh shipment
  const { data: allShipments } = await s.from('embarkation_shipments').select('quantity, status');
  const totalQty = (allShipments || []).reduce((acc, curr) => acc + Number(curr.quantity), 0);
  console.log('--- REKAP AKHIR PENGIRIMAN EMBERKASI ---');
  console.log('Total Transaksi Pengiriman:', allShipments?.length);
  console.log('Total Fisik Terkirim & Tiba:', totalQty, 'SET (Target: 22.579 SET)');
}

run().catch(console.error);
