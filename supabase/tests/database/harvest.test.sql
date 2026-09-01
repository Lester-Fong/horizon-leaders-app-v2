begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

select has_table('public', 'harvest_participations', 'Harvest participations table exists');
select has_pk('public', 'harvest_participations', 'Harvest participations have an Event/Visitor primary key');
select has_index('public', 'harvest_participations', 'harvest_participations_visitor_id_idx', 'Harvest history supports Visitor lookup');
select is((select relrowsecurity from pg_class where oid = 'public.harvest_participations'::regclass), true, 'Harvest participations have RLS enabled');
select ok(not has_table_privilege('anon', 'public.harvest_participations', 'select'), 'anon cannot read Harvest participation');
select ok(not has_table_privilege('authenticated', 'public.harvest_participations', 'select'), 'authenticated cannot read Harvest participation directly');
select ok(not has_table_privilege('authenticated', 'public.harvest_participations', 'insert'), 'authenticated cannot register Harvest participation directly');
select ok(has_table_privilege('service_role', 'public.harvest_participations', 'select'), 'service role can read Harvest participation');
select ok(has_table_privilege('service_role', 'public.harvest_participations', 'insert'), 'service role can insert authorized Harvest participation');
select ok(not has_table_privilege('service_role', 'public.harvest_participations', 'update'), 'service role cannot bypass the interest transaction with direct update');
select ok(not has_table_privilege('authenticated', 'public.harvest_participations', 'delete'), 'authenticated cannot delete Harvest participation directly');
select ok(not has_function_privilege('authenticated', 'public.create_harvest_visitor_registration(uuid,uuid,text,text,text,text)', 'execute'), 'authenticated cannot execute atomic Harvest registration');
select ok(has_function_privilege('service_role', 'public.create_harvest_visitor_registration(uuid,uuid,text,text,text,text)', 'execute'), 'service role can execute atomic Harvest registration');
select ok(not has_function_privilege('authenticated', 'public.record_harvest_sunday_interest(uuid,uuid,uuid,boolean)', 'execute'), 'authenticated cannot execute Harvest interest transaction');
select ok(has_function_privilege('service_role', 'public.record_harvest_sunday_interest(uuid,uuid,uuid,boolean)', 'execute'), 'service role can execute Harvest interest transaction');

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1111111-1111-4111-8111-111111111111', 'harvest-admin@example.test', '{"name":"Harvest Admin"}'::jsonb),
  ('a2222222-2222-4222-8222-222222222222', 'harvest-leader@example.test', '{"name":"Harvest Leader"}'::jsonb);
update public.profiles set role = 'admin' where id = 'a1111111-1111-4111-8111-111111111111';

insert into public.life_groups (id, name, leader_profile_id)
values ('a3333333-3333-4333-8333-333333333333', 'Harvest Group', 'a2222222-2222-4222-8222-222222222222');
insert into public.members (id, first_name, last_name, email, life_group_id, qr_token) values
  ('a4444444-4444-4444-8444-444444444444', 'Existing', 'Member', 'member-harvest@example.test', 'a3333333-3333-4333-8333-333333333333', 'harvest-member-token'),
  ('a4444444-4444-4444-8444-444444444445', 'Converted', 'Member', null, 'a3333333-3333-4333-8333-333333333333', 'harvest-converted-token');
insert into public.visitors (id, first_name, last_name, phone)
values ('a5555555-5555-4555-8555-555555555555', 'Active', 'Visitor', '0917 444 0001');
insert into public.visitors (id, first_name, last_name)
values ('a6666666-6666-4666-8666-666666666666', 'Converted', 'Visitor');
update public.visitors set status = 'converted', converted_member_id = 'a4444444-4444-4444-8444-444444444445'
where id = 'a6666666-6666-4666-8666-666666666666';

do $$ begin begin insert into public.events (type, title, event_date, counts_for_absence, created_by_profile_id) values ('harvest', 'Bad Counting Harvest', '2026-09-12', true, 'a1111111-1111-4111-8111-111111111111'); raise exception 'counting Harvest accepted'; exception when check_violation then null; end; end $$;
select pass('Harvest Events cannot count for absence');

insert into public.events (id, type, title, event_date, counts_for_absence, created_by_profile_id) values
  ('a7777777-7777-4777-8777-777777777771', 'harvest', 'Open Harvest', '2026-09-12', false, 'a1111111-1111-4111-8111-111111111111'),
  ('a7777777-7777-4777-8777-777777777772', 'harvest', 'Closed Harvest', '2026-09-13', false, 'a1111111-1111-4111-8111-111111111111'),
  ('a7777777-7777-4777-8777-777777777773', 'service', 'Service', '2026-09-13', false, 'a1111111-1111-4111-8111-111111111111');
update public.events set status = 'closed' where id = 'a7777777-7777-4777-8777-777777777772';

insert into public.harvest_participations (event_id, visitor_id, registered_by_profile_id)
values ('a7777777-7777-4777-8777-777777777771', 'a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222');
select is((select count(*) from public.harvest_participations), 1::bigint, 'valid open-Harvest active-Visitor participation is stored');
select ok((select sunday_interest is null and interest_recorded_at is null and interest_recorded_by_profile_id is null from public.harvest_participations where event_id = 'a7777777-7777-4777-8777-777777777771'), 'participation starts with unrecorded interest');
select ok((select created_at is not null from public.harvest_participations where event_id = 'a7777777-7777-4777-8777-777777777771'), 'participation uses database creation time');
do $$ begin begin insert into public.harvest_participations (event_id, visitor_id, registered_by_profile_id) values ('a7777777-7777-4777-8777-777777777771', 'a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222'); raise exception 'duplicate accepted'; exception when unique_violation then null; end; end $$;
select pass('one Visitor can participate only once per Harvest Event');
do $$ begin begin insert into public.harvest_participations (event_id, visitor_id, registered_by_profile_id) values ('a7777777-7777-4777-8777-777777777773', 'a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222'); raise exception 'Service accepted'; exception when check_violation then null; end; end $$;
select pass('non-Harvest Events reject Harvest participation');
do $$ begin begin insert into public.harvest_participations (event_id, visitor_id, registered_by_profile_id) values ('a7777777-7777-4777-8777-777777777772', 'a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222'); raise exception 'closed accepted'; exception when check_violation then null; end; end $$;
select pass('closed Harvest Events reject new participation');
do $$ begin begin insert into public.harvest_participations (event_id, visitor_id, registered_by_profile_id) values ('a7777777-7777-4777-8777-777777777771', 'a6666666-6666-4666-8666-666666666666', 'a2222222-2222-4222-8222-222222222222'); raise exception 'converted accepted'; exception when check_violation then null; end; end $$;
select pass('converted Visitors reject new participation');
do $$ begin begin insert into public.harvest_participations (event_id, visitor_id, registered_by_profile_id, sunday_interest, interest_recorded_by_profile_id, interest_recorded_at) values ('a7777777-7777-4777-8777-777777777771', 'a6666666-6666-4666-8666-666666666666', 'a2222222-2222-4222-8222-222222222222', false, 'a2222222-2222-4222-8222-222222222222', now()); raise exception 'pre-recorded accepted'; exception when check_violation then null; end; end $$;
select pass('new participation cannot pre-record Sunday interest');

select is((select outcome from public.record_harvest_sunday_interest('a7777777-7777-4777-8777-777777777771', 'a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222', false)), 'recorded_not_interested', 'false Sunday interest is recorded');
select is((select count(*) from public.follow_ups where visitor_id = 'a5555555-5555-4555-8555-555555555555'), 0::bigint, 'false Sunday interest creates no Follow Up');
select is((select outcome from public.record_harvest_sunday_interest('a7777777-7777-4777-8777-777777777771', 'a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222', false)), 'already_not_interested', 'repeated false interest is idempotent');
select is((select outcome from public.record_harvest_sunday_interest('a7777777-7777-4777-8777-777777777771', 'a5555555-5555-4555-8555-555555555555', 'a1111111-1111-4111-8111-111111111111', true)), 'recorded_interested', 'false may transition to positive interest');
select ok((select sunday_interest and interest_recorded_by_profile_id = 'a1111111-1111-4111-8111-111111111111' and interest_recorded_at is not null from public.harvest_participations where event_id = 'a7777777-7777-4777-8777-777777777771'), 'positive interest stores trusted actor and database time');
select is((select count(*) from public.follow_ups where visitor_id = 'a5555555-5555-4555-8555-555555555555' and reason = 'harvest_sunday_interest'), 1::bigint, 'positive interest creates one Harvest Follow Up');
select is((select context->>'harvestEventTitle' from public.follow_ups where visitor_id = 'a5555555-5555-4555-8555-555555555555'), 'Open Harvest', 'Harvest Follow Up stores Event context');
select is((select outcome from public.record_harvest_sunday_interest('a7777777-7777-4777-8777-777777777771', 'a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222', true)), 'already_interested', 'repeated positive interest is idempotent');
select is((select count(*) from public.follow_ups where visitor_id = 'a5555555-5555-4555-8555-555555555555' and reason = 'harvest_sunday_interest'), 1::bigint, 'repeated positive interest creates no duplicate Follow Up');
select is((select outcome from public.record_harvest_sunday_interest('a7777777-7777-4777-8777-777777777771', 'a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222', false)), 'interest_locked', 'positive interest cannot be reversed');

update public.visitors set status = 'converted', converted_member_id = 'a4444444-4444-4444-8444-444444444444'
where id = 'a5555555-5555-4555-8555-555555555555';
select is((select count(*) from public.harvest_participations where visitor_id = 'a5555555-5555-4555-8555-555555555555'), 1::bigint, 'Harvest participation survives Visitor conversion');
select is((select count(*) from public.follow_ups where visitor_id = 'a5555555-5555-4555-8555-555555555555'), 1::bigint, 'Harvest Follow Up remains attached to converted Visitor');
do $$ begin begin delete from public.visitors where id = 'a5555555-5555-4555-8555-555555555555'; raise exception 'Visitor deleted'; exception when foreign_key_violation then null; end; end $$;
select pass('Harvest participation restricts deletion of its Visitor');
do $$ begin begin delete from public.events where id = 'a7777777-7777-4777-8777-777777777771'; raise exception 'Event deleted'; exception when foreign_key_violation then null; end; end $$;
select pass('Harvest participation restricts deletion of its Event');

select is((select outcome from public.create_harvest_visitor_registration('a7777777-7777-4777-8777-777777777771', 'a2222222-2222-4222-8222-222222222222', 'New', 'Harvest Visitor', '0918 555 0002', 'new-harvest@example.test')), 'registered', 'atomic Visitor creation and Harvest registration succeeds');
select is((select count(*) from public.harvest_participations participations join public.visitors on visitors.id = participations.visitor_id where participations.event_id = 'a7777777-7777-4777-8777-777777777771' and visitors.email = 'new-harvest@example.test'), 1::bigint, 'atomic registration stores the new Visitor participation');
select is((select outcome from public.create_harvest_visitor_registration('a7777777-7777-4777-8777-777777777771', 'a2222222-2222-4222-8222-222222222222', 'Member', 'Conflict', null, 'member-harvest@example.test')), 'member_conflict', 'atomic Harvest registration blocks Member contact conflicts');
select is((select outcome from public.create_harvest_visitor_registration('a7777777-7777-4777-8777-777777777771', 'a2222222-2222-4222-8222-222222222222', 'Visitor', 'Conflict', '+63 918 555 0002', null)), 'visitor_conflict', 'atomic Harvest registration returns normalized Visitor conflict');
select is((select outcome from public.create_harvest_visitor_registration('a7777777-7777-4777-8777-777777777772', 'a2222222-2222-4222-8222-222222222222', 'Closed', 'Visitor', null, 'closed-harvest@example.test')), 'event_closed', 'atomic Harvest registration rejects a closed Event');
do $$ begin begin update public.events set status = 'open' where id = 'a7777777-7777-4777-8777-777777777772'; raise exception 'reopen accepted'; exception when check_violation then null; end; end $$;
select pass('closed Events cannot be reopened');

select * from finish();
rollback;
