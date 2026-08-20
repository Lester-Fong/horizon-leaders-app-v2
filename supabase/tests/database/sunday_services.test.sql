begin;

create extension if not exists pgtap with schema extensions;

select plan(68);

select is((select jsonb_agg(enumlabel order by enumsortorder) from pg_enum where enumtypid = 'public.event_type'::regtype), '["service", "harvest", "other"]'::jsonb, 'event_type has the locked values');
select is((select jsonb_agg(enumlabel order by enumsortorder) from pg_enum where enumtypid = 'public.event_status'::regtype), '["open", "closed"]'::jsonb, 'event_status has the locked values');
select has_table('public', 'events', 'events table exists');
select has_pk('public', 'events', 'events has a primary key');
select col_type_is('public', 'events', 'type', 'public.event_type', 'events use event_type');
select col_type_is('public', 'events', 'event_date', 'date', 'event date is a date');
select has_index('public', 'events', 'events_one_counting_service_per_date_key', 'counting Service dates have a unique index');
select is((select relrowsecurity from pg_class where oid = 'public.events'::regclass), true, 'events has RLS enabled');
select ok(not has_table_privilege('anon', 'public.events', 'select'), 'anon cannot read events directly');
select ok(not has_table_privilege('authenticated', 'public.events', 'select'), 'authenticated cannot read events directly');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'events'), 0::bigint, 'events exposes no browser policy');
select ok(has_table_privilege('service_role', 'public.events', 'select'), 'service_role can read events');

select has_table('public', 'sunday_service_presence', 'presence table exists');
select has_pk('public', 'sunday_service_presence', 'presence has a composite primary key');
select is((select relrowsecurity from pg_class where oid = 'public.sunday_service_presence'::regclass), true, 'presence has RLS enabled');
select ok(not has_table_privilege('anon', 'public.sunday_service_presence', 'select'), 'anon cannot read presence');
select ok(not has_table_privilege('authenticated', 'public.sunday_service_presence', 'select'), 'authenticated cannot read presence');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'sunday_service_presence'), 0::bigint, 'presence exposes no browser policy');
select has_table('public', 'sunday_service_eligibility', 'eligibility snapshot table exists');
select has_pk('public', 'sunday_service_eligibility', 'eligibility has a composite primary key');
select has_index('public', 'sunday_service_eligibility', 'sunday_service_eligibility_life_group_idx', 'eligibility supports close-time Life Group scope');
select is((select relrowsecurity from pg_class where oid = 'public.sunday_service_eligibility'::regclass), true, 'eligibility has RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.sunday_service_eligibility', 'select'), 'authenticated cannot read eligibility');
select has_table('public', 'sunday_service_visitor_registrations', 'Sunday Visitor registrations table exists');
select has_pk('public', 'sunday_service_visitor_registrations', 'Sunday Visitor registrations have a composite primary key');
select has_index('public', 'sunday_service_visitor_registrations', 'sunday_service_visitor_registrations_visitor_id_idx', 'Visitor registrations support historical Visitor lookup');
select is((select relrowsecurity from pg_class where oid = 'public.sunday_service_visitor_registrations'::regclass), true, 'Visitor registrations have RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.sunday_service_visitor_registrations', 'select'), 'authenticated cannot read Visitor registrations');

select ok(not has_function_privilege('anon', 'public.close_sunday_service(uuid)', 'execute'), 'anon cannot close a Service');
select ok(not has_function_privilege('authenticated', 'public.close_sunday_service(uuid)', 'execute'), 'authenticated cannot close a Service');
select ok(has_function_privilege('service_role', 'public.close_sunday_service(uuid)', 'execute'), 'service_role can use the atomic close boundary');
select ok(not has_function_privilege('anon', 'public.create_sunday_visitor_registration(uuid,uuid,text,text,text,text)', 'execute'), 'anon cannot create and register a Visitor');
select ok(not has_function_privilege('authenticated', 'public.create_sunday_visitor_registration(uuid,uuid,text,text,text,text)', 'execute'), 'authenticated cannot create and register a Visitor');
select ok(has_function_privilege('service_role', 'public.create_sunday_visitor_registration(uuid,uuid,text,text,text,text)', 'execute'), 'service_role can use the atomic Visitor registration boundary');

insert into auth.users (id, email, raw_user_meta_data) values
  ('81111111-1111-4111-8111-111111111111', 'service-admin@example.test', '{"name":"Service Admin"}'::jsonb),
  ('82222222-2222-4222-8222-222222222222', 'service-leader@example.test', '{"name":"Service Leader"}'::jsonb),
  ('82333333-3333-4233-8233-333333333333', 'service-leader-b@example.test', '{"name":"Service Leader B"}'::jsonb);
update public.profiles set role = 'admin' where id = '81111111-1111-4111-8111-111111111111';

insert into public.life_groups (id, name, leader_profile_id) values
  ('83333333-3333-4333-8333-333333333333', 'Service Group A', '82222222-2222-4222-8222-222222222222'),
  ('84444444-4444-4444-8444-444444444444', 'Service Group B', '82333333-3333-4233-8233-333333333333');

insert into public.members (id, first_name, last_name, email, life_group_id, qr_token, is_active, created_at) values
  ('85555555-5555-4555-8555-555555555555', 'Early', 'Member', 'early-member@example.test', '83333333-3333-4333-8333-333333333333', 'service-early-token', true, '2026-08-01 00:00:00+00'),
  ('86666666-6666-4666-8666-666666666666', 'Future', 'Member', null, '83333333-3333-4333-8333-333333333333', 'service-future-token', true, '2026-09-01 00:00:00+00'),
  ('87777777-7777-4777-8777-777777777777', 'Inactive', 'Member', null, '84444444-4444-4444-8444-444444444444', 'service-inactive-token', false, '2026-08-01 00:00:00+00');

insert into public.events (id, type, title, event_date, created_by_profile_id) values
  ('88888888-8888-4888-8888-888888888881', 'service', 'Sunday Service', '2026-08-23', '81111111-1111-4111-8111-111111111111'),
  ('88888888-8888-4888-8888-888888888882', 'service', 'Closing Service', '2026-08-30', '81111111-1111-4111-8111-111111111111'),
  ('88888888-8888-4888-8888-888888888883', 'service', 'Visitor Service', '2026-09-06', '81111111-1111-4111-8111-111111111111');

select is((select count(*) from public.events), 3::bigint, 'valid Sunday Services can be created');
select ok((select status = 'open' and counts_for_absence from public.events where id = '88888888-8888-4888-8888-888888888881'), 'new Services default open and counting');
select ok((select created_at is not null and updated_at is not null from public.events where id = '88888888-8888-4888-8888-888888888881'), 'Service timestamps default from the database');
update public.events set title = 'Corrected Service', updated_at = '2000-01-01 00:00:00+00' where id = '88888888-8888-4888-8888-888888888881';
select ok((select updated_at > '2000-01-01 00:00:00+00' from public.events where id = '88888888-8888-4888-8888-888888888881'), 'Service updated_at is trigger maintained');

do $$ begin begin insert into public.events (type, title, event_date, created_by_profile_id) values ('service', ' ', '2026-09-13', '81111111-1111-4111-8111-111111111111'); raise exception 'blank accepted'; exception when check_violation then null; end; end $$;
select pass('blank Service titles are rejected');
do $$ begin begin insert into public.events (type, title, event_date, created_by_profile_id) values ('service', 'Weekday', '2026-08-24', '81111111-1111-4111-8111-111111111111'); raise exception 'weekday counting accepted'; exception when check_violation then null; end; end $$;
select pass('counting Services must be Sundays');
do $$ begin begin insert into public.events (type, title, event_date, created_by_profile_id) values ('service', 'Duplicate', '2026-08-23', '81111111-1111-4111-8111-111111111111'); raise exception 'duplicate counting accepted'; exception when unique_violation then null; end; end $$;
select pass('only one counting Service is allowed per date');
insert into public.events (id, type, title, event_date, counts_for_absence, created_by_profile_id) values ('88888888-8888-4888-8888-888888888884', 'service', 'Excluded Weekday', '2026-08-25', false, '81111111-1111-4111-8111-111111111111');
select is((select count(*) from public.events where id = '88888888-8888-4888-8888-888888888884'), 1::bigint, 'excluded Services may use a non-Sunday date');
do $$ begin begin insert into public.events (type, title, event_date, created_by_profile_id) values ('service', 'Bad Creator', '2026-09-13', '89999999-9999-4999-8999-999999999999'); raise exception 'bad creator accepted'; exception when foreign_key_violation then null; end; end $$;
select pass('Service creator must be a valid Profile');
do $$ begin begin update public.events set type = 'harvest' where id = '88888888-8888-4888-8888-888888888884'; raise exception 'type changed'; exception when check_violation then null; end; end $$;
select pass('Event type is immutable');
do $$ begin begin update public.events set created_by_profile_id = '82222222-2222-4222-8222-222222222222' where id = '88888888-8888-4888-8888-888888888884'; raise exception 'creator changed'; exception when check_violation then null; end; end $$;
select pass('Event creator is immutable');

insert into public.sunday_service_presence (event_id, member_id) values ('88888888-8888-4888-8888-888888888881', '85555555-5555-4555-8555-555555555555');
select is((select count(*) from public.sunday_service_presence), 1::bigint, 'valid Member presence can be recorded');
do $$ begin begin insert into public.sunday_service_presence values ('88888888-8888-4888-8888-888888888881', '85555555-5555-4555-8555-555555555555'); raise exception 'duplicate presence accepted'; exception when unique_violation then null; end; end $$;
select pass('duplicate Member presence is rejected');
do $$ begin begin insert into public.sunday_service_presence values ('89999999-9999-4999-8999-999999999999', '85555555-5555-4555-8555-555555555555'); raise exception 'bad event accepted'; exception when foreign_key_violation then null; end; end $$;
select pass('presence requires a valid Event');
do $$ begin begin insert into public.sunday_service_presence values ('88888888-8888-4888-8888-888888888881', '89999999-9999-4999-8999-999999999999'); raise exception 'bad member accepted'; exception when foreign_key_violation then null; end; end $$;
select pass('presence requires a valid Member');

insert into public.visitors (id, first_name, last_name, email) values ('89999999-9999-4999-8999-999999999991', 'Sunday', 'Visitor', 'sunday-visitor@example.test');
insert into public.sunday_service_visitor_registrations (event_id, visitor_id, registered_by_profile_id) values ('88888888-8888-4888-8888-888888888883', '89999999-9999-4999-8999-999999999991', '82222222-2222-4222-8222-222222222222');
select is((select count(*) from public.sunday_service_visitor_registrations), 1::bigint, 'valid Sunday Visitor registration can be recorded');
do $$ begin begin insert into public.sunday_service_visitor_registrations values ('88888888-8888-4888-8888-888888888883', '89999999-9999-4999-8999-999999999991', '82222222-2222-4222-8222-222222222222', now()); raise exception 'duplicate visitor accepted'; exception when unique_violation then null; end; end $$;
select pass('duplicate Visitor registration is rejected');
do $$ begin begin insert into public.sunday_service_visitor_registrations (event_id, visitor_id, registered_by_profile_id) values ('88888888-8888-4888-8888-888888888883', '89999999-9999-4999-8999-999999999999', '82222222-2222-4222-8222-222222222222'); raise exception 'bad visitor accepted'; exception when foreign_key_violation then null; end; end $$;
select pass('Visitor registration requires a valid Visitor');

select is((select outcome from public.close_sunday_service('88888888-8888-4888-8888-888888888882')), 'closed', 'atomic close succeeds');
select is((select status::text from public.events where id = '88888888-8888-4888-8888-888888888882'), 'closed', 'atomic close changes Service lifecycle');
select is((select count(*) from public.sunday_service_eligibility where event_id = '88888888-8888-4888-8888-888888888882'), 1::bigint, 'close snapshots all active date-eligible Members');
select is((select count(*) from public.sunday_service_eligibility where member_id = '86666666-6666-4666-8666-666666666666'), 0::bigint, 'close excludes Members created after the Service date');
select is((select count(*) from public.sunday_service_eligibility where member_id = '87777777-7777-4777-8777-777777777777'), 0::bigint, 'close excludes inactive Members');
select is((select outcome from public.close_sunday_service('88888888-8888-4888-8888-888888888882')), 'already_closed', 'repeat close is safe and creates no second snapshot');
update public.members set life_group_id = '84444444-4444-4444-8444-444444444444' where id = '85555555-5555-4555-8555-555555555555';
select is((select life_group_id_at_close from public.sunday_service_eligibility where event_id = '88888888-8888-4888-8888-888888888882' and member_id = '85555555-5555-4555-8555-555555555555'), '83333333-3333-4333-8333-333333333333'::uuid, 'snapshot preserves close-time Life Group after reassignment');
update public.members set is_active = false where id = '85555555-5555-4555-8555-555555555555';
select is((select count(*) from public.sunday_service_eligibility where member_id = '85555555-5555-4555-8555-555555555555'), 1::bigint, 'snapshot survives Member archival');
do $$ begin begin delete from public.members where id = '85555555-5555-4555-8555-555555555555'; raise exception 'snapshot member deleted'; exception when foreign_key_violation then null; end; end $$;
select pass('snapshot restricts deletion of a referenced Member');
do $$ begin begin delete from public.events where id = '88888888-8888-4888-8888-888888888882'; raise exception 'snapshotted event deleted'; exception when foreign_key_violation then null; end; end $$;
select pass('snapshot restricts deletion of its Event');

insert into public.members (id, first_name, last_name, life_group_id, qr_token) values ('89999999-9999-4999-8999-999999999992', 'Converted', 'Member', '83333333-3333-4333-8333-333333333333', 'service-converted-token');
update public.visitors set status = 'converted', converted_member_id = '89999999-9999-4999-8999-999999999992' where id = '89999999-9999-4999-8999-999999999991';
select is((select count(*) from public.sunday_service_visitor_registrations where visitor_id = '89999999-9999-4999-8999-999999999991'), 1::bigint, 'Visitor registration survives conversion');

select is((select outcome from public.create_sunday_visitor_registration('88888888-8888-4888-8888-888888888883', '82222222-2222-4222-8222-222222222222', 'New', 'Visitor', '0917 800 0001', 'new-sunday@example.test')), 'registered', 'atomic create and register succeeds');
select is((select count(*) from public.sunday_service_visitor_registrations registrations join public.visitors on visitors.id = registrations.visitor_id where registrations.event_id = '88888888-8888-4888-8888-888888888883' and visitors.email = 'new-sunday@example.test'), 1::bigint, 'atomic create also records registration');
select is((select outcome from public.create_sunday_visitor_registration('88888888-8888-4888-8888-888888888883', '82222222-2222-4222-8222-222222222222', 'Conflict', 'Member', null, 'early-member@example.test')), 'member_conflict', 'new Visitor registration blocks Member contact conflicts');
select is((select outcome from public.create_sunday_visitor_registration('88888888-8888-4888-8888-888888888883', '82222222-2222-4222-8222-222222222222', 'Conflict', 'Visitor', '+63 917 800 0001', null)), 'visitor_conflict', 'new Visitor registration returns an existing normalized Visitor conflict');
update public.events set status = 'closed' where id = '88888888-8888-4888-8888-888888888883';
select is((select outcome from public.create_sunday_visitor_registration('88888888-8888-4888-8888-888888888883', '82222222-2222-4222-8222-222222222222', 'Closed', 'Visitor', null, 'closed-new@example.test')), 'event_closed', 'closed Services reject new Visitor creation');

select * from finish();
rollback;
