const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const ranselEntries = [
  // OP005 - ASIAH
  {
    worker_code: 'OP005',
    items: [
      { itemId: 68, name: 'RN01 - PASANG STOPAN SLETING 04', qty: 150 },
      { itemId: 69, name: 'RN02 - PASANG SELETING SAMBUNGAN KANTONG 04', qty: 150 },
      { itemId: 70, name: 'RN03 - PASANG SELETING KANTONG 04', qty: 199 },
      { itemId: 71, name: 'RN04 - PONCOT KANTONG 04 2X', qty: 438 },
      { itemId: 72, name: 'RN05 - JAHIT KELILING KANTONG 04', qty: 148 },
      { itemId: 76, name: 'RN09 - TEMPEL KANTONG + GANTUNGAN 04', qty: 210 },
    ]
  },
  // OP006 - HAMIDAH
  {
    worker_code: 'OP006',
    items: [
      { itemId: 70, name: 'RN03 - PASANG SELETING KANTONG 04', qty: 40 },
      { itemId: 71, name: 'RN04 - PONCOT KANTONG 04 2X', qty: 40 },
      { itemId: 72, name: 'RN05 - JAHIT KELILING KANTONG 04', qty: 40 },
      { itemId: 76, name: 'RN09 - TEMPEL KANTONG + GANTUNGAN 04', qty: 40 },
      { itemId: 77, name: 'RN10 - SAMBUNG BADAN DEPAN + BUNGKUS 04 2X', qty: 320 },
    ]
  },
  // OP003 - RIKA
  {
    worker_code: 'OP003',
    items: [
      { itemId: 72, name: 'RN05 - JAHIT KELILING KANTONG 04', qty: 57 },
      { itemId: 80, name: 'RN13 - TEMPEL JARING 04 2X', qty: 422 },
    ]
  },
  // OP002 - NUR ROHMAH
  {
    worker_code: 'OP002',
    items: [
      { itemId: 77, name: 'RN10 - SAMBUNG BADAN DEPAN + BUNGKUS 04 2X', qty: 140 },
      { itemId: 79, name: 'RN12 - BUNGKUS JARING 04 2X', qty: 400 },
    ]
  },
  // OP063 - FAISAL TANJUNG
  {
    worker_code: 'OP063',
    items: [
      { itemId: 82, name: 'RN15 - TEMPEL MIKA 04', qty: 22 },
      { itemId: 84, name: 'RN17 - BUAT SEGITIGA + WEBBING 04 2X', qty: 22 },
      { itemId: 85, name: 'RN18 - PASANG RING JALAN 04 2X', qty: 22 },
      { itemId: 86, name: 'RN19 - JAHIT RING JALAN 04 2X', qty: 22 },
      { itemId: 88, name: 'RN21 - JAHIT KUPINGAN TALI 04 2X', qty: 22 },
      { itemId: 90, name: 'RN23 - TEMPEL TALI BADAN BELAKANG 04', qty: 22 },
      { itemId: 91, name: 'RN24 - TEMPEL SEGITIGA 04', qty: 22 },
      { itemId: 95, name: 'RN28 - SETEL BADAN BELAKANG + BUNGKUS 04', qty: 28 },
    ]
  }
];

async function run() {
  await s.auth.signInWithPassword({ email: 'dandimardani8@gmail.com', password: 'smptdev123@' });
  const today = new Date().toISOString().slice(0, 10);
  const { data: spv } = await s.from('workers').select('id').eq('worker_code', 'SPV001').single();

  for (const group of ranselEntries) {
    const { data: worker } = await s.from('workers').select('id, name').eq('worker_code', group.worker_code).single();
    console.log(`Processing SPK Tas Ransel for ${group.worker_code} - ${worker.name}...`);

    // 1. Create SPK for Product 4 (Tas Ransel)
    const { data: orderId, error: spkErr } = await s.rpc('create_production_order', {
      p_order_date: today,
      p_project_id: 1,
      p_product_id: 4, // Tas Ransel
      p_operator_worker_id: worker.id,
      p_checker_email: 'dandimardani8@gmail.com',
      p_supervisor_worker_id: spv.id,
      p_due_date: today,
      p_notes: `SPK Hasil Jahit Tas Ransel - ${worker.name}`
    });

    if (spkErr) {
      console.error(`Error create SPK for ${worker.name}:`, spkErr);
      continue;
    }

    // 2. Add each item
    for (const item of group.items) {
      const { error: addErr } = await s.rpc('add_production_order_item', {
        p_order_id: orderId,
        p_work_item_id: item.itemId,
        p_assigned_qty: item.qty
      });
      if (addErr) console.error(`Error adding item ${item.name}:`, addErr);
    }

    // 3. Publish SPK
    const { error: pubErr } = await s.rpc('publish_production_order', { p_order_id: orderId });
    if (pubErr) console.error(`Error publishing SPK ${orderId}:`, pubErr);

    // 4. Fetch order items
    const { data: orderItems } = await s.from('production_order_items').select('id, work_item_name_snapshot, assigned_qty').eq('order_id', orderId);

    // 5. Checker record results
    for (const oi of orderItems) {
      const { error: checkErr } = await s.rpc('record_checker_result', {
        p_order_item_id: oi.id,
        p_check_date: today,
        p_good_qty: oi.assigned_qty,
        p_reject_qty: 0,
        p_notes: 'Pemeriksaan Hasil Jahit Ransel OK'
      });
      if (checkErr) console.error(`Error checking item ${oi.work_item_name_snapshot}:`, checkErr);
    }
    console.log(`SPK ${orderId} (Ransel) for ${worker.name} successfully published & checked!`);
  }
}

run();
