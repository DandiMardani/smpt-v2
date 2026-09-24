-- SMPT V2 - Master Pekerja: Add Foto KTP and Jumlah Anak (all pay systems: HARIAN, BORONGAN, BULANAN)

alter table public.workers
  add column if not exists children_count integer not null default 0 check (children_count >= 0),
  add column if not exists ktp_photo_url text;

-- Ensure storage bucket 'worker-documents' exists and is public
insert into storage.buckets (id, name, public)
values ('worker-documents', 'worker-documents', true)
on conflict (id) do update set public = true;

-- Storage RLS policies for worker-documents
drop policy if exists "Authenticated users can upload worker documents" on storage.objects;
create policy "Authenticated users can upload worker documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'worker-documents');

drop policy if exists "Authenticated users can update worker documents" on storage.objects;
create policy "Authenticated users can update worker documents"
on storage.objects for update to authenticated
using (bucket_id = 'worker-documents');

drop policy if exists "Anyone can read worker documents" on storage.objects;
create policy "Anyone can read worker documents"
on storage.objects for select to public
using (bucket_id = 'worker-documents');

notify pgrst, 'reload schema';
