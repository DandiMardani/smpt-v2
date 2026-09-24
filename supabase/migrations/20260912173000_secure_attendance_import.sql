-- SMPT V2 - Finalisasi import Secure fingerprint + audit RAW
-- Berdasarkan format Secure yang sudah dipakai V1 dan divalidasi terhadap contoh export asli.

create sequence if not exists public.smpt_att_import_code_seq start with 1;

create or replace function public.smpt_normalize_finger_id(p_value text)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when btrim(coalesce(p_value,'')) ~ '^[0-9]+$'
      then coalesce(nullif(ltrim(btrim(p_value),'0'),''),'0')
    else upper(btrim(coalesce(p_value,'')))
  end
$$;

create or replace function public.smpt_secure_date(p_value text)
returns date
language plpgsql
immutable
set search_path=''
as $$
declare v text:=btrim(coalesce(p_value,''));
begin
  if v !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  begin return v::date; exception when others then return null; end;
end $$;

create or replace function public.smpt_secure_time(p_value text)
returns time
language plpgsql
immutable
set search_path=''
as $$
declare v text:=btrim(coalesce(p_value,''));
begin
  if v !~ '^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$' then return null; end if;
  begin return v::time; exception when others then return null; end;
end $$;

create index if not exists workers_finger_normalized_idx
on public.workers(public.smpt_normalize_finger_id(finger_id))
where finger_id is not null and btrim(finger_id)<>'';

create table if not exists public.attendance_import_batches (
  id bigint generated always as identity primary key,
  import_code text not null unique default ('ABI-'||lpad(nextval('public.smpt_att_import_code_seq')::text,7,'0')),
  source_file text not null,
  row_count integer not null default 0 check(row_count>=0),
  matched_count integer not null default 0 check(matched_count>=0),
  problem_count integer not null default 0 check(problem_count>=0),
  duplicate_count integer not null default 0 check(duplicate_count>=0),
  verified_protected_count integer not null default 0 check(verified_protected_count>=0),
  status text not null default 'COMMITTED' check(status in ('COMMITTED','DIBATALKAN')),
  imported_by uuid references auth.users(id) on delete set null default auth.uid(),
  imported_at timestamptz not null default now()
);

create table if not exists public.attendance_import_rows (
  id bigint generated always as identity primary key,
  batch_id bigint not null references public.attendance_import_batches(id) on delete restrict,
  source_row_no integer,
  sheet_name text,
  sheet_row integer,
  finger_id text not null,
  worker_id bigint references public.workers(id) on delete restrict,
  employee_code text,
  employee_name_raw text,
  position_raw text,
  department_raw text,
  day_name text,
  attendance_date date not null,
  schedule_text text,
  activity text,
  actual_in time,
  actual_out time,
  late_text text,
  early_leave_text text,
  effective_text text,
  overtime_text text,
  notes text,
  problem text not null,
  row_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists attendance_import_rows_worker_date_idx
on public.attendance_import_rows(worker_id,attendance_date desc,id desc);
create index if not exists attendance_import_rows_batch_idx
on public.attendance_import_rows(batch_id,id);

alter table public.attendance_records
  add column if not exists source_import_row_id bigint references public.attendance_import_rows(id) on delete set null;

alter table public.attendance_records
  drop constraint if exists attendance_records_verification_status_check;
alter table public.attendance_records
  add constraint attendance_records_verification_status_check
  check(verification_status in ('DRAFT','PERLU_PERBAIKAN','TERVERIFIKASI'));

create or replace function public.preview_secure_attendance_import(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r jsonb;
  v_idx bigint;
  v_total int:=0;
  v_matched int:=0;
  v_problem_count int:=0;
  v_duplicate int:=0;
  v_verified int:=0;
  v_items jsonb:='[]'::jsonb;
  v_finger text;
  v_norm text;
  v_date date;
  v_in time;
  v_out time;
  v_worker_id bigint;
  v_worker_name text;
  v_match_count int;
  v_problem text;
  v_hash text;
  v_existing_status text;
  v_seen_hashes text[]:=array[]::text[];
begin
  if not public.has_permission('absensi.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin import Absensi.' using errcode='42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Data import tidak valid.'; end if;
  if jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>5000 then raise exception 'Jumlah baris import harus 1-5000.'; end if;

  for r,v_idx in select value,ordinality from jsonb_array_elements(p_rows) with ordinality loop
    v_total:=v_total+1;
    v_finger:=btrim(coalesce(r->>'idFinger',''));
    v_norm:=public.smpt_normalize_finger_id(v_finger);
    v_date:=public.smpt_secure_date(r->>'tanggal');
    v_in:=public.smpt_secure_time(r->>'jamMasuk');
    v_out:=public.smpt_secure_time(r->>'jamKeluar');
    v_worker_id:=null;v_worker_name:=null;v_match_count:=0;v_existing_status:=null;

    select count(*),min(id),min(name)
      into v_match_count,v_worker_id,v_worker_name
    from public.workers
    where status='AKTIF' and public.smpt_normalize_finger_id(finger_id)=v_norm and v_norm<>'';

    if v_match_count>0 then v_matched:=v_matched+1; end if;
    v_hash:=md5(concat_ws('|',v_norm,coalesce(v_date::text,''),coalesce(v_in::text,''),coalesce(v_out::text,'')));

    if v_date is null then
      v_problem:='TANGGAL_TIDAK_VALID';
    elsif v_match_count=0 then
      v_problem:='ID_BELUM_TERDAFTAR';
    elsif v_match_count>1 then
      v_problem:='ID_FINGER_GANDA';
    elsif v_hash=any(v_seen_hashes) or exists(select 1 from public.attendance_import_rows where row_hash=v_hash) then
      v_problem:='DUPLIKAT';v_duplicate:=v_duplicate+1;
    else
      select verification_status into v_existing_status
      from public.attendance_records
      where worker_id=v_worker_id and attendance_date=v_date;
      if v_existing_status='TERVERIFIKASI' then
        v_problem:='SUDAH_TERVERIFIKASI';v_verified:=v_verified+1;
      elsif v_in is null and v_out is null then
        v_problem:='TANPA_SCAN';
      elsif v_in is null or v_out is null then
        v_problem:='SCAN_TIDAK_LENGKAP';
      else
        v_problem:='NORMAL';
      end if;
    end if;

    if v_problem not in ('NORMAL','DUPLIKAT','SUDAH_TERVERIFIKASI') then
      v_problem_count:=v_problem_count+1;
    end if;
    v_seen_hashes:=array_append(v_seen_hashes,v_hash);

    v_items:=v_items||jsonb_build_array(
      r||jsonb_build_object(
        'rowNo',coalesce(nullif(r->>'rowNo','')::int,v_idx::int),
        'workerId',v_worker_id,
        'workerName',v_worker_name,
        'problem',v_problem
      )
    );
  end loop;

  return jsonb_build_object(
    'total',v_total,
    'matched',v_matched,
    'problem',v_problem_count,
    'duplicate',v_duplicate,
    'verifiedProtected',v_verified,
    'rows',v_items
  );
end $$;

create or replace function public.commit_secure_attendance_import(p_source_file text,p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r jsonb;
  v_idx bigint;
  v_batch_id bigint;
  v_import_code text;
  v_total int:=0;
  v_matched int:=0;
  v_problem_count int:=0;
  v_duplicate int:=0;
  v_verified int:=0;
  v_manual int:=0;
  v_unregistered int:=0;
  v_raw_new int:=0;
  v_final_new int:=0;
  v_final_update int:=0;
  v_finger text;
  v_norm text;
  v_date date;
  v_in time;
  v_out time;
  v_schedule text[];
  v_schedule_in time;
  v_schedule_out time;
  v_worker_id bigint;
  v_match_count int;
  v_problem text;
  v_hash text;
  v_raw_id bigint;
  a public.attendance_records%rowtype;
begin
  if not public.has_permission('absensi.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin import Absensi.' using errcode='42501';
  end if;
  if btrim(coalesce(p_source_file,''))='' or length(p_source_file)>255 then raise exception 'Nama file sumber tidak valid.'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Data import tidak valid.'; end if;
  if jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>5000 then raise exception 'Jumlah baris import harus 1-5000.'; end if;

  insert into public.attendance_import_batches(source_file)
  values(btrim(p_source_file)) returning id,import_code into v_batch_id,v_import_code;

  for r,v_idx in select value,ordinality from jsonb_array_elements(p_rows) with ordinality loop
    v_total:=v_total+1;
    v_finger:=btrim(coalesce(r->>'idFinger',''));
    v_norm:=public.smpt_normalize_finger_id(v_finger);
    v_date:=public.smpt_secure_date(r->>'tanggal');
    v_in:=public.smpt_secure_time(r->>'jamMasuk');
    v_out:=public.smpt_secure_time(r->>'jamKeluar');
    v_schedule_in:=null;v_schedule_out:=null;
    v_schedule:=regexp_match(coalesce(r->>'jamKerja',''),'([0-9]{1,2}:[0-9]{2})\s*[-–—]\s*([0-9]{1,2}:[0-9]{2})');
    if v_schedule is not null then
      v_schedule_in:=public.smpt_secure_time(v_schedule[1]);
      v_schedule_out:=public.smpt_secure_time(v_schedule[2]);
    end if;

    v_worker_id:=null;v_match_count:=0;
    select count(*),min(id) into v_match_count,v_worker_id
    from public.workers
    where status='AKTIF' and public.smpt_normalize_finger_id(finger_id)=v_norm and v_norm<>'';
    if v_match_count>0 then v_matched:=v_matched+1; end if;

    if v_date is null then
      v_problem:='TANGGAL_TIDAK_VALID';
    elsif v_match_count=0 then
      v_problem:='ID_BELUM_TERDAFTAR';v_unregistered:=v_unregistered+1;
    elsif v_match_count>1 then
      v_problem:='ID_FINGER_GANDA';
    elsif v_in is null and v_out is null then
      v_problem:='TANPA_SCAN';
    elsif v_in is null or v_out is null then
      v_problem:='SCAN_TIDAK_LENGKAP';
    else
      v_problem:='NORMAL';
    end if;

    v_hash:=md5(concat_ws('|',v_norm,coalesce(v_date::text,''),coalesce(v_in::text,''),coalesce(v_out::text,'')));
    if exists(select 1 from public.attendance_import_rows where row_hash=v_hash) then
      v_duplicate:=v_duplicate+1;
      continue;
    end if;

    if v_date is null then
      v_problem_count:=v_problem_count+1;
      continue;
    end if;

    insert into public.attendance_import_rows(
      batch_id,source_row_no,sheet_name,sheet_row,finger_id,worker_id,employee_code,employee_name_raw,
      position_raw,department_raw,day_name,attendance_date,schedule_text,activity,actual_in,actual_out,
      late_text,early_leave_text,effective_text,overtime_text,notes,problem,row_hash
    ) values(
      v_batch_id,coalesce(nullif(r->>'rowNo','')::int,v_idx::int),nullif(r->>'sheetName',''),nullif(r->>'sheetRow','')::int,
      v_finger,case when v_match_count=1 then v_worker_id else null end,nullif(r->>'kodeKaryawan',''),nullif(r->>'namaRaw',''),
      nullif(r->>'jabatanRaw',''),nullif(r->>'departemenRaw',''),nullif(r->>'hari',''),v_date,nullif(r->>'jamKerja',''),
      nullif(r->>'kegiatan',''),v_in,v_out,nullif(r->>'terlambat',''),nullif(r->>'cepatPulang',''),nullif(r->>'jamEfektif',''),
      nullif(r->>'lembur',''),nullif(r->>'notes',''),v_problem,v_hash
    ) returning id into v_raw_id;
    v_raw_new:=v_raw_new+1;

    if v_problem not in ('NORMAL') then v_problem_count:=v_problem_count+1; end if;
    if v_match_count<>1 then continue; end if;

    select * into a from public.attendance_records
      where worker_id=v_worker_id and attendance_date=v_date for update;

    if not found then
      insert into public.attendance_records(
        worker_id,attendance_date,schedule_in,schedule_out,actual_in,actual_out,attendance_status,
        verification_status,source,source_file,source_import_row_id,notes
      ) values(
        v_worker_id,v_date,v_schedule_in,v_schedule_out,v_in,v_out,'HADIR',
        case when v_problem='NORMAL' then 'DRAFT' else 'PERLU_PERBAIKAN' end,
        'FINGERPRINT_IMPORT',btrim(p_source_file),v_raw_id,
        nullif(concat_ws(' · ',nullif(r->>'kegiatan',''),nullif(r->>'notes','')),'')
      );
      v_final_new:=v_final_new+1;
    elsif a.verification_status='TERVERIFIKASI' then
      v_verified:=v_verified+1;
      update public.attendance_import_rows set problem='SUDAH_TERVERIFIKASI' where id=v_raw_id;
    elsif a.source='MANUAL' then
      v_manual:=v_manual+1;
      update public.attendance_import_rows set problem='MANUAL_DILINDUNGI' where id=v_raw_id;
    else
      update public.attendance_records set
        schedule_in=coalesce(v_schedule_in,schedule_in),
        schedule_out=coalesce(v_schedule_out,schedule_out),
        actual_in=v_in,
        actual_out=v_out,
        verification_status=case when v_problem='NORMAL' then 'DRAFT' else 'PERLU_PERBAIKAN' end,
        source='FINGERPRINT_IMPORT',source_file=btrim(p_source_file),source_import_row_id=v_raw_id,
        notes=nullif(concat_ws(' · ',nullif(r->>'kegiatan',''),nullif(r->>'notes','')),''),
        updated_at=now()
      where id=a.id;
      v_final_update:=v_final_update+1;
    end if;
  end loop;

  update public.attendance_import_batches set
    row_count=v_total,matched_count=v_matched,problem_count=v_problem_count,
    duplicate_count=v_duplicate,verified_protected_count=v_verified
  where id=v_batch_id;

  return jsonb_build_object(
    'importCode',v_import_code,
    'rawBaru',v_raw_new,
    'finalBaru',v_final_new,
    'finalUpdate',v_final_update,
    'duplikatDilewati',v_duplicate,
    'belumTerdaftar',v_unregistered,
    'terverifikasiDilindungi',v_verified,
    'manualDilindungi',v_manual,
    'perluReview',v_problem_count
  );
end $$;

alter table public.attendance_import_batches enable row level security;
alter table public.attendance_import_rows enable row level security;

drop policy if exists attendance_import_batches_select on public.attendance_import_batches;
create policy attendance_import_batches_select on public.attendance_import_batches
for select to authenticated using(public.has_permission('absensi.view'));

drop policy if exists attendance_import_rows_select on public.attendance_import_rows;
create policy attendance_import_rows_select on public.attendance_import_rows
for select to authenticated using(public.has_permission('absensi.view'));

revoke all on table public.attendance_import_batches from authenticated;
revoke all on table public.attendance_import_rows from authenticated;
grant select on public.attendance_import_batches,public.attendance_import_rows to authenticated;

revoke all on function public.preview_secure_attendance_import(jsonb) from public;
revoke all on function public.commit_secure_attendance_import(text,jsonb) from public;
grant execute on function public.preview_secure_attendance_import(jsonb) to authenticated;
grant execute on function public.commit_secure_attendance_import(text,jsonb) to authenticated;
