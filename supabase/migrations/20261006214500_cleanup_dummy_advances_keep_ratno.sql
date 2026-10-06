-- Clean up restored dummy transactions
-- Keep ONLY real transactions for Warung Ratno (recently inputted 5 active items: 48, 49, 50, 51, 52)
-- And clean up cash_advance_payments foreign key constraints for dummy items

do $$
begin
  -- 1. Hapus payment dummy yang merujuk ke pinjaman / kasbon dummy
  delete from public.cash_advance_payments
  where advance_id not in (48, 49, 50, 51, 52);

  -- 2. Hapus seluruh data kasbon dummy (Pinjaman kantor lama, Dandi Store dummy, dandimardani8 dummy)
  -- HANYA sisakan kasbon warung Ratno yang riil diinput barusan!
  delete from public.cash_advances
  where id not in (48, 49, 50, 51, 52);

  -- 3. Pastikan warung_name untuk 5 nota riil tersebut konsisten
  update public.cash_advances
  set warung_name = 'ratno'
  where id in (48, 49, 50, 51, 52);
end $$;
