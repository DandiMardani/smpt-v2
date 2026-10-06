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
  const { data } = await s.from('work_items').select('id, item_code, name, operator_price, proposed_price, executor_scope, submission_category').eq('product_id', 3).order('id');
  console.log('Work items count for Tas Paspor:', data.length);
  data.forEach(item => {
    console.log(`${item.id} | ${item.item_code} | ${item.name} | op:${item.operator_price} | prop:${item.proposed_price} | scope:${item.executor_scope} | sub:${item.submission_category}`);
  });
}
run();
