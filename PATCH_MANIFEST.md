# SMPT V2 — Cumulative Procurement + Setup & Data Test Candidate

Source basis: `SMPT_V2_HANDOFF.zip` terbaru / authoritative source.
Existing migration lama tidak diubah atau dihapus.

## Scope cumulative

### Procurement / Gudang
- Granular permission procurement + supplier.
- Extend Master Vendor sebagai Supplier; tidak membuat master supplier kedua.
- Purchase Planning dari BOM `COMPANY_PURCHASE`.
- Draft / Issue / Cancel PO.
- Atomic PO number, duplicate protection, concurrency lock.
- Partial PO receipt ke warehouse receipt + stock ledger existing.
- PO receipt idempotency + reversal yang mengembalikan outstanding PO.
- Integrasi Roll/Lot berdasarkan qty aktual.
- Perbaikan overload `fulfill_material_request_item` 7-vs-8 parameter.
- Gudang pending inbox/count memakai RPC ter-scope.
- Procurement XLSX export.
- PO print-friendly / Save PDF via browser.
- Inline field validation global + procurement cross-field validation.

### Setup & Data Test
- Tetap memakai halaman existing `Setup & Data Test`; tidak membuat menu baru.
- Diagnostic run + run ID.
- `Dummy Full` E2E all-or-nothing dengan diagnostic per step.
- Dummy entity tracking per run untuk `Reset Dummy Run` yang presisi.
- Backup data bisnis konsisten di database transaction.
- Restore backup dengan schema fingerprint validation.
- Selective Reset + Select All / Clear All + dependency/FK cleanup backend.
- Full Dev Reset dengan explicit business-table whitelist.
- Optional auto-backup sebelum reset.
- Maintenance safety guard: role/permission/profile/admin/auth/schema/migration/system security tidak ikut dihapus.
- Dummy tracking lama otomatis di-invalidasi setelah restore/reset besar untuk mencegah salah hapus ID yang dipakai ulang.
- Raw Material reset ikut graph procurement terkait agar stock vs PO received/outstanding tidak drift.

## FULL REPLACE

1. `src/app/api/export/xlsx/route.ts`
2. `src/app/dashboard/barangKeluarGudang/page.tsx`
3. `src/app/dashboard/barangMasukGudang/actions.ts`
4. `src/app/dashboard/barangMasukGudang/page.tsx`
5. `src/app/dashboard/layout.tsx`
6. `src/app/dashboard/masterVendor/actions.ts`
7. `src/app/dashboard/masterVendor/page.tsx`
8. `src/app/dashboard/setupTest/page.tsx`
9. `src/app/globals.css`
10. `src/app/layout.tsx`
11. `src/lib/access/current-user.ts`
12. `src/lib/access/menu.ts`

## ADD NEW

1. `src/app/dashboard/procurement/actions.ts`
2. `src/app/dashboard/procurement/page.tsx`
3. `src/app/dashboard/procurement/po/[id]/page.tsx`
4. `src/app/dashboard/procurement/po/[id]/print-button.tsx`
5. `src/app/dashboard/setupTest/actions.ts`
6. `src/app/dashboard/setupTest/reset-group-selector.tsx`
7. `src/components/inline-form-validation.tsx`
8. `supabase/migrations/20260913170000_procurement_core_and_gudang_fix.sql`
9. `supabase/migrations/20260913171000_setup_test_diagnostics.sql`
10. `supabase/migrations/20260913172000_procurement_validation_hardening.sql`
11. `supabase/migrations/20260913173000_setup_test_full_maintenance.sql`

## Migration order

Push **hanya migration yang belum pernah diterapkan** ke database, tetap sesuai urutan timestamp:

1. `20260913170000_procurement_core_and_gudang_fix.sql`
2. `20260913171000_setup_test_diagnostics.sql`
3. `20260913172000_procurement_validation_hardening.sql`
4. `20260913173000_setup_test_full_maintenance.sql`

Jika 170000/171000/172000 sudah pernah dipush dari patch sebelumnya, jangan push ulang; lanjutkan 173000 saja.
Jangan edit atau repush migration lama yang sudah tercatat Supabase.

## Setup & Data Test safety

Protected / tidak termasuk reset bisnis:
- auth users
- `roles`
- `permissions`
- `role_permissions`
- `profiles`
- `user_permission_overrides`
- `stock_locations`
- `payroll_settings`
- `audit_events`
- migration / schema objects
- maintenance run + backup metadata

`Full Dev Reset` memakai whitelist tabel bisnis, bukan `DROP/TRUNCATE schema`.

Konfirmasi destructive:
- Restore: ketik `RESTORE`
- Reset Dummy Run: ketik `DELETE DUMMY`
- Selective Reset: ketik `RESET`
- Full/Master reset: ketik `FULL RESET`

## Validation status

- STATIC TS/TSX syntax: **PASS** — 107 files, 0 parse error.
- Local `@/` imports: **PASS** — 0 missing import.
- Frontend RPC name → SQL definition: **PASS** — 0 missing definition.
- SQL `$$` delimiter balance migration 173000: **PASS** — 11 pairs.
- Existing migration immutability: **PASS** — 0 changed, 0 missing vs authoritative source.
- Working source deleted files: **0**.
- Maintenance FK graph static audit: **PASS** — 69 business tables / 169 FK dependencies / 0 detected cycle in current source schema.
- BUILD CHECK: **NOT VERIFIED** in audit container because source ZIP has no `node_modules` and dependencies cannot be installed from the offline environment. No build-PASS claim.
- RUNTIME TEST: **NOT YET RUN** against the user's Supabase instance.
- DEPLOYED TEST: **NOT YET RUN**.

## Runtime test pertama yang disarankan

Setelah migration terbaru diterapkan dan app berhasil start, buka:
`Dashboard → Setup & Data Test`

Klik **BUAT DUMMY FULL** sekali.

Expected:
- run ID dibuat;
- status akhir `PASS` bila seluruh flow transaksi lolos;
- jika gagal, business rows dari run tersebut rollback dan diagnostic menyimpan `failed_step`, expected, actual, SQLSTATE/database error, dan kemungkinan penyebab.

Jangan lakukan Full Dev Reset pada data penting sebelum backup dan runtime test maintenance lolos.
