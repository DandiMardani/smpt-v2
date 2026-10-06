const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

async function testAll() {
  const { data: auth } = await s.auth.signInWithPassword({ email: 'dandimardani8@gmail.com', password: 'smptdev123@' });

  // 1. Cek SPV & Checker
  console.log('=== 1. CEK DATA SPV & CHECKER ===');
  const { data: spvs } = await s.from('workers').select('id, worker_code, name, position, department, pay_system').ilike('position', '%SPV%');
  console.log('SPV terdaftar:', spvs);

  const { data: checkers } = await s.from('workers').select('id, worker_code, name, position, department, pay_system').ilike('position', '%CHECKER%');
  console.log('Checker terdaftar:', checkers);

  const { data: checkerUsers } = await s.rpc('smpt_spk_checker_options');
  console.log('Checker login options (untuk form SPK):', checkerUsers);

  // 2. Cek SPK & Tombol Terbitkan SPK
  console.log('\n=== 2. CEK STATUS SPK PRODUKSI ===');
  const { data: orders } = await s.from('production_orders').select('id, order_code, order_date, status, notes').order('id', { ascending: false }).limit(5);
  console.log('Sample SPK terbaru:', orders);

  // 3. Cek Input Hasil Checker di /dashboard/borongan
  console.log('\n=== 3. CEK HASIL CHECKER ===');
  const { data: checks } = await s.from('production_checks').select('id, check_code, check_date, good_qty, reject_qty, status').order('id', { ascending: false }).limit(5);
  console.log('Sample Checker checks:', checks);

  // 4. Cek Batch Run Payroll Borongan
  console.log('\n=== 4. CEK BATCH PAYROLL BORONGAN ===');
  const { data: runs } = await s.from('operator_payroll_runs').select('*').order('id', { ascending: false }).limit(3);
  console.log('Runs:', runs);
}

testAll();
