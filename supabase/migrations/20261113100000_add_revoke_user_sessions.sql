-- Signs a user out everywhere by deleting their Supabase Auth sessions.
-- Refresh tokens cascade with their session, and Express validates every
-- access token through Supabase Auth, which rejects tokens whose session is gone.
-- Used by the Admin-only Users workflow after a password reset or deactivation.
create function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  revoked_count integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$$;

comment on function public.revoke_user_sessions(uuid) is
  'Deletes every Supabase Auth session for the given user and returns how many were removed.';

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
