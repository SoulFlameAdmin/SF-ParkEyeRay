begin;

create extension if not exists postgis;
create extension if not exists pgcrypto;

create type public.parking_source as enum ('osm','soulflame','operator','municipality');
create type public.parking_status as enum ('draft','pending_soulflame','changes_requested','approved','rejected','archived');
create type public.moderation_action as enum ('submitted','updated','changes_requested','approved','rejected','archived','restored');

create table public.parking_zones (
  id uuid primary key default gen_random_uuid(),
  source public.parking_source not null,
  external_id text,
  name text not null check (char_length(name) between 2 and 160),
  geometry geometry(Polygon,4326) not null,
  vehicle_entrance geometry(Point,4326),
  pedestrian_exit geometry(Point,4326),
  access text,
  capacity integer check (capacity is null or capacity between 1 and 100000),
  fee text,
  opening_hours text,
  status public.parking_status not null default 'draft',
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_requires_verifier check (
    status <> 'approved' or (verified_at is not null and verified_by is not null)
  ),
  constraint community_cannot_start_approved check (
    source <> 'soulflame' or status in ('draft','pending_soulflame','changes_requested','approved','rejected','archived')
  )
);

create unique index parking_zones_source_external_id_unique
  on public.parking_zones(source, external_id)
  where external_id is not null;
create index parking_zones_geometry_gix on public.parking_zones using gist(geometry);
create index parking_zones_status_idx on public.parking_zones(status);

create table public.parking_evidence (
  id uuid primary key default gen_random_uuid(),
  parking_zone_id uuid not null references public.parking_zones(id) on delete cascade,
  storage_path text,
  note text,
  captured_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (storage_path is not null or nullif(trim(note),'') is not null)
);

create table public.parking_moderation_events (
  id uuid primary key default gen_random_uuid(),
  parking_zone_id uuid not null references public.parking_zones(id) on delete cascade,
  action public.moderation_action not null,
  from_status public.parking_status,
  to_status public.parking_status not null,
  reason text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index parking_moderation_zone_created_idx
  on public.parking_moderation_events(parking_zone_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger parking_zones_set_updated_at
before update on public.parking_zones
for each row execute function public.set_updated_at();

create or replace function public.enforce_parking_status_transition()
returns trigger language plpgsql as $$
begin
  if old.status = new.status then return new; end if;
  if old.status = 'draft' and new.status not in ('pending_soulflame','archived') then
    raise exception 'invalid parking status transition';
  elsif old.status = 'pending_soulflame' and new.status not in ('changes_requested','approved','rejected','archived') then
    raise exception 'invalid parking status transition';
  elsif old.status = 'changes_requested' and new.status not in ('pending_soulflame','archived') then
    raise exception 'invalid parking status transition';
  elsif old.status = 'approved' and new.status not in ('archived') then
    raise exception 'invalid parking status transition';
  elsif old.status = 'rejected' and new.status not in ('archived') then
    raise exception 'invalid parking status transition';
  elsif old.status = 'archived' and new.status not in ('draft','pending_soulflame') then
    raise exception 'invalid parking status transition';
  end if;
  return new;
end;
$$;

create trigger parking_zones_status_transition
before update of status on public.parking_zones
for each row execute function public.enforce_parking_status_transition();

alter table public.parking_zones enable row level security;
alter table public.parking_evidence enable row level security;
alter table public.parking_moderation_events enable row level security;

create policy "public reads approved parking"
on public.parking_zones for select
using (status = 'approved');

create policy "owners read own submissions"
on public.parking_zones for select to authenticated
using (created_by = auth.uid());

create policy "users create pending proposals"
on public.parking_zones for insert to authenticated
with check (
  created_by = auth.uid()
  and source = 'soulflame'
  and status = 'pending_soulflame'
  and verified_at is null
  and verified_by is null
);

create policy "owners update only editable proposals"
on public.parking_zones for update to authenticated
using (created_by = auth.uid() and status in ('draft','changes_requested'))
with check (created_by = auth.uid() and status in ('draft','pending_soulflame','changes_requested'));

create policy "owners manage own evidence"
on public.parking_evidence for all to authenticated
using (created_by = auth.uid())
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.parking_zones z
    where z.id = parking_zone_id and z.created_by = auth.uid()
  )
);

-- Moderator writes are intentionally deferred to a service-role API.
-- No client policy can approve, reject or create moderation events.

create or replace view public.published_parking_zones
with (security_invoker = true) as
select id, source, external_id, name, geometry, vehicle_entrance,
       pedestrian_exit, access, capacity, fee, opening_hours,
       verified_at, updated_at
from public.parking_zones
where status = 'approved';

commit;
