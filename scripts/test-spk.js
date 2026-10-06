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
  const { data: checkers, error: cErr } = await s.rpc('smpt_spk_checker_options');
  console.log('Checker options:', checkers, cErr);

  const { data: projects } = await s.from('projects').select('id, name, product_category');
  console.log('Projects:', projects);

  const { data: prods } = await s.from('project_products').select('id, project_id, name');
  console.log('Project products:', prods);
}

run();
