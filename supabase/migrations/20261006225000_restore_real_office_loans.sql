-- Restore real office loans (Pinjaman Kantor)
-- 1. Usman Alamsyah (ID 1, KSB-000001): Rp 2.000.000, 3x angsuran, terbayar Rp 20.000, status AKTIF
-- 2. Jajang Rosadi (ID 3, KSB-000003): Rp 2.500.000, 3x angsuran (Rp 833.333,33/bln), baru kebayar 1 kali (Rp 833.333,33), sisa Rp 1.666.666,67, status AKTIF
-- 3. Historical loans: Dandi (ID 2), ID 17, ID 47 (LUNAS)

insert into public.cash_advances (
  id,
  advance_code,
  worker_id,
  advance_date,
  amount,
  paid_amount,
  status,
  notes,
  created_by,
  created_at,
  category,
  installment_count,
  installment_amount,
  installments_paid
)
overriding system value
values
  (
    1,
    'KSB-000001',
    9,
    '2026-09-01',
    2000000.00,
    20000.00,
    'AKTIF',
    'keperluan Pribadi',
    '0d8eea71-e781-4700-b48c-52835fc8397c'::uuid,
    '2026-09-25 08:02:39.360778+00',
    'KASBON_PERUSAHAAN',
    3,
    666666.67,
    1
  ),
  (
    3,
    'KSB-000003',
    2,
    '2026-09-03',
    2500000.00,
    833333.33,
    'AKTIF',
    'keperluan Pribadi',
    '0d8eea71-e781-4700-b48c-52835fc8397c'::uuid,
    '2026-09-25 08:03:49.282807+00',
    'KASBON_PERUSAHAAN',
    3,
    833333.33,
    1
  ),
  (
    2,
    'KSB-000002',
    10,
    '2026-09-01',
    2000000.00,
    2000000.00,
    'LUNAS',
    'keperluan Pribadi',
    '0d8eea71-e781-4700-b48c-52835fc8397c'::uuid,
    '2026-09-25 08:03:04.229361+00',
    'KASBON_PERUSAHAAN',
    3,
    666666.67,
    3
  ),
  (
    17,
    'KSB-000017',
    9,
    '2026-09-26',
    100000.00,
    100000.00,
    'LUNAS',
    'Uang pak bony',
    '0d8eea71-e781-4700-b48c-52835fc8397c'::uuid,
    '2026-09-26 11:45:57.360101+00',
    'KASBON_PERUSAHAAN',
    1,
    100000.00,
    1
  ),
  (
    47,
    'KSB-000047',
    9,
    '2026-09-30',
    100000.00,
    100000.00,
    'LUNAS',
    'Kasbon Kantor - Lunas Payroll September',
    '0d8eea71-e781-4700-b48c-52835fc8397c'::uuid,
    '2026-09-30 10:34:33.497893+00',
    'KASBON_PERUSAHAAN',
    1,
    100000.00,
    1
  )
on conflict (id) do update set
  advance_code = excluded.advance_code,
  worker_id = excluded.worker_id,
  advance_date = excluded.advance_date,
  amount = excluded.amount,
  paid_amount = excluded.paid_amount,
  status = excluded.status,
  notes = excluded.notes,
  category = excluded.category,
  installment_count = excluded.installment_count,
  installment_amount = excluded.installment_amount,
  installments_paid = excluded.installments_paid;

-- Ensure payment history exists for Jajang (1x angsuran)
insert into public.cash_advance_payments (
  advance_id, payment_date, amount, source, reference, notes, created_by
)
select 3, '2026-10-06'::date, 833333.33, 'MANUAL', 'ANGSURAN-1', 'Pembayaran angsuran ke-1 (dari 3x)', '0d8eea71-e781-4700-b48c-52835fc8397c'::uuid
where not exists (select 1 from public.cash_advance_payments where advance_id = 3);
