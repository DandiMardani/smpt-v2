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

  const { data: runs, error } = await s.from('operator_payroll_runs').select('*');
  console.log('Current runs:', runs, error);

  // If there is an existing run, let's see its items or cancel it
  if (runs && runs.length > 0) {
    for (const r of runs) {
      const { error: delItemsErr } = await s.from('operator_payroll_items').delete().eq('run_id', r.id);
      console.log('Delete items for run', r.id, delItemsErr);
      const { error: delRunErr } = await s.from('operator_payroll_runs').delete().eq('id', r.id);
      console.log('Delete run', r.id, delRunErr);
    }
  }

  // Now finalize all checks
  const today = new Date().toISOString().slice(0, 10);
  const { data: newRunId, error: fErr } = await s.rpc('finalize_operator_payroll', {
    p_start: today,
    p_end: today,
    p_notes: 'Finalisasi Payroll Borongan Tas Paspor Haji'
  });
  console.log('New finalize run ID:', newRunId, fErr);

  const { data: items } = await s.from('operator_payroll_items').select('*').eq('run_id', newRunId).order('id');
  console.log(`\n=== HASIL REKAP PENGGAJIAN BORONGAN TAS PASPOR (${today}) ===`);
  let total = 0;
  const workerTotals = {};

  items.forEach(it => {
    const val = Number(it.operator_value);
    total += val;
    workerTotals[it.worker_name_snapshot] = (workerTotals[it.worker_name_snapshot] || 0) + val;
    console.log(`${it.worker_name_snapshot.padEnd(18)} | ${it.work_item_name_snapshot.padEnd(45)} | ${String(it.qty_approved).padStart(4)} pcs @ Rp ${String(it.operator_price_snapshot).padStart(4)} = Rp ${val.toLocaleString('id-ID')}`);
  });

  console.log('\n=== REKAP PER OPERATOR ===');
  for (const [wName, wTot] of Object.entries(workerTotals)) {
    console.log(`${wName.padEnd(20)} : Rp ${wTot.toLocaleString('id-ID')}`);
  }
  console.log(`\nTOTAL KESELURUHAN UPAH BORONGAN: Rp ${total.toLocaleString('id-ID')}`);
}

run();
