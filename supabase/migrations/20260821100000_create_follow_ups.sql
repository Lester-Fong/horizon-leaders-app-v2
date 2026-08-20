create type public.follow_up_reason as enum (
  'consecutive_sunday_absence',
  'opencell_high_participation',
  'harvest_sunday_interest'
);

create type public.follow_up_status as enum ('active', 'completed');

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  member_id uuid
    constraint follow_ups_member_id_fkey
      references public.members (id) on delete restrict,
  visitor_id uuid
    constraint follow_ups_visitor_id_fkey
      references public.visitors (id) on delete restrict,
  reason public.follow_up_reason not null,
  context jsonb not null default '{}'::jsonb
    constraint follow_ups_context_object_check
      check (jsonb_typeof(context) = 'object'),
  status public.follow_up_status not null default 'active',
  created_at timestamp with time zone not null default now(),
  completed_by_profile_id uuid
    constraint follow_ups_completed_by_profile_id_fkey
      references public.profiles (id) on delete restrict,
  completed_at timestamp with time zone,
  completion_note text
    constraint follow_ups_completion_note_not_blank
      check (completion_note is null or btrim(completion_note) <> ''),
  constraint follow_ups_exactly_one_subject_check check (
    (member_id is not null)::integer + (visitor_id is not null)::integer = 1
  ),
  constraint follow_ups_lifecycle_check check (
    (
      status = 'active'::public.follow_up_status
      and completed_by_profile_id is null
      and completed_at is null
      and completion_note is null
    )
    or
    (
      status = 'completed'::public.follow_up_status
      and completed_by_profile_id is not null
      and completed_at is not null
    )
  )
);

create unique index follow_ups_active_member_reason_key
on public.follow_ups (member_id, reason)
where status = 'active'::public.follow_up_status and member_id is not null;

create unique index follow_ups_active_visitor_reason_key
on public.follow_ups (visitor_id, reason)
where status = 'active'::public.follow_up_status and visitor_id is not null;

create index follow_ups_status_created_at_idx
on public.follow_ups (status, created_at desc, id);

create index follow_ups_completed_at_idx
on public.follow_ups (completed_at desc, id)
where status = 'completed'::public.follow_up_status;

comment on table public.follow_ups is
  'Shared active and completed pastoral Follow Up history for exactly one Member or Visitor.';
comment on column public.follow_ups.context is
  'Small immutable reason-specific trigger context; never user-authored task content.';

alter table public.follow_ups enable row level security;
revoke all on table public.follow_ups from anon, authenticated;
grant select, insert, update, delete on table public.follow_ups to service_role;

create function public.enforce_follow_up_trigger_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.member_id is distinct from old.member_id
    or new.visitor_id is distinct from old.visitor_id
    or new.reason is distinct from old.reason
    or new.context is distinct from old.context
    or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '23514',
      constraint = 'follow_ups_trigger_fields_immutable',
      message = 'Follow Up subject, reason, context, and trigger time cannot be changed';
  end if;

  if old.status = 'completed'::public.follow_up_status then
    raise exception using
      errcode = '23514',
      constraint = 'follow_ups_completion_immutable',
      message = 'Completed Follow Ups cannot be changed';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_follow_up_trigger_immutability()
from public, anon, authenticated;

create trigger enforce_follow_up_trigger_immutability
before update on public.follow_ups
for each row
execute function public.enforce_follow_up_trigger_immutability();

create function public.create_follow_up_if_absent(
  p_member_id uuid,
  p_visitor_id uuid,
  p_reason public.follow_up_reason,
  p_context jsonb
)
returns table (outcome text, follow_up_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  created_id uuid;
begin
  if ((p_member_id is not null)::integer + (p_visitor_id is not null)::integer) <> 1 then
    raise check_violation using
      constraint = 'follow_ups_exactly_one_subject_check',
      message = 'Exactly one Follow Up subject is required';
  end if;

  if p_context is null or jsonb_typeof(p_context) <> 'object' then
    raise check_violation using
      constraint = 'follow_ups_context_object_check',
      message = 'Follow Up context must be a JSON object';
  end if;

  if p_member_id is not null then
    insert into public.follow_ups (member_id, reason, context)
    values (p_member_id, p_reason, p_context)
    on conflict (member_id, reason)
      where status = 'active'::public.follow_up_status and member_id is not null
      do nothing
    returning id into created_id;

    if created_id is null then
      select id into created_id
      from public.follow_ups
      where member_id = p_member_id
        and reason = p_reason
        and status = 'active'::public.follow_up_status;
      return query select 'suppressed', created_id;
      return;
    end if;
  else
    insert into public.follow_ups (visitor_id, reason, context)
    values (p_visitor_id, p_reason, p_context)
    on conflict (visitor_id, reason)
      where status = 'active'::public.follow_up_status and visitor_id is not null
      do nothing
    returning id into created_id;

    if created_id is null then
      select id into created_id
      from public.follow_ups
      where visitor_id = p_visitor_id
        and reason = p_reason
        and status = 'active'::public.follow_up_status;
      return query select 'suppressed', created_id;
      return;
    end if;
  end if;

  return query select 'created', created_id;
end;
$$;

comment on function public.create_follow_up_if_absent(uuid,uuid,public.follow_up_reason,jsonb) is
  'Service-only idempotent trigger boundary; repeated active triggers leave stored context and time unchanged.';
revoke all on function public.create_follow_up_if_absent(uuid,uuid,public.follow_up_reason,jsonb)
from public, anon, authenticated;
grant execute on function public.create_follow_up_if_absent(uuid,uuid,public.follow_up_reason,jsonb)
to service_role;

create function public.complete_follow_up(
  p_follow_up_id uuid,
  p_completed_by_profile_id uuid,
  p_completion_note text
)
returns table (outcome text, completed_at timestamp with time zone)
language plpgsql
set search_path = ''
as $$
declare
  follow_up_record public.follow_ups%rowtype;
  completion_time timestamp with time zone;
  normalized_note text;
begin
  select follow_ups.*
  into follow_up_record
  from public.follow_ups
  where follow_ups.id = p_follow_up_id
  for update;

  if not found then
    return query select 'not_found', null::timestamp with time zone;
    return;
  end if;

  if follow_up_record.status = 'completed'::public.follow_up_status then
    return query select 'already_completed', follow_up_record.completed_at;
    return;
  end if;

  normalized_note := nullif(btrim(p_completion_note), '');
  completion_time := now();

  update public.follow_ups
  set status = 'completed'::public.follow_up_status,
      completed_by_profile_id = p_completed_by_profile_id,
      completed_at = completion_time,
      completion_note = normalized_note
  where id = p_follow_up_id;

  return query select 'completed', completion_time;
end;
$$;

comment on function public.complete_follow_up(uuid,uuid,text) is
  'Service-only one-way completion boundary using a trusted Profile and database time.';
revoke all on function public.complete_follow_up(uuid,uuid,text)
from public, anon, authenticated;
grant execute on function public.complete_follow_up(uuid,uuid,text) to service_role;
