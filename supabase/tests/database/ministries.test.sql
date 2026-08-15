begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

select has_table('public', 'ministries', 'ministries table exists');
select has_pk('public', 'ministries', 'ministries has a primary key');
select col_type_is('public', 'ministries', 'id', 'uuid', 'ministries.id is a uuid');
select is(
  (select relrowsecurity from pg_class where oid = 'public.ministries'::regclass),
  true,
  'ministries has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.ministries', 'select'),
  'anon has no direct ministries access'
);
select ok(
  not has_table_privilege('authenticated', 'public.ministries', 'select'),
  'authenticated has no direct ministries access'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ministries'),
  0::bigint,
  'ministries exposes no browser-facing RLS policies'
);
select ok(
  has_table_privilege('service_role', 'public.ministries', 'select'),
  'service_role has server-side ministries access'
);

select has_table('public', 'member_ministries', 'member_ministries table exists');
select has_pk('public', 'member_ministries', 'member_ministries has a composite primary key');
select has_index(
  'public',
  'member_ministries',
  'member_ministries_ministry_id_idx',
  'member_ministries has a Ministry lookup index'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.member_ministries'::regclass),
  true,
  'member_ministries has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.member_ministries', 'select'),
  'anon has no direct member_ministries access'
);
select ok(
  not has_table_privilege('authenticated', 'public.member_ministries', 'select'),
  'authenticated has no direct member_ministries access'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'member_ministries'),
  0::bigint,
  'member_ministries exposes no browser-facing RLS policies'
);
select ok(
  has_table_privilege('service_role', 'public.member_ministries', 'select'),
  'service_role has server-side assignment access'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '81111111-1111-4111-8111-111111111111',
  'ministries-leader@example.test',
  '{"name":"Ministries Leader"}'::jsonb
);

insert into public.life_groups (id, name, leader_profile_id)
values (
  '82222222-2222-4222-8222-222222222222',
  'Ministries Test Group',
  '81111111-1111-4111-8111-111111111111'
);

insert into public.members (id, first_name, last_name, life_group_id, qr_token)
values (
  '83333333-3333-4333-8333-333333333333',
  'Mara',
  'Member',
  '82222222-2222-4222-8222-222222222222',
  'ministry-member-token'
);

insert into public.ministries (id, name, description)
values (
  '84444444-4444-4444-8444-444444444444',
  'Worship Ministry',
  'Supports gathered worship.'
);

select is(
  (select count(*) from public.ministries where name = 'Worship Ministry'),
  1::bigint,
  'a valid Ministry can be created'
);
select is(
  (select is_active from public.ministries where id = '84444444-4444-4444-8444-444444444444'),
  true,
  'new Ministries default to active'
);
select ok(
  (select created_at is not null and updated_at is not null from public.ministries where id = '84444444-4444-4444-8444-444444444444'),
  'Ministry timestamps default to database values'
);

do $$
begin
  begin
    insert into public.ministries (name) values ('   ');
    raise exception 'blank Ministry name was accepted';
  exception when check_violation then null;
  end;
end;
$$;
select pass('blank Ministry names are rejected');

update public.ministries
set description = 'Updated', updated_at = '2000-01-01 00:00:00+00'
where id = '84444444-4444-4444-8444-444444444444';
select ok(
  (select updated_at > '2000-01-01 00:00:00+00' from public.ministries where id = '84444444-4444-4444-8444-444444444444'),
  'updated_at is maintained by the database'
);

insert into public.member_ministries (member_id, ministry_id)
values (
  '83333333-3333-4333-8333-333333333333',
  '84444444-4444-4444-8444-444444444444'
);
select is(
  (select count(*) from public.member_ministries),
  1::bigint,
  'a valid Member-Ministry assignment can be created'
);

do $$
begin
  begin
    insert into public.member_ministries (member_id, ministry_id)
    values ('83333333-3333-4333-8333-333333333333', '84444444-4444-4444-8444-444444444444');
    raise exception 'duplicate assignment was accepted';
  exception when unique_violation then null;
  end;
end;
$$;
select pass('duplicate Member-Ministry assignments are rejected');

do $$
begin
  begin
    insert into public.member_ministries (member_id, ministry_id)
    values ('89999999-9999-4999-8999-999999999999', '84444444-4444-4444-8444-444444444444');
    raise exception 'invalid Member assignment was accepted';
  exception when foreign_key_violation then null;
  end;
end;
$$;
select pass('assignment requires a valid Member foreign key');

do $$
begin
  begin
    insert into public.member_ministries (member_id, ministry_id)
    values ('83333333-3333-4333-8333-333333333333', '89999999-9999-4999-8999-999999999999');
    raise exception 'invalid Ministry assignment was accepted';
  exception when foreign_key_violation then null;
  end;
end;
$$;
select pass('assignment requires a valid Ministry foreign key');

update public.ministries set is_active = false
where id = '84444444-4444-4444-8444-444444444444';
select is(
  (select is_active from public.ministries where id = '84444444-4444-4444-8444-444444444444'),
  false,
  'Ministry archive uses is_active false'
);
select is(
  (select count(*) from public.member_ministries),
  1::bigint,
  'archiving a Ministry preserves assignments'
);

update public.members set is_active = false
where id = '83333333-3333-4333-8333-333333333333';
select is(
  (select count(*) from public.member_ministries),
  1::bigint,
  'archiving a Member preserves assignments'
);

do $$
begin
  begin
    delete from public.members where id = '83333333-3333-4333-8333-333333333333';
    raise exception 'assigned Member was deleted';
  exception when foreign_key_violation then null;
  end;
end;
$$;
select pass('an assigned Member cannot be deleted without removing the assignment');

do $$
begin
  begin
    delete from public.ministries where id = '84444444-4444-4444-8444-444444444444';
    raise exception 'assigned Ministry was deleted';
  exception when foreign_key_violation then null;
  end;
end;
$$;
select pass('an assigned Ministry cannot be deleted without removing the assignment');

delete from public.member_ministries
where member_id = '83333333-3333-4333-8333-333333333333'
  and ministry_id = '84444444-4444-4444-8444-444444444444';
select is(
  (select count(*) from public.members where id = '83333333-3333-4333-8333-333333333333'),
  1::bigint,
  'removing an assignment preserves the Member'
);
select is(
  (select count(*) from public.ministries where id = '84444444-4444-4444-8444-444444444444'),
  1::bigint,
  'removing an assignment preserves the Ministry'
);

select * from finish();
rollback;
