-- Phase 13: synchronous Sunday absence evaluation and narrow daily reconciliation.

create or replace function public.sunday_consecutive_absence_threshold()
returns integer language sql immutable set search_path = '' as $$ select 5 $$;

create or replace function public.opencell_participation_threshold_percent()
returns integer language sql immutable set search_path = '' as $$ select 75 $$;

create or replace function public.church_time_zone()
returns text language sql immutable set search_path = '' as $$ select 'Asia/Manila' $$;

create table public.sunday_service_evaluations (
  event_id uuid primary key references public.events(id) on delete restrict,
  evaluated_at timestamptz not null default now(),
  processed_count integer not null default 0 check (processed_count >= 0)
);

create table public.sunday_absence_threshold_occurrences (
  event_id uuid not null references public.events(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  threshold integer not null check (threshold > 0),
  previous_streak integer not null check (previous_streak >= 0),
  new_streak integer not null check (new_streak >= 1),
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create index sunday_absence_occurrences_member_idx
  on public.sunday_absence_threshold_occurrences(member_id, created_at);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed_count integer not null default 0 check (processed_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  error_summary text
);

create index automation_runs_job_started_idx on public.automation_runs(job_name, started_at desc);

alter table public.sunday_service_evaluations enable row level security;
alter table public.sunday_absence_threshold_occurrences enable row level security;
alter table public.automation_runs enable row level security;
revoke all on public.sunday_service_evaluations, public.sunday_absence_threshold_occurrences, public.automation_runs from anon, authenticated;
grant select, insert, update, delete on public.sunday_service_evaluations, public.sunday_absence_threshold_occurrences, public.automation_runs to service_role;

create or replace function public.evaluate_sunday_member(p_member_id uuid)
returns integer language plpgsql set search_path = '' as $$
declare
  service_record record;
  current_streak integer := 0;
  threshold integer := public.sunday_consecutive_absence_threshold();
  inserted_occurrence boolean;
begin
  for service_record in
    select e.id, e.event_date
    from public.events e
    join public.sunday_service_eligibility eligibility
      on eligibility.event_id = e.id and eligibility.member_id = p_member_id
    where e.type = 'service'::public.event_type
      and e.status = 'closed'::public.event_status
      and e.counts_for_absence
    order by e.event_date, e.id
  loop
    if exists (
      select 1 from public.sunday_service_presence presence
      where presence.event_id = service_record.id and presence.member_id = p_member_id
    ) then
      current_streak := 0;
    elsif current_streak < threshold and current_streak + 1 >= threshold then
      inserted_occurrence := false;
      insert into public.sunday_absence_threshold_occurrences
        (event_id, member_id, threshold, previous_streak, new_streak)
      values
        (service_record.id, p_member_id, threshold, current_streak, current_streak + 1)
      on conflict (event_id, member_id) do nothing;
      inserted_occurrence := found;
      if inserted_occurrence then
        perform public.create_follow_up_if_absent(
          p_member_id,
          null::uuid,
          'consecutive_sunday_absence'::public.follow_up_reason,
          jsonb_build_object(
            'threshold', threshold,
            'eventId', service_record.id,
            'eventDate', service_record.event_date,
            'previousStreak', current_streak,
            'newStreak', current_streak + 1
          )
        );
      end if;
      current_streak := current_streak + 1;
    else
      current_streak := current_streak + 1;
    end if;
  end loop;
  return current_streak;
end;
$$;

create or replace function public.evaluate_sunday_service(p_event_id uuid)
returns table(outcome text, processed_count integer, error_count integer)
language plpgsql set search_path = '' as $$
declare
  event_record public.events%rowtype;
  member_record record;
  processed integer := 0;
begin
  select * into event_record from public.events where id = p_event_id for update;
  if not found then return query select 'event_not_found', 0, 0; return; end if;
  if event_record.type <> 'service'::public.event_type or event_record.status <> 'closed'::public.event_status then
    return query select 'not_closed_counting_service', 0, 0; return;
  end if;
  if not event_record.counts_for_absence then
    return query select 'not_counting', 0, 0; return;
  end if;
  for member_record in
    select member_id from public.sunday_service_eligibility where event_id = p_event_id order by member_id
  loop
    perform public.evaluate_sunday_member(member_record.member_id);
    processed := processed + 1;
  end loop;
  insert into public.sunday_service_evaluations(event_id, processed_count)
  values (p_event_id, processed)
  on conflict (event_id) do update set evaluated_at = now(), processed_count = excluded.processed_count;
  return query select 'evaluated', processed, 0;
end;
$$;

drop function public.close_sunday_service(uuid);
create function public.close_sunday_service(p_event_id uuid)
returns table(outcome text, eligibility_count integer)
language plpgsql set search_path = '' as $$
declare
  event_record public.events%rowtype;
  snapshot_count integer;
begin
  select * into event_record from public.events where id = p_event_id for update;
  if not found then return query select 'event_not_found', 0; return; end if;
  if event_record.type <> 'service'::public.event_type then return query select 'not_service', 0; return; end if;
  if event_record.status <> 'open'::public.event_status then return query select 'already_closed', 0; return; end if;
  if exists (select 1 from public.sunday_service_eligibility where event_id = p_event_id) then
    return query select 'invalid_snapshot_state', 0; return;
  end if;
  insert into public.sunday_service_eligibility(event_id, member_id, life_group_id_at_close)
  select event_record.id, members.id, members.life_group_id
  from public.members
  where members.is_active
    and timezone(public.church_time_zone(), members.created_at)::date <= event_record.event_date;
  get diagnostics snapshot_count = row_count;
  update public.events set status = 'closed'::public.event_status where id = event_record.id;
  if event_record.counts_for_absence then
    perform public.evaluate_sunday_service(event_record.id);
  end if;
  return query select 'closed', snapshot_count;
end;
$$;

create or replace function public.correct_sunday_service_presence(
  p_event_id uuid, p_member_id uuid, p_present boolean
)
returns text language plpgsql set search_path = '' as $$
declare
  event_record public.events%rowtype;
begin
  select * into event_record from public.events where id = p_event_id for update;
  if not found then return 'event_not_found'; end if;
  if event_record.type <> 'service'::public.event_type or event_record.status <> 'closed'::public.event_status then return 'not_closed_service'; end if;
  if not exists (select 1 from public.sunday_service_eligibility where event_id = p_event_id and member_id = p_member_id) then return 'member_not_eligible'; end if;
  if p_present then
    insert into public.sunday_service_presence(event_id, member_id) values (p_event_id, p_member_id) on conflict do nothing;
  else
    delete from public.sunday_service_presence where event_id = p_event_id and member_id = p_member_id;
  end if;
  if event_record.counts_for_absence then perform public.evaluate_sunday_member(p_member_id); end if;
  return case when p_present then 'recorded' else 'removed' end;
end;
$$;

create or replace function public.update_sunday_service_counts_for_absence(
  p_event_id uuid, p_counts_for_absence boolean
)
returns text language plpgsql set search_path = '' as $$
declare
  event_record public.events%rowtype;
  member_record record;
begin
  select * into event_record from public.events where id = p_event_id for update;
  if not found then return 'event_not_found'; end if;
  if event_record.type <> 'service'::public.event_type or event_record.status <> 'closed'::public.event_status then return 'not_closed_service'; end if;
  update public.events set counts_for_absence = p_counts_for_absence where id = p_event_id;
  if p_counts_for_absence then
    for member_record in select member_id from public.sunday_service_eligibility where event_id = p_event_id loop
      perform public.evaluate_sunday_member(member_record.member_id);
    end loop;
    insert into public.sunday_service_evaluations(event_id, processed_count)
    select p_event_id, count(*)::integer from public.sunday_service_eligibility where event_id = p_event_id
    on conflict (event_id) do update set evaluated_at = now(), processed_count = excluded.processed_count;
  end if;
  return 'updated';
end;
$$;

create or replace function public.reconcile_sunday_services()
returns table(processed_count integer, error_count integer, run_status text)
language plpgsql set search_path = '' as $$
declare
  run_id uuid;
  service_record record;
  processed integer := 0;
  errors integer := 0;
  summary text := null;
begin
  insert into public.automation_runs(job_name, status) values ('sunday_reconciliation', 'running') returning id into run_id;
  for service_record in
    select e.id from public.events e
    where e.type = 'service'::public.event_type and e.status = 'closed'::public.event_status
      and e.counts_for_absence and not exists (select 1 from public.sunday_service_evaluations x where x.event_id = e.id)
    order by e.event_date, e.id
  loop
    begin
      perform public.evaluate_sunday_service(service_record.id);
      processed := processed + 1;
    exception when others then
      errors := errors + 1;
      summary := left(coalesce(summary || '; ', '') || service_record.id::text || ': ' || sqlerrm, 2000);
    end;
  end loop;
  update public.automation_runs
  set status = case when errors = 0 then 'succeeded' when processed > 0 then 'partial' else 'failed' end,
      finished_at = now(), processed_count = processed, error_count = errors, error_summary = summary
  where id = run_id;
  return query select processed, errors, case when errors = 0 then 'succeeded' when processed > 0 then 'partial' else 'failed' end;
end;
$$;

revoke all on function public.close_sunday_service(uuid), public.sunday_consecutive_absence_threshold(), public.opencell_participation_threshold_percent(), public.church_time_zone(), public.evaluate_sunday_member(uuid), public.evaluate_sunday_service(uuid), public.correct_sunday_service_presence(uuid,uuid,boolean), public.update_sunday_service_counts_for_absence(uuid,boolean), public.reconcile_sunday_services() from public, anon, authenticated;
grant execute on function public.close_sunday_service(uuid), public.sunday_consecutive_absence_threshold(), public.opencell_participation_threshold_percent(), public.church_time_zone(), public.evaluate_sunday_member(uuid), public.evaluate_sunday_service(uuid), public.correct_sunday_service_presence(uuid,uuid,boolean), public.update_sunday_service_counts_for_absence(uuid,boolean), public.reconcile_sunday_services() to service_role;

create extension if not exists pg_cron with schema extensions;
select cron.schedule('horizon-sunday-reconciliation', '0 19 * * *', 'select public.reconcile_sunday_services();');

-- Reuse the centralized threshold in the existing OpenCell finish transaction.
create or replace function public.finish_opencell_programme(p_programme_id uuid)
returns table(outcome text, finished_at timestamptz, evaluations jsonb)
language plpgsql set search_path = '' as $$
declare
  programme_status public.opencell_programme_status;
  completion_time timestamptz;
  evaluation_json jsonb := '[]'::jsonb;
  enrollment_record record;
  eligible_count integer;
  attended_count integer;
  qualifies boolean;
  follow_up_result record;
  follow_up_outcome text;
  threshold_percent integer := public.opencell_participation_threshold_percent();
begin
  select status into programme_status from public.opencell_programmes where id = p_programme_id for update;
  if not found then return query select 'programme_not_found', null::timestamptz, '[]'::jsonb; return; end if;
  if programme_status = 'finished' then return query select 'already_finished', (select p2.finished_at from public.opencell_programmes p2 where p2.id = p_programme_id), '[]'::jsonb; return; end if;
  for enrollment_record in
    select e.visitor_id, e.enrolled_on, v.first_name, v.last_name
    from public.opencell_enrollments e join public.visitors v on v.id = e.visitor_id
    where e.programme_id = p_programme_id order by v.last_name, v.first_name, v.id
  loop
    select count(*) into eligible_count from public.opencell_sessions s where s.programme_id = p_programme_id and not s.is_cancelled and s.session_date >= enrollment_record.enrolled_on;
    select count(*) into attended_count from public.opencell_attendance a join public.opencell_sessions s on s.id = a.session_id where s.programme_id = p_programme_id and a.visitor_id = enrollment_record.visitor_id and not s.is_cancelled and s.session_date >= enrollment_record.enrolled_on;
    qualifies := eligible_count > 0 and attended_count * 100 >= eligible_count * threshold_percent;
    follow_up_outcome := null;
    if qualifies then
      select * into follow_up_result from public.create_follow_up_if_absent(null::uuid, enrollment_record.visitor_id, 'opencell_high_participation'::public.follow_up_reason, jsonb_build_object('programmeId', p_programme_id, 'programmeName', (select name from public.opencell_programmes where id = p_programme_id), 'attendedCount', attended_count, 'eligibleSessionCount', eligible_count, 'percentage', round((attended_count::numeric * 100) / eligible_count)));
      follow_up_outcome := follow_up_result.outcome;
    end if;
    evaluation_json := evaluation_json || jsonb_build_array(jsonb_build_object('visitorId', enrollment_record.visitor_id, 'visitorName', enrollment_record.first_name || ' ' || enrollment_record.last_name, 'attendedCount', attended_count, 'eligibleSessionCount', eligible_count, 'percentage', case when eligible_count = 0 then null else round((attended_count::numeric * 100) / eligible_count) end, 'qualified', qualifies, 'followUpOutcome', follow_up_outcome));
  end loop;
  completion_time := now();
  update public.opencell_programmes set status = 'finished', finished_at = completion_time where id = p_programme_id;
  return query select 'finished', completion_time, evaluation_json;
end;
$$;
revoke all on function public.finish_opencell_programme(uuid) from public, anon, authenticated;
grant execute on function public.finish_opencell_programme(uuid) to service_role;
