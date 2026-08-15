create table public.ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint ministries_name_not_blank check (btrim(name) <> ''),
  description text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.ministries is
  'Horizon Ministries with an archive-only lifecycle and no owner or Leader field.';

comment on column public.ministries.is_active is
  'Archive lifecycle flag; normal product behavior does not hard-delete Ministries.';

alter table public.ministries enable row level security;

revoke all on table public.ministries from anon, authenticated;
grant select, insert, update, delete on table public.ministries to service_role;

create trigger set_ministries_updated_at
before update on public.ministries
for each row
execute function public.set_profiles_updated_at();

create table public.member_ministries (
  member_id uuid not null
    constraint member_ministries_member_id_fkey
      references public.members (id) on delete restrict,
  ministry_id uuid not null
    constraint member_ministries_ministry_id_fkey
      references public.ministries (id) on delete restrict,
  constraint member_ministries_pkey primary key (member_id, ministry_id)
);

create index member_ministries_ministry_id_idx
on public.member_ministries (ministry_id);

comment on table public.member_ministries is
  'Current many-to-many Member-Ministry assignments without history or role metadata.';

alter table public.member_ministries enable row level security;

revoke all on table public.member_ministries from anon, authenticated;
grant select, insert, update, delete on table public.member_ministries to service_role;
