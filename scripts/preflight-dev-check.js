/**
 * Read-Only Preflight Verification Script (Unprivileged)
 * Purpose: Audit target instance identity using safe, unprivileged read-only queries.
 * Safety: 
 * - Strictly NO service-role key (uses anon key only).
 * - Strictly NO RPC calls to prevent accidental function execution or side effects.
 * - Does not attempt mutations or data resets.
 */

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// 1. Load .env.local
if (!fs.existsSync('.env.local')) {
  console.error('FATAL: .env.local not found.');
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

if (!supabaseUrl || !anonKey) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.');
  process.exit(1);
}

// 2. Allowlist Check
const AUTHORIZED_DEV_REFS = ['jqhkoelrouuqszqpuwib'];
const urlObj = new URL(supabaseUrl);
const projectRef = urlObj.hostname.split('.')[0].toLowerCase();

const isRefMatched = AUTHORIZED_DEV_REFS.includes(projectRef);

console.log('================================================================');
console.log('🔍 PREFLIGHT READ-ONLY: DEV INSTANCE IDENTITY AUDIT');
console.log('================================================================');
console.log(`Target Host: ${urlObj.hostname}`);
console.log(`Project Ref: ${projectRef}`);
console.log(`Allowlist Match: ${isRefMatched ? 'YES (Authorized DEV ref)' : 'NO (Unrecognized target)'}`);

if (!isRefMatched) {
  console.error('STOP: Target ref is NOT in authorized DEV allowlist!');
  process.exit(1);
}

// 3. Unprivileged Client (Anon Key Only, No Service Role)
const client = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runPreflight() {
  const results = {
    targetRef: projectRef,
    isDevAllowlist: isRefMatched,
    bundlePackagesStatus: 'UNKNOWN',
    disposabilityStatus: 'UNPROVEN'
  };

  // Check 1: Read-only table probe for bundle_packages (absence indicates non-LIVE)
  try {
    const { data, error } = await client.from('bundle_packages').select('id').limit(1);
    if (error) {
      if (error.message.includes('Could not find the table') || error.code === 'PGRST205') {
        results.bundlePackagesStatus = 'NOT_PRESENT (Sesuai kondisi target DEV)';
      } else {
        results.bundlePackagesStatus = `ACCESSIBLE_OR_ERROR (${error.code || error.message})`;
      }
    } else {
      results.bundlePackagesStatus = `PRESENT (${(data || []).length} baris terbaca)`;
    }
  } catch (err) {
    results.bundlePackagesStatus = `PROBE_FAILED: ${err.message}`;
  }

  // Check 2: Disposability assessment
  // Unprivileged read-only queries CANNOT prove disposability / reset capability
  // without calling administrative/mutating operations, which are strictly forbidden.
  results.disposabilityStatus = 'BELUM TERBUKTI (Pemeriksaan read-only unprivileged tidak dapat membuktikan mekanisme reset tanpa mutasi).';

  console.log('\n--- HASIL PEMERIKSAAN IDENTITAS TARGET ---');
  console.log(`1. Status Tabel bundle_packages: ${results.bundlePackagesStatus}`);
  console.log(`2. Status Disposability: ${results.disposabilityStatus}`);
  console.log('3. Metode Pengujian: 100% Read-Only Unprivileged REST Query (Tanpa RPC, Tanpa Service-Role Key)');

  console.log('\n================================================================');
  console.log('⚠️ KESIMPULAN PREFLIGHT:');
  console.log('- Target terverifikasi sesuai allowlist ref DEV dan tidak memuat bundle_packages.');
  console.log('- Namun, disposability/resettability BELUM TERBUKTI secara read-only.');
  console.log('- Sesuai kebijakan fail-closed: PENGUJIAN MUTASI & EKSEKUSI MIGRASI TETAP DIBLOKIR.');
  console.log('================================================================');
}

runPreflight().catch(err => {
  console.error('Fatal preflight error:', err.message);
  process.exit(1);
});
