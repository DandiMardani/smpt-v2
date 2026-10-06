const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

async function run() {
  const { data: auth, error: authErr } = await s.auth.signInWithPassword({ email: 'dandimardani8@gmail.com', password: 'smptdev123@' });
  if (authErr) console.error('Auth error:', authErr.message);

  const { data: w, error: wErr } = await s.from('workers').select('id,worker_code,name,worker_type,department,position').limit(30);
  if (wErr) console.error('Workers error:', wErr.message);
  else console.log('Workers count:', w.length, 'Sample:', w.slice(0, 5));

  const { data: rates, error: rErr } = await s.from('piece_rates').select('*');
  if (rErr) console.error('Rates error:', rErr.message);
  else console.log('Piece rates:', rates);
}

run().catch(console.error);
