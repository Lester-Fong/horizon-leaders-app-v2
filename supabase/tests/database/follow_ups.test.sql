begin;
select plan(41);

select has_type('public', 'follow_up_reason', 'Follow Up reason enum exists');
select enum_has_labels(
  'public',
  'follow_up_reason',
  array['consecutive_sunday_absence', 'opencell_high_participation', 'harvest_sunday_interest'],
  'Follow Up reason codes are exact and stable'
);
select has_type('public', 'follow_up_status', 'Follow Up status enum exists');
select enum_has_labels('public', 'follow_up_status', array['active', 'completed'], 'Follow Up lifecycle is exact');
select has_table('public', 'follow_ups', 'Follow Ups table exists');
select has_pk('public', 'follow_ups', 'Follow Ups have a primary key');
select has_index('public', 'follow_ups', 'follow_ups_active_member_reason_key', 'Active Member reason dedup index exists');
select has_index('public', 'follow_ups', 'follow_ups_active_visitor_reason_key', 'Active Visitor reason dedup index exists');
select is((select relrowsecurity from pg_class where oid = 'public.follow_ups'::regclass), true, 'Follow Ups have RLS enabled');
select ok(not has_table_privilege('anon', 'public.follow_ups', 'select'), 'anon cannot read Follow Ups');
select ok(not has_table_privilege('authenticated', 'public.follow_ups', 'select'), 'authenticated cannot read Follow Ups directly');
select ok(not has_table_privilege('authenticated', 'public.follow_ups', 'insert'), 'authenticated cannot create Follow Ups directly');
select ok(not has_function_privilege('authenticated', 'public.create_follow_up_if_absent(uuid,uuid,public.follow_up_reason,jsonb)', 'execute'), 'authenticated cannot execute trigger function');
select ok(has_function_privilege('service_role', 'public.create_follow_up_if_absent(uuid,uuid,public.follow_up_reason,jsonb)', 'execute'), 'service role can execute trigger function');
select ok(not has_function_privilege('authenticated', 'public.complete_follow_up(uuid,uuid,text)', 'execute'), 'authenticated cannot execute completion function');
select ok(has_function_privilege('service_role', 'public.complete_follow_up(uuid,uuid,text)', 'execute'), 'service role can execute completion function');

insert into auth.users (id, email, raw_user_meta_data) values
  ('91111111-1111-4111-8111-111111111111', 'follow-admin@example.test', '{"name":"Follow Admin"}'::jsonb),
  ('92222222-2222-4222-8222-222222222222', 'follow-leader@example.test', '{"name":"Follow Leader"}'::jsonb);
update public.profiles set role = 'admin' where id = '91111111-1111-4111-8111-111111111111';

insert into public.life_groups (id, name, leader_profile_id)
values ('93333333-3333-4333-8333-333333333333', 'Follow Group', '92222222-2222-4222-8222-222222222222');
insert into public.members (id, first_name, last_name, life_group_id, qr_token)
values ('94444444-4444-4444-8444-444444444444', 'Member', 'Subject', '93333333-3333-4333-8333-333333333333', 'follow-up-member-token');
insert into public.visitors (id, first_name, last_name)
values ('95555555-5555-4555-8555-555555555555', 'Visitor', 'Subject');

do $$ begin begin
  insert into public.follow_ups (reason) values ('consecutive_sunday_absence');
  raise exception 'missing subject accepted';
exception when check_violation then null; end; end $$;
select pass('a Follow Up rejects no subject');

do $$ begin begin
  insert into public.follow_ups (member_id, visitor_id, reason)
  values ('94444444-4444-4444-8444-444444444444', '95555555-5555-4555-8555-555555555555', 'consecutive_sunday_absence');
  raise exception 'two subjects accepted';
exception when check_violation then null; end; end $$;
select pass('a Follow Up rejects two subjects');

do $$ begin begin
  insert into public.follow_ups (member_id, reason, context)
  values ('94444444-4444-4444-8444-444444444444', 'consecutive_sunday_absence', '[]'::jsonb);
  raise exception 'array context accepted';
exception when check_violation then null; end; end $$;
select pass('context must be a JSON object');

select is(
  (select outcome from public.create_follow_up_if_absent(
    '94444444-4444-4444-8444-444444444444', null, 'consecutive_sunday_absence', '{"threshold":5,"serviceCount":5}'::jsonb
  )),
  'created',
  'first Member trigger creates an active Follow Up'
);
select ok((select status = 'active' and completed_at is null from public.follow_ups where member_id = '94444444-4444-4444-8444-444444444444'), 'active lifecycle defaults with null completion');
select is(
  (select outcome from public.create_follow_up_if_absent(
    '94444444-4444-4444-8444-444444444444', null, 'consecutive_sunday_absence', '{"threshold":99}'::jsonb
  )),
  'suppressed',
  'repeated Member trigger is suppressed'
);
select is((select context from public.follow_ups where member_id = '94444444-4444-4444-8444-444444444444'), '{"threshold":5,"serviceCount":5}'::jsonb, 'suppression preserves original context');
select is((select count(*) from public.follow_ups where member_id = '94444444-4444-4444-8444-444444444444'), 1::bigint, 'suppression creates no second Member record');

select is(
  (select outcome from public.create_follow_up_if_absent(
    '94444444-4444-4444-8444-444444444444', null, 'harvest_sunday_interest', '{"eventId":"example"}'::jsonb
  )),
  'created',
  'different active reasons may coexist'
);
select is((select count(*) from public.follow_ups where member_id = '94444444-4444-4444-8444-444444444444' and status = 'active'), 2::bigint, 'Member has two distinct active reasons');

select is(
  (select outcome from public.create_follow_up_if_absent(
    null, '95555555-5555-4555-8555-555555555555', 'opencell_high_participation', '{"attendanceCount":6,"percentage":75}'::jsonb
  )),
  'created',
  'first Visitor trigger creates an active Follow Up'
);
select is(
  (select outcome from public.create_follow_up_if_absent(
    null, '95555555-5555-4555-8555-555555555555', 'opencell_high_participation', '{"percentage":100}'::jsonb
  )),
  'suppressed',
  'repeated Visitor trigger is suppressed'
);
select is((select count(*) from public.follow_ups where visitor_id = '95555555-5555-4555-8555-555555555555'), 1::bigint, 'suppression creates no second Visitor record');

do $$ begin begin
  insert into public.follow_ups (member_id, reason, status)
  values ('94444444-4444-4444-8444-444444444444', 'opencell_high_participation', 'completed');
  raise exception 'completed without actor/time accepted';
exception when check_violation then null; end; end $$;
select pass('completed lifecycle requires actor and time');

select is(
  (select outcome from public.complete_follow_up(
    (select id from public.follow_ups where member_id = '94444444-4444-4444-8444-444444444444' and reason = 'consecutive_sunday_absence'),
    '92222222-2222-4222-8222-222222222222',
    '  Contacted and encouraged.  '
  )),
  'completed',
  'active Follow Up completes through the trusted boundary'
);
select ok((select status = 'completed' and completed_by_profile_id = '92222222-2222-4222-8222-222222222222' and completed_at is not null from public.follow_ups where member_id = '94444444-4444-4444-8444-444444444444' and reason = 'consecutive_sunday_absence'), 'completion stores lifecycle actor and time');
select is((select completion_note from public.follow_ups where member_id = '94444444-4444-4444-8444-444444444444' and reason = 'consecutive_sunday_absence'), 'Contacted and encouraged.', 'completion trims the optional note');
select is(
  (select outcome from public.complete_follow_up(
    (select id from public.follow_ups where member_id = '94444444-4444-4444-8444-444444444444' and reason = 'consecutive_sunday_absence'),
    '91111111-1111-4111-8111-111111111111', null
  )),
  'already_completed',
  'completion is one-way'
);
select is(
  (select outcome from public.create_follow_up_if_absent(
    '94444444-4444-4444-8444-444444444444', null, 'consecutive_sunday_absence', '{"threshold":5,"cycle":2}'::jsonb
  )),
  'created',
  'later independent same reason may create after completion'
);
select is((select count(*) from public.follow_ups where member_id = '94444444-4444-4444-8444-444444444444' and reason = 'consecutive_sunday_absence'), 2::bigint, 'completed history and later active record coexist');

do $$ begin begin
  update public.follow_ups set context = '{"changed":true}'::jsonb
  where visitor_id = '95555555-5555-4555-8555-555555555555';
  raise exception 'trigger context changed';
exception when check_violation then null; end; end $$;
select pass('trigger context is immutable');

insert into public.members (id, first_name, last_name, life_group_id, qr_token)
values ('96666666-6666-4666-8666-666666666666', 'Converted', 'Member', '93333333-3333-4333-8333-333333333333', 'follow-up-converted-token');
update public.visitors set status = 'converted', converted_member_id = '96666666-6666-4666-8666-666666666666'
where id = '95555555-5555-4555-8555-555555555555';
select is((select count(*) from public.follow_ups where visitor_id = '95555555-5555-4555-8555-555555555555'), 1::bigint, 'Visitor Follow Up remains linked after conversion');

do $$ begin begin
  delete from public.members where id = '94444444-4444-4444-8444-444444444444';
  raise exception 'referenced Member deleted';
exception when foreign_key_violation then null; end; end $$;
select pass('Member history foreign key is restrictive');
do $$ begin begin
  delete from public.visitors where id = '95555555-5555-4555-8555-555555555555';
  raise exception 'referenced Visitor deleted';
exception when foreign_key_violation then null; end; end $$;
select pass('Visitor history foreign key is restrictive');
do $$ begin begin
  delete from public.profiles where id = '92222222-2222-4222-8222-222222222222';
  raise exception 'completing Profile deleted';
exception when foreign_key_violation then null; end; end $$;
select pass('completing Profile history foreign key is restrictive');

select * from finish();
rollback;
