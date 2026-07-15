begin;

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
      and f.feature_type <> 'entrance'
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

commit;
