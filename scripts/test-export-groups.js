const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

async function testExport() {
  await s.auth.signInWithPassword({ email: 'dandimardani8@gmail.com', password: 'smptdev123@' });

  // Test query
  const { data: run } = await s.from('operator_payroll_runs').select('*').eq('id', 5).single();
  const { data: items } = await s.from('operator_payroll_items').select('*').eq('run_id', 5);
  const { data: workItems } = await s.from('work_items').select('id, item_code, name, product_id');
  const { data: products } = await s.from('project_products').select('id, name, product_code');

  const wiMap = new Map(workItems.map(wi => [wi.id, wi]));
  const prodMap = new Map(products.map(p => [p.id, p]));

  console.log('Run 5 data count:', items.length);
  const itemsByProduct = {};
  items.forEach(it => {
    const wi = wiMap.get(it.work_item_id);
    const prod = prodMap.get(wi?.product_id);
    const pName = prod ? prod.name : 'LAINNYA';
    if (!itemsByProduct[pName]) itemsByProduct[pName] = [];
    itemsByProduct[pName].push(it);
  });

  console.log('Products found in items:');
  for (const [pName, list] of Object.entries(itemsByProduct)) {
    const subTot = list.reduce((a, b) => a + Number(b.submission_value || 0), 0);
    const opTot = list.reduce((a, b) => a + Number(b.operator_value || 0), 0);
    console.log(`- ${pName}: ${list.length} baris | Pengajuan: Rp ${subTot.toLocaleString('id-ID')} | Real: Rp ${opTot.toLocaleString('id-ID')}`);
  }
}

testExport();
