begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select has_table('public', 'sunday_service_evaluations', 'Sunday evaluation state exists');
select has_table('public', 'sunday_absence_threshold_occurrences', 'threshold occurrences exist');
select has_table('public', 'automation_runs', 'automation run log exists');
select has_index('public', 'sunday_absence_threshold_occurrences', 'sunday_absence_occurrences_member_idx', 'occurrences have member lookup');
select ok(not has_function_privilege('anon', 'public.close_sunday_service(uuid)', 'execute'), 'anonymous clients cannot close a Service');
select ok(not has_table_privilege('authenticated', 'public.automation_runs', 'select'), 'automation runs are closed to browsers');
select ok(not has_function_privilege('authenticated', 'public.reconcile_sunday_services()', 'execute'), 'reconciliation is service-role only');
select is(public.sunday_consecutive_absence_threshold(), 5, 'Sunday threshold is five');
select is(public.opencell_participation_threshold_percent(), 75, 'OpenCell threshold is 75 percent');
select is(public.church_time_zone(), 'Asia/Manila', 'church timezone is Asia/Manila');

insert into auth.users (id, email, raw_user_meta_data) values ('91111111-1111-4111-8111-111111111111', 'automation-admin@example.test', '{"name":"Automation Admin"}'::jsonb);
update public.profiles set role = 'admin' where id = '91111111-1111-4111-8111-111111111111';
insert into public.life_groups (id, name, leader_profile_id) values ('92222222-2222-4222-8222-222222222222', 'Automation Group', '91111111-1111-4111-8111-111111111111');
insert into public.members (id, first_name, last_name, life_group_id, qr_token, created_at) values ('93333333-3333-4333-8333-333333333333', 'Absent', 'Member', '92222222-2222-4222-8222-222222222222', 'automation-token', '2026-01-01 00:00:00+00');

insert into public.events (id, type, title, event_date, created_by_profile_id) values
 ('94444444-4444-4444-8444-444444444441','service','S1','2026-01-04','91111111-1111-4111-8111-111111111111'),
 ('94444444-4444-4444-8444-444444444442','service','S2','2026-01-11','91111111-1111-4111-8111-111111111111'),
 ('94444444-4444-4444-8444-444444444443','service','S3','2026-01-18','91111111-1111-4111-8111-111111111111'),
 ('94444444-4444-4444-8444-444444444444','service','S4','2026-01-25','91111111-1111-4111-8111-111111111111'),
 ('94444444-4444-4444-8444-444444444445','service','S5','2026-02-01','91111111-1111-4111-8111-111111111111'),
 ('94444444-4444-4444-8444-444444444446','service','S6','2026-02-08','91111111-1111-4111-8111-111111111111'),
 ('94444444-4444-4444-8444-444444444447','service','S7','2026-02-15','91111111-1111-4111-8111-111111111111'),
 ('94444444-4444-4444-8444-444444444448','service','S8','2026-02-22','91111111-1111-4111-8111-111111111111'),
 ('94444444-4444-4444-8444-444444444449','service','S9','2026-03-01','91111111-1111-4111-8111-111111111111'),
 ('94444444-4444-4444-8444-444444444450','service','S10','2026-03-08','91111111-1111-4111-8111-111111111111'),
 ('94444444-4444-4444-8444-444444444451','service','S11','2026-03-15','91111111-1111-4111-8111-111111111111'),
 ('94444444-4444-4444-8444-444444444452','service','S12','2026-03-22','91111111-1111-4111-8111-111111111111');

select is((select outcome from public.close_sunday_service('94444444-4444-4444-8444-444444444441')), 'closed', 'first absence closes normally');
select is((select count(*) from public.follow_ups where member_id = '93333333-3333-4333-8333-333333333333'), 0::bigint, 'one absence creates no Follow Up');
select is((select outcome from public.close_sunday_service('94444444-4444-4444-8444-444444444442')), 'closed', 'second absence closes normally');
select is((select outcome from public.close_sunday_service('94444444-4444-4444-8444-444444444443')), 'closed', 'third absence closes normally');
select is((select outcome from public.close_sunday_service('94444444-4444-4444-8444-444444444444')), 'closed', 'fourth absence closes normally');
select is((select outcome from public.close_sunday_service('94444444-4444-4444-8444-444444444445')), 'closed', 'fifth absence closes normally');
select is((select count(*) from public.sunday_absence_threshold_occurrences where member_id = '93333333-3333-4333-8333-333333333333'), 1::bigint, 'threshold crossing records one occurrence');
select is((select count(*) from public.follow_ups where member_id = '93333333-3333-4333-8333-333333333333' and reason = 'consecutive_sunday_absence'), 1::bigint, 'threshold crossing creates one Follow Up');
select is((select outcome from public.close_sunday_service('94444444-4444-4444-8444-444444444446')), 'closed', 'sixth absence closes normally');
select is((select count(*) from public.sunday_absence_threshold_occurrences where member_id = '93333333-3333-4333-8333-333333333333'), 1::bigint, 'continued streak does not create another occurrence');

insert into public.sunday_service_presence(event_id, member_id) values ('94444444-4444-4444-8444-444444444447', '93333333-3333-4333-8333-333333333333');
select is((select outcome from public.close_sunday_service('94444444-4444-4444-8444-444444444447')), 'closed', 'presence closes and resets streak');
select public.close_sunday_service('94444444-4444-4444-8444-444444444448');
select public.close_sunday_service('94444444-4444-4444-8444-444444444449');
select public.close_sunday_service('94444444-4444-4444-8444-444444444450');
select public.close_sunday_service('94444444-4444-4444-8444-444444444451');
select is((select outcome from public.close_sunday_service('94444444-4444-4444-8444-444444444452')), 'closed', 'later service closes');
select is((select count(*) from public.sunday_absence_threshold_occurrences where member_id = '93333333-3333-4333-8333-333333333333'), 2::bigint, 'a later post-reset crossing records a second occurrence');
insert into public.events (id, type, title, event_date, counts_for_absence, created_by_profile_id) values ('94444444-4444-4444-8444-444444444460', 'service', 'Excluded', '2026-03-23', false, '91111111-1111-4111-8111-111111111111');
select is((select outcome from public.close_sunday_service('94444444-4444-4444-8444-444444444460')), 'closed', 'non-counting Service closes without evaluation');
select is((select count(*) from public.sunday_service_evaluations where event_id = '94444444-4444-4444-8444-444444444460'), 0::bigint, 'non-counting Service has no evaluation state');
delete from public.sunday_service_evaluations where event_id = '94444444-4444-4444-8444-444444444441';
select is((select processed_count from public.reconcile_sunday_services()), 1, 'reconciliation retries a pending Service');
select is((select count(*) from public.sunday_service_evaluations where event_id = '94444444-4444-4444-8444-444444444441'), 1::bigint, 'reconciliation restores evaluation state');

select * from finish();
rollback;
