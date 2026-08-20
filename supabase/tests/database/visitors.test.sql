begin;

create extension if not exists pgtap with schema extensions;

select plan(50);

select has_table('public', 'visitors', 'visitors table exists');
select has_pk('public', 'visitors', 'visitors has a primary key');
select is(
  (
    select jsonb_agg(enumlabel order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.visitor_status'::regtype
  ),
  '["active", "converted"]'::jsonb,
  'visitor_status contains exactly active and converted'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.visitors'::regclass),
  true,
  'visitors has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.visitors', 'select'),
  'anon has no direct visitors access'
);
select ok(
  not has_table_privilege('authenticated', 'public.visitors', 'select'),
  'authenticated has no direct visitors access'
);
select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public' and tablename = 'visitors'
  ),
  0::bigint,
  'visitors exposes no browser-facing RLS policies'
);
select ok(
  has_table_privilege('service_role', 'public.visitors', 'select'),
  'service_role has server-side visitors access'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.convert_visitor_to_member(uuid,uuid,text)',
    'execute'
  ),
  'anon cannot execute Visitor conversion'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.convert_visitor_to_member(uuid,uuid,text)',
    'execute'
  ),
  'authenticated cannot execute Visitor conversion'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.convert_visitor_to_member(uuid,uuid,text)',
    'execute'
  ),
  'service_role can execute the backend conversion boundary'
);
select has_index(
  'public',
  'visitors',
  'visitors_status_name_idx',
  'visitors has a status/name directory index'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '91111111-1111-4111-8111-111111111111',
    'visitor-leader@example.test',
    '{"name":"Visitor Leader"}'::jsonb
  ),
  (
    '92222222-2222-4222-8222-222222222222',
    'visitor-inactive-leader@example.test',
    '{"name":"Inactive Group Leader"}'::jsonb
  );

insert into public.life_groups (id, name, leader_profile_id, is_active)
values
  (
    '93333333-3333-4333-8333-333333333333',
    'Visitor Test Group',
    '91111111-1111-4111-8111-111111111111',
    true
  ),
  (
    '94444444-4444-4444-8444-444444444444',
    'Inactive Visitor Group',
    '92222222-2222-4222-8222-222222222222',
    false
  );

insert into public.visitors (id, first_name, last_name, phone, email)
values (
  '95555555-5555-4555-8555-555555555555',
  'Ana',
  'Visitor',
  '0917 123 4567',
  ' Ana.Visitor@Example.Test '
);

select is(
  (select count(*) from public.visitors where first_name = 'Ana'),
  1::bigint,
  'a valid Visitor can be created'
);
select is(
  (select status::text from public.visitors where id = '95555555-5555-4555-8555-555555555555'),
  'active',
  'new Visitors default to active'
);
select is(
  (select converted_member_id from public.visitors where id = '95555555-5555-4555-8555-555555555555'),
  null::uuid,
  'new active Visitors have no converted Member'
);
select is(
  (select normalized_email from public.visitors where id = '95555555-5555-4555-8555-555555555555'),
  'ana.visitor@example.test',
  'Visitor email normalization trims and lowercases'
);
select is(
  (select normalized_phone from public.visitors where id = '95555555-5555-4555-8555-555555555555'),
  '639171234567',
  'Visitor Philippine phone normalization uses the Member canonical form'
);
select ok(
  (select id is not null from public.visitors where id = '95555555-5555-4555-8555-555555555555'),
  'Visitor ids are present'
);
select ok(
  (
    select created_at is not null and updated_at is not null
    from public.visitors
    where id = '95555555-5555-4555-8555-555555555555'
  ),
  'Visitor timestamps default from the database'
);

do $$
begin
  begin
    insert into public.visitors (first_name, last_name) values (' ', 'Valid');
    raise exception 'blank first name was accepted';
  exception when check_violation then null;
  end;
end;
$$;
select pass('blank Visitor first names are rejected');

do $$
begin
  begin
    insert into public.visitors (first_name, last_name) values ('Valid', ' ');
    raise exception 'blank last name was accepted';
  exception when check_violation then null;
  end;
end;
$$;
select pass('blank Visitor last names are rejected');

do $$
begin
  begin
    insert into public.visitors (first_name, last_name, status)
    values ('Bad', 'Status', 'archived');
    raise exception 'invalid Visitor status was accepted';
  exception when invalid_text_representation then null;
  end;
end;
$$;
select pass('Visitor status values outside active and converted are rejected');

insert into public.members (
  id,
  first_name,
  last_name,
  email,
  life_group_id,
  qr_token
)
values (
  '96666666-6666-4666-8666-666666666666',
  'Existing',
  'Member',
  'member@example.test',
  '93333333-3333-4333-8333-333333333333',
  'visitor-db-existing-member'
);

do $$
begin
  begin
    insert into public.visitors (
      first_name,
      last_name,
      status,
      converted_member_id
    ) values (
      'Invalid',
      'Active Link',
      'active',
      '96666666-6666-4666-8666-666666666666'
    );
    raise exception 'active Visitor with converted Member was accepted';
  exception when check_violation then null;
  end;
end;
$$;
select pass('active Visitors cannot reference a converted Member');

do $$
begin
  begin
    insert into public.visitors (first_name, last_name, status)
    values ('Invalid', 'Converted Link', 'converted');
    raise exception 'converted Visitor without Member was accepted';
  exception when check_violation then null;
  end;
end;
$$;
select pass('converted Visitors require a converted Member');

do $$
begin
  begin
    insert into public.visitors (
      first_name,
      last_name,
      status,
      converted_member_id
    ) values (
      'Invalid',
      'Member FK',
      'converted',
      '97777777-7777-4777-8777-777777777777'
    );
    raise exception 'invalid converted Member was accepted';
  exception when foreign_key_violation then null;
  end;
end;
$$;
select pass('converted_member_id requires an existing Member');

insert into public.visitors (first_name, last_name)
values
  ('No', 'Contact'),
  ('No', 'Contact');
select is(
  (
    select count(*)
    from public.visitors
    where first_name = 'No' and last_name = 'Contact'
  ),
  2::bigint,
  'multiple Visitors may have null phone/email and duplicate names'
);
select is(
  (
    select count(*)
    from public.visitors
    where phone is null and email is null
  ),
  2::bigint,
  'nullable Visitor contacts do not conflict'
);

do $$
begin
  begin
    insert into public.visitors (first_name, last_name, email)
    values ('Duplicate', 'Email', 'ANA.VISITOR@example.test');
    raise exception 'normalized duplicate Visitor email was accepted';
  exception when unique_violation then null;
  end;
end;
$$;
select pass('normalized duplicate Visitor emails are rejected');

do $$
begin
  begin
    insert into public.visitors (first_name, last_name, phone)
    values ('Duplicate', 'Phone', '+63 (917) 123-4567');
    raise exception 'normalized duplicate Visitor phone was accepted';
  exception when unique_violation then null;
  end;
end;
$$;
select pass('formatted Philippine duplicate Visitor phones are rejected');

update public.visitors
set updated_at = '2000-01-01 00:00:00+00', first_name = 'Updated'
where id = '95555555-5555-4555-8555-555555555555';
select ok(
  (
    select updated_at > '2000-01-01 00:00:00+00'
    from public.visitors
    where id = '95555555-5555-4555-8555-555555555555'
  ),
  'Visitor updates refresh updated_at'
);

insert into public.visitors (id, first_name, last_name, email)
values (
  '98888888-8888-4888-8888-888888888888',
  'Duplicate',
  'Member Contact',
  ' MEMBER@example.test '
);

select is(
  (
    select outcome
    from public.convert_visitor_to_member(
      '98888888-8888-4888-8888-888888888888',
      '93333333-3333-4333-8333-333333333333',
      'duplicate-conversion-token'
    )
  ),
  'duplicate_member',
  'conversion identifies a normalized Member contact conflict'
);
select is(
  (select status::text from public.visitors where id = '98888888-8888-4888-8888-888888888888'),
  'active',
  'duplicate Member conflict leaves Visitor active'
);
select is(
  (select converted_member_id from public.visitors where id = '98888888-8888-4888-8888-888888888888'),
  null::uuid,
  'duplicate conflict leaves converted_member_id null'
);
select is(
  (select count(*) from public.members where qr_token = 'duplicate-conversion-token'),
  0::bigint,
  'duplicate conflict creates no Member'
);

insert into public.visitors (id, first_name, last_name, email)
values (
  '99999999-9999-4999-8999-999999999999',
  'Inactive',
  'Group Conversion',
  'inactive-group@example.test'
);
select is(
  (
    select outcome
    from public.convert_visitor_to_member(
      '99999999-9999-4999-8999-999999999999',
      '94444444-4444-4444-8444-444444444444',
      'inactive-group-token'
    )
  ),
  'inactive_life_group',
  'conversion rejects an inactive Life Group'
);
select is(
  (select status::text from public.visitors where id = '99999999-9999-4999-8999-999999999999'),
  'active',
  'inactive group rejection preserves active Visitor state'
);

insert into public.visitors (id, first_name, last_name, email)
values (
  '90000000-0000-4000-8000-000000000001',
  'Rollback',
  'Visitor',
  'rollback@example.test'
);
do $$
begin
  begin
    perform *
    from public.convert_visitor_to_member(
      '90000000-0000-4000-8000-000000000001',
      '93333333-3333-4333-8333-333333333333',
      ' '
    );
    raise exception 'invalid Member creation unexpectedly succeeded';
  exception when check_violation then null;
  end;
end;
$$;
select pass('failed Member creation rolls back the conversion function');
select ok(
  (
    select status = 'active' and converted_member_id is null
    from public.visitors
    where id = '90000000-0000-4000-8000-000000000001'
  ),
  'rollback leaves Visitor active and unlinked'
);

insert into public.visitors (id, first_name, last_name, phone, email)
values (
  '90000000-0000-4000-8000-000000000002',
  'Conversion',
  'Success',
  '0999-888-7777',
  'convert-success@example.test'
);
select is(
  (
    select outcome
    from public.convert_visitor_to_member(
      '90000000-0000-4000-8000-000000000002',
      '93333333-3333-4333-8333-333333333333',
      'successful-conversion-token'
    )
  ),
  'converted',
  'valid conversion succeeds'
);
select ok(
  (
    select
      first_name = 'Conversion'
      and last_name = 'Success'
      and phone = '0999-888-7777'
      and email = 'convert-success@example.test'
    from public.members
    where qr_token = 'successful-conversion-token'
  ),
  'conversion copies Visitor identity and contact to the new Member'
);
select is(
  (
    select qr_token
    from public.members
    where email = 'convert-success@example.test'
  ),
  'successful-conversion-token',
  'conversion stores the server-supplied permanent QR token'
);
select ok(
  (
    select
      address is null
      and birth_date is null
      and gender is null
      and is_active
      and life_group_id = '93333333-3333-4333-8333-333333333333'
    from public.members
    where qr_token = 'successful-conversion-token'
  ),
  'converted Member uses normal defaults and the required Life Group'
);
select is(
  (select status::text from public.visitors where id = '90000000-0000-4000-8000-000000000002'),
  'converted',
  'successful conversion marks the Visitor converted'
);
select is(
  (
    select visitors.converted_member_id
    from public.visitors
    join public.members on members.id = visitors.converted_member_id
    where visitors.id = '90000000-0000-4000-8000-000000000002'
  ),
  (
    select id
    from public.members
    where qr_token = 'successful-conversion-token'
  ),
  'successful conversion links the preserved Visitor to the new Member'
);
select is(
  (
    select outcome
    from public.convert_visitor_to_member(
      '90000000-0000-4000-8000-000000000002',
      '93333333-3333-4333-8333-333333333333',
      'second-conversion-token'
    )
  ),
  'visitor_not_active',
  'a converted Visitor cannot convert again'
);
select is(
  (
    select count(*)
    from public.members
    where email = 'convert-success@example.test'
  ),
  1::bigint,
  'one Visitor conversion creates exactly one Member'
);

do $$
begin
  begin
    insert into public.visitors (first_name, last_name, phone)
    values ('Converted', 'Duplicate', '+63 999 888 7777');
    raise exception 'converted Visitor contact stopped participating in uniqueness';
  exception when unique_violation then null;
  end;
end;
$$;
select pass('converted Visitors continue participating in duplicate protection');

do $$
declare
  converted_member uuid;
begin
  select converted_member_id
  into converted_member
  from public.visitors
  where id = '90000000-0000-4000-8000-000000000002';

  begin
    insert into public.visitors (
      first_name,
      last_name,
      status,
      converted_member_id
    ) values (
      'Second',
      'Conversion Link',
      'converted',
      converted_member
    );
    raise exception 'one Member was linked from multiple Visitors';
  exception when unique_violation then null;
  end;
end;
$$;
select pass('one Member cannot be the conversion result of multiple Visitors');

do $$
declare
  converted_member uuid;
begin
  select converted_member_id
  into converted_member
  from public.visitors
  where id = '90000000-0000-4000-8000-000000000002';

  begin
    delete from public.members where id = converted_member;
    raise exception 'linked converted Member deletion was accepted';
  exception when foreign_key_violation then null;
  end;
end;
$$;
select pass('converted Member deletion is restricted to preserve the Visitor relationship');
select is(
  (
    select count(*)
    from public.visitors
    where id = '90000000-0000-4000-8000-000000000002'
      and status = 'converted'
      and converted_member_id is not null
  ),
  1::bigint,
  'converted Visitor remains preserved with its Member link'
);

select * from finish();

rollback;
