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

  // Check operator_payroll_runs
  const { data: runs, error: rErr } = await s.from('operator_payroll_runs').select('*');
  console.log('Operator payroll runs:', runs, rErr);

  // Check production_checks
  const { data: checks } = await s.from('production_checks').select('*');
  console.log('Production checks:', checks);
}

run();
