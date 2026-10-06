const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

async function run() {
  const { data: auth, error: authErr } = await s.auth.signInWithPassword({
    email: 'dandimardani8@gmail.com',
    password: 'smptdev123@'
  });
  if (authErr) {
    console.error('Auth error:', authErr.message);
    return;
  }

  const testWorker = {
    worker_code: 'OP001',
    name: 'SINTIA',
    department: 'PRODUKSI',
    position: 'OPERATOR JAHIT',
    pay_system: 'BORONGAN',
    daily_wage: 0,
    monthly_salary: 0,
    status: 'AKTIF'
  };

  const { data, error } = await s.from('workers').insert(testWorker).select();
  if (error) {
    console.error('Insert error:', error);
  } else {
    console.log('Insert success:', data);
  }
}

run().catch(console.error);
