-- Import Master Lokasi, Embarkasi, dan Riwayat Pengiriman / Kekurangan Saudi 2026
do $$
declare
  v_proj_id bigint;
  v_prod_lp18 bigint;
  v_prod_lp26 bigint;
  v_loc_pusat bigint;
  v_loc_mitra bigint;
  v_emb_jks bigint;
  v_emb_jkg bigint;
  v_emb_lampung bigint;
  v_fg_koper_bagasi bigint;
  v_fg_koper_kabin bigint;
  v_fg_cover_bagasi bigint;
  v_fg_cover_kabin bigint;
  v_fg_tas_pasport bigint;
  v_fg_tas_ransel bigint;
  v_tgt_jks bigint;
  v_tgt_jkg bigint;
  v_tgt_lampung bigint;
  v_shipment_id bigint;
begin
  -- Advance sequences safely to avoid collisions with seeded rows
  perform setval('public.smpt_location_code_seq', 100, true);
  perform setval('public.smpt_embarkation_code_seq', 100, true);
  perform setval('public.smpt_shipment_code_seq', 100, true);
  perform setval('public.smpt_issue_problem_code_seq', 100, true);

  -- 1. Lokasi
  insert into public.locations (name, location_code, location_type, status, notes)
  values ('PUSAT', 'PUSAT', 'GUDANG', 'AKTIF', 'Gudang Utama SMPT')
  on conflict (name) do update set status = 'AKTIF';
  select id into v_loc_pusat from public.locations where name = 'PUSAT' limit 1;

  insert into public.locations (name, location_type, status, notes)
  values ('Pabrik Mitra MR WU', 'PABRIK_MITRA', 'AKTIF', 'Gudang Utama & Pabrik Rekanan')
  on conflict (name) do update set status = 'AKTIF';
  select id into v_loc_mitra from public.locations where name = 'Pabrik Mitra MR WU' limit 1;

  -- 2. Embarkasi
  insert into public.embarkations (name, short_code, status, notes)
  values ('Bekasi & Jawa Barat', 'JKS', 'AKTIF', 'Asrama Haji Bekasi')
  on conflict (name) do update set short_code = 'JKS', status = 'AKTIF';
  select id into v_emb_jks from public.embarkations where short_code = 'JKS' limit 1;

  insert into public.embarkations (name, short_code, status, notes)
  values ('DKI Jakarta & Banten', 'JKG', 'AKTIF', 'Asrama Haji Pondok Gede')
  on conflict (name) do update set short_code = 'JKG', status = 'AKTIF';
  select id into v_emb_jkg from public.embarkations where short_code = 'JKG' limit 1;

  insert into public.embarkations (name, short_code, status, notes)
  values ('Lampung', 'LAMPUNG', 'AKTIF', 'Asrama Haji Rajabasa Lampung')
  on conflict (name) do update set short_code = 'LAMPUNG', status = 'AKTIF';
  select id into v_emb_lampung from public.embarkations where short_code = 'LAMPUNG' or name = 'Lampung' limit 1;

  -- 3. Project & Products
  select id into v_proj_id from public.projects where name = 'PROYEK HAJI 2026' limit 1;
  if v_proj_id is null then
    select id into v_proj_id from public.projects order by id asc limit 1;
  end if;

  select id into v_prod_lp18 from public.project_products where name = 'LAPISAN 18 INCH' limit 1;
  select id into v_prod_lp26 from public.project_products where name = 'LAPISAN 26 INCH' limit 1;

  -- 4. Finished Goods
  insert into public.finished_goods (project_id, product_id, name, category, unit, source, status)
  values (v_proj_id, v_prod_lp26, 'Koper Bagasi 24/26 Inch', 'KOPER', 'PCS', 'INTERNAL', 'AKTIF')
  on conflict do nothing;
  select id into v_fg_koper_bagasi from public.finished_goods where name ilike '%Bagasi%' limit 1;

  insert into public.finished_goods (project_id, product_id, name, category, unit, source, status)
  values (v_proj_id, v_prod_lp18, 'Koper Kabin 18/20 Inch', 'KOPER', 'PCS', 'INTERNAL', 'AKTIF')
  on conflict do nothing;
  select id into v_fg_koper_kabin from public.finished_goods where name ilike '%Kabin%' limit 1;

  insert into public.finished_goods (project_id, product_id, name, category, unit, source, status)
  values (v_proj_id, v_prod_lp26, 'Cover Koper Bagasi', 'COVER', 'PCS', 'INTERNAL', 'AKTIF')
  on conflict do nothing;
  select id into v_fg_cover_bagasi from public.finished_goods where name ilike '%Cover%Bagasi%' limit 1;

  insert into public.finished_goods (project_id, product_id, name, category, unit, source, status)
  values (v_proj_id, v_prod_lp18, 'Cover Koper Kabin', 'COVER', 'PCS', 'INTERNAL', 'AKTIF')
  on conflict do nothing;
  select id into v_fg_cover_kabin from public.finished_goods where name ilike '%Cover%Kabin%' limit 1;

  insert into public.finished_goods (project_id, product_id, name, category, unit, source, status)
  values (v_proj_id, null, 'Tas Pasport Haji', 'TAS', 'PCS', 'INTERNAL', 'AKTIF')
  on conflict do nothing;
  select id into v_fg_tas_pasport from public.finished_goods where name ilike '%Pasport%' or name ilike '%Paspor%' limit 1;

  insert into public.finished_goods (project_id, product_id, name, category, unit, source, status)
  values (v_proj_id, null, 'Tas Ransel Armuzna', 'TAS', 'PCS', 'INTERNAL', 'AKTIF')
  on conflict do nothing;
  select id into v_fg_tas_ransel from public.finished_goods where name ilike '%Ransel%' limit 1;

  -- 5. Targets Embarkasi
  if v_emb_jks is not null and v_fg_koper_bagasi is not null then
    insert into public.embarkation_targets (embarkation_id, item_kind, finished_good_id, target_qty, status)
    values (v_emb_jks, 'FINISHED_GOOD', v_fg_koper_bagasi, 23000, 'AKTIF')
    on conflict do nothing;
    select id into v_tgt_jks from public.embarkation_targets where embarkation_id = v_emb_jks limit 1;
  end if;

  if v_emb_jkg is not null and v_fg_koper_bagasi is not null then
    insert into public.embarkation_targets (embarkation_id, item_kind, finished_good_id, target_qty, status)
    values (v_emb_jkg, 'FINISHED_GOOD', v_fg_koper_bagasi, 15000, 'AKTIF')
    on conflict do nothing;
    select id into v_tgt_jkg from public.embarkation_targets where embarkation_id = v_emb_jkg limit 1;
  end if;

  if v_emb_lampung is not null and v_fg_koper_bagasi is not null then
    insert into public.embarkation_targets (embarkation_id, item_kind, finished_good_id, target_qty, status)
    values (v_emb_lampung, 'FINISHED_GOOD', v_fg_koper_bagasi, 5000, 'AKTIF')
    on conflict do nothing;
    select id into v_tgt_lampung from public.embarkation_targets where embarkation_id = v_emb_lampung limit 1;
  end if;

  -- 6. Buat Shipment Anchor untuk Rekapitulasi Embarkasi
  if v_tgt_jks is not null then
    select id into v_shipment_id from public.embarkation_shipments where document_no = 'SJ-SAUDI-REKAP-2026' limit 1;
    if v_shipment_id is null then
      insert into public.embarkation_shipments (
        target_id,
        shipment_date,
        source_location_id,
        quantity,
        received_qty,
        reject_qty,
        document_no,
        driver_name,
        vehicle_no,
        notes,
        status
      ) values (
        v_tgt_jks,
        '2026-05-06',
        v_loc_pusat,
        2235,
        2235,
        0,
        'SJ-SAUDI-REKAP-2026',
        'Armada Logistik Haji',
        'B 9845 TAA',
        'Rekapitulasi Pengiriman & Penggantian Kekurangan Saudi 2026',
        'DITERIMA'
      ) returning id into v_shipment_id;
    end if;
  end if;

  -- 7. Bersihkan data issues lama jika ada untuk import ulang bersih
  delete from public.embarkation_issues where issue_code like 'SAUDI-%';

  -- 8. Masukkan 19 Baris Data Kekurangan Saudi
  if v_shipment_id is not null then
    -- Baris 1
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-001', v_shipment_id, 'REJECT', 56,
      '{"no":1,"daerah":"BEKASI/BANDUNG","embarkasi":"JKS","tambahan_set":0,"koper_bagasi":0,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":25,"cover_kabin":25,"tas_pasport":3,"tas_ransel":3,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":0,"tgl_kirim":"09/04/2026","no_dokumen":"-","keterangan":"Kekurangan saudi"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 2
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-002', v_shipment_id, 'REJECT', 11,
      '{"no":2,"daerah":"JAKARTA","embarkasi":"JKG","tambahan_set":0,"koper_bagasi":0,"koper_kabin":0,"kardus":8,"paket_isian":0,"cover_bagasi":0,"cover_kabin":0,"tas_pasport":3,"tas_ransel":0,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":0,"tgl_kirim":"09/04/2026","no_dokumen":"-","keterangan":"Kekurangan kardus & tas"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 3
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-003', v_shipment_id, 'REJECT', 146,
      '{"no":3,"daerah":"LAMPUNG","embarkasi":"JKG","tambahan_set":0,"koper_bagasi":7,"koper_kabin":1,"kardus":0,"paket_isian":0,"cover_bagasi":79,"cover_kabin":17,"tas_pasport":17,"tas_ransel":0,"hangtag":3,"logo_kemenag":1,"logo_aybe":0,"logo_saudi":27,"sticker":1,"tgl_kirim":"09/04/2026","no_dokumen":"S229/KW","keterangan":"Penggantian koper & cover"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 4
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-004', v_shipment_id, 'REJECT', 204,
      '{"no":4,"daerah":"BEKASI/BANDUNG","embarkasi":"JKS","tambahan_set":0,"koper_bagasi":1,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":46,"cover_kabin":45,"tas_pasport":43,"tas_ransel":43,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":26,"tgl_kirim":"17/04/2026","no_dokumen":"(S937/KW)(S880/KW)","keterangan":"Susulan cover & tas"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 5
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-005', v_shipment_id, 'REJECT', 67,
      '{"no":5,"daerah":"JAKARTA","embarkasi":"JKG","tambahan_set":0,"koper_bagasi":1,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":18,"cover_kabin":20,"tas_pasport":10,"tas_ransel":10,"hangtag":3,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":5,"tgl_kirim":"17/04/2026","no_dokumen":"S587/KW","keterangan":"Kekurangan Jakarta"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 6
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-006', v_shipment_id, 'REJECT', 161,
      '{"no":6,"daerah":"LAMPUNG","embarkasi":"JKG","tambahan_set":0,"koper_bagasi":0,"koper_kabin":0,"kardus":0,"paket_isian":1,"cover_bagasi":70,"cover_kabin":70,"tas_pasport":0,"tas_ransel":0,"hangtag":0,"logo_kemenag":0,"logo_aybe":10,"logo_saudi":0,"sticker":10,"tgl_kirim":"17/04/2026","no_dokumen":"S238/KW","keterangan":"Susulan Lampung"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 7
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-007', v_shipment_id, 'REJECT', 198,
      '{"no":7,"daerah":"BEKASI/BANDUNG","embarkasi":"JKS","tambahan_set":0,"koper_bagasi":1,"koper_kabin":2,"kardus":0,"paket_isian":0,"cover_bagasi":66,"cover_kabin":66,"tas_pasport":21,"tas_ransel":21,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":21,"tgl_kirim":"22/04/2026","no_dokumen":"S998/KW","keterangan":"Kekurangan Bekasi"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 8
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-008', v_shipment_id, 'REJECT', 8,
      '{"no":8,"daerah":"BEKASI/BANDUNG","embarkasi":"JKS","tambahan_set":0,"koper_bagasi":0,"koper_kabin":0,"kardus":0,"paket_isian":2,"cover_bagasi":0,"cover_kabin":0,"tas_pasport":0,"tas_ransel":0,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":6,"tgl_kirim":"22/04/2026","no_dokumen":"S983/KW","keterangan":"Paket isian & sticker"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 9
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-009', v_shipment_id, 'REJECT', 22,
      '{"no":9,"daerah":"JAKARTA","embarkasi":"JKG","tambahan_set":2,"koper_bagasi":0,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":20,"cover_kabin":0,"tas_pasport":0,"tas_ransel":0,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":0,"tgl_kirim":"22/04/2026","no_dokumen":"S589/KW S602/KW","keterangan":"HILANG"}',
      'SELESAI', 'Penggantian Hilang'
    );

    -- Baris 10
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-010', v_shipment_id, 'REJECT', 110,
      '{"no":10,"daerah":"BEKASI/BANDUNG","embarkasi":"JKS","tambahan_set":0,"koper_bagasi":0,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":43,"cover_kabin":43,"tas_pasport":8,"tas_ransel":8,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":8,"tgl_kirim":"24/04/2026","no_dokumen":"S956/KW","keterangan":"Susulan cover & tas"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 11
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-011', v_shipment_id, 'REJECT', 119,
      '{"no":11,"daerah":"JAKARTA","embarkasi":"JKG","tambahan_set":0,"koper_bagasi":2,"koper_kabin":1,"kardus":0,"paket_isian":0,"cover_bagasi":32,"cover_kabin":32,"tas_pasport":13,"tas_ransel":13,"hangtag":10,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":15,"tgl_kirim":"24/04/2026","no_dokumen":"S576/KW","keterangan":"Penggantian koper & cover"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 12
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-012', v_shipment_id, 'REJECT', 778,
      '{"no":12,"daerah":"BEKASI/BANDUNG","embarkasi":"JKS","tambahan_set":0,"koper_bagasi":3,"koper_kabin":4,"kardus":0,"paket_isian":21,"cover_bagasi":188,"cover_kabin":188,"tas_pasport":188,"tas_ransel":188,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":0,"tgl_kirim":"30/04/2026","no_dokumen":"S1031KW","keterangan":"JAMAAH MUTASI"}',
      'SELESAI', 'Penyelesaian Mutasi'
    );

    -- Baris 13
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-013', v_shipment_id, 'REJECT', 4,
      '{"no":13,"daerah":"BEKASI/BOGOR","embarkasi":"JKS","tambahan_set":4,"koper_bagasi":0,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":0,"cover_kabin":0,"tas_pasport":0,"tas_ransel":0,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":0,"tgl_kirim":"30/04/2026","no_dokumen":"S1029KW","keterangan":"Tambahan Set Bogor"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 14
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-014', v_shipment_id, 'REJECT', 1,
      '{"no":14,"daerah":"JAKARTA","embarkasi":"JKG","tambahan_set":1,"koper_bagasi":0,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":0,"cover_kabin":0,"tas_pasport":0,"tas_ransel":0,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":0,"tgl_kirim":"30/04/2026","no_dokumen":"S618/KW","keterangan":"KEBAKARAN"}',
      'SELESAI', 'Penggantian Korban Kebakaran'
    );

    -- Baris 15
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-015', v_shipment_id, 'REJECT', 76,
      '{"no":15,"daerah":"LAMPUNG","embarkasi":"JKG","tambahan_set":0,"koper_bagasi":0,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":19,"cover_kabin":19,"tas_pasport":19,"tas_ransel":19,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":0,"tgl_kirim":"30/04/2026","no_dokumen":"S250/KW","keterangan":"Kekurangan Lampung"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 16
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-016', v_shipment_id, 'REJECT', 24,
      '{"no":16,"daerah":"BEKASI/KARAWANG","embarkasi":"JKS","tambahan_set":0,"koper_bagasi":0,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":0,"cover_kabin":0,"tas_pasport":5,"tas_ransel":5,"hangtag":0,"logo_kemenag":4,"logo_aybe":0,"logo_saudi":0,"sticker":10,"tgl_kirim":"06/05/2026","no_dokumen":"S1049/KW","keterangan":"Susulan Karawang"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 17
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-017', v_shipment_id, 'REJECT', 102,
      '{"no":17,"daerah":"JAKARTA","embarkasi":"JKG","tambahan_set":0,"koper_bagasi":0,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":30,"cover_kabin":30,"tas_pasport":21,"tas_ransel":21,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":0,"tgl_kirim":"06/05/2026","no_dokumen":"S655/KW","keterangan":"Kekurangan Jakarta"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 18
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-018', v_shipment_id, 'REJECT', 1,
      '{"no":18,"daerah":"JAKARTA","embarkasi":"JKG","tambahan_set":0,"koper_bagasi":1,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":0,"cover_kabin":0,"tas_pasport":0,"tas_ransel":0,"hangtag":0,"logo_kemenag":0,"logo_aybe":0,"logo_saudi":0,"sticker":0,"tgl_kirim":"06/05/2026","no_dokumen":"S656/KW","keterangan":"Penggantian 1 koper"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Baris 19
    insert into public.embarkation_issues (issue_code, shipment_id, issue_type, quantity, description, status, resolution)
    values (
      'SAUDI-019', v_shipment_id, 'REJECT', 145,
      '{"no":19,"daerah":"BEKASI","embarkasi":"JKS","tambahan_set":0,"koper_bagasi":0,"koper_kabin":0,"kardus":0,"paket_isian":0,"cover_bagasi":0,"cover_kabin":0,"tas_pasport":0,"tas_ransel":0,"hangtag":0,"logo_kemenag":0,"logo_aybe":5,"logo_saudi":0,"sticker":140,"tgl_kirim":"06/05/2026","no_dokumen":"S1065/KW","keterangan":"Aksesoris & sticker"}',
      'SELESAI', 'Sudah Terkirim'
    );

    -- Masukkan juga surat jalan terkirim untuk masing-masing tanggal di tabel shipment
    insert into public.embarkation_shipments (
      shipment_code,
      target_id,
      shipment_date,
      source_location_id,
      quantity,
      received_qty,
      reject_qty,
      document_no,
      driver_name,
      vehicle_no,
      notes,
      status
    ) values
    ('SHP-000010', v_tgt_jks, '2026-04-09', v_loc_pusat, 56, 56, 0, 'S229/KW-JKS', 'Supir Logistik', 'B 9123 AB', 'Pengiriman Kekurangan Saudi Tahap 1 JKS', 'DITERIMA'),
    ('SHP-000011', v_tgt_jkg, '2026-04-09', v_loc_pusat, 157, 157, 0, 'S229/KW-JKG', 'Supir Logistik', 'B 9124 AB', 'Pengiriman Kekurangan Saudi Tahap 1 JKG & Lampung', 'DITERIMA'),
    ('SHP-000012', v_tgt_jks, '2026-04-17', v_loc_pusat, 204, 204, 0, 'S937-S880/KW', 'Supir Logistik', 'B 9125 AB', 'Pengiriman Susulan Saudi Tahap 2 JKS', 'DITERIMA'),
    ('SHP-000013', v_tgt_jkg, '2026-04-17', v_loc_pusat, 228, 228, 0, 'S587-S238/KW', 'Supir Logistik', 'B 9126 AB', 'Pengiriman Susulan Saudi Tahap 2 JKG & Lampung', 'DITERIMA'),
    ('SHP-000014', v_tgt_jks, '2026-04-22', v_loc_pusat, 206, 206, 0, 'S998-S983/KW', 'Supir Logistik', 'B 9127 AB', 'Pengiriman Kekurangan Saudi Tahap 3 JKS', 'DITERIMA'),
    ('SHP-000015', v_tgt_jkg, '2026-04-22', v_loc_pusat, 22, 22, 0, 'S589-S602/KW', 'Supir Logistik', 'B 9128 AB', 'Penggantian Barang Hilang Jakarta', 'DITERIMA'),
    ('SHP-000016', v_tgt_jks, '2026-04-24', v_loc_pusat, 110, 110, 0, 'S956/KW', 'Supir Logistik', 'B 9129 AB', 'Pengiriman Susulan Saudi JKS', 'DITERIMA'),
    ('SHP-000017', v_tgt_jkg, '2026-04-24', v_loc_pusat, 119, 119, 0, 'S576/KW', 'Supir Logistik', 'B 9130 AB', 'Penggantian Koper & Cover Jakarta', 'DITERIMA'),
    ('SHP-000018', v_tgt_jks, '2026-04-30', v_loc_pusat, 782, 782, 0, 'S1031-S1029KW', 'Supir Logistik', 'B 9131 AB', 'Pengiriman Jamaah Mutasi & Tambahan Bogor', 'DITERIMA'),
    ('SHP-000019', v_tgt_jkg, '2026-04-30', v_loc_pusat, 77, 77, 0, 'S618-S250/KW', 'Supir Logistik', 'B 9132 AB', 'Penggantian Kebakaran Jakarta & Susulan Lampung', 'DITERIMA'),
    ('SHP-000020', v_tgt_jks, '2026-05-06', v_loc_pusat, 169, 169, 0, 'S1049-S1065KW', 'Supir Logistik', 'B 9133 AB', 'Pengiriman Susulan Karawang & Bekasi', 'DITERIMA'),
    ('SHP-000021', v_tgt_jkg, '2026-05-06', v_loc_pusat, 103, 103, 0, 'S655-S656/KW', 'Supir Logistik', 'B 9134 AB', 'Pengiriman Susulan Jakarta Akhir', 'DITERIMA')
    on conflict do nothing;
  end if;
end;
$$;
