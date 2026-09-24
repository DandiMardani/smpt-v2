# SMPT V2 — Final Smoke Test Report

Date: 2026-09-13

## Result Summary

- Runtime business E2E: user reported Setup & Data Test / Dummy Full flow appears PASS.
- System diagnostic: PASS for MASTER, STOCK, CUTTING_GUDANG_HASIL, SPV_REQUEST_GUDANG, PROCUREMENT, RPC_FULFILL_SIGNATURE.
- TypeScript/TSX syntax: PASS — 107 files, 0 syntax errors.
- Local imports: PASS — 0 missing imports.
- Dashboard server access guards: PASS — 48/48 page routes protected by session/permission context.
- API route access checks: PASS — 5/5 routes authenticated or intentionally public health endpoint.
- Sidebar/menu permission mapping: PASS for implemented menu routes; dynamic fallback also re-checks permission server-side.
- Frontend RPC references: PASS — 57/57 RPC names have SQL function definitions in migrations.
- Migration delimiter preflight: PASS — 26 SQL files, no odd $$ delimiter count.
- Historical migrations: PASS — 22/22 original migrations byte-for-byte unchanged; 4 new migrations only.
- Role preset static smoke: PASS for MANAGER, SUPERVISOR, GUDANG, PEKERJA, USER, CHECKER.
- Checker assignment hardening: PASS statically — RPC checks borongan.operate and assigned checker email.
- Manager dashboard hardening: PASS statically — RPC rejects roles other than MANAGER/ADMIN.
- Export hardening: PASS statically — report-specific permission checks are enforced server-side.

## New Migrations

1. `20260913170000_procurement_core_and_gudang_fix.sql`
2. `20260913171000_setup_test_diagnostics.sql`
3. `20260913172000_procurement_validation_hardening.sql`
4. `20260913173000_setup_test_full_maintenance.sql`

Do not re-run migrations that are already recorded as applied in the target Supabase project.

## Build Status

`npm run build` could not be completed inside the audit container because package installation requires an npm tarball not present in the offline cache (`zod-validation-error@4.0.2`). This is an environment/dependency availability limitation, not a source-code build error.

The remaining release gate is therefore a real local/CI `npm run build` using installed dependencies, followed by one deployed smoke test.

## Release Gate

Do not label production deploy as 100% verified until:

1. `npm run build` passes in the project environment.
2. Login and one direct-URL negative access check are performed on the deployed build.
3. One procurement path and one SPV Request → Gudang fulfill path are smoke-tested after deploy.
