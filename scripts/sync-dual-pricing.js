const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const pasporTarif = {
  37: { opPrice: 100, propPrice: 200 },
  38: { opPrice: 100, propPrice: 200 },
  39: { opPrice: 75, propPrice: 175 },
  40: { opPrice: 75, propPrice: 175 },
  41: { opPrice: 175, propPrice: 275 },
  42: { opPrice: 70, propPrice: 170 },
  43: { opPrice: 75, propPrice: 175 },
  44: { opPrice: 175, propPrice: 275 },
  46: { opPrice: 50, propPrice: 120 },
  47: { opPrice: 250, propPrice: 350 },
  50: { opPrice: 190, propPrice: 290 },
  51: { opPrice: 200, propPrice: 300 },
  52: { opPrice: 50, propPrice: 150 },
  56: { opPrice: 30, propPrice: 130 },
  57: { opPrice: 50, propPrice: 150 },
  60: { opPrice: 700, propPrice: 800 },
  61: { opPrice: 700, propPrice: 800 },
  65: { opPrice: 80, propPrice: 80 },
  66: { opPrice: 150, propPrice: 150 }
};

const ranselTarif = {
  68: { opPrice: 60, propPrice: 160 },
  69: { opPrice: 225, propPrice: 325 },
  70: { opPrice: 225, propPrice: 325 },
  71: { opPrice: 160, propPrice: 260 },
  72: { opPrice: 100, propPrice: 200 },
  76: { opPrice: 400, propPrice: 500 },
  77: { opPrice: 125, propPrice: 225 },
  79: { opPrice: 100, propPrice: 200 },
  80: { opPrice: 150, propPrice: 250 },
  82: { opPrice: 150, propPrice: 250 },
  84: { opPrice: 100, propPrice: 200 },
  85: { opPrice: 30, propPrice: 130 },
  86: { opPrice: 50, propPrice: 150 },
  88: { opPrice: 100, propPrice: 200 },
  90: { opPrice: 100, propPrice: 200 },
  91: { opPrice: 100, propPrice: 200 },
  95: { opPrice: 800, propPrice: 900 }
};

async function run() {
  await s.auth.signInWithPassword({ email: 'dandimardani8@gmail.com', password: 'smptdev123@' });

  // 1. Update master work_items to ensure operator_price = opPrice and proposed_price = propPrice
  for (const [idStr, t] of Object.entries(pasporTarif)) {
    await s.from('work_items').update({ operator_price: t.opPrice, proposed_price: t.propPrice }).eq('id', Number(idStr));
  }
  for (const [idStr, t] of Object.entries(ranselTarif)) {
    await s.from('work_items').update({ operator_price: t.opPrice, proposed_price: t.propPrice }).eq('id', Number(idStr));
  }
  console.log('Master work_items updated with dual prices: operator_price and proposed_price!');

  // 2. Update production_order_items snapshots
  const { data: poi } = await s.from('production_order_items').select('id, work_item_id, order_id');
  for (const item of poi) {
    const t = pasporTarif[item.work_item_id] || ranselTarif[item.work_item_id];
    if (t) {
      await s.from('production_order_items').update({
        operator_price_snapshot: t.opPrice,
        submission_price_snapshot: t.propPrice
      }).eq('id', item.id);
    }
  }
  console.log('Production order items snapshots updated!');

  // 3. Update operator_payroll_items for run 5
  const { data: opItems } = await s.from('operator_payroll_items').select('id, work_item_id, qty_approved').eq('run_id', 5);
  let totOp = 0;
  let totSub = 0;
  for (const it of opItems) {
    const t = pasporTarif[it.work_item_id] || ranselTarif[it.work_item_id];
    if (t) {
      const opVal = Number(it.qty_approved) * t.opPrice;
      const subVal = Number(it.qty_approved) * t.propPrice;
      totOp += opVal;
      totSub += subVal;
      await s.from('operator_payroll_items').update({
        operator_price_snapshot: t.opPrice,
        submission_price_snapshot: t.propPrice,
        operator_value: opVal,
        submission_value: subVal
      }).eq('id', it.id);
    }
  }

  // 4. Update operator_payroll_runs
  await s.from('operator_payroll_runs').update({
    total_operator_value: totOp,
    total_submission_value: totSub
  }).eq('id', 5);

  console.log(`Run 5 successfully synchronized!`);
  console.log(`Total Penggajian Real Operator: Rp ${totOp.toLocaleString('id-ID')}`);
  console.log(`Total Pengajuan: Rp ${totSub.toLocaleString('id-ID')}`);
  console.log(`Selisih Margin: Rp ${(totSub - totOp).toLocaleString('id-ID')}`);
}

run();
