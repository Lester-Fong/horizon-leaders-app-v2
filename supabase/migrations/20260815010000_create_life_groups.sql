create table public.life_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint life_groups_name_not_blank check (btrim(name) <> ''),
  description text,
  leader_profile_id uuid not null
    constraint life_groups_leader_profile_id_key unique
    constraint life_groups_leader_profile_id_fkey
      references public.profiles (id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.life_groups is
  'Current Horizon Life Groups with one assigned Leader Profile each.';

comment on column public.life_groups.leader_profile_id is
  'Unique Leader Profile assignment; role and active state are validated by Express.';

comment on column public.life_groups.is_active is
  'Archive lifecycle flag; normal product behavior does not hard-delete Life Groups.';

alter table public.life_groups enable row level security;

revoke all on table public.life_groups from anon, authenticated;
grant select, insert, update, delete on table public.life_groups to service_role;

create trigger set_life_groups_updated_at
before update on public.life_groups
for each row
execute function public.set_profiles_updated_at();
