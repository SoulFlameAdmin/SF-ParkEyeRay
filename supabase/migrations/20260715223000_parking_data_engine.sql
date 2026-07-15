begin;

create table public.parking_import_runs (
  id uuid primary key default gen_random_uuid(),
  source public.parking_source not null,
  scope_key text not null check (char_length(scope_key) between 2 and 120),
  revision text not null check (char_length(revision) between 1 and 160),
  bbox geometry(Polygon,4326),
  status text not null default 'running' check (status in ('running','completed','failed')),
  seen_count integer not null default 0 check (seen_count >= 0),
  upserted_count integer not null default 0 check (upserted_count >= 0),
  deactivated_count integer not null default 0 check (deactivated_count >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (source, scope_key, revision)
);

create index parking_import_runs_source_scope_idx
  on public.parking_import_runs(source, scope_key, started_at desc);

create table public.parking_features (
  id uuid primary key default gen_random_uuid(),
  source public.parking_source not null check (source in ('osm','operator','municipality')),
  external_id text not null check (char_length(external_id) between 1 and 180),
  scope_key text not null check (char_length(scope_key) between 2 and 120),
  feature_type text not null check (feature_type in ('area','space','street','entrance','point')),
  name text,
  kind text not null default 'parking',
  geometry geometry(Geometry,4326) not null,
  representative_point geometry(Point,4326) not null,
  vehicle_entrance geometry(Point,4326),
  access text,
  capacity integer check (capacity is null or capacity between 1 and 100000),
  fee text,
  covered boolean,
  lit boolean,
  surveillance boolean,
  tags jsonb not null default '{}'::jsonb,
  source_revision text not null,
  source_updated_at timestamptz,
  import_run_id uuid references public.parking_import_runs(id) on delete set null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  unique (source, external_id)
);

create index parking_features_rep_point_gix
  on public.parking_features using gist(representative_point);
create index parking_features_geometry_gix
  on public.parking_features using gist(geometry);
create index parking_features_active_scope_idx
  on public.parking_features(source, scope_key, is_active);
create index parking_features_revision_idx
  on public.parking_features(source, scope_key, source_revision);

create trigger parking_features_set_updated_at
before update on public.parking_features
for each row execute function public.set_updated_at();

alter table public.parking_import_runs enable row level security;
alter table public.parking_features enable row level security;

-- Direct client reads and writes are intentionally blocked. Public access goes
-- through the bounded spatial RPC below; imports use the server-only service role.

create or replace function public.search_parking_features(
  p_lat double precision,
  p_lon double precision,
  p_radius_m integer default 1000,
  p_limit integer default 80
)
returns table (
  source text,
  external_id text,
  name text,
  kind text,
  latitude double precision,
  longitude double precision,
  entrance_latitude double precision,
  entrance_longitude double precision,
  distance_m double precision,
  access text,
  capacity integer,
  fee text,
  covered boolean,
  lit boolean,
  surveillance boolean,
  verification_status text,
  source_updated_at timestamptz,
  source_revision text,
  tags jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      st_setsrid(st_makepoint(p_lon, p_lat), 4326) as origin,
      greatest(100, least(coalesce(p_radius_m, 1000), 5000))::integer as radius_m,
      greatest(1, least(coalesce(p_limit, 80), 150))::integer as row_limit
  ), candidates as (
    select
      f.source::text as source,
      f.external_id,
      nullif(trim(f.name), '') as name,
      f.kind,
      st_y(f.representative_point) as latitude,
      st_x(f.representative_point) as longitude,
      case when f.vehicle_entrance is null then null else st_y(f.vehicle_entrance) end as entrance_latitude,
      case when f.vehicle_entrance is null then null else st_x(f.vehicle_entrance) end as entrance_longitude,
      st_distance(f.representative_point::geography, p.origin::geography) as distance_m,
      f.access,
      f.capacity,
      f.fee,
      f.covered,
      f.lit,
      f.surveillance,
      'mapped'::text as verification_status,
      coalesce(f.source_updated_at, f.imported_at) as source_updated_at,
      f.source_revision,
      f.tags
    from public.parking_features f
    cross join params p
    where f.is_active
      and st_dwithin(f.representative_point::geography, p.origin::geography, p.radius_m)

    union all

    select
      z.source::text as source,
      coalesce(z.external_id, z.id::text) as external_id,
      z.name,
      'community_zone'::text as kind,
      st_y(st_pointonsurface(z.geometry)) as latitude,
      st_x(st_pointonsurface(z.geometry)) as longitude,
      case when z.vehicle_entrance is null then null else st_y(z.vehicle_entrance) end as entrance_latitude,
      case when z.vehicle_entrance is null then null else st_x(z.vehicle_entrance) end as entrance_longitude,
      st_distance(st_pointonsurface(z.geometry)::geography, p.origin::geography) as distance_m,
      z.access,
      z.capacity,
      z.fee,
      null::boolean as covered,
      null::boolean as lit,
      null::boolean as surveillance,
      'approved'::text as verification_status,
      coalesce(z.verified_at, z.updated_at) as source_updated_at,
      null::text as source_revision,
      jsonb_build_object('opening_hours', z.opening_hours, 'verified_at', z.verified_at) as tags
    from public.parking_zones z
    cross join params p
    where z.source = 'soulflame'
      and z.status = 'approved'
      and st_dwithin(st_pointonsurface(z.geometry)::geography, p.origin::geography, p.radius_m)
  )
  select c.*
  from candidates c
  cross join params p
  order by
    case when c.verification_status = 'approved' then 0 else 1 end,
    c.distance_m asc
  limit (select row_limit from params);
$$;

revoke all on function public.search_parking_features(double precision,double precision,integer,integer) from public;
grant execute on function public.search_parking_features(double precision,double precision,integer,integer) to anon, authenticated;

create or replace function public.finalize_parking_import(
  p_run_id uuid,
  p_seen_count integer,
  p_upserted_count integer
)
returns table (deactivated_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_run public.parking_import_runs%rowtype;
  changed integer := 0;
begin
  select * into target_run
  from public.parking_import_runs
  where id = p_run_id
  for update;

  if target_run.id is null then
    raise exception 'parking import run not found';
  end if;
  if target_run.status <> 'running' then
    raise exception 'parking import run is not running';
  end if;

  update public.parking_features
  set is_active = false,
      updated_at = now()
  where source = target_run.source
    and scope_key = target_run.scope_key
    and source_revision <> target_run.revision
    and is_active;
  get diagnostics changed = row_count;

  update public.parking_import_runs
  set status = 'completed',
      seen_count = greatest(coalesce(p_seen_count, 0), 0),
      upserted_count = greatest(coalesce(p_upserted_count, 0), 0),
      deactivated_count = changed,
      completed_at = now()
  where id = p_run_id;

  return query select changed;
end;
$$;

revoke all on function public.finalize_parking_import(uuid,integer,integer) from public;
grant execute on function public.finalize_parking_import(uuid,integer,integer) to service_role;

commit;
