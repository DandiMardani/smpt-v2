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

  const { data: runs } = await s.from('operator_payroll_runs').select('id, payroll_code, period_start, period_end, status, total_operator_value');
  console.log('Current operator payroll runs:', runs);

  // Finalize for period 2026-10-04 to 2026-10-10
  const { data: newRunId, error: fErr } = await s.rpc('finalize_operator_payroll', {
    p_start: '2026-10-04',
    p_end: '2026-10-10',
    p_notes: 'Finalisasi Payroll Borongan Haji - Paspor & Ransel'
  });
  console.log('New Run ID for Haji (Paspor + Ransel):', newRunId, fErr);

  const { data: items } = await s.from('operator_payroll_items').select('*').eq('run_id', newRunId).order('worker_name_snapshot');
  
  const opSummary = {};
  let totalGrand = 0;
  items.forEach(it => {
    const val = Number(it.operator_value);
    totalGrand += val;
    if (!opSummary[it.worker_name_snapshot]) opSummary[it.worker_name_snapshot] = { total: 0, items: [] };
    opSummary[it.worker_name_snapshot].total += val;
    opSummary[it.worker_name_snapshot].items.push(it);
  });

  console.log('\n=== REKAP PER OPERATOR (TAS PASPOR + TAS RANSEL) ===');
  for (const [name, d] of Object.entries(opSummary)) {
    console.log(`\n👤 ${name} -> Total Upah: Rp ${d.total.toLocaleString('id-ID')}`);
    d.items.forEach(it => {
      console.log(`   - ${it.work_item_name_snapshot.padEnd(46)}: ${String(it.qty_approved).padStart(4)} pcs x Rp ${String(it.operator_price_snapshot).padStart(4)} = Rp ${Number(it.operator_value).toLocaleString('id-ID')}`);
    });
  }
  console.log(`\n======================================================`);
  console.log(`GRAND TOTAL PENGGAJIAN BORONGAN HAJI: Rp ${totalGrand.toLocaleString('id-ID')}`);
  console.log(`======================================================`);
}

run();
