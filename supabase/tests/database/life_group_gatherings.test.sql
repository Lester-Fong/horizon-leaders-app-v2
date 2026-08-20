begin;

create extension if not exists pgtap with schema extensions;

select plan(37);

select has_table('public', 'life_group_gatherings', 'Gathering table exists');
select has_pk('public', 'life_group_gatherings', 'Gatherings have a primary key');
select col_type_is('public', 'life_group_gatherings', 'id', 'uuid', 'Gathering ids are UUIDs');
select col_type_is('public', 'life_group_gatherings', 'gathering_date', 'date', 'Gathering date uses date');
select has_index('public', 'life_group_gatherings', 'life_group_gatherings_life_group_date_idx', 'Gatherings have a Life Group/date index');
select is((select relrowsecurity from pg_class where oid = 'public.life_group_gatherings'::regclass), true, 'Gatherings have RLS enabled');
select ok(not has_table_privilege('anon', 'public.life_group_gatherings', 'select'), 'anon cannot read Gatherings directly');
select ok(not has_table_privilege('authenticated', 'public.life_group_gatherings', 'select'), 'authenticated cannot read Gatherings directly');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'life_group_gatherings'), 0::bigint, 'Gatherings expose no browser policies');
select ok(has_table_privilege('service_role', 'public.life_group_gatherings', 'select'), 'service_role can read Gatherings');

select has_table('public', 'life_group_gathering_attendance', 'Gathering attendance table exists');
select has_pk('public', 'life_group_gathering_attendance', 'Attendance has a composite primary key');
select has_index('public', 'life_group_gathering_attendance', 'life_group_gathering_attendance_member_id_idx', 'Attendance has a Member lookup index');
select is((select relrowsecurity from pg_class where oid = 'public.life_group_gathering_attendance'::regclass), true, 'Attendance has RLS enabled');
select ok(not has_table_privilege('anon', 'public.life_group_gathering_attendance', 'select'), 'anon cannot read Gathering attendance directly');
select ok(not has_table_privilege('authenticated', 'public.life_group_gathering_attendance', 'select'), 'authenticated cannot read Gathering attendance directly');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'life_group_gathering_attendance'), 0::bigint, 'Attendance exposes no browser policies');
select ok(has_table_privilege('service_role', 'public.life_group_gathering_attendance', 'select'), 'service_role can read Gathering attendance');

insert into auth.users (id, email, raw_user_meta_data) values
  ('91111111-1111-4111-8111-111111111111', 'gathering-leader-a@example.test', '{"name":"Gathering Leader A"}'::jsonb),
  ('92222222-2222-4222-8222-222222222222', 'gathering-leader-b@example.test', '{"name":"Gathering Leader B"}'::jsonb);

insert into public.life_groups (id, name, leader_profile_id) values
  ('93333333-3333-4333-8333-333333333333', 'Gathering Group A', '91111111-1111-4111-8111-111111111111'),
  ('94444444-4444-4444-8444-444444444444', 'Gathering Group B', '92222222-2222-4222-8222-222222222222');

insert into public.members (id, first_name, last_name, life_group_id, qr_token)
values ('95555555-5555-4555-8555-555555555555', 'Mara', 'Member', '93333333-3333-4333-8333-333333333333', 'gathering-member-token');

insert into public.life_group_gatherings (
  id, life_group_id, gathering_date, created_by_profile_id
) values (
  '96666666-6666-4666-8666-666666666666',
  '93333333-3333-4333-8333-333333333333',
  '2026-08-19',
  '91111111-1111-4111-8111-111111111111'
);

select is((select count(*) from public.life_group_gatherings where id = '96666666-6666-4666-8666-666666666666'), 1::bigint, 'a valid Gathering can be created');
select ok((select title is null and location is null and notes is null from public.life_group_gatherings where id = '96666666-6666-4666-8666-666666666666'), 'Gathering optional fields are nullable');
select ok((select created_at is not null and updated_at is not null from public.life_group_gatherings where id = '96666666-6666-4666-8666-666666666666'), 'Gathering timestamps default to database values');

update public.life_group_gatherings set title = 'Corrected title', updated_at = '2000-01-01 00:00:00+00' where id = '96666666-6666-4666-8666-666666666666';
select ok((select updated_at > '2000-01-01 00:00:00+00' from public.life_group_gatherings where id = '96666666-6666-4666-8666-666666666666'), 'Gathering updated_at is trigger-maintained');

do $$ begin begin
  insert into public.life_group_gatherings (gathering_date, created_by_profile_id) values ('2026-08-19', '91111111-1111-4111-8111-111111111111');
  raise exception 'missing Life Group was accepted'; exception when not_null_violation then null; end; end $$;
select pass('Gathering requires a Life Group');
do $$ begin begin
  insert into public.life_group_gatherings (life_group_id, created_by_profile_id) values ('93333333-3333-4333-8333-333333333333', '91111111-1111-4111-8111-111111111111');
  raise exception 'missing date was accepted'; exception when not_null_violation then null; end; end $$;
select pass('Gathering requires a date');
do $$ begin begin
  insert into public.life_group_gatherings (life_group_id, gathering_date) values ('93333333-3333-4333-8333-333333333333', '2026-08-19');
  raise exception 'missing creator was accepted'; exception when not_null_violation then null; end; end $$;
select pass('Gathering requires a creator');
do $$ begin begin
  insert into public.life_group_gatherings (life_group_id, gathering_date, created_by_profile_id) values ('99999999-9999-4999-8999-999999999999', '2026-08-19', '91111111-1111-4111-8111-111111111111');
  raise exception 'invalid Life Group was accepted'; exception when foreign_key_violation then null; end; end $$;
select pass('Gathering requires a valid Life Group foreign key');
do $$ begin begin
  insert into public.life_group_gatherings (life_group_id, gathering_date, created_by_profile_id) values ('93333333-3333-4333-8333-333333333333', '2026-08-19', '99999999-9999-4999-8999-999999999999');
  raise exception 'invalid creator was accepted'; exception when foreign_key_violation then null; end; end $$;
select pass('Gathering requires a valid creator Profile foreign key');

insert into public.life_group_gathering_attendance (gathering_id, member_id)
values ('96666666-6666-4666-8666-666666666666', '95555555-5555-4555-8555-555555555555');
select is((select count(*) from public.life_group_gathering_attendance), 1::bigint, 'valid presence attendance can be recorded');
do $$ begin begin
  insert into public.life_group_gathering_attendance (gathering_id, member_id) values ('96666666-6666-4666-8666-666666666666', '95555555-5555-4555-8555-555555555555');
  raise exception 'duplicate attendance was accepted'; exception when unique_violation then null; end; end $$;
select pass('duplicate Gathering attendance is rejected');
do $$ begin begin
  insert into public.life_group_gathering_attendance (gathering_id, member_id) values ('99999999-9999-4999-8999-999999999999', '95555555-5555-4555-8555-555555555555');
  raise exception 'invalid Gathering was accepted'; exception when foreign_key_violation then null; end; end $$;
select pass('attendance requires a valid Gathering');
do $$ begin begin
  insert into public.life_group_gathering_attendance (gathering_id, member_id) values ('96666666-6666-4666-8666-666666666666', '99999999-9999-4999-8999-999999999999');
  raise exception 'invalid Member was accepted'; exception when foreign_key_violation then null; end; end $$;
select pass('attendance requires a valid Member');

update public.members set life_group_id = '94444444-4444-4444-8444-444444444444' where id = '95555555-5555-4555-8555-555555555555';
select is((select count(*) from public.life_group_gathering_attendance where member_id = '95555555-5555-4555-8555-555555555555'), 1::bigint, 'historical attendance survives Member Life Group reassignment');
update public.life_groups set is_active = false where id = '93333333-3333-4333-8333-333333333333';
select is((select count(*) from public.life_group_gatherings where life_group_id = '93333333-3333-4333-8333-333333333333'), 1::bigint, 'Life Group archival preserves Gatherings');
select is((select count(*) from public.life_group_gathering_attendance), 1::bigint, 'Life Group archival preserves Gathering attendance');

do $$ begin begin
  delete from public.members where id = '95555555-5555-4555-8555-555555555555';
  raise exception 'attendee Member was deleted'; exception when foreign_key_violation then null; end; end $$;
select pass('attendance restricts deletion of an attendee Member');
do $$ begin begin
  delete from public.life_group_gatherings where id = '96666666-6666-4666-8666-666666666666';
  raise exception 'Gathering with attendance was deleted'; exception when foreign_key_violation then null; end; end $$;
select pass('attendance restricts deletion of a Gathering');
do $$ begin begin
  delete from public.life_groups where id = '93333333-3333-4333-8333-333333333333';
  raise exception 'Life Group with Gathering was deleted'; exception when foreign_key_violation then null; end; end $$;
select pass('Gathering foreign key restricts deletion of its Life Group');

select * from finish();
rollback;
