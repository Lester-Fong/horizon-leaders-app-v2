begin;
select plan(6);

insert into auth.users (id, email, raw_user_meta_data)
values ('81111111-1111-4111-8111-111111111111', 'opencell-conversion@example.test', '{"name":"OpenCell Conversion"}'::jsonb);
update public.profiles set role = 'admin' where id = '81111111-1111-4111-8111-111111111111';
insert into public.life_groups (id, name, leader_profile_id)
values ('82222222-2222-4222-8222-222222222222', 'OpenCell Conversion Group', '81111111-1111-4111-8111-111111111111');
insert into public.visitors (id, first_name, last_name, life_group_id)
values ('83333333-3333-4333-8333-333333333333', 'Enrolled', 'Visitor', '82222222-2222-4222-8222-222222222222');
insert into public.opencell_programmes (id, name, created_by_profile_id)
values ('84444444-4444-4444-8444-444444444444', 'Active Programme', '81111111-1111-4111-8111-111111111111');
insert into public.opencell_enrollments (programme_id, visitor_id, enrolled_on, enrolled_by_profile_id)
values ('84444444-4444-4444-8444-444444444444', '83333333-3333-4333-8333-333333333333', current_date, '81111111-1111-4111-8111-111111111111');

select is(
  (select outcome from public.convert_visitor_to_member(
    '83333333-3333-4333-8333-333333333333',
    '82222222-2222-4222-8222-222222222222',
    null,
    'conversion-qr-token'
  )),
  'active_opencell_enrollment',
  'unfinished OpenCell enrollment blocks Visitor conversion'
);
select is((select status::text from public.visitors where id = '83333333-3333-4333-8333-333333333333'), 'active', 'blocked conversion preserves Visitor status');
select is((select converted_member_id from public.visitors where id = '83333333-3333-4333-8333-333333333333'), null::uuid, 'blocked conversion does not link a Member');
select is((select count(*) from public.members where first_name = 'Enrolled' and last_name = 'Visitor'), 0::bigint, 'blocked conversion creates no Member');
select is((select count(*) from public.opencell_enrollments where visitor_id = '83333333-3333-4333-8333-333333333333'), 1::bigint, 'blocked conversion preserves enrollment history');
select pass('OpenCell conversion blocker is enforced transactionally');

select * from finish();
rollback;
