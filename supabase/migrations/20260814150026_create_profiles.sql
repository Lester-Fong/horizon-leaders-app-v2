create type public.app_role as enum ('admin', 'leader');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null constraint profiles_name_not_blank check (btrim(name) <> ''),
  role public.app_role not null default 'leader',
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.profiles is
  'Horizon application data for an authenticated Supabase user.';

comment on column public.profiles.role is
  'Authorization role managed only by a privileged Horizon workflow.';

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

create function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_profiles_updated_at() from public, anon, authenticated;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := nullif(btrim(new.raw_user_meta_data ->> 'name'), '');

  if profile_name is null then
    profile_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;

  insert into public.profiles (id, name)
  values (new.id, coalesce(profile_name, 'New user'));

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();
