-- Deleting a user removes their sign-in but keeps the Profile, so their name
-- stays on past Horizon records and in the activity log. A deleted Profile is
-- always inactive; the Users API rejects further changes to it.
alter table public.profiles
  add column deleted_at timestamp with time zone,
  add constraint profiles_deleted_is_inactive
    check (deleted_at is null or is_active = false);

comment on column public.profiles.deleted_at is
  'When an Admin deleted this user. The sign-in is removed; the Profile and its history are kept. Cannot be undone.';
