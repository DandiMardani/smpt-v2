-- ============================================================================
-- SMPT V2: Fleksibilitas Barang Jadi & Transaksi Manufaktur / Barang Titipan
-- ============================================================================
-- 1. Mengizinkan Barang Jadi (finished_goods) dibuat tanpa terikat proyek tertentu (Umum/Stok Bebas)
-- 2. Memastikan transaksi Manufaktur (Titipan, Barang Luar, Pengiriman) mendukung
--    Bahan Baku maupun Barang Jadi, baik yang berproyek maupun non-proyek (seperti V1).
-- ============================================================================

alter table public.finished_goods alter column project_id drop not null;

create unique index if not exists finished_goods_name_no_proj_uq 
on public.finished_goods(lower(name)) 
where project_id is null;
