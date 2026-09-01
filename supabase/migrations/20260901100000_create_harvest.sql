alter table public.events
add constraint events_harvest_never_counts_for_absence_check check (
  type <> 'harvest'::public.event_type or not counts_for_absence
);

create or replace function public.enforce_event_immutable_fields()
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

  if old.status = 'closed'::public.event_status
    and new.status <> 'closed'::public.event_status then
    raise exception using
      errcode = '23514',
      constraint = 'events_closed_status_immutable',
      message = 'Closed Events cannot be reopened';
  end if;

  return new;
end;
$$;

create table public.harvest_participations (
  event_id uuid not null
    constraint harvest_participations_event_id_fkey
      references public.events (id) on delete restrict,
  visitor_id uuid not null
    constraint harvest_participations_visitor_id_fkey
      references public.visitors (id) on delete restrict,
  registered_by_profile_id uuid not null
    constraint harvest_participations_registered_by_profile_id_fkey
      references public.profiles (id) on delete restrict,
  sunday_interest boolean,
  interest_recorded_by_profile_id uuid
    constraint harvest_participations_interest_recorded_by_profile_id_fkey
      references public.profiles (id) on delete restrict,
  interest_recorded_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint harvest_participations_pkey primary key (event_id, visitor_id),
  constraint harvest_participations_interest_shape_check check (
    (
      sunday_interest is null
      and interest_recorded_by_profile_id is null
      and interest_recorded_at is null
    )
    or
    (
      sunday_interest is not null
      and interest_recorded_by_profile_id is not null
      and interest_recorded_at is not null
    )
  )
);

create index harvest_participations_visitor_id_idx
on public.harvest_participations (visitor_id);

comment on table public.harvest_participations is
  'One preserved staff-side Visitor participation and Sunday-interest decision for one Harvest Event.';

alter table public.harvest_participations enable row level security;
revoke all on table public.harvest_participations from anon, authenticated;
grant select, insert, delete on table public.harvest_participations to service_role;

create function public.enforce_harvest_participation_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
  visitor_record public.visitors%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.sunday_interest is not null
      or new.interest_recorded_by_profile_id is not null
      or new.interest_recorded_at is not null then
      raise exception using
        errcode = '23514',
        constraint = 'harvest_participations_interest_starts_unrecorded',
        message = 'Harvest interest starts unrecorded';
    end if;

    select events.* into event_record
    from public.events
    where events.id = new.event_id
    for update;

    if not found or event_record.type <> 'harvest'::public.event_type then
      raise exception using
        errcode = '23514',
        constraint = 'harvest_participations_harvest_event_check',
        message = 'Harvest participation requires a Harvest Event';
    end if;

    if event_record.status <> 'open'::public.event_status then
      raise exception using
        errcode = '23514',
        constraint = 'harvest_participations_open_event_check',
        message = 'New participation requires an open Harvest Event';
    end if;

    select visitors.* into visitor_record
    from public.visitors
    where visitors.id = new.visitor_id
    for update;

    if not found or visitor_record.status <> 'active'::public.visitor_status then
      raise exception using
        errcode = '23514',
        constraint = 'harvest_participations_active_visitor_check',
        message = 'New participation requires an active Visitor';
    end if;
  else
    if new.event_id is distinct from old.event_id
      or new.visitor_id is distinct from old.visitor_id
      or new.registered_by_profile_id is distinct from old.registered_by_profile_id
      or new.created_at is distinct from old.created_at then
      raise exception using
        errcode = '23514',
        constraint = 'harvest_participations_identity_immutable',
        message = 'Harvest participation identity cannot be changed';
    end if;

    if old.sunday_interest is true and new.sunday_interest is distinct from true then
      raise exception using
        errcode = '23514',
        constraint = 'harvest_participations_positive_interest_immutable',
        message = 'Positive Sunday interest cannot be reversed';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_harvest_participation_integrity()
from public, anon, authenticated;

create trigger enforce_harvest_participation_integrity
before insert or update on public.harvest_participations
for each row
execute function public.enforce_harvest_participation_integrity();

create function public.create_harvest_visitor_registration(
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
  select events.* into event_record
  from public.events
  where events.id = p_event_id
  for update;

  if not found then
    return query select 'event_not_found', null::uuid, null::uuid, null::public.visitor_status, null::uuid, null::text;
    return;
  end if;

  if event_record.type <> 'harvest'::public.event_type then
    return query select 'not_harvest', null::uuid, null::uuid, null::public.visitor_status, null::uuid, null::text;
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

  insert into public.harvest_participations (
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

comment on function public.create_harvest_visitor_registration(uuid, uuid, text, text, text, text) is
  'Service-only atomic contact checking, Visitor creation, and registration for an open Harvest Event.';
revoke all on function public.create_harvest_visitor_registration(uuid, uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.create_harvest_visitor_registration(uuid, uuid, text, text, text, text)
to service_role;

create function public.record_harvest_sunday_interest(
  p_event_id uuid,
  p_visitor_id uuid,
  p_recorded_by_profile_id uuid,
  p_interested boolean
)
returns table (outcome text, follow_up_outcome text, follow_up_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  participation_record public.harvest_participations%rowtype;
  event_record public.events%rowtype;
  trigger_outcome text;
  triggered_follow_up_id uuid;
begin
  if p_interested is null then
    raise check_violation using message = 'Sunday interest decision is required';
  end if;

  select participations.* into participation_record
  from public.harvest_participations participations
  where participations.event_id = p_event_id
    and participations.visitor_id = p_visitor_id
  for update;

  if not found then
    return query select 'participation_not_found', null::text, null::uuid;
    return;
  end if;

  select events.* into event_record
  from public.events
  where events.id = p_event_id;

  if event_record.type <> 'harvest'::public.event_type then
    return query select 'not_harvest', null::text, null::uuid;
    return;
  end if;

  if participation_record.sunday_interest is true then
    if not p_interested then
      return query select 'interest_locked', null::text, null::uuid;
      return;
    end if;

    select follow_ups.id into triggered_follow_up_id
    from public.follow_ups
    where follow_ups.visitor_id = p_visitor_id
      and follow_ups.reason = 'harvest_sunday_interest'::public.follow_up_reason
      and follow_ups.status = 'active'::public.follow_up_status;

    return query select 'already_interested', 'suppressed', triggered_follow_up_id;
    return;
  end if;

  if participation_record.sunday_interest is false and not p_interested then
    return query select 'already_not_interested', null::text, null::uuid;
    return;
  end if;

  if not p_interested then
    update public.harvest_participations
    set sunday_interest = false,
        interest_recorded_by_profile_id = p_recorded_by_profile_id,
        interest_recorded_at = now()
    where event_id = p_event_id and visitor_id = p_visitor_id;

    return query select 'recorded_not_interested', null::text, null::uuid;
    return;
  end if;

  select triggered.outcome, triggered.follow_up_id
  into trigger_outcome, triggered_follow_up_id
  from public.create_follow_up_if_absent(
    null,
    p_visitor_id,
    'harvest_sunday_interest'::public.follow_up_reason,
    jsonb_build_object(
      'harvestEventId', event_record.id,
      'harvestEventTitle', event_record.title,
      'eventDate', event_record.event_date
    )
  ) triggered;

  update public.harvest_participations
  set sunday_interest = true,
      interest_recorded_by_profile_id = p_recorded_by_profile_id,
      interest_recorded_at = now()
  where event_id = p_event_id and visitor_id = p_visitor_id;

  return query select 'recorded_interested', trigger_outcome, triggered_follow_up_id;
end;
$$;

comment on function public.record_harvest_sunday_interest(uuid,uuid,uuid,boolean) is
  'Service-only atomic Harvest Sunday-interest transition and deduplicated Visitor Follow Up trigger.';
revoke all on function public.record_harvest_sunday_interest(uuid,uuid,uuid,boolean)
from public, anon, authenticated;
grant execute on function public.record_harvest_sunday_interest(uuid,uuid,uuid,boolean)
to service_role;
