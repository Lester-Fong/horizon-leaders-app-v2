create type public.event_type as enum ('service', 'harvest', 'other');
create type public.event_status as enum ('open', 'closed');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  type public.event_type not null,
  status public.event_status not null default 'open',
  title text not null
    constraint events_title_not_blank check (btrim(title) <> ''),
  event_date date not null,
  location text
    constraint events_location_not_blank check (location is null or btrim(location) <> ''),
  description text
    constraint events_description_not_blank check (description is null or btrim(description) <> ''),
  counts_for_absence boolean not null default true,
  created_by_profile_id uuid not null
    constraint events_created_by_profile_id_fkey
      references public.profiles (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint events_counting_service_sunday_check check (
    type <> 'service'::public.event_type
    or not counts_for_absence
    or extract(isodow from event_date) = 7
  )
);

create unique index events_one_counting_service_per_date_key
on public.events (event_date)
where type = 'service'::public.event_type and counts_for_absence;

create index events_type_date_idx
on public.events (type, event_date desc, created_at desc);

comment on table public.events is
  'Generic Event records; the current application slice implements Sunday Service behavior only.';
comment on column public.events.counts_for_absence is
  'Whether a Sunday Service participates in derived absence; not an attendance status.';

alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;
grant select, insert, update, delete on table public.events to service_role;

create function public.enforce_event_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type is distinct from old.type then
    raise exception using
      errcode = '23514',
      constraint = 'events_type_immutable',
      message = 'Event type cannot be changed';
  end if;

  if new.created_by_profile_id is distinct from old.created_by_profile_id then
    raise exception using
      errcode = '23514',
      constraint = 'events_created_by_profile_id_immutable',
      message = 'Event creator cannot be changed';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_event_immutable_fields()
from public, anon, authenticated;

create trigger enforce_event_immutable_fields
before update on public.events
for each row
execute function public.enforce_event_immutable_fields();

create trigger set_events_updated_at
before update on public.events
for each row
execute function public.set_profiles_updated_at();

create table public.sunday_service_presence (
  event_id uuid not null
    constraint sunday_service_presence_event_id_fkey
      references public.events (id) on delete restrict,
  member_id uuid not null
    constraint sunday_service_presence_member_id_fkey
      references public.members (id) on delete restrict,
  constraint sunday_service_presence_pkey primary key (event_id, member_id)
);

create index sunday_service_presence_member_id_idx
on public.sunday_service_presence (member_id);

comment on table public.sunday_service_presence is
  'Presence-only Member attendance for Sunday Services; missing rows never store an absence state.';

alter table public.sunday_service_presence enable row level security;
revoke all on table public.sunday_service_presence from anon, authenticated;
grant select, insert, update, delete on table public.sunday_service_presence to service_role;

create table public.sunday_service_eligibility (
  event_id uuid not null
    constraint sunday_service_eligibility_event_id_fkey
      references public.events (id) on delete restrict,
  member_id uuid not null
    constraint sunday_service_eligibility_member_id_fkey
      references public.members (id) on delete restrict,
  life_group_id_at_close uuid not null
    constraint sunday_service_eligibility_life_group_id_at_close_fkey
      references public.life_groups (id) on delete restrict,
  constraint sunday_service_eligibility_pkey primary key (event_id, member_id)
);

create index sunday_service_eligibility_member_id_idx
on public.sunday_service_eligibility (member_id);
create index sunday_service_eligibility_life_group_idx
on public.sunday_service_eligibility (event_id, life_group_id_at_close);

comment on table public.sunday_service_eligibility is
  'Immutable-by-domain close-time Member eligibility and Life Group scope for one Sunday Service.';

alter table public.sunday_service_eligibility enable row level security;
revoke all on table public.sunday_service_eligibility from anon, authenticated;
grant select, insert, update, delete on table public.sunday_service_eligibility to service_role;

create table public.sunday_service_visitor_registrations (
  event_id uuid not null
    constraint sunday_service_visitor_registrations_event_id_fkey
      references public.events (id) on delete restrict,
  visitor_id uuid not null
    constraint sunday_service_visitor_registrations_visitor_id_fkey
      references public.visitors (id) on delete restrict,
  registered_by_profile_id uuid not null
    constraint sunday_service_visitor_registrations_registered_by_profile_id_fkey
      references public.profiles (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  constraint sunday_service_visitor_registrations_pkey
    primary key (event_id, visitor_id)
);

create index sunday_service_visitor_registrations_visitor_id_idx
on public.sunday_service_visitor_registrations (visitor_id);

comment on table public.sunday_service_visitor_registrations is
  'Historical staff registration of one Visitor for one Sunday Service.';

alter table public.sunday_service_visitor_registrations enable row level security;
revoke all on table public.sunday_service_visitor_registrations from anon, authenticated;
grant select, insert, update, delete on table public.sunday_service_visitor_registrations to service_role;

create function public.close_sunday_service(p_event_id uuid)
returns table (outcome text, eligibility_count integer)
language plpgsql
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
  snapshot_count integer;
begin
  select events.*
  into event_record
  from public.events
  where events.id = p_event_id
  for update;

  if not found then
    return query select 'event_not_found', 0;
    return;
  end if;

  if event_record.type <> 'service'::public.event_type then
    return query select 'not_service', 0;
    return;
  end if;

  if event_record.status <> 'open'::public.event_status then
    return query select 'already_closed', 0;
    return;
  end if;

  if exists (
    select 1 from public.sunday_service_eligibility
    where event_id = p_event_id
  ) then
    return query select 'invalid_snapshot_state', 0;
    return;
  end if;

  insert into public.sunday_service_eligibility (
    event_id,
    member_id,
    life_group_id_at_close
  )
  select
    event_record.id,
    members.id,
    members.life_group_id
  from public.members
  where members.is_active
    and timezone('Asia/Manila', members.created_at)::date <= event_record.event_date;

  get diagnostics snapshot_count = row_count;

  update public.events
  set status = 'closed'::public.event_status
  where id = event_record.id;

  return query select 'closed', snapshot_count;
end;
$$;

comment on function public.close_sunday_service(uuid) is
  'Narrow atomic boundary that locks an open Service, freezes eligible Member/Life Group history, and closes it.';
revoke all on function public.close_sunday_service(uuid)
from public, anon, authenticated;
grant execute on function public.close_sunday_service(uuid) to service_role;

create function public.create_sunday_visitor_registration(
  p_event_id uuid,
  p_registered_by_profile_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text
)
returns table (
  outcome text,
  created_visitor_id uuid,
  conflicting_visitor_id uuid,
  conflicting_visitor_status public.visitor_status,
  conflicting_member_id uuid,
  conflict_field text
)
language plpgsql
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
  visitor_conflict public.visitors%rowtype;
  member_conflict_id uuid;
  new_visitor_id uuid;
  normalized_email_value text;
  normalized_phone_value text;
begin
  select events.*
  into event_record
  from public.events
  where events.id = p_event_id
  for update;

  if not found then
    return query select 'event_not_found', null::uuid, null::uuid, null::public.visitor_status, null::uuid, null::text;
    return;
  end if;

  if event_record.type <> 'service'::public.event_type then
    return query select 'not_service', null::uuid, null::uuid, null::public.visitor_status, null::uuid, null::text;
    return;
  end if;

  if event_record.status <> 'open'::public.event_status then
    return query select 'event_closed', null::uuid, null::uuid, null::public.visitor_status, null::uuid, null::text;
    return;
  end if;

  if p_first_name is null or btrim(p_first_name) = ''
    or p_last_name is null or btrim(p_last_name) = '' then
    return query select 'invalid_visitor', null::uuid, null::uuid, null::public.visitor_status, null::uuid, null::text;
    return;
  end if;

  normalized_email_value := public.normalize_member_email(p_email);
  normalized_phone_value := public.normalize_member_phone(p_phone);

  if normalized_email_value is not null then
    select visitors.* into visitor_conflict
    from public.visitors
    where visitors.normalized_email = normalized_email_value
    order by visitors.created_at, visitors.id
    limit 1;
    if found then
      return query select 'visitor_conflict', null::uuid, visitor_conflict.id, visitor_conflict.status, null::uuid, 'email';
      return;
    end if;
  end if;

  if normalized_phone_value is not null then
    select visitors.* into visitor_conflict
    from public.visitors
    where visitors.normalized_phone = normalized_phone_value
    order by visitors.created_at, visitors.id
    limit 1;
    if found then
      return query select 'visitor_conflict', null::uuid, visitor_conflict.id, visitor_conflict.status, null::uuid, 'phone';
      return;
    end if;
  end if;

  if normalized_email_value is not null then
    select members.id into member_conflict_id
    from public.members
    where members.normalized_email = normalized_email_value
    order by members.created_at, members.id
    limit 1;
    if found then
      return query select 'member_conflict', null::uuid, null::uuid, null::public.visitor_status, member_conflict_id, 'email';
      return;
    end if;
  end if;

  if normalized_phone_value is not null then
    select members.id into member_conflict_id
    from public.members
    where members.normalized_phone = normalized_phone_value
    order by members.created_at, members.id
    limit 1;
    if found then
      return query select 'member_conflict', null::uuid, null::uuid, null::public.visitor_status, member_conflict_id, 'phone';
      return;
    end if;
  end if;

  insert into public.visitors (first_name, last_name, phone, email)
  values (
    btrim(p_first_name),
    btrim(p_last_name),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_email), '')
  )
  returning id into new_visitor_id;

  insert into public.sunday_service_visitor_registrations (
    event_id,
    visitor_id,
    registered_by_profile_id
  ) values (
    event_record.id,
    new_visitor_id,
    p_registered_by_profile_id
  );

  return query select 'registered', new_visitor_id, null::uuid, null::public.visitor_status, null::uuid, null::text;
end;
$$;

comment on function public.create_sunday_visitor_registration(uuid, uuid, text, text, text, text) is
  'Narrow atomic boundary for checking contacts, creating one Visitor, and registering that Visitor to an open Sunday Service.';
revoke all on function public.create_sunday_visitor_registration(uuid, uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.create_sunday_visitor_registration(uuid, uuid, text, text, text, text)
to service_role;
