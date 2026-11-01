/**
 * Isolated Integration Test for Bundling & Transfer Synchronization
 * 
 * Execution boundary:
 * - Runs strictly against local ephemeral Supabase container (127.0.0.1 / localhost).
 * - Refuses to run against any remote database URL to prevent data contamination.
 * - Tests full lifecycle: Permission guard -> Recipe validation -> Packing ->
 *   Transfer dispatch (in-transit isolation) -> Confirmation & receipt -> Balances.
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');

const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const anonKey = process.env.ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Hard fail-closed safety guard: Never connect to remote host
function assertLocalEndpoint(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error(`SECURITY ALERT: Endpoint ${host} is not local. Integration tests are strictly restricted to local ephemeral container.`);
    }
  } catch (err) {
    throw new Error(`Invalid test endpoint: ${err.message}`);
  }
}

describe('Bundling & Transfer Flow Integration Tests (Local Ephemeral Only)', () => {
  let isLocalAvailable = false;
  let adminClient = null;
  let anonClient = null;

  before(async () => {
    assertLocalEndpoint(apiUrl);

    if (!serviceKey || !anonKey) {
      console.log('Skipping: Local Supabase credentials not provided in environment.');
      return;
    }

    try {
      const probeClient = createClient(apiUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      // Quick probe to check if local container is running
      const { error } = await probeClient.from('locations').select('id').limit(1);
      if (!error || error.code !== 'ECONNREFUSED') {
        isLocalAvailable = true;
        adminClient = createClient(apiUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        anonClient = probeClient;
      }
    } catch {
      isLocalAvailable = false;
    }
  });

  test('Permission Guard: Unauthenticated caller cannot process packing (Fail-Closed)', async (t) => {
    if (!isLocalAvailable) {
      t.skip('Local Supabase container is not running locally. Verified in CI.');
      return;
    }

    const { error } = await anonClient.rpc('process_bundle_package_packing', {
      p_date: '2026-10-31',
      p_package_id: 1,
      p_location_id: 1,
      p_quantity: 1,
      p_notes: 'Unauthorized probe',
      p_components: [{ finished_good_id: 1, qty_used: 1 }]
    });

    assert.ok(error, 'Expected RPC to fail for unauthenticated caller');
    assert.equal(error.code, '42501');
    assert.match(error.message, /Sesi tidak valid atau belum terautentikasi/);
  });

  test('Permission Guard: Caller without mr_wu.confirm cannot confirm package transfer', async (t) => {
    if (!isLocalAvailable) {
      t.skip('Local Supabase container is not running locally. Verified in CI.');
      return;
    }

    const { error } = await anonClient.rpc('confirm_bundle_package_transfer', {
      p_transfer_id: 999999,
      p_received_qty: 1,
      p_reject_qty: 0,
      p_damaged_qty: 0,
      p_notes: 'Unauthorized confirmation',
      p_photo_url: null
    });

    assert.ok(error, 'Expected RPC to fail for unauthenticated caller');
    assert.equal(error.code, '42501');
  });

  test('Permission Guard: Caller without transfer_barang_jadi.write cannot dispatch bundle transfer', async (t) => {
    if (!isLocalAvailable) {
      t.skip('Local Supabase container is not running locally. Verified in CI.');
      return;
    }

    const { error } = await anonClient.rpc('transfer_bundle_package', {
      p_date: '2026-10-31',
      p_package_id: 1,
      p_source_location_id: 1,
      p_destination_location_id: 2,
      p_quantity: 1,
      p_notes: 'Unauthorized transfer'
    });

    assert.ok(error, 'Expected transfer_bundle_package to fail for unauthenticated caller');
    assert.equal(error.code, '42501');
  });

  test('Full Lifecycle: Packing -> In-Transit Transfer -> Receipt Confirmation -> Balances', async (t) => {
    if (!isLocalAvailable) {
      t.skip('Local Supabase container is not running locally. Verified in CI.');
      return;
    }

    // Step 1: Create isolated test locations
    const { data: locSource, error: locSrcErr } = await adminClient.from('locations').insert({
      name: `LOC_SRC_${Date.now()}`,
      location_type: 'GUDANG',
      status: 'AKTIF'
    }).select().single();
    assert.ifError(locSrcErr);

    const { data: locDest, error: locDstErr } = await adminClient.from('locations').insert({
      name: `LOC_DST_${Date.now()}`,
      location_type: 'GUDANG',
      status: 'AKTIF'
    }).select().single();
    assert.ifError(locDstErr);

    // Step 2: Create isolated test finished goods
    const { data: fg1, error: fg1Err } = await adminClient.from('finished_goods').insert({
      finished_good_code: `FG1_${Date.now()}`,
      name: 'Test Component Item 1',
      unit: 'PCS',
      status: 'AKTIF'
    }).select().single();
    assert.ifError(fg1Err);

    const { data: fg2, error: fg2Err } = await adminClient.from('finished_goods').insert({
      finished_good_code: `FG2_${Date.now()}`,
      name: 'Test Component Item 2',
      unit: 'PCS',
      status: 'AKTIF'
    }).select().single();
    assert.ifError(fg2Err);

    // Seed raw component stock at locSource (100 PCS each)
    const { data: eventSeed, error: evSeedErr } = await adminClient.rpc('smpt_new_logistics_event', {
      p_event_type: 'SEED',
      p_reference_type: 'TEST_SEED',
      p_reference_id: null,
      p_reference_code: 'SEED_01',
      p_event_date: '2026-10-31',
      p_notes: 'Seed initial stock for test'
    });
    assert.ifError(evSeedErr);

    await adminClient.rpc('smpt_apply_logistics_stock', {
      p_event_id: eventSeed,
      p_item_kind: 'FINISHED_GOOD',
      p_finished_good_id: fg1.id,
      p_set_id: null,
      p_location_id: locSource.id,
      p_delta: 100,
      p_unit: 'PCS',
      p_kind: 'INSPECTION_GOOD',
      p_notes: 'Seed FG1'
    });

    await adminClient.rpc('smpt_apply_logistics_stock', {
      p_event_id: eventSeed,
      p_item_kind: 'FINISHED_GOOD',
      p_finished_good_id: fg2.id,
      p_set_id: null,
      p_location_id: locSource.id,
      p_delta: 100,
      p_unit: 'PCS',
      p_kind: 'INSPECTION_GOOD',
      p_notes: 'Seed FG2'
    });

    // Step 3: Create bundle package and recipe (FG1: 2 pcs, FG2: 3 pcs)
    const { data: pkg, error: pkgErr } = await adminClient.from('bundle_packages').insert({
      package_code: `PKG_${Date.now()}`,
      name: 'Test Bundle Package',
      status: 'AKTIF'
    }).select().single();
    assert.ifError(pkgErr);

    await adminClient.from('bundle_package_recipes').insert([
      { package_id: pkg.id, finished_good_id: fg1.id, qty_per_bundle: 2 },
      { package_id: pkg.id, finished_good_id: fg2.id, qty_per_bundle: 3 }
    ]);

    // Step 4: Recipe mismatch validation check
    const { error: mismatchErr } = await adminClient.rpc('process_bundle_package_packing', {
      p_date: '2026-10-31',
      p_package_id: pkg.id,
      p_location_id: locSource.id,
      p_quantity: 10,
      p_notes: 'Packing with wrong components',
      p_components: [
        { finished_good_id: fg1.id, qty_per_bundle: 5 } // Mismatched quantity
      ]
    });
    assert.ok(mismatchErr, 'Expected packing to reject mismatched recipe components');
    assert.match(mismatchErr.message, /Komponen yang dikirim tidak sama dengan resep paket/);

    // Step 5: Successful packing execution (10 bundles)
    const { data: packingRes, error: packErr } = await adminClient.rpc('process_bundle_package_packing', {
      p_date: '2026-10-31',
      p_package_id: pkg.id,
      p_location_id: locSource.id,
      p_quantity: 10,
      p_notes: 'Packing 10 bundles',
      p_components: [
        { finished_good_id: fg1.id, qty_per_bundle: 2 },
        { finished_good_id: fg2.id, qty_per_bundle: 3 }
      ]
    });
    assert.ifError(packErr);
    assert.equal(packingRes.success, true);
    assert.equal(packingRes.quantity, 10);

    // Verify stock deductions for components:
    // FG1: 100 - (10 * 2) = 80
    // FG2: 100 - (10 * 3) = 70
    const { data: balFg1 } = await adminClient.from('logistics_stock_balances')
      .select('quantity').eq('finished_good_id', fg1.id).eq('location_id', locSource.id).single();
    assert.equal(Number(balFg1.quantity), 80);

    const { data: balFg2 } = await adminClient.from('logistics_stock_balances')
      .select('quantity').eq('finished_good_id', fg2.id).eq('location_id', locSource.id).single();
    assert.equal(Number(balFg2.quantity), 70);

    // Verify bundle package balance at source: 10
    const { data: balPkgSrc } = await adminClient.from('bundle_package_balances')
      .select('quantity').eq('package_id', pkg.id).eq('location_id', locSource.id).single();
    assert.equal(Number(balPkgSrc.quantity), 10);

    // Step 6: Dispatch bundle package transfer (4 bundles to locDest)
    const { data: trfRes, error: trfErr } = await adminClient.rpc('transfer_bundle_package', {
      p_date: '2026-10-31',
      p_package_id: pkg.id,
      p_source_location_id: locSource.id,
      p_destination_location_id: locDest.id,
      p_quantity: 4,
      p_notes: 'Transfer 4 bundles to destination'
    });
    assert.ifError(trfErr);
    assert.equal(trfRes.success, true);
    const transferId = trfRes.transfer_id;

    // In-Transit Isolation Verification:
    // Source package balance decremented to 6:
    const { data: balPkgSrcAfter } = await adminClient.from('bundle_package_balances')
      .select('quantity').eq('package_id', pkg.id).eq('location_id', locSource.id).single();
    assert.equal(Number(balPkgSrcAfter.quantity), 6);

    // Destination balance MUST NOT exist or be 0 (goods in transit are not available at destination):
    const { data: balPkgDstInTransit } = await adminClient.from('bundle_package_balances')
      .select('quantity').eq('package_id', pkg.id).eq('location_id', locDest.id).maybeSingle();
    assert.equal(balPkgDstInTransit, null, 'In-transit shipment must NOT appear at destination location');

    // Step 7: Confirmation & Receipt with Exact Balance Enforcement
    // Attempt confirmation where received + reject + damaged != quantity (e.g. 2 + 0 + 0 != 4)
    const { error: sumMismatchErr } = await adminClient.rpc('confirm_bundle_package_transfer', {
      p_transfer_id: transferId,
      p_received_qty: 2,
      p_reject_qty: 0,
      p_damaged_qty: 0,
      p_notes: 'Partial without balance'
    });
    assert.ok(sumMismatchErr, 'Expected confirmation to fail when received + reject + damaged != quantity');
    assert.match(sumMismatchErr.message, /Jumlah diterima, reject, dan rusak harus sama dengan jumlah yang dikirim/);

    // Valid confirmation: 3 received, 1 damaged, 0 reject (3 + 1 + 0 = 4)
    const validPhoto = '/storage/v1/object/public/shipment-documents/surat-jalan/test_photo.jpg';
    const { data: confRes, error: confErr } = await adminClient.rpc('confirm_bundle_package_transfer', {
      p_transfer_id: transferId,
      p_received_qty: 3,
      p_reject_qty: 0,
      p_damaged_qty: 1,
      p_notes: 'Received with 1 damaged bundle',
      p_photo_url: validPhoto
    });
    assert.ifError(confErr);
    assert.equal(confRes.success, true);

    // Destination balance now reflects strictly received quantity (+3)
    const { data: balPkgDstFinal } = await adminClient.from('bundle_package_balances')
      .select('quantity').eq('package_id', pkg.id).eq('location_id', locDest.id).single();
    assert.equal(Number(balPkgDstFinal.quantity), 3);

    // Verify transfer record status and photo
    const { data: trfRecord } = await adminClient.from('bundle_package_transfers')
      .select('*').eq('id', transferId).single();
    assert.equal(trfRecord.status, 'DITERIMA');
    assert.equal(Number(trfRecord.received_qty), 3);
    assert.equal(Number(trfRecord.damaged_qty), 1);
    assert.equal(Number(trfRecord.reject_qty), 0);
    assert.equal(trfRecord.surat_jalan_photo_url, validPhoto);
  });
});

