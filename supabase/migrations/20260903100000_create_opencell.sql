create type public.opencell_programme_status as enum ('active', 'finished');

create table public.opencell_programmes (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint opencell_programmes_name_not_blank check (btrim(name) <> ''),
  description text,
  status public.opencell_programme_status not null default 'active',
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opencell_programmes_lifecycle_check check (
    (status = 'active' and finished_at is null) or
    (status = 'finished' and finished_at is not null)
  )
);

create table public.opencell_sessions (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.opencell_programmes(id) on delete restrict,
  session_date date not null,
  title text,
  location text,
  notes text,
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opencell_sessions_title_not_blank check (title is null or btrim(title) <> ''),
  constraint opencell_sessions_location_not_blank check (location is null or btrim(location) <> '')
);

create table public.opencell_enrollments (
  programme_id uuid not null references public.opencell_programmes(id) on delete restrict,
  visitor_id uuid not null references public.visitors(id) on delete restrict,
  enrolled_on date not null,
  enrolled_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (programme_id, visitor_id)
);

create table public.opencell_attendance (
  session_id uuid not null references public.opencell_sessions(id) on delete restrict,
  visitor_id uuid not null references public.visitors(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (session_id, visitor_id)
);

create index opencell_programmes_status_name_idx on public.opencell_programmes(status, name);
create index opencell_sessions_programme_date_idx on public.opencell_sessions(programme_id, session_date, id);
create index opencell_enrollments_visitor_idx on public.opencell_enrollments(visitor_id, programme_id);
create index opencell_attendance_visitor_idx on public.opencell_attendance(visitor_id, session_id);

create or replace function public.set_opencell_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger opencell_programmes_updated_at before update on public.opencell_programmes for each row execute function public.set_opencell_updated_at();
create trigger opencell_sessions_updated_at before update on public.opencell_sessions for each row execute function public.set_opencell_updated_at();

create or replace function public.enforce_opencell_session_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  programme_status public.opencell_programme_status;
  attendance_count integer;
begin
  select status into programme_status from public.opencell_programmes where id = coalesce(new.programme_id, old.programme_id) for share;
  if programme_status = 'finished' then
    raise exception using errcode = '23514', constraint = 'opencell_programme_finished', message = 'Finished OpenCell Programmes are read-only';
  end if;
  if tg_op = 'UPDATE' and new.session_date is distinct from old.session_date then
    select count(*) into attendance_count from public.opencell_attendance where session_id = old.id;
    if attendance_count > 0 then
      raise exception using errcode = '23514', constraint = 'opencell_session_date_immutable', message = 'A Session date cannot change after attendance exists';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.is_cancelled and not old.is_cancelled then
    select count(*) into attendance_count from public.opencell_attendance where session_id = old.id;
    if attendance_count > 0 then
      raise exception using errcode = '23514', constraint = 'opencell_session_attendance_blocks_cancel', message = 'Correct attendance before cancelling this Session';
    end if;
  end if;
  return new;
end;
$$;
create trigger opencell_sessions_write_guard before update on public.opencell_sessions for each row execute function public.enforce_opencell_session_write();

create or replace function public.enforce_opencell_attendance_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  session_record public.opencell_sessions%rowtype;
  programme_status public.opencell_programme_status;
  enrolled_on date;
  visitor_status public.visitor_status;
begin
  select s.* into session_record from public.opencell_sessions s where s.id = new.session_id;
  select p.status into programme_status from public.opencell_programmes p where p.id = session_record.programme_id;
  if not found or programme_status <> 'active' or session_record.is_cancelled then
    raise exception using errcode = '23514', constraint = 'opencell_attendance_session_closed', message = 'Attendance is unavailable for this Session';
  end if;
  select status into visitor_status from public.visitors where id = new.visitor_id;
  if visitor_status is distinct from 'active'::public.visitor_status then
    raise exception using errcode = '23514', constraint = 'opencell_attendance_visitor_inactive', message = 'Only active Visitors may attend OpenCell';
  end if;
  select e.enrolled_on into enrolled_on from public.opencell_enrollments e where e.programme_id = session_record.programme_id and e.visitor_id = new.visitor_id;
  if not found or session_record.session_date < enrolled_on then
    raise exception using errcode = '23514', constraint = 'opencell_attendance_not_enrolled', message = 'Visitor enrollment does not cover this Session';
  end if;
  return new;
end;
$$;
create trigger opencell_attendance_write_guard before insert on public.opencell_attendance for each row execute function public.enforce_opencell_attendance_write();

create function public.enroll_opencell_visitor(p_programme_id uuid, p_visitor_id uuid, p_enrolled_on date, p_enrolled_by_profile_id uuid)
returns table(outcome text, programme_id uuid, visitor_id uuid, enrolled_on date)
language plpgsql set search_path = '' as $$
declare
  programme_status public.opencell_programme_status;
  visitor_record public.visitors%rowtype;
  existing_programme uuid;
begin
  select status into programme_status from public.opencell_programmes where id = p_programme_id for update;
  if not found then return query select 'programme_not_found', null::uuid, null::uuid, null::date; return; end if;
  if programme_status <> 'active' then return query select 'programme_finished', null::uuid, null::uuid, null::date; return; end if;
  select * into visitor_record from public.visitors where id = p_visitor_id for update;
  if not found then return query select 'visitor_not_found', null::uuid, null::uuid, null::date; return; end if;
  if visitor_record.status <> 'active'::public.visitor_status then return query select 'visitor_not_active', null::uuid, null::uuid, null::date; return; end if;
  if exists (select 1 from public.opencell_enrollments e0 where e0.programme_id = p_programme_id and e0.visitor_id = p_visitor_id) then return query select 'already_enrolled', p_programme_id, p_visitor_id, null::date; return; end if;
  select e.programme_id into existing_programme from public.opencell_enrollments e join public.opencell_programmes p on p.id = e.programme_id where e.visitor_id = p_visitor_id and p.status = 'active' for share;
  if found then return query select 'active_enrollment', existing_programme, p_visitor_id, null::date; return; end if;
  insert into public.opencell_enrollments(programme_id, visitor_id, enrolled_on, enrolled_by_profile_id) values (p_programme_id, p_visitor_id, p_enrolled_on, p_enrolled_by_profile_id);
  return query select 'enrolled', p_programme_id, p_visitor_id, p_enrolled_on;
end;
$$;

create function public.remove_opencell_enrollment(p_programme_id uuid, p_visitor_id uuid)
returns text language plpgsql set search_path = '' as $$
declare
  programme_status public.opencell_programme_status;
begin
  select status into programme_status from public.opencell_programmes where id = p_programme_id for update;
  if not found then return 'programme_not_found'; end if;
  if programme_status <> 'active' then return 'programme_finished'; end if;
  if not exists (select 1 from public.opencell_enrollments e0 where e0.programme_id = p_programme_id and e0.visitor_id = p_visitor_id) then return 'enrollment_not_found'; end if;
  if exists (select 1 from public.opencell_attendance a join public.opencell_sessions s on s.id = a.session_id where s.programme_id = p_programme_id and a.visitor_id = p_visitor_id) then return 'attendance_exists'; end if;
  delete from public.opencell_enrollments where programme_id = p_programme_id and visitor_id = p_visitor_id;
  return 'removed';
end;
$$;

create function public.finish_opencell_programme(p_programme_id uuid)
returns table(outcome text, finished_at timestamptz, evaluations jsonb)
language plpgsql set search_path = '' as $$
declare
  programme_status public.opencell_programme_status;
  completion_time timestamptz;
  evaluation_json jsonb;
  enrollment_record record;
  eligible_count integer;
  attended_count integer;
  qualifies boolean;
  follow_up_result record;
  follow_up_outcome text;
begin
  select status into programme_status from public.opencell_programmes where id = p_programme_id for update;
  if not found then return query select 'programme_not_found', null::timestamptz, '[]'::jsonb; return; end if;
  if programme_status = 'finished' then return query select 'already_finished', (select p2.finished_at from public.opencell_programmes p2 where p2.id = p_programme_id), '[]'::jsonb; return; end if;
  evaluation_json := '[]'::jsonb;
  for enrollment_record in select e.programme_id, e.visitor_id, e.enrolled_on, v.first_name, v.last_name from public.opencell_enrollments e join public.visitors v on v.id = e.visitor_id where e.programme_id = p_programme_id order by v.last_name, v.first_name, v.id loop
    select count(*) into eligible_count from public.opencell_sessions s where s.programme_id = p_programme_id and not s.is_cancelled and s.session_date >= enrollment_record.enrolled_on;
    select count(*) into attended_count from public.opencell_attendance a join public.opencell_sessions s on s.id = a.session_id where s.programme_id = p_programme_id and a.visitor_id = enrollment_record.visitor_id and not s.is_cancelled and s.session_date >= enrollment_record.enrolled_on;
    qualifies := eligible_count > 0 and attended_count * 100 >= eligible_count * 75;
    follow_up_outcome := null;
    if qualifies then
      select * into follow_up_result from public.create_follow_up_if_absent(null::uuid, enrollment_record.visitor_id, 'opencell_high_participation'::public.follow_up_reason, jsonb_build_object('programmeId', p_programme_id, 'programmeName', (select name from public.opencell_programmes where id = p_programme_id), 'attendedCount', attended_count, 'eligibleSessionCount', eligible_count, 'percentage', round((attended_count::numeric * 100) / eligible_count))) ;
      follow_up_outcome := follow_up_result.outcome;
    end if;
    evaluation_json := evaluation_json || jsonb_build_array(jsonb_build_object('visitorId', enrollment_record.visitor_id, 'visitorName', enrollment_record.first_name || ' ' || enrollment_record.last_name, 'attendedCount', attended_count, 'eligibleSessionCount', eligible_count, 'percentage', case when eligible_count = 0 then null else round((attended_count::numeric * 100) / eligible_count) end, 'qualified', qualifies, 'followUpOutcome', follow_up_outcome));
  end loop;
  completion_time := now();
  update public.opencell_programmes set status = 'finished', finished_at = completion_time where id = p_programme_id;
  return query select 'finished', completion_time, evaluation_json;
end;
$$;

alter table public.opencell_programmes enable row level security;
alter table public.opencell_sessions enable row level security;
alter table public.opencell_enrollments enable row level security;
alter table public.opencell_attendance enable row level security;
revoke all on public.opencell_programmes, public.opencell_sessions, public.opencell_enrollments, public.opencell_attendance from anon, authenticated;
grant select, insert, update, delete on public.opencell_programmes, public.opencell_sessions, public.opencell_enrollments, public.opencell_attendance to service_role;
revoke all on function public.enroll_opencell_visitor(uuid,uuid,date,uuid), public.remove_opencell_enrollment(uuid,uuid), public.finish_opencell_programme(uuid) from public, anon, authenticated;
grant execute on function public.enroll_opencell_visitor(uuid,uuid,date,uuid), public.remove_opencell_enrollment(uuid,uuid), public.finish_opencell_programme(uuid) to service_role;
