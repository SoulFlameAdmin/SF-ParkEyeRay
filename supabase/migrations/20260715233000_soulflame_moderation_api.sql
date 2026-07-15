begin;

create or replace function public.moderate_parking_proposal(
  proposal_id uuid,
  next_status public.parking_status,
  moderator_id uuid,
  moderation_reason text default null
)
returns table (
  id uuid,
  status public.parking_status,
  verified_at timestamptz,
  verified_by uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_zone public.parking_zones%rowtype;
  action_name public.moderation_action;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  if moderator_id is null then
    raise exception 'moderator id required';
  end if;

  if next_status not in ('approved','rejected','changes_requested') then
    raise exception 'invalid moderation target';
  end if;

  select * into current_zone
  from public.parking_zones
  where parking_zones.id = proposal_id
    and source = 'soulflame'
  for update;

  if not found then
    raise exception 'proposal not found';
  end if;

  if current_zone.status <> 'pending_soulflame' then
    raise exception 'proposal is not pending moderation';
  end if;

  if next_status in ('rejected','changes_requested')
     and nullif(trim(moderation_reason),'') is null then
    raise exception 'moderation reason required';
  end if;

  action_name := case next_status
    when 'approved' then 'approved'::public.moderation_action
    when 'rejected' then 'rejected'::public.moderation_action
    else 'changes_requested'::public.moderation_action
  end;

  update public.parking_zones
  set status = next_status,
      verified_at = case when next_status = 'approved' then now() else null end,
      verified_by = case when next_status = 'approved' then moderator_id else null end
  where parking_zones.id = proposal_id;

  insert into public.parking_moderation_events(
    parking_zone_id, action, from_status, to_status, reason, actor_id
  ) values (
    proposal_id, action_name, current_zone.status, next_status,
    nullif(trim(moderation_reason),''), moderator_id
  );

  return query
  select z.id, z.status, z.verified_at, z.verified_by, z.updated_at
  from public.parking_zones z
  where z.id = proposal_id;
end;
$$;

revoke all on function public.moderate_parking_proposal(uuid, public.parking_status, uuid, text)
from public, anon, authenticated;
grant execute on function public.moderate_parking_proposal(uuid, public.parking_status, uuid, text)
to service_role;

revoke update, delete, truncate on public.parking_moderation_events
from public, anon, authenticated;

commit;
