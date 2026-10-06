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
  const today = new Date().toISOString().slice(0, 10);

  // Call finalize_operator_payroll
  const { data: runId, error: fErr } = await s.rpc('finalize_operator_payroll', {
    p_start: today,
    p_end: today,
    p_notes: 'Finalisasi Uji Coba Borongan Tas Paspor'
  });
  console.log('Finalize result:', runId, fErr);

  const { data: runItems } = await s.from('operator_payroll_items').select('*').eq('run_id', runId);
  console.log('Operator payroll items:', runItems);

  const { data: runRow } = await s.from('operator_payroll_runs').select('*').eq('id', runId).single();
  console.log('Operator payroll run summary:', runRow);
}

run();
