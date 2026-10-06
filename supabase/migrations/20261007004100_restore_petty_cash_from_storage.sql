-- Restore real petty cash transactions from uploaded receipts in nota-kas-kecil bucket
insert into public.petty_cash_transactions (
  transaction_date, direction, category, amount, description, document_no, receipt_url, status
) values
  (
    '2026-09-30', 'KELUAR', 'Perlengkapan', 45000, 'Mahardika Bangunan: Kuda terbang, Rofil bulat', null, 'https://xhtwpfzryrtrjhjpemor.supabase.co/storage/v1/object/public/nota-kas-kecil/nota_1790744249267_inh1xh.jpg', 'AKTIF'
  ),
  (
    '2026-09-30', 'KELUAR', 'Sanitasi & Alat', 52310, 'Shopee (Star+ Sanitary177): Afur wastafel tekan kuningan E1003', '260930D4AK597Y', 'https://xhtwpfzryrtrjhjpemor.supabase.co/storage/v1/object/public/nota-kas-kecil/nota_1790755615625_7ybsp5.jpeg', 'AKTIF'
  ),
  (
    '2026-10-01', 'KELUAR', 'Konsumsi', 126000, '21 Air Isi Ulang @ 6.000 (Klass Artindo 2)', null, 'https://xhtwpfzryrtrjhjpemor.supabase.co/storage/v1/object/public/nota-kas-kecil/nota_1790911902819_7yah8.jpeg', 'AKTIF'
  ),
  (
    '2026-10-01', 'KELUAR', 'BBM & Transport', 20000, 'SPBU Raya Pamulang: Pertalite 2 liter', '2215776', 'https://xhtwpfzryrtrjhjpemor.supabase.co/storage/v1/object/public/nota-kas-kecil/nota_1790915873447_0op7v.jpeg', 'AKTIF'
  ),
  (
    '2026-10-02', 'KELUAR', 'Bahan Bangunan', 185000, 'Mahardika Bangunan: 2 kg Aquaproof 091, 1 btl Silen clear', null, 'https://xhtwpfzryrtrjhjpemor.supabase.co/storage/v1/object/public/nota-kas-kecil/nota_1790907367220_jqm3he.jpeg', 'AKTIF'
  ),
  (
    '2026-10-02', 'KELUAR', 'Sanitasi & Alat', 20000, 'Mahardika Bangunan: Selang Afur BCP Abu-Abu', 'CS/66/261002/0024', 'https://xhtwpfzryrtrjhjpemor.supabase.co/storage/v1/object/public/nota-kas-kecil/nota_1790930287165_z9th3f.jpeg', 'AKTIF'
  );
