-- Horizon must always keep at least one active Admin, otherwise nobody can
-- manage users any more. This guards every Profile update that demotes or
-- deactivates an active Admin (including a soft delete, which deactivates).
-- The advisory lock serialises concurrent demotions so two Admins cannot
-- demote each other at the same time and leave no active Admin.
-- DELETE is intentionally not covered: the Users API never hard-deletes
-- Profiles, and service-role test cleanups remove fixture Admins.
create function public.require_active_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin'::public.app_role
    and old.is_active
    and not (new.role = 'admin'::public.app_role and new.is_active) then
    perform pg_advisory_xact_lock(hashtext('public.profiles.active_admin'));

    if not exists (
      select 1
      from public.profiles
      where role = 'admin'::public.app_role
        and is_active
    ) then
      raise exception using
        errcode = '23514',
        constraint = 'profiles_active_admin_required',
        message = 'profiles_active_admin_required: At least one active Admin is required';
    end if;
  end if;

  return null;
end;
$$;

comment on function public.require_active_admin() is
  'Rejects a Profile update that would leave Horizon without an active Admin.';

revoke all on function public.require_active_admin() from public, anon, authenticated;

create trigger require_active_admin
after update of role, is_active on public.profiles
for each row
execute function public.require_active_admin();
