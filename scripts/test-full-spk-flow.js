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

  // 1. Sync operator_price with proposed_price for Product 3 so operator gets full rate
  const { data: updatedItems, error: upErr } = await s
    .from('work_items')
    .update({ operator_price: s.raw ? undefined : 0 }) // let's check how to update
    .eq('product_id', 3);

  // We can update each item:
  const { data: items } = await s.from('work_items').select('id, proposed_price, operator_price').eq('product_id', 3);
  for (const it of items) {
    if (it.operator_price !== it.proposed_price) {
      await s.from('work_items').update({ operator_price: it.proposed_price }).eq('id', it.id);
    }
  }
  console.log('Work items operator prices aligned to proposed prices!');

  // Check supervisor ID
  const { data: spv } = await s.from('workers').select('id, name').eq('worker_code', 'SPV001').single();
  // Check operator OP063
  const { data: op63 } = await s.from('workers').select('id, name').eq('worker_code', 'OP063').single();
  console.log('SPV:', spv, 'OP063:', op63);

  // 2. Test create SPK for OP063
  const today = new Date().toISOString().slice(0, 10);
  const { data: orderId, error: spkErr } = await s.rpc('create_production_order', {
    p_order_date: today,
    p_project_id: 1,
    p_product_id: 3,
    p_operator_worker_id: op63.id,
    p_checker_email: 'dandimardani8@gmail.com',
    p_supervisor_worker_id: spv.id,
    p_due_date: today,
    p_notes: 'SPK Uji Coba Tas Paspor OP063'
  });

  if (spkErr) {
    console.error('Create SPK error:', spkErr);
    return;
  }
  console.log('SPK created with ID:', orderId);

  // 3. Add items: TP01 (item ID 37, qty 209), TP03 (item ID 39, qty 210)
  const { data: item1, error: addErr1 } = await s.rpc('add_production_order_item', {
    p_order_id: orderId,
    p_work_item_id: 37, // TP01
    p_assigned_qty: 209
  });
  console.log('Add item TP01 result:', item1, addErr1);

  const { data: item2, error: addErr2 } = await s.rpc('add_production_order_item', {
    p_order_id: orderId,
    p_work_item_id: 39, // TP03
    p_assigned_qty: 210
  });
  console.log('Add item TP03 result:', item2, addErr2);

  // 4. Publish SPK
  const { data: pub, error: pubErr } = await s.rpc('publish_production_order', {
    p_order_id: orderId
  });
  console.log('Publish SPK result:', pub, pubErr);

  // 5. Get the order items to find their IDs
  const { data: orderItems } = await s.from('production_order_items').select('id, work_item_name_snapshot, assigned_qty, operator_price_snapshot').eq('order_id', orderId);
  console.log('Published order items:', orderItems);

  // 6. Record checker result
  for (const oi of orderItems) {
    const { data: checkRes, error: checkErr } = await s.rpc('record_checker_result', {
      p_order_item_id: oi.id,
      p_check_date: today,
      p_good_qty: oi.assigned_qty,
      p_reject_qty: 0,
      p_notes: 'Hasil Jahit Aktual OK'
    });
    console.log(`Record checker result for ${oi.work_item_name_snapshot}:`, checkRes, checkErr);
  }
}

run();
