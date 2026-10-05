begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_function(
  'public',
  'dashboard_member_demographics',
  array['uuid', 'date'],
  'Dashboard Member aggregation exists'
);
select has_function(
  'public',
  'dashboard_sunday_attendance',
  array['uuid[]', 'uuid'],
  'Dashboard Sunday aggregation exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.dashboard_member_demographics(uuid,date)',
    'execute'
  ),
  'browser roles cannot execute Member Dashboard aggregation'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.dashboard_sunday_attendance(uuid[],uuid)',
    'execute'
  ),
  'browser roles cannot execute Sunday Dashboard aggregation'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.dashboard_member_demographics(uuid,date)',
    'execute'
  ),
  'service role can execute Member Dashboard aggregation'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.dashboard_sunday_attendance(uuid[],uuid)',
    'execute'
  ),
  'service role can execute Sunday Dashboard aggregation'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'd1000000-0000-4000-8000-000000000001',
  'dashboard-performance@example.test',
  '{"name":"Dashboard Performance"}'::jsonb
);
insert into public.life_groups (id, name, leader_profile_id)
values (
  'd1000000-0000-4000-8000-000000000002',
  'Dashboard Performance Group',
  'd1000000-0000-4000-8000-000000000001'
);
insert into public.members (
  id, first_name, last_name, life_group_id, qr_token, gender, birth_date
) values
  ('d1000000-0000-4000-8000-000000000003', 'Female', 'Adult', 'd1000000-0000-4000-8000-000000000002', 'dashboard-performance-1', 'female', '2001-10-05'),
  ('d1000000-0000-4000-8000-000000000004', 'Unset', 'Member', 'd1000000-0000-4000-8000-000000000002', 'dashboard-performance-2', null, null);
insert into public.events (
  id, type, status, title, event_date, counts_for_absence, created_by_profile_id
) values (
  'd1000000-0000-4000-8000-000000000005',
  'service',
  'closed',
  'Dashboard Performance Service',
  '1901-01-06',
  true,
  'd1000000-0000-4000-8000-000000000001'
);
insert into public.sunday_service_eligibility (
  event_id, member_id, life_group_id_at_close
) values
  ('d1000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000002'),
  ('d1000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002');
insert into public.sunday_service_presence (event_id, member_id)
values ('d1000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000003');

select is(
  (
    select bucket_count
    from public.dashboard_member_demographics(
      'd1000000-0000-4000-8000-000000000002',
      '2026-10-05'
    )
    where dimension = 'age' and bucket_key = '25_34'
  ),
  1::bigint,
  'Member aggregation uses exact as-of-date age buckets'
);
select results_eq(
  $$
    select eligible_count, present_count
    from public.dashboard_sunday_attendance(
      array['d1000000-0000-4000-8000-000000000005'::uuid],
      'd1000000-0000-4000-8000-000000000002'
    )
  $$,
  $$ values (2::bigint, 1::bigint) $$,
  'Sunday aggregation counts frozen eligibility and presence'
);

select * from finish();
rollback;
