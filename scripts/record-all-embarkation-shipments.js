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

  // 1. Update/Pastikan Target Embarkasi akurat sesuai tabel user
  // Target 1: JKG - Jakarta (4.453 SET)
  await s.from('embarkation_targets').update({
    target_qty: 4453,
    notes: 'Target Kuota Embarkasi JKG - Wilayah DKI Jakarta (4.453 SET)'
  }).eq('id', 1);

  // Target 2: JKS - Bekasi / Jawa Barat (12.341 SET)
  await s.from('embarkation_targets').update({
    target_qty: 12341,
    notes: 'Target Kuota Embarkasi JKS - Wilayah Bekasi & Jawa Barat (12.341 SET)'
  }).eq('id', 2);

  // Target 4: JKG - Lampung (5.785 SET)
  const { data: existingTrg4 } = await s.from('embarkation_targets').select('id').eq('notes', 'Target Kuota Embarkasi JKG - Wilayah Lampung (5.785 SET)');
  let target4Id = existingTrg4?.[0]?.id;
  if (!target4Id) {
    const { data: newTrg4 } = await s.from('embarkation_targets').insert({
      target_code: 'TRG-00004',
      embarkation_id: 1, // JKG
      item_kind: 'SET',
      set_id: 1, // Isian Koper Haji JKG
      target_qty: 5785,
      status: 'AKTIF',
      notes: 'Target Kuota Embarkasi JKG - Wilayah Lampung (5.785 SET)'
    }).select('id');
    target4Id = newTrg4?.[0]?.id;
  }

  console.log('Targets ready: JKG Jakarta=1, JKS=2, JKG Lampung=' + target4Id);

  // 2. Data Pengiriman JKS (Bekasi/Bandung) - 14 pengiriman
  const jksShipments = [
    { date: '2026-03-02', qty: 1056, doc: 'SJ-JKS-01' },
    { date: '2026-03-03', qty: 1588, doc: 'SJ-JKS-02' },
    { date: '2026-03-06', qty: 547, doc: 'SJ-JKS-03' },
    { date: '2026-03-09', qty: 1717, doc: 'SJ-JKS-04' },
    { date: '2026-03-11', qty: 583, doc: 'SJ-JKS-05' },
    { date: '2026-03-12', qty: 1579, doc: 'SJ-JKS-06' },
    { date: '2026-03-13', qty: 550, doc: 'SJ-JKS-07' },
    { date: '2026-03-31', qty: 1529, doc: 'SJ-JKS-08' },
    { date: '2026-04-01', qty: 550, doc: 'SJ-JKS-09' },
    { date: '2026-04-02', qty: 970, doc: 'SJ-JKS-10' },
    { date: '2026-04-07', qty: 1093, doc: 'SJ-JKS-11' },
    { date: '2026-04-09', qty: 416, doc: 'SJ-JKS-12' },
    { date: '2026-04-17', qty: 159, doc: 'SJ-JKS-13' },
    { date: '2026-04-30', qty: 4, doc: 'SJ-JKS-14' },
  ];

  // 3. Data Pengiriman JKG (Jakarta) - 11 pengiriman (26/02 sudah id:1)
  const jkgJakartaShipments = [
    // 26/02: 800 (sudah ada di ID 1)
    { date: '2026-03-06', qty: 517, doc: 'SJ-JKG-02' },
    { date: '2026-03-10', qty: 583, doc: 'SJ-JKG-03' },
    { date: '2026-03-12', qty: 361, doc: 'SJ-JKG-04' },
    { date: '2026-03-13', qty: 1001, doc: 'SJ-JKG-05' },
    { date: '2026-04-01', qty: 548, doc: 'SJ-JKG-06' },
    { date: '2026-04-08', qty: 583, doc: 'SJ-JKG-07' },
    { date: '2026-04-09', qty: 17, doc: 'SJ-JKG-08' },
    { date: '2026-04-17', qty: 40, doc: 'SJ-JKG-09' },
    { date: '2026-04-22', qty: 2, doc: 'SJ-JKG-10' },
    { date: '2026-04-30', qty: 1, doc: 'SJ-JKG-11' },
  ];

  // 4. Data Pengiriman JKG (Lampung) - 7 pengiriman
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

  async function processBatch(targetId, list, prefix) {
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const { data: shipId, error: e1 } = await s.rpc('create_embarkation_shipment', {
        p_target_id: targetId,
        p_date: item.date,
        p_source_location_id: sourceLocationId,
        p_quantity: item.qty,
        p_document_no: item.doc,
        p_driver: 'Ekspedisi Armada Dadap',
        p_vehicle: 'B 92' + (10 + i) + ' WU',
        p_notes: `Pengiriman Distribusi Koper Haji Saudi 2026 - ${prefix} (${item.qty} SET)`
      });

      if (e1) {
        console.error(`Error creating ${item.doc}:`, e1);
        continue;
      }

      // Kirim (potong stok)
      const { error: e2 } = await s.rpc('send_embarkation_shipment', { p_shipment_id: shipId });
      if (e2) {
        console.error(`Error sending ${item.doc}:`, e2);
        continue;
      }

      // Konfirmasi penerimaan di Embarkasi
      const { error: e3 } = await s.rpc('receive_embarkation_shipment', {
        p_shipment_id: shipId,
        p_received: item.qty,
        p_reject: 0,
        p_damaged: 0,
        p_missing: 0,
        p_notes: `Tiba lengkap dan diterima dengan baik di Asrama Haji (${prefix})`
      });

      if (e3) {
        console.error(`Error receiving ${item.doc}:`, e3);
      } else {
        console.log(`[OK] ${item.doc} | Tgl: ${item.date} | Qty: ${item.qty} SET (${prefix})`);
      }
    }
  }

  console.log('--- Processing JKS Shipments (14 batches) ---');
  await processBatch(2, jksShipments, 'Bekasi (JKS)');

  console.log('--- Processing JKG Jakarta Shipments (10 remaining batches) ---');
  await processBatch(1, jkgJakartaShipments, 'Jakarta (JKG)');

  console.log('--- Processing JKG Lampung Shipments (7 batches) ---');
  await processBatch(target4Id, jkgLampungShipments, 'Lampung (JKG)');

  // Verifikasi total pengiriman
  const { data: allShipments } = await s.from('embarkation_shipments').select('quantity, status');
  const totalQty = (allShipments || []).reduce((acc, curr) => acc + Number(curr.quantity), 0);
  console.log('Total Shipments in DB:', allShipments?.length, 'Total Qty:', totalQty);
}

run().catch(console.error);
