begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select has_table(
  'public',
  'profiles',
  'profiles table exists'
);

select has_pk(
  'public',
  'profiles',
  'profiles has a primary key'
);

select col_type_is(
  'public',
  'profiles',
  'id',
  'uuid',
  'profiles.id is a uuid'
);

select is(
  (
    select jsonb_agg(enumlabel order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.app_role'::regtype
  ),
  '["admin", "leader"]'::jsonb,
  'app_role contains exactly admin and leader'
);

select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ),
  true,
  'profiles has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'select'),
  'anon has no direct profiles access'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'select'),
  'authenticated has no direct profiles access'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
  ),
  0::bigint,
  'profiles exposes no browser-facing RLS policies in this slice'
);

select ok(
  has_table_privilege('service_role', 'public.profiles', 'select'),
  'service_role has server-side profiles access'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '11111111-1111-4111-8111-111111111111',
  'leader@example.test',
  '{"name":"Test Leader","role":"admin","is_active":false}'::jsonb
);

select is(
  (select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  1::bigint,
  'an Auth user creates exactly one profile'
);

select is(
  (select name from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Test Leader',
  'non-authoritative name metadata initializes the display name'
);

select is(
  (select role::text from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'leader',
  'user-controlled metadata cannot assign the admin role'
);

select is(
  (select is_active from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  true,
  'user-controlled metadata cannot deactivate a profile'
);

insert into auth.users (id, email)
values (
  '22222222-2222-4222-8222-222222222222',
  'fallback.name@example.test'
);

select is(
  (select name from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'fallback.name',
  'the email local part supplies a deterministic fallback name'
);

do $$
begin
  begin
    update public.profiles
    set role = 'owner'
    where id = '11111111-1111-4111-8111-111111111111';

    raise exception 'invalid role was accepted';
  exception
    when invalid_text_representation then null;
  end;
end;
$$;

select pass('invalid roles are rejected');

do $$
begin
  begin
    update public.profiles
    set name = '   '
    where id = '11111111-1111-4111-8111-111111111111';

    raise exception 'blank name was accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

select pass('blank profile names are rejected');

update public.profiles
set name = 'Renamed Leader',
    updated_at = '2000-01-01 00:00:00+00'
where id = '11111111-1111-4111-8111-111111111111';

select ok(
  (
    select updated_at > '2000-01-01 00:00:00+00'
    from public.profiles
    where id = '11111111-1111-4111-8111-111111111111'
  ),
  'updated_at is maintained by the database'
);

delete from auth.users
where id = '11111111-1111-4111-8111-111111111111';

select is(
  (select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'deleting an Auth user cascades to the profile'
);

select * from finish();
rollback;
