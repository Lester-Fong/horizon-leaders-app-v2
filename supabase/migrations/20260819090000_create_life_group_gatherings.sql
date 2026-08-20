create table public.life_group_gatherings (
  id uuid primary key default gen_random_uuid(),
  life_group_id uuid not null
    constraint life_group_gatherings_life_group_id_fkey
      references public.life_groups (id) on delete restrict,
  gathering_date date not null,
  title text
    constraint life_group_gatherings_title_not_blank
      check (title is null or btrim(title) <> ''),
  location text
    constraint life_group_gatherings_location_not_blank
      check (location is null or btrim(location) <> ''),
  notes text
    constraint life_group_gatherings_notes_not_blank
      check (notes is null or btrim(notes) <> ''),
  created_by_profile_id uuid not null
    constraint life_group_gatherings_created_by_profile_id_fkey
      references public.profiles (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index life_group_gatherings_life_group_date_idx
on public.life_group_gatherings (life_group_id, gathering_date desc, created_at desc);

comment on table public.life_group_gatherings is
  'Historical meetings belonging directly to one Life Group; not generic Events.';

comment on column public.life_group_gatherings.created_by_profile_id is
  'Original authenticated creator; immutable through the normal Gathering API.';

alter table public.life_group_gatherings enable row level security;

revoke all on table public.life_group_gatherings from anon, authenticated;
grant select, insert, update, delete on table public.life_group_gatherings to service_role;

create trigger set_life_group_gatherings_updated_at
before update on public.life_group_gatherings
for each row
execute function public.set_profiles_updated_at();

create table public.life_group_gathering_attendance (
  gathering_id uuid not null
    constraint life_group_gathering_attendance_gathering_id_fkey
      references public.life_group_gatherings (id) on delete restrict,
  member_id uuid not null
    constraint life_group_gathering_attendance_member_id_fkey
      references public.members (id) on delete restrict,
  constraint life_group_gathering_attendance_pkey
    primary key (gathering_id, member_id)
);

create index life_group_gathering_attendance_member_id_idx
on public.life_group_gathering_attendance (member_id);

comment on table public.life_group_gathering_attendance is
  'Presence-only historical Member attendance for Life Group Gatherings.';

alter table public.life_group_gathering_attendance enable row level security;

revoke all on table public.life_group_gathering_attendance from anon, authenticated;
grant select, insert, update, delete on table public.life_group_gathering_attendance to service_role;
