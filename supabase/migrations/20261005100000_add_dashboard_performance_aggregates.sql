-- QA-007: bounded Dashboard aggregates that cannot be truncated by PostgREST row limits.

create function public.dashboard_member_demographics(
  p_life_group_id uuid,
  p_as_of_date date
)
returns table(dimension text, bucket_key text, bucket_count bigint)
language sql
stable
set search_path = ''
as $$
  with scoped_members as (
    select
      coalesce(members.gender::text, 'not_set') as gender_key,
      case
        when members.birth_date is null then null
        else extract(year from age(p_as_of_date, members.birth_date))::integer
      end as age_years
    from public.members
    where members.is_active
      and (p_life_group_id is null or members.life_group_id = p_life_group_id)
  ), categorized as (
    select
      gender_key,
      case
        when age_years is null then 'not_set'
        when age_years < 18 then 'under_18'
        when age_years <= 24 then '18_24'
        when age_years <= 34 then '25_34'
        when age_years <= 44 then '35_44'
        when age_years <= 54 then '45_54'
        else '55_plus'
      end as age_key
    from scoped_members
  )
  select 'gender', gender_key, count(*) from categorized group by gender_key
  union all
  select 'age', age_key, count(*) from categorized group by age_key;
$$;

create function public.dashboard_sunday_attendance(
  p_event_ids uuid[],
  p_life_group_id uuid
)
returns table(event_id uuid, eligible_count bigint, present_count bigint)
language sql
stable
set search_path = ''
as $$
  with requested_events as (
    select unnest(p_event_ids) as event_id
  ), scoped_eligibility as (
    select eligibility.event_id, eligibility.member_id
    from public.sunday_service_eligibility eligibility
    where eligibility.event_id = any(p_event_ids)
      and (
        p_life_group_id is null
        or eligibility.life_group_id_at_close = p_life_group_id
      )
  )
  select
    requested.event_id,
    count(eligibility.member_id) as eligible_count,
    count(presence.member_id) as present_count
  from requested_events requested
  left join scoped_eligibility eligibility
    on eligibility.event_id = requested.event_id
  left join public.sunday_service_presence presence
    on presence.event_id = eligibility.event_id
   and presence.member_id = eligibility.member_id
  group by requested.event_id;
$$;

revoke all on function public.dashboard_member_demographics(uuid, date)
from public, anon, authenticated;
revoke all on function public.dashboard_sunday_attendance(uuid[], uuid)
from public, anon, authenticated;

grant execute on function public.dashboard_member_demographics(uuid, date)
to service_role;
grant execute on function public.dashboard_sunday_attendance(uuid[], uuid)
to service_role;

comment on function public.dashboard_member_demographics(uuid, date) is
  'Bounded active-Member gender and exact-age aggregates for the authorized Dashboard scope.';
comment on function public.dashboard_sunday_attendance(uuid[], uuid) is
  'Bounded Sunday presence and frozen-eligibility counts for Dashboard chart events and optional historical Life Group scope.';
