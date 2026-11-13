begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

select has_function(
  'public',
  'profile_has_references',
  array['uuid'],
  'profile_has_references exists'
);

select ok(
  not has_function_privilege('anon', 'public.profile_has_references(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.profile_has_references(uuid)', 'execute'),
  'browser roles cannot execute profile_has_references'
);

select ok(
  has_function_privilege('service_role', 'public.profile_has_references(uuid)', 'execute'),
  'service_role can execute profile_has_references'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1111111-1111-4111-8111-111111111111', 'fresh@example.test', '{"name":"Fresh User"}'),
  ('a2222222-2222-4222-8222-222222222222', 'leader@example.test', '{"name":"Group Leader"}'),
  ('a3333333-3333-4333-8333-333333333333', 'creator@example.test', '{"name":"Event Creator"}');

select is(
  public.profile_has_references('a1111111-1111-4111-8111-111111111111'),
  false,
  'a fresh Profile has no references'
);

insert into public.life_groups (name, leader_profile_id)
values ('Reference Group', 'a2222222-2222-4222-8222-222222222222');

select is(
  public.profile_has_references('a2222222-2222-4222-8222-222222222222'),
  true,
  'a Profile leading a Life Group has references'
);

insert into public.events (type, title, event_date, created_by_profile_id)
values ('service', 'Reference Service', '2026-08-23', 'a3333333-3333-4333-8333-333333333333');

select is(
  public.profile_has_references('a3333333-3333-4333-8333-333333333333'),
  true,
  'a Profile that created an Event has references'
);

select is(
  public.profile_has_references('a9999999-9999-4999-8999-999999999999'),
  false,
  'an unknown Profile has no references'
);

select has_function(
  'public',
  'revoke_user_sessions',
  array['uuid'],
  'revoke_user_sessions exists'
);

select ok(
  not has_function_privilege('anon', 'public.revoke_user_sessions(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.revoke_user_sessions(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.revoke_user_sessions(uuid)', 'execute'),
  'only service_role can execute revoke_user_sessions'
);

insert into auth.sessions (id, user_id) values
  ('b1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111'),
  ('b2222222-2222-4222-8222-222222222222', 'a1111111-1111-4111-8111-111111111111'),
  ('b3333333-3333-4333-8333-333333333333', 'a2222222-2222-4222-8222-222222222222');

select is(
  public.revoke_user_sessions('a1111111-1111-4111-8111-111111111111'),
  2,
  'revoke_user_sessions removes every session of the target user'
);

select is(
  (select count(*)::integer from auth.sessions where user_id = 'a2222222-2222-4222-8222-222222222222'),
  1,
  'revoke_user_sessions leaves other users signed in'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_audit_events'::regclass),
  'user_audit_events has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.user_audit_events', 'select')
  and not has_table_privilege('authenticated', 'public.user_audit_events', 'select')
  and not has_table_privilege('authenticated', 'public.user_audit_events', 'insert'),
  'browser roles cannot read or write user_audit_events'
);

select ok(
  has_table_privilege('service_role', 'public.user_audit_events', 'insert')
  and not has_table_privilege('service_role', 'public.user_audit_events', 'update')
  and not has_table_privilege('service_role', 'public.user_audit_events', 'delete'),
  'user_audit_events is append-only for service_role'
);

select throws_ok(
  $$insert into public.user_audit_events (action, actor_profile_id, actor_name, target_user_id, target_name)
    values ('made_up_action', gen_random_uuid(), 'Admin', gen_random_uuid(), 'Target')$$,
  '23514',
  null,
  'user_audit_events rejects unknown actions'
);

-- Last active Admin rule (DEC-075).
select has_trigger('public', 'profiles', 'require_active_admin', 'profiles has the active Admin trigger');

select ok(
  not has_function_privilege('anon', 'public.require_active_admin()', 'execute')
  and not has_function_privilege('authenticated', 'public.require_active_admin()', 'execute'),
  'browser roles cannot execute require_active_admin'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1111111-1111-4111-8111-111111111111', 'admin.one@example.test', '{"name":"Admin One"}'),
  ('c2222222-2222-4222-8222-222222222222', 'admin.two@example.test', '{"name":"Admin Two"}');

update public.profiles set role = 'admin'
where id in ('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222');

-- Leave the two test Admins as the only active Admins in this transaction.
select lives_ok(
  $$update public.profiles set role = 'leader'
    where role = 'admin'
      and id not in ('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222')$$,
  'other Admins can be demoted while an active Admin remains'
);

select lives_ok(
  $$update public.profiles set is_active = false where id = 'c2222222-2222-4222-8222-222222222222'$$,
  'one of two active Admins can be deactivated'
);

select throws_ok(
  $$update public.profiles set is_active = false where id = 'c1111111-1111-4111-8111-111111111111'$$,
  '23514',
  'profiles_active_admin_required: At least one active Admin is required',
  'the last active Admin cannot be deactivated'
);

select throws_ok(
  $$update public.profiles set role = 'leader' where id = 'c1111111-1111-4111-8111-111111111111'$$,
  '23514',
  'profiles_active_admin_required: At least one active Admin is required',
  'the last active Admin cannot be demoted'
);

select throws_ok(
  $$update public.profiles set is_active = false, deleted_at = now()
    where id = 'c1111111-1111-4111-8111-111111111111'$$,
  '23514',
  'profiles_active_admin_required: At least one active Admin is required',
  'the last active Admin cannot be soft deleted'
);

select lives_ok(
  $$update public.profiles set name = 'Admin One Renamed' where id = 'c1111111-1111-4111-8111-111111111111'$$,
  'the last active Admin can be renamed'
);

select lives_ok(
  $$update public.profiles set is_active = false where id = 'a1111111-1111-4111-8111-111111111111'$$,
  'Leader updates are not affected'
);

select lives_ok(
  $$update public.profiles set is_active = true where id = 'c2222222-2222-4222-8222-222222222222'$$,
  'an inactive Admin can be reactivated'
);

select lives_ok(
  $$update public.profiles set role = 'leader' where id = 'c1111111-1111-4111-8111-111111111111'$$,
  'an Admin can be demoted once another Admin is active again'
);

-- Soft delete (DEC-075).
select has_column('public', 'profiles', 'deleted_at', 'profiles has deleted_at');

select throws_ok(
  $$update public.profiles set deleted_at = now(), is_active = true
    where id = 'a2222222-2222-4222-8222-222222222222'$$,
  '23514',
  null,
  'a deleted Profile cannot be active'
);

select lives_ok(
  $$update public.profiles set deleted_at = now(), is_active = false
    where id = 'a2222222-2222-4222-8222-222222222222'$$,
  'a Profile can be soft deleted while it keeps its Life Group reference'
);

select * from finish();

rollback;
