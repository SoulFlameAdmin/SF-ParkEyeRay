begin;

alter function public.set_updated_at()
  set search_path = public, pg_temp;

alter function public.enforce_parking_status_transition()
  set search_path = public, pg_temp;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_parking_status_transition() from public, anon, authenticated;

revoke all on function public.finalize_parking_import(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.finalize_parking_import(uuid, integer, integer)
  to service_role;

-- Public parking search is intentionally callable, but only through this bounded
-- read-only RPC. The underlying feature and import tables remain inaccessible.
revoke all on function public.search_parking_features(double precision, double precision, integer, integer)
  from public;
grant execute on function public.search_parking_features(double precision, double precision, integer, integer)
  to anon, authenticated, service_role;

commit;
