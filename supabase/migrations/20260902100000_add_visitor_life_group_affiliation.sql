alter table public.visitors
add column life_group_id uuid
  constraint visitors_life_group_id_fkey
    references public.life_groups (id) on delete restrict;

create index visitors_life_group_id_status_idx
on public.visitors (life_group_id, status, last_name, first_name);

comment on column public.visitors.life_group_id is
  'Optional current Life Group affiliation. Preserved as Visitor context after conversion.';

create table public.life_group_gathering_visitor_attendance (
  gathering_id uuid not null
    constraint life_group_gathering_visitor_attendance_gathering_id_fkey
      references public.life_group_gatherings (id) on delete restrict,
  visitor_id uuid not null
    constraint life_group_gathering_visitor_attendance_visitor_id_fkey
      references public.visitors (id) on delete restrict,
  constraint life_group_gathering_visitor_attendance_pkey
    primary key (gathering_id, visitor_id)
);

create index life_group_gathering_visitor_attendance_visitor_id_idx
on public.life_group_gathering_visitor_attendance (visitor_id);

comment on table public.life_group_gathering_visitor_attendance is
  'Presence-only historical Visitor attendance for Life Group Gatherings.';

alter table public.life_group_gathering_visitor_attendance enable row level security;

revoke all on table public.life_group_gathering_visitor_attendance
from anon, authenticated;
grant select, insert, delete on table public.life_group_gathering_visitor_attendance
to service_role;

create function public.validate_life_group_gathering_visitor_attendance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  gathering_life_group_id uuid;
  visitor_life_group_id uuid;
  visitor_status public.visitor_status;
begin
  select life_group_gatherings.life_group_id
  into gathering_life_group_id
  from public.life_group_gatherings
  where life_group_gatherings.id = new.gathering_id
  for share;

  select visitors.life_group_id, visitors.status
  into visitor_life_group_id, visitor_status
  from public.visitors
  where visitors.id = new.visitor_id
  for share;

  if visitor_status is distinct from 'active'::public.visitor_status
    or visitor_life_group_id is distinct from gathering_life_group_id then
    raise exception using
      errcode = '23514',
      constraint = 'life_group_gathering_visitor_attendance_eligibility_check',
      message = 'Visitor must be active and currently affiliated with the Gathering Life Group';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_life_group_gathering_visitor_attendance()
from public, anon, authenticated;

create trigger validate_life_group_gathering_visitor_attendance
before insert on public.life_group_gathering_visitor_attendance
for each row
execute function public.validate_life_group_gathering_visitor_attendance();

create function public.set_visitor_life_group(
  p_visitor_id uuid,
  p_expected_life_group_id uuid,
  p_life_group_id uuid
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  visitor_record public.visitors%rowtype;
  target_life_group_active boolean;
begin
  select visitors.*
  into visitor_record
  from public.visitors
  where visitors.id = p_visitor_id
  for update;

  if not found then
    return 'visitor_not_found';
  end if;

  if visitor_record.status <> 'active'::public.visitor_status then
    return 'visitor_not_active';
  end if;

  if visitor_record.life_group_id is distinct from p_expected_life_group_id then
    return 'visitor_changed';
  end if;

  if p_life_group_id is not null then
    select life_groups.is_active
    into target_life_group_active
    from public.life_groups
    where life_groups.id = p_life_group_id
    for share;

    if not found then
      return 'life_group_not_found';
    end if;

    if not target_life_group_active then
      return 'inactive_life_group';
    end if;
  end if;

  update public.visitors
  set life_group_id = p_life_group_id
  where visitors.id = p_visitor_id;

  return 'updated';
end;
$$;

comment on function public.set_visitor_life_group(uuid, uuid, uuid) is
  'Concurrency-safe Visitor current-affiliation update; Express owns actor authorization.';

revoke all on function public.set_visitor_life_group(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.set_visitor_life_group(uuid, uuid, uuid)
to service_role;

create or replace function public.convert_visitor_to_member(
  p_visitor_id uuid,
  p_life_group_id uuid,
  p_qr_token text
)
returns table (
  outcome text,
  created_member_id uuid,
  conflicting_member_id uuid,
  conflict_field text
)
language plpgsql
set search_path = ''
as $$
declare
  visitor_record public.visitors%rowtype;
  member_conflict_id uuid;
  new_member_id uuid;
  target_life_group_id uuid;
  target_life_group_active boolean;
begin
  select visitors.*
  into visitor_record
  from public.visitors
  where visitors.id = p_visitor_id
  for update;

  if not found then
    return query select 'visitor_not_found', null::uuid, null::uuid, null::text;
    return;
  end if;

  if visitor_record.status <> 'active'::public.visitor_status then
    return query select 'visitor_not_active', null::uuid, null::uuid, null::text;
    return;
  end if;

  if visitor_record.life_group_id is not null
    and p_life_group_id is not null
    and p_life_group_id is distinct from visitor_record.life_group_id then
    return query select 'life_group_mismatch', null::uuid, null::uuid, null::text;
    return;
  end if;

  target_life_group_id := coalesce(visitor_record.life_group_id, p_life_group_id);

  if target_life_group_id is null then
    return query select 'life_group_required', null::uuid, null::uuid, null::text;
    return;
  end if;

  select life_groups.is_active
  into target_life_group_active
  from public.life_groups
  where life_groups.id = target_life_group_id
  for share;

  if not found then
    return query select 'life_group_not_found', null::uuid, null::uuid, null::text;
    return;
  end if;

  if not target_life_group_active then
    return query select 'inactive_life_group', null::uuid, null::uuid, null::text;
    return;
  end if;

  if visitor_record.normalized_email is not null then
    select members.id
    into member_conflict_id
    from public.members
    where members.normalized_email = visitor_record.normalized_email
    order by members.created_at, members.id
    limit 1;

    if found then
      return query select 'duplicate_member', null::uuid, member_conflict_id, 'email';
      return;
    end if;
  end if;

  member_conflict_id := null;
  if visitor_record.normalized_phone is not null then
    select members.id
    into member_conflict_id
    from public.members
    where members.normalized_phone = visitor_record.normalized_phone
    order by members.created_at, members.id
    limit 1;

    if found then
      return query select 'duplicate_member', null::uuid, member_conflict_id, 'phone';
      return;
    end if;
  end if;

  insert into public.members (
    first_name,
    last_name,
    phone,
    email,
    life_group_id,
    qr_token
  )
  values (
    visitor_record.first_name,
    visitor_record.last_name,
    visitor_record.phone,
    visitor_record.email,
    target_life_group_id,
    p_qr_token
  )
  returning members.id into new_member_id;

  update public.visitors
  set
    status = 'converted',
    converted_member_id = new_member_id
  where visitors.id = p_visitor_id;

  return query select 'converted', new_member_id, null::uuid, null::text;
end;
$$;

comment on function public.convert_visitor_to_member(uuid, uuid, text) is
  'Atomic Visitor conversion that inherits current Visitor Life Group affiliation or uses an authorized active group when unassigned.';
