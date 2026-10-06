const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

async function checkMaterials() {
  await s.auth.signInWithPassword({ email: 'dandimardani8@gmail.com', password: 'smptdev123@' });
  const { data: mats } = await s.from('materials').select('id,material_code,name,standard_unit,category').limit(50);
  console.log('Sample Materials:', mats?.slice(0, 10));

  const { data: accessories } = await s.from('materials').select('id,material_code,name,standard_unit,category').or('name.ilike.%hangtag%,name.ilike.%logo%,name.ilike.%booklet%');
  console.log('Accessories in materials:', accessories);
}

checkMaterials().catch(console.error);
