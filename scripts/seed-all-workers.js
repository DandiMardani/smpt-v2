const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const operators = [
  { code: 'OP001', name: 'SINTIA' },
  { code: 'OP002', name: 'NUR ROHMAH' },
  { code: 'OP003', name: 'RIKA' },
  { code: 'OP004', name: 'YANTI' },
  { code: 'OP005', name: 'ASIAH' },
  { code: 'OP006', name: 'HAMIDAH' },
  { code: 'OP007', name: 'FAUZIAH' },
  { code: 'OP008', name: 'ROHIMAH' },
  { code: 'OP009', name: 'ANDRI' },
  { code: 'OP010', name: 'ROHAELI' },
  { code: 'OP011', name: 'SUTAMA' },
  { code: 'OP012', name: 'NURDIN' },
  { code: 'OP013', name: 'AKANG' },
  { code: 'OP014', name: 'NASIH' },
  { code: 'OP015', name: 'RINI AYUNINGSIH' },
  { code: 'OP016', name: 'SITI NURLAELAH' },
  { code: 'OP017', name: 'MUYANAH' },
  { code: 'OP018', name: 'SIMAN' },
  { code: 'OP019', name: 'SUPARMAN' },
  { code: 'OP020', name: 'AJID SAPRIATNA' },
  { code: 'OP021', name: 'ENDANG GUNAWAN' },
  { code: 'OP022', name: 'AHMAD HASAN' },
  { code: 'OP023', name: 'SAMBAS' },
  { code: 'OP024', name: 'MUHAMMAD HASANUDIN' },
  { code: 'OP025', name: 'ARYANI' },
  { code: 'OP026', name: 'WAHYU/BAYU' },
  { code: 'OP027', name: 'SALIM' },
  { code: 'OP028', name: 'YEVI WINANJAR' },
  { code: 'OP029', name: 'SUHENRA' },
  { code: 'OP030', name: 'M NASRUDIN' },
  { code: 'OP031', name: 'SAPRUDIN' },
  { code: 'OP032', name: 'HERMAN' },
  { code: 'OP033', name: 'NURAJAT' },
  { code: 'OP034', name: 'BOBY' },
  { code: 'OP035', name: 'LILI RUSLI' },
  { code: 'OP036', name: 'SAEP' },
  { code: 'OP037', name: 'RIDWAN MAULANA' },
  { code: 'OP038', name: 'SOLEH' },
  { code: 'OP039', name: 'ASEP' },
  { code: 'OP040', name: 'NURYAMIN' },
  { code: 'OP041', name: 'NANA SUPRIATNA' },
  { code: 'OP042', name: 'SARIP HIDAYAT' },
  { code: 'OP043', name: 'ATO HUDOYO' },
  { code: 'OP044', name: 'SUBUR' },
  { code: 'OP045', name: 'ABDUL' },
  { code: 'OP046', name: 'KISMOYO/AMOY' },
  { code: 'OP047', name: 'FAHMI' },
  { code: 'OP048', name: 'TIKA RISMAWATI' },
  { code: 'OP049', name: 'ROZAK/AJAY' },
  { code: 'OP050', name: 'ROSIDIN/JABAR' },
  { code: 'OP051', name: 'SARIP BAWAH' },
  { code: 'OP052', name: 'DEDE SUTISNA/NTIS' },
  { code: 'OP053', name: 'NITA' },
  { code: 'OP054', name: 'IDA FARIDA' },
  { code: 'OP055', name: 'AAN ANDRIYANI' },
  { code: 'OP056', name: 'RINAH' },
  { code: 'OP057', name: 'NURDIN ATAS' },
  { code: 'OP058', name: 'JUHENI' },
  { code: 'OP059', name: 'DEDI' },
  { code: 'OP060', name: 'SARIPUDIN' },
  { code: 'OP061', name: 'AYI' },
  { code: 'OP062', name: 'YUYU WAHYUDIN/YUDI' },
  { code: 'OP063', name: 'FAISAL TANJUNG' },
  { code: 'OP064', name: 'MAHMUDIN' },
  { code: 'OP065', name: 'MUCHTAR' },
  { code: 'OP066', name: 'ATEP ODANG' },
  { code: 'OP067', name: 'SAEP/AMIN' },
  { code: 'OP068', name: 'MUHAMMAD HARIS/RAIS' },
  { code: 'OP069', name: 'MAMAN' },
  { code: 'OP070', name: 'YANI' },
  { code: 'OP071', name: 'UPENDI' },
  { code: 'OP072', name: 'DENI/PERMANA' },
  { code: 'OP073', name: 'ANGGI RAMDHANI' },
  { code: 'OP074', name: 'YAYAT' },
  { code: 'OP075', name: 'MAYA SAFITRI' }
];

const helpers = [
  { code: 'OP116', name: 'WINARTI NURAENI PUTRI' },
  { code: 'OP117', name: "SA'ANIH" },
  { code: 'OP118', name: 'MULYANAH' },
  { code: 'OP119', name: 'ARSIH SUWARSIH' },
  { code: 'OP120', name: 'DAHLIA' },
  { code: 'OP121', name: 'PUJI UTAMI' },
  { code: 'OP122', name: 'MAYANAH' },
  { code: 'OP123', name: 'NASYILA ADNIDA' },
  { code: 'OP124', name: 'MIMIH' },
  { code: 'OP125', name: 'DINDA ZAHRA' },
  { code: 'OP126', name: 'FAHRI' },
  { code: 'OP127', name: 'NURHASANAH/TEMBEN' },
  { code: 'OP128', name: 'DIMAS UBAIDILAH' },
  { code: 'OP129', name: 'SANDIKA' },
  { code: 'OP130', name: 'MURNI' }
];

const supervisorsAndCheckers = [
  { code: 'SPV001', name: 'PAK HARI', position: 'SPV PRODUKSI', department: 'PRODUKSI', pay_system: 'BULANAN', daily_wage: 0, monthly_salary: 4500000 },
  { code: 'CHK001', name: 'CHECKER PRODUKSI', position: 'CHECKER', department: 'PRODUKSI', pay_system: 'HARIAN', daily_wage: 75000, monthly_salary: 0 }
];

async function run() {
  const { data: auth, error: authErr } = await s.auth.signInWithPassword({
    email: 'dandimardani8@gmail.com',
    password: 'smptdev123@'
  });
  if (authErr) {
    console.error('Auth error:', authErr.message);
    return;
  }

  const allRecords = [
    ...operators.map(op => ({
      worker_code: op.code,
      name: op.name,
      department: 'PRODUKSI',
      position: 'OPERATOR JAHIT',
      pay_system: 'BORONGAN',
      daily_wage: 0,
      monthly_salary: 0,
      status: 'AKTIF'
    })),
    ...helpers.map(h => ({
      worker_code: h.code,
      name: h.name,
      department: 'PRODUKSI',
      position: 'HELPER',
      pay_system: 'HARIAN',
      daily_wage: 55000,
      monthly_salary: 0,
      status: 'AKTIF'
    })),
    ...supervisorsAndCheckers.map(sc => ({
      worker_code: sc.code,
      name: sc.name,
      department: sc.department,
      position: sc.position,
      pay_system: sc.pay_system,
      daily_wage: sc.daily_wage,
      monthly_salary: sc.monthly_salary,
      status: 'AKTIF'
    }))
  ];

  console.log(`Upserting ${allRecords.length} workers...`);
  const { data, error } = await s.from('workers').upsert(allRecords, { onConflict: 'worker_code' }).select('id, worker_code, name, position, pay_system, daily_wage');

  if (error) {
    console.error('Upsert error:', error);
  } else {
    console.log(`Successfully upserted ${data.length} workers!`);
    console.log('Sample operators:', data.slice(0, 3));
    console.log('Sample helpers:', data.filter(w => w.position === 'HELPER').slice(0, 3));
  }
}

run().catch(console.error);
