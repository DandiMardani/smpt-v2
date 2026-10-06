const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

// Data input dari Excel Tas Paspor
const entries = [
  // OP010 - ROHAELI
  {
    worker_code: 'OP010',
    items: [
      { itemId: 38, name: 'TP02 - PASANG SELETING MIKA KANTONG BELAKANG 03', qty: 209 },
      { itemId: 40, name: 'TP04 - TEMPEL KANTONG BADAN BELAKANG 03', qty: 209 },
      { itemId: 42, name: 'TP06 - BUNGKUS JARING 03', qty: 200 },
      { itemId: 50, name: 'TP14 - JAHIT TUTUP + TALI KUNCI SODOK 03', qty: 238 },
      { itemId: 51, name: 'TP15 - STIK TUTUP 03', qty: 239 },
      { itemId: 52, name: 'TP16 - TEMPEL TUTUP KEBADAN BELAKANG 03', qty: 209 },
      { itemId: 60, name: 'TP24 - SETEL BADAN DEPAN + BUNGKUS 03', qty: 210 },
      { itemId: 61, name: 'TP25 - SETEL BADAN BELAKANG + BUNGKUS 03', qty: 210 },
    ]
  },
  // OP003 - RIKA
  {
    worker_code: 'OP003',
    items: [
      { itemId: 41, name: 'TP05 - PASANG LAPISAN BDN DPN + JAHIT MIKA + TALI 03', qty: 100 },
      { itemId: 43, name: 'TP07 - PASANG JARING LAPISAN BADAN BLKNG 03', qty: 209 },
      { itemId: 44, name: 'TP08 - PASANG LAPISAN BDN BLKNG + JAHIT MIKA 03', qty: 209 },
    ]
  },
  // OP002 - NUR ROHMAH
  {
    worker_code: 'OP002',
    items: [
      { itemId: 41, name: 'TP05 - PASANG LAPISAN BDN DPN + JAHIT MIKA + TALI 03', qty: 100 },
      { itemId: 46, name: 'TP10 - REMPEL PIYEN + LAPISAN PIYEN 03', qty: 210 },
      { itemId: 56, name: 'TP20 - PASANG RING JALAN 03', qty: 210 },
      { itemId: 57, name: 'TP21 - JAHIT WEBBING RING JALAN 03', qty: 210 },
      { itemId: 65, name: 'TP29 - TEKUK MULUT SLETING X2 03', qty: 420 },
      { itemId: 66, name: 'TP30 - JAHIT SLETING MULUT 03', qty: 210 },
    ]
  },
  // OP006 - HAMIDAH
  {
    worker_code: 'OP006',
    items: [
      { itemId: 47, name: 'TP11 - SAMBUNG PIYEN + MULUT + WEBBING 03', qty: 206 },
    ]
  }
];

async function run() {
  await s.auth.signInWithPassword({ email: 'dandimardani8@gmail.com', password: 'smptdev123@' });
  const today = new Date().toISOString().slice(0, 10);

  const { data: spv } = await s.from('workers').select('id').eq('worker_code', 'SPV001').single();

  for (const group of entries) {
    const { data: worker } = await s.from('workers').select('id, name').eq('worker_code', group.worker_code).single();
    console.log(`Processing SPK for ${group.worker_code} - ${worker.name}...`);

    // 1. Create SPK
    const { data: orderId, error: spkErr } = await s.rpc('create_production_order', {
      p_order_date: today,
      p_project_id: 1,
      p_product_id: 3,
      p_operator_worker_id: worker.id,
      p_checker_email: 'dandimardani8@gmail.com',
      p_supervisor_worker_id: spv.id,
      p_due_date: today,
      p_notes: `SPK Hasil Jahit Tas Paspor - ${worker.name}`
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
        p_notes: 'Pemeriksaan Hasil Jahit OK'
      });
      if (checkErr) console.error(`Error checking item ${oi.work_item_name_snapshot}:`, checkErr);
    }
    console.log(`SPK ${orderId} for ${worker.name} successfully published & checked!`);
  }

  // Delete previous test run 1 so we can re-finalize all together
  await s.from('operator_payroll_items').delete().eq('run_id', 1);
  await s.from('operator_payroll_runs').delete().eq('id', 1);

  // Finalize full operator payroll for today
  const { data: runId, error: fErr } = await s.rpc('finalize_operator_payroll', {
    p_start: today,
    p_end: today,
    p_notes: 'Finalisasi Payroll Borongan Tas Paspor Haji'
  });
  console.log('Full Finalize result:', runId, fErr);

  // Display summary
  const { data: runItems } = await s.from('operator_payroll_items').select('worker_name_snapshot, work_item_name_snapshot, qty_approved, operator_price_snapshot, operator_value').eq('run_id', runId);
  console.log('\n--- DAFTAR GAJI BORONGAN HARI INI ---');
  let grandTotal = 0;
  runItems.forEach(ri => {
    console.log(`${ri.worker_name_snapshot.padEnd(20)} | ${ri.work_item_name_snapshot.slice(0, 35).padEnd(36)} | Qty: ${String(ri.qty_approved).padStart(4)} | Tarif: Rp ${String(ri.operator_price_snapshot).padStart(4)} | Total: Rp ${ri.operator_value.toLocaleString('id-ID')}`);
    grandTotal += Number(ri.operator_value);
  });
  console.log(`\nGRAND TOTAL UPAH BORONGAN: Rp ${grandTotal.toLocaleString('id-ID')}`);
}

run();
