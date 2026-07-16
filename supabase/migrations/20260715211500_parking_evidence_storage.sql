begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'parking-evidence',
  'parking-evidence',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload own parking evidence"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'parking-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users read own parking evidence"
on storage.objects for select to authenticated
using (
  bucket_id = 'parking-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users delete own unmoderated evidence"
on storage.objects for delete to authenticated
using (
  bucket_id = 'parking-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
  and not exists (
    select 1
    from public.parking_evidence evidence
    join public.parking_zones zone on zone.id = evidence.parking_zone_id
    where evidence.storage_path = storage.objects.name
      and zone.status in ('approved','archived')
  )
);

commit;
