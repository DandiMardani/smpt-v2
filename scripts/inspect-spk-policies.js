const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

async function test() {
  await s.auth.signInWithPassword({ email: 'dandimardani8@gmail.com', password: 'smptdev123@' });

  // Check user permissions
  const { data: perms } = await s.rpc('current_user_permissions');
  console.log('User perms has spk.write?:', perms ? perms.includes('spk.write') : false);

  // Check if we can create a draft SPK, add an item, and see how update works
  const { data: spkCode, error: cErr } = await s.rpc('create_production_order', {
    p_order_date: '2026-10-04',
    p_project_id: 1,
    p_product_id: 3,
    p_operator_worker_id: 22,
    p_checker_email: 'dandimardani8@gmail.com',
    p_supervisor_worker_id: 1,
    p_due_date: '2026-10-05',
    p_notes: 'Test Draft SPK'
  });
  console.log('Created draft SPK id:', spkCode, cErr);

  if (spkCode) {
    // Try to update an item via add_production_order_item
    const { data: itemId, error: aErr } = await s.rpc('add_production_order_item', {
      p_order_id: spkCode,
      p_work_item_id: 37,
      p_assigned_qty: 15
    });
    console.log('Added item:', itemId, aErr);

    // Try to re-call add_production_order_item with different qty (update)
    const { data: updatedItemId, error: uErr } = await s.rpc('add_production_order_item', {
      p_order_id: spkCode,
      p_work_item_id: 37,
      p_assigned_qty: 25
    });
    console.log('Updated item qty:', updatedItemId, uErr);

    // Try remove
    const { error: rErr } = await s.rpc('remove_production_order_item', {
      p_order_id: spkCode,
      p_order_item_id: itemId
    });
    console.log('Removed item:', rErr);

    // Cancel draft order
    const { error: canErr } = await s.rpc('cancel_production_order', {
      p_order_id: spkCode
    });
    console.log('Cancelled test order:', canErr);
  }
}
test();
