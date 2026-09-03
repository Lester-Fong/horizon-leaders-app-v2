begin;

create extension if not exists pgtap with schema extensions;

select plan(37);

select has_column('public', 'visitors', 'life_group_id', 'Visitors have optional current Life Group affiliation');
select col_type_is('public', 'visitors', 'life_group_id', 'uuid', 'Visitor Life Group affiliation uses UUID');
select has_fk('public', 'visitors', 'Visitors retain foreign-key integrity');
select has_index('public', 'visitors', 'visitors_life_group_id_status_idx', 'Visitor affiliation has a roster index');

select has_table('public', 'life_group_gathering_visitor_attendance', 'Gathering Visitor attendance table exists');
select has_pk('public', 'life_group_gathering_visitor_attendance', 'Gathering Visitor attendance has a composite primary key');
select has_index('public', 'life_group_gathering_visitor_attendance', 'life_group_gathering_visitor_attendance_visitor_id_idx', 'Gathering Visitor attendance has a Visitor index');
select is(
  (select relrowsecurity from pg_class where oid = 'public.life_group_gathering_visitor_attendance'::regclass),
  true,
  'Gathering Visitor attendance has RLS enabled'
);
select ok(not has_table_privilege('anon', 'public.life_group_gathering_visitor_attendance', 'select'), 'anon cannot read Gathering Visitor attendance');
select ok(not has_table_privilege('authenticated', 'public.life_group_gathering_visitor_attendance', 'select'), 'authenticated cannot read Gathering Visitor attendance');
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'life_group_gathering_visitor_attendance'),
  0::bigint,
  'Gathering Visitor attendance exposes no browser policy'
);
select ok(has_table_privilege('service_role', 'public.life_group_gathering_visitor_attendance', 'select'), 'service_role can read Gathering Visitor attendance');
select ok(not has_function_privilege('anon', 'public.set_visitor_life_group(uuid,uuid,uuid)', 'execute'), 'anon cannot use Visitor affiliation boundary');
select ok(not has_function_privilege('authenticated', 'public.set_visitor_life_group(uuid,uuid,uuid)', 'execute'), 'authenticated cannot use Visitor affiliation boundary');
select ok(has_function_privilege('service_role', 'public.set_visitor_life_group(uuid,uuid,uuid)', 'execute'), 'service_role can use Visitor affiliation boundary');

insert into auth.users (id, email, raw_user_meta_data) values
  ('71111111-1111-4111-8111-111111111111', 'visitor-group-leader-a@example.test', '{"name":"Visitor Group Leader A"}'::jsonb),
  ('72222222-2222-4222-8222-222222222222', 'visitor-group-leader-b@example.test', '{"name":"Visitor Group Leader B"}'::jsonb),
  ('73333333-3333-4333-8333-333333333333', 'visitor-group-leader-c@example.test', '{"name":"Visitor Group Leader C"}'::jsonb);

insert into public.life_groups (id, name, leader_profile_id, is_active) values
  ('74444444-4444-4444-8444-444444444444', 'Visitor Group A', '71111111-1111-4111-8111-111111111111', true),
  ('75555555-5555-4555-8555-555555555555', 'Visitor Group B', '72222222-2222-4222-8222-222222222222', true),
  ('76666666-6666-4666-8666-666666666666', 'Visitor Group Inactive', '73333333-3333-4333-8333-333333333333', false);

insert into public.life_group_gatherings (id, life_group_id, gathering_date, created_by_profile_id) values
  ('77777777-7777-4777-8777-777777777777', '74444444-4444-4444-8444-444444444444', '2026-09-01', '71111111-1111-4111-8111-111111111111'),
  ('78888888-8888-4888-8888-888888888888', '74444444-4444-4444-8444-444444444444', '2026-09-08', '71111111-1111-4111-8111-111111111111');

insert into public.visitors (id, first_name, last_name) values
  ('79999999-9999-4999-8999-999999999999', 'Affiliation', 'Visitor'),
  ('70000000-0000-4000-8000-000000000001', 'Other Group', 'Visitor'),
  ('70000000-0000-4000-8000-000000000002', 'Unassigned', 'Visitor');

select is(
  (select life_group_id from public.visitors where id = '79999999-9999-4999-8999-999999999999'),
  null::uuid,
  'Visitor Life Group affiliation defaults to unassigned'
);
select is(
  public.set_visitor_life_group('79999999-9999-4999-8999-999999999999', null, '74444444-4444-4444-8444-444444444444'),
  'updated',
  'affiliation boundary assigns an active Life Group'
);
select is(
  (select life_group_id from public.visitors where id = '79999999-9999-4999-8999-999999999999'),
  '74444444-4444-4444-8444-444444444444'::uuid,
  'Visitor stores current Life Group affiliation'
);
select is(
  public.set_visitor_life_group('79999999-9999-4999-8999-999999999999', '74444444-4444-4444-8444-444444444444', '76666666-6666-4666-8666-666666666666'),
  'inactive_life_group',
  'affiliation boundary rejects an inactive Life Group'
);
select is(
  public.set_visitor_life_group('79999999-9999-4999-8999-999999999999', null, '75555555-5555-4555-8555-555555555555'),
  'visitor_changed',
  'affiliation boundary rejects a stale expected affiliation'
);

do $$ begin begin
  update public.visitors set life_group_id = '79999999-1111-4111-8111-111111111111'
  where id = '70000000-0000-4000-8000-000000000002';
  raise exception 'invalid Visitor Life Group was accepted';
exception when foreign_key_violation then null; end; end $$;
select pass('Visitor Life Group requires a valid restrictive foreign key');

update public.visitors
set life_group_id = '75555555-5555-4555-8555-555555555555'
where id = '70000000-0000-4000-8000-000000000001';

insert into public.life_group_gathering_visitor_attendance (gathering_id, visitor_id)
values ('77777777-7777-4777-8777-777777777777', '79999999-9999-4999-8999-999999999999');
select is((select count(*) from public.life_group_gathering_visitor_attendance), 1::bigint, 'eligible Visitor presence can be recorded');

do $$ begin begin
  insert into public.life_group_gathering_visitor_attendance (gathering_id, visitor_id)
  values ('77777777-7777-4777-8777-777777777777', '79999999-9999-4999-8999-999999999999');
  raise exception 'duplicate Visitor presence was accepted';
exception when unique_violation then null; end; end $$;
select pass('one Visitor presence per Gathering is enforced');

do $$ begin begin
  insert into public.life_group_gathering_visitor_attendance (gathering_id, visitor_id)
  values ('77777777-7777-4777-8777-777777777777', '70000000-0000-4000-8000-000000000001');
  raise exception 'other-group Visitor presence was accepted';
exception when check_violation then null; end; end $$;
select pass('new presence rejects a Visitor in another Life Group');

do $$ begin begin
  insert into public.life_group_gathering_visitor_attendance (gathering_id, visitor_id)
  values ('77777777-7777-4777-8777-777777777777', '70000000-0000-4000-8000-000000000002');
  raise exception 'unassigned Visitor presence was accepted';
exception when check_violation then null; end; end $$;
select pass('new presence rejects an unassigned Visitor');

update public.visitors set life_group_id = '75555555-5555-4555-8555-555555555555'
where id = '79999999-9999-4999-8999-999999999999';
select is((select count(*) from public.life_group_gathering_visitor_attendance where visitor_id = '79999999-9999-4999-8999-999999999999'), 1::bigint, 'historical Visitor presence survives a Life Group move');

update public.visitors set life_group_id = null
where id = '79999999-9999-4999-8999-999999999999';
select is((select count(*) from public.life_group_gathering_visitor_attendance where visitor_id = '79999999-9999-4999-8999-999999999999'), 1::bigint, 'historical Visitor presence survives unassignment');

update public.visitors set life_group_id = '74444444-4444-4444-8444-444444444444'
where id = '79999999-9999-4999-8999-999999999999';
select is(
  (select outcome from public.convert_visitor_to_member('79999999-9999-4999-8999-999999999999', '74444444-4444-4444-8444-444444444444', null, 'visitor-affiliation-conversion-token')),
  'converted',
  'assigned Visitor conversion inherits affiliation without another selection'
);
select is(
  (select life_group_id from public.members where qr_token = 'visitor-affiliation-conversion-token'),
  '74444444-4444-4444-8444-444444444444'::uuid,
  'converted Member inherits the Visitor Life Group'
);
select is(
  (select life_group_id from public.visitors where id = '79999999-9999-4999-8999-999999999999'),
  '74444444-4444-4444-8444-444444444444'::uuid,
  'converted Visitor preserves original affiliation'
);
select is((select count(*) from public.life_group_gathering_visitor_attendance where visitor_id = '79999999-9999-4999-8999-999999999999'), 1::bigint, 'historical Visitor presence survives conversion');

do $$ begin begin
  insert into public.life_group_gathering_visitor_attendance (gathering_id, visitor_id)
  values ('78888888-8888-4888-8888-888888888888', '79999999-9999-4999-8999-999999999999');
  raise exception 'converted Visitor received new presence';
exception when check_violation then null; end; end $$;
select pass('converted Visitors cannot receive new Visitor presence');

delete from public.life_group_gathering_visitor_attendance
where gathering_id = '77777777-7777-4777-8777-777777777777'
  and visitor_id = '79999999-9999-4999-8999-999999999999';
select is((select count(*) from public.life_group_gathering_visitor_attendance where visitor_id = '79999999-9999-4999-8999-999999999999'), 0::bigint, 'historical Visitor presence can be removed as a correction');

insert into public.visitors (id, first_name, last_name, life_group_id)
values ('70000000-0000-4000-8000-000000000003', 'Mismatch', 'Conversion', '74444444-4444-4444-8444-444444444444');
select is(
  (select outcome from public.convert_visitor_to_member('70000000-0000-4000-8000-000000000003', '74444444-4444-4444-8444-444444444444', '75555555-5555-4555-8555-555555555555', 'mismatch-token')),
  'life_group_mismatch',
  'assigned Visitor conversion rejects a Life Group override'
);
select is(
  (select status::text from public.visitors where id = '70000000-0000-4000-8000-000000000003'),
  'active',
  'conversion override rejection leaves the Visitor active'
);
select is(
  (select outcome from public.convert_visitor_to_member('70000000-0000-4000-8000-000000000003', null, '75555555-5555-4555-8555-555555555555', 'stale-affiliation-token')),
  'visitor_changed',
  'conversion rejects a concurrently changed Visitor affiliation'
);

insert into public.visitors (id, first_name, last_name, life_group_id)
values ('70000000-0000-4000-8000-000000000004', 'Inactive', 'Conversion', '76666666-6666-4666-8666-666666666666');
select is(
  (select outcome from public.convert_visitor_to_member('70000000-0000-4000-8000-000000000004', '76666666-6666-4666-8666-666666666666', null, 'inactive-affiliation-token')),
  'inactive_life_group',
  'conversion rejects a preserved inactive Visitor affiliation'
);

select * from finish();
rollback;
