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

  // Finalize for period 2026-10-01 to 2026-10-07 (Mingguan)
  const { data: runId, error: fErr } = await s.rpc('finalize_operator_payroll', {
    p_start: '2026-10-01',
    p_end: '2026-10-07',
    p_notes: 'Payroll Borongan Mingguan - Tas Paspor Haji'
  });
  console.log('Weekly finalize run ID:', runId, fErr);

  const { data: items } = await s.from('operator_payroll_items').select('*').eq('run_id', runId).order('worker_name_snapshot');
  console.log(`\n=== DAFTAR SLIP GAJI BORONGAN OPERATOR TAS PASPOR ===`);
  let grandTotal = 0;
  const operatorMap = {};

  items.forEach(it => {
    const val = Number(it.operator_value);
    grandTotal += val;
    if (!operatorMap[it.worker_name_snapshot]) {
      operatorMap[it.worker_name_snapshot] = { total: 0, items: [] };
    }
    operatorMap[it.worker_name_snapshot].total += val;
    operatorMap[it.worker_name_snapshot].items.push(it);
  });

  for (const [opName, data] of Object.entries(operatorMap)) {
    console.log(`\n👤 OPERATOR: ${opName} (Total: Rp ${data.total.toLocaleString('id-ID')})`);
    data.items.forEach(it => {
      console.log(`  - ${it.work_item_name_snapshot.padEnd(46)}: ${String(it.qty_approved).padStart(4)} pcs x Rp ${String(it.operator_price_snapshot).padStart(4)} = Rp ${Number(it.operator_value).toLocaleString('id-ID')}`);
    });
  }

  console.log(`\n======================================================`);
  console.log(`TOTAL KESELURUHAN UPAH BORONGAN: Rp ${grandTotal.toLocaleString('id-ID')}`);
  console.log(`======================================================`);
}

run();
