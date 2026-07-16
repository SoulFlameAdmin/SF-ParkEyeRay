begin;

alter function public.is_parking_moderator(uuid)
  security invoker;

-- Authenticated callers can see only their own membership row through RLS.
-- The moderation transition itself remains SECURITY DEFINER and repeats the
-- active-membership check before changing a proposal.

commit;
