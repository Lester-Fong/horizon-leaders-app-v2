begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

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

select * from finish();

rollback;
