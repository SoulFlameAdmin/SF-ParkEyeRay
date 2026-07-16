begin;

create table if not exists public.parking_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'reviewer' check (role in ('owner','reviewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.parking_moderators enable row level security;

create or replace function public.is_parking_moderator(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.parking_moderators moderator
    where moderator.user_id = check_user
      and moderator.active
  );
$$;

revoke all on function public.is_parking_moderator(uuid) from public, anon;
grant execute on function public.is_parking_moderator(uuid) to authenticated, service_role;

create policy "moderators read own membership"
on public.parking_moderators for select to authenticated
using (user_id = auth.uid());

revoke insert, update, delete, truncate on public.parking_moderators from public, anon, authenticated;

create policy "moderators review soulflame zones"
on public.parking_zones for select to authenticated
using (public.is_parking_moderator(auth.uid()) and source = 'soulflame');

create policy "moderators read proposal evidence"
on public.parking_evidence for select to authenticated
using (public.is_parking_moderator(auth.uid()));

create policy "moderators read moderation history"
on public.parking_moderation_events for select to authenticated
using (public.is_parking_moderator(auth.uid()));

create policy "moderators read private parking evidence objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'parking-evidence'
  and public.is_parking_moderator(auth.uid())
);

create or replace function public.moderate_parking_proposal_auth(
  proposal_id uuid,
  next_status public.parking_status,
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
  moderator_id uuid := auth.uid();
begin
  if moderator_id is null or not public.is_parking_moderator(moderator_id) then
    raise exception 'moderator access required';
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
  select zone.id, zone.status, zone.verified_at, zone.verified_by, zone.updated_at
  from public.parking_zones zone
  where zone.id = proposal_id;
end;
$$;

revoke all on function public.moderate_parking_proposal_auth(uuid, public.parking_status, text)
from public, anon;
grant execute on function public.moderate_parking_proposal_auth(uuid, public.parking_status, text)
to authenticated, service_role;

commit;
