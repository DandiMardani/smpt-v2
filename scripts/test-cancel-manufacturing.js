/**
 * Test Suite: cancel_manufacturing_transaction Security & Logic
 * Target Environment: DEV ONLY
 * 
 * Safeguards:
 * 1. Fail-closed allowlist verification of target Supabase URL & Project Ref before any mutation.
 * 2. Strict pre-flight validation of test user roles/permissions (fail immediately if user state is invalid).
 * 3. Isolated finished good fixture (does not contaminate business stock).
 * 4. Respects database trigger immutability (does NOT attempt to delete immutable ledger/event rows).
 * 5. Error-checked cleanup of disposable test users and references; halts on failure.
 */

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// ============================================================================
// 1. FAIL-CLOSED DEV ENVIRONMENT ALLOWLIST
// ============================================================================
const AUTHORIZED_DEV_ALLOWLIST = {
  urls: [
    'https://jqhkoelrouuqszqpuwib.supabase.co'
  ],
  refs: [
    'jqhkoelrouuqszqpuwib'
  ]
};

// Parse .env.local safely
if (!fs.existsSync('.env.local')) {
  console.error('FAIL-CLOSED: .env.local file not found.');
  process.exit(1);
}

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] || '';
const anonKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '';
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'] || '';

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error('FAIL-CLOSED: Missing required Supabase credentials in .env.local');
  process.exit(1);
}

// Strict allowlist validation
let parsedUrl;
try {
  parsedUrl = new URL(supabaseUrl);
} catch (e) {
  console.error('FAIL-CLOSED: Invalid NEXT_PUBLIC_SUPABASE_URL format:', supabaseUrl);
  process.exit(1);
}

const normalizedUrl = parsedUrl.origin.toLowerCase();
const projectRef = parsedUrl.hostname.split('.')[0].toLowerCase();

const isUrlAuthorized = AUTHORIZED_DEV_ALLOWLIST.urls.map(u => u.toLowerCase()).includes(normalizedUrl);
const isRefAuthorized = AUTHORIZED_DEV_ALLOWLIST.refs.map(r => r.toLowerCase()).includes(projectRef);

if (!isUrlAuthorized || !isRefAuthorized) {
  console.error('================================================================');
  console.error('⛔ FAIL-CLOSED SAFETY INTERLOCK ACTIVATED');
  console.error(`Target URL (${normalizedUrl}) or Ref (${projectRef}) is NOT in the authorized DEV allowlist!`);
  console.error('Refusing to execute tests or create test accounts.');
  console.error('================================================================');
  process.exit(1);
}

// ============================================================================
// 2. CLIENT INITIALIZATION
// ============================================================================
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Helper to prepare authenticated test sessions with strict role verification
async function setupAuthenticatedUser(email, targetRoleCode) {
  // A. Create user in auth schema
  let userId;
  const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password: 'Password123!',
    email_confirm: true
  });

  if (createErr) {
    if (createErr.message.includes('already been registered')) {
      const { data: prof } = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle();
      userId = prof?.id;
    } else {
      throw new Error(`[UserSetup] Failed creating auth user (${email}): ${createErr.message}`);
    }
  } else {
    userId = createData.user.id;
  }

  // B. Assign target role in profiles
  const { data: roleRow, error: roleErr } = await adminClient
    .from('roles')
    .select('id, code')
    .eq('code', targetRoleCode)
    .single();

  if (roleErr || !roleRow) {
    throw new Error(`[UserSetup] Target role '${targetRoleCode}' does not exist in roles table.`);
  }

  const { error: profUpdErr } = await adminClient
    .from('profiles')
    .update({ role_id: roleRow.id, is_active: true })
    .eq('id', userId);

  if (profUpdErr) {
    throw new Error(`[UserSetup] Failed updating profile for ${email}: ${profUpdErr.message}`);
  }

  // C. Generate magiclink and verify OTP to obtain authentic session access_token
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email
  });
  if (linkErr) throw new Error(`[UserSetup] generateLink failed for ${email}: ${linkErr.message}`);

  const tokenHash = linkData.properties.hashed_token;
  const { data: otpData, error: otpErr } = await anonClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink'
  });
  if (otpErr) throw new Error(`[UserSetup] verifyOtp failed for ${email}: ${otpErr.message}`);

  const accessToken = otpData.session.access_token;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // D. Strict runtime verification of assigned role & permissions
  const { data: verifiedRole, error: vRoleErr } = await client.rpc('current_user_role');
  if (vRoleErr || verifiedRole !== targetRoleCode) {
    throw new Error(`[UserSetup] Role verification failed for ${email}. Expected: ${targetRoleCode}, Got: ${verifiedRole} (${vRoleErr?.message})`);
  }

  const { data: permRows, error: vPermErr } = await client.rpc('current_user_permissions');
  if (vPermErr) {
    throw new Error(`[UserSetup] Failed fetching permissions for ${email}: ${vPermErr.message}`);
  }

  const permCodes = (permRows || []).map(r => r.permission_code);

  if (targetRoleCode === 'USER') {
    // Must NOT have manufacturing write permissions
    const forbiddenPerms = ['manufaktur.titipan.write', 'manufaktur.barang_luar.write', 'manufaktur.pengiriman.write'];
    const hasForbidden = forbiddenPerms.some(p => permCodes.includes(p));
    if (hasForbidden || verifiedRole === 'ADMIN') {
      throw new Error(`[UserSetup] Security assertion failed: Unauthorized test user ${email} unexpectedly possesses write permissions!`);
    }
  } else if (targetRoleCode === 'ADMIN') {
    if (verifiedRole !== 'ADMIN') {
      throw new Error(`[UserSetup] Security assertion failed: Authorized test user ${email} is not ADMIN.`);
    }
  }

  return { client, userId, email, accessToken, role: verifiedRole };
}

// ============================================================================
// 3. TEST SUITE EXECUTION
// ============================================================================
async function runTests() {
  console.log('================================================================');
  console.log('🧪 DEV TEST: cancel_manufacturing_transaction Security & Reversal');
  console.log('Verified Target URL:', normalizedUrl);
  console.log('Verified Project Ref:', projectRef);
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  let isolatedFg = null;
  let inboundEventId = null;
  let fixtureTx = null;
  let unauthSession = null;
  let authAdminSession = null;
  let locId = null;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Isolated Stock Fixture & Initial Inbound Event
    // ------------------------------------------------------------------------
    console.log('📦 STEP 1: Creating isolated stock fixture & inbound transaction...');

    // 1a. Cari lokasi gudang yang valid
    const { data: locRow, error: locErr } = await adminClient
      .from('locations')
      .select('id, name')
      .order('id', { ascending: true })
      .limit(1)
      .single();

    if (locErr || !locRow) {
      throw new Error(`[Setup] Tidak ada lokasi gudang yang tersedia: ${locErr?.message}`);
    }
    locId = locRow.id;
    console.log(`  -> Lokasi gudang uji ID: ${locId} (${locRow.name})`);

    // 1b. Buat barang jadi terisolasi
    const fgCode = 'FG-TEST-ISO-' + Date.now();
    const { data: fgData, error: fgErr } = await adminClient
      .from('finished_goods')
      .insert({
        finished_good_code: fgCode,
        name: 'TEST ISOLATED FG ' + Date.now(),
        unit: 'PCS',
        status: 'AKTIF'
      })
      .select('*')
      .single();

    if (fgErr || !fgData) {
      throw new Error(`[Setup] Gagal membuat finished_good terisolasi: ${fgErr?.message}`);
    }
    isolatedFg = fgData;
    console.log(`  -> Isolated Finished Good ID: ${isolatedFg.id} (${isolatedFg.finished_good_code})`);

    // 1c. Catat stok masuk awal (+10 PCS) via smpt_new_logistics_event & smpt_apply_logistics_stock
    const initialQty = 10;
    const { data: eventId, error: eventErr } = await adminClient.rpc('smpt_new_logistics_event', {
      p_event_type: 'MANUFAKTUR BARANG LUAR',
      p_reference_type: 'MANUFAKTUR',
      p_reference_id: 0,
      p_reference_code: 'INIT-' + fgCode,
      p_event_date: new Date().toISOString().slice(0, 10),
      p_notes: 'Initial isolated test stock',
      p_reversal_of: null
    });

    if (eventErr || !eventId) {
      throw new Error(`[Setup] Gagal membuat logistics event awal: ${eventErr?.message}`);
    }
    inboundEventId = eventId;

    const { error: applyErr } = await adminClient.rpc('smpt_apply_logistics_stock', {
      p_event_id: inboundEventId,
      p_item_kind: 'FINISHED_GOOD',
      p_finished_good_id: isolatedFg.id,
      p_set_id: null,
      p_location_id: locId,
      p_delta: initialQty,
      p_unit: 'PCS',
      p_kind: 'MANUFAKTUR MASUK',
      p_notes: 'Initial test stock ledger entry'
    });

    if (applyErr) {
      throw new Error(`[Setup] Gagal mutasi stok awal: ${applyErr.message}`);
    }

    // Verifikasi saldo awal = 10
    const { data: initialBalance } = await adminClient
      .from('logistics_stock_balances')
      .select('quantity')
      .eq('item_kind', 'FINISHED_GOOD')
      .eq('finished_good_id', isolatedFg.id)
      .eq('location_id', locId)
      .single();

    assert(Number(initialBalance?.quantity) === initialQty, `Saldo awal stok terisolasi tercatat tepat ${initialQty}`);

    // 1d. Buat transaksi manufaktur BARANG_LUAR dengan logistics_event_id asal
    const mfgCode = 'MFG-TEST-ISO-' + Date.now();
    const { data: txData, error: txErr } = await adminClient
      .from('manufacturing_transactions')
      .insert({
        manufacturing_code: mfgCode,
        transaction_date: new Date().toISOString().slice(0, 10),
        flow_type: 'BARANG_LUAR',
        finished_good_id: isolatedFg.id,
        quantity: initialQty,
        unit: 'PCS',
        status: 'AKTIF',
        logistics_event_id: inboundEventId,
        description: 'Test Fixture BARANG_LUAR dengan ledger event terikat'
      })
      .select('*')
      .single();

    if (txErr || !txData) {
      throw new Error(`[Setup] Gagal membuat manufacturing_transaction: ${txErr?.message}`);
    }
    fixtureTx = txData;
    console.log(`  -> Transaksi manufaktur fixture ID: ${fixtureTx.id} (${fixtureTx.manufacturing_code})\n`);

    // ------------------------------------------------------------------------
    // TEST 1: Anon / Unauthenticated Rejection
    // ------------------------------------------------------------------------
    console.log('▶️ TEST 1: Pemanggil Anonim / Unauthenticated ditolak fail-closed');
    const { data: anonData, error: anonErr } = await anonClient.rpc('cancel_manufacturing_transaction', {
      p_id: fixtureTx.id,
      p_reason: 'Percobaan pembatalan anonim'
    });

    assert(anonErr !== null, 'Pemanggil anonim wajib ditolak dengan error');
    if (anonErr) {
      const is42501 = anonErr.code === '42501' || anonErr.message.includes('42501') || anonErr.message.includes('Akses ditolak') || anonErr.message.includes('permission denied');
      assert(is42501, `Error penolakan anonim sesuai ekspektasi (${anonErr.code || anonErr.message})`);
    }

    // ------------------------------------------------------------------------
    // TEST 2: Sesi Authenticated TANPA IZIN (Role: USER) Ditolak Fail-Closed (42501)
    // ------------------------------------------------------------------------
    console.log('\n▶️ TEST 2: Sesi Authenticated TANPA IZIN (Role: USER)');
    const unauthEmail = 'unauth_user_' + Date.now() + '@gmail.com';
    unauthSession = await setupAuthenticatedUser(unauthEmail, 'USER');
    console.log(`  -> User sesi terverifikasi tanpa izin: ${unauthSession.email} (Role: ${unauthSession.role})`);

    const { data: unauthData, error: unauthErr } = await unauthSession.client.rpc('cancel_manufacturing_transaction', {
      p_id: fixtureTx.id,
      p_reason: 'Percobaan pembatalan tanpa izin manufaktur'
    });

    assert(unauthErr !== null, 'Panggilan authenticated tanpa izin harus ditolak');
    if (unauthErr) {
      const is42501 = unauthErr.code === '42501' || unauthErr.message.includes('42501') || unauthErr.message.includes('Tidak memiliki izin');
      assert(is42501, `Error penolakan kode 42501 sesuai ekspektasi (${unauthErr.code}: ${unauthErr.message})`);
    }

    // Verifikasi data dan saldo stok sama sekali TIDAK termutasi
    const { data: txCheck1 } = await adminClient
      .from('manufacturing_transactions')
      .select('status')
      .eq('id', fixtureTx.id)
      .single();
    assert(txCheck1?.status === 'AKTIF', 'Status transaksi tetap AKTIF setelah penolakan user tanpa izin');

    const { data: balCheck1 } = await adminClient
      .from('logistics_stock_balances')
      .select('quantity')
      .eq('item_kind', 'FINISHED_GOOD')
      .eq('finished_good_id', isolatedFg.id)
      .eq('location_id', locId)
      .single();
    assert(Number(balCheck1?.quantity) === initialQty, `Saldo stok terisolasi tetap ${initialQty} (tidak berubah)`);

    // ------------------------------------------------------------------------
    // TEST 3: Sesi Authenticated BERIZIN (Role: ADMIN) Berhasil Membatalkan & Reversal
    // ------------------------------------------------------------------------
    console.log('\n▶️ TEST 3: Sesi Authenticated BERIZIN (Role: ADMIN)');
    const authAdminEmail = 'auth_admin_' + Date.now() + '@gmail.com';
    authAdminSession = await setupAuthenticatedUser(authAdminEmail, 'ADMIN');
    console.log(`  -> User sesi terverifikasi berizin: ${authAdminSession.email} (Role: ${authAdminSession.role})`);

    const cancelReason = 'Pembatalan resmi oleh Supervisor Produksi';
    const { data: authCancelData, error: authCancelErr } = await authAdminSession.client.rpc('cancel_manufacturing_transaction', {
      p_id: fixtureTx.id,
      p_reason: cancelReason
    });

    assert(authCancelErr === null, `User berizin berhasil membatalkan transaksi (Error: ${authCancelErr?.message})`);

    // Verifikasi status transaksi beralih ke DIBATALKAN
    const { data: txCheck2 } = await adminClient
      .from('manufacturing_transactions')
      .select('status, description')
      .eq('id', fixtureTx.id)
      .single();
    assert(txCheck2?.status === 'DIBATALKAN', 'Status transaksi berhasil beralih ke DIBATALKAN');
    assert(txCheck2?.description.includes(cancelReason), 'Deskripsi transaksi mencatat alasan pembatalan');

    // Verifikasi saldo stok berkurang dari 10 menjadi 0 (reversal stok akurat)
    const { data: balCheck2 } = await adminClient
      .from('logistics_stock_balances')
      .select('quantity')
      .eq('item_kind', 'FINISHED_GOOD')
      .eq('finished_good_id', isolatedFg.id)
      .eq('location_id', locId)
      .single();
    assert(Number(balCheck2?.quantity) === 0, 'Saldo stok terisolasi berkurang tepat menjadi 0');

    // Verifikasi reversal event tersimpan dengan reversal_of_event_id yang valid
    const { data: revEvents } = await adminClient
      .from('logistics_stock_events')
      .select('id, event_type, reversal_of_event_id')
      .eq('reference_id', fixtureTx.id)
      .eq('event_type', 'CANCEL_MANUFACTURING_BARANG_LUAR');

    assert(revEvents && revEvents.length === 1, 'Reversal logistics event tercatat satu kali');
    assert(revEvents?.[0]?.reversal_of_event_id == inboundEventId, 'Reversal event terhubung tepat ke inboundEventId asal');

    // ------------------------------------------------------------------------
    // TEST 4: Idempotensi / Pencegahan Pembatalan Ganda
    // ------------------------------------------------------------------------
    console.log('\n▶️ TEST 4: Idempotensi pembatalan ganda');
    const { data: dupData, error: dupErr } = await authAdminSession.client.rpc('cancel_manufacturing_transaction', {
      p_id: fixtureTx.id,
      p_reason: 'Percobaan pembatalan kedua'
    });

    assert(dupErr !== null, 'Pembatalan kedua kali pada transaksi yang sudah dibatalkan wajib ditolak');
    assert(dupErr?.message.includes('sudah dibatalkan sebelumnya'), `Pesan error idempotensi sesuai: ${dupErr?.message}`);

  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP: Disposable Users & Fixture Deactivation (Fail-Closed Cleanup)
    // Catatan: logistics_stock_ledger dan logistics_stock_events dilindungi trigger
    // immutability (immutable accounting ledger). Sisa saldo terisolasi bernilai 0.
    // ------------------------------------------------------------------------
    console.log('\n🧹 CLEANUP: Membersihkan disposable test accounts & entitas uji...');
    const cleanupFailures = [];

    // 1. Nonaktifkan transaksi manufaktur uji
    if (fixtureTx) {
      const { error: txDelErr } = await adminClient
        .from('manufacturing_transactions')
        .delete()
        .eq('id', fixtureTx.id);
      if (txDelErr) cleanupFailures.push(`Gagal menghapus manufacturing_transactions (${fixtureTx.id}): ${txDelErr.message}`);
    }

    // 2. Nonaktifkan / hapus finished good terisolasi
    if (isolatedFg) {
      const { error: fgDelErr } = await adminClient
        .from('finished_goods')
        .delete()
        .eq('id', isolatedFg.id);
      // Jika foreign key ledger mencegah delete, tandai sebagai NONAKTIF agar tidak tampil di aplikasi
      if (fgDelErr) {
        const { error: fgDeactErr } = await adminClient
          .from('finished_goods')
          .update({ status: 'NONAKTIF', name: '[TEST DISPOSABLE - SELESAI] ' + isolatedFg.name })
          .eq('id', isolatedFg.id);
        if (fgDeactErr) cleanupFailures.push(`Gagal menonaktifkan finished_goods (${isolatedFg.id}): ${fgDeactErr.message}`);
      }
    }

    // 3. Hapus disposable auth users & profiles
    const usersToDelete = [unauthSession?.userId, authAdminSession?.userId].filter(Boolean);
    for (const uid of usersToDelete) {
      const { error: profErr } = await adminClient.from('profiles').delete().eq('id', uid);
      if (profErr) cleanupFailures.push(`Gagal menghapus profile (${uid}): ${profErr.message}`);

      const { error: authErr } = await adminClient.auth.admin.deleteUser(uid);
      if (authErr) cleanupFailures.push(`Gagal menghapus auth user (${uid}): ${authErr.message}`);
    }

    if (cleanupFailures.length > 0) {
      console.error('❌ CLEANUP GAGAL:', cleanupFailures);
      throw new Error(`Cleanup gagal dengan ${cleanupFailures.length} error:\n${cleanupFailures.join('\n')}`);
    } else {
      console.log('  ✅ Cleanup akun dan data uji disposable selesai tanpa error.');
    }
  }

  console.log('\n================================================================');
  console.log(`📊 RINGKASAN TEST: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

// Eksekusi jika dijalankan langsung
if (require.main === module) {
  runTests().catch(err => {
    console.error('Fatal error during test run:', err.message);
    process.exit(1);
  });
}

module.exports = { runTests, AUTHORIZED_DEV_ALLOWLIST };
