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
  if (authErr) {
    console.error('Auth error:', authErr.message);
    return;
  }

  // Cek apakah tabel embarkation_replacements sudah ada
  const { data: testTable, error: testErr } = await s.from('embarkation_replacements').select('id').limit(1);
  console.log('embarkation_replacements test:', testTable, testErr);

  const { data: allLocs } = await s.from('locations').select('id, location_code, name, location_type, status').order('id');
  console.log('All locations now:', allLocs);
}

run().catch(console.error);
