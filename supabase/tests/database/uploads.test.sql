begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select has_column('public', 'members', 'photo_path', 'members stores an optional photo path');
select has_column('public', 'life_groups', 'logo_path', 'life_groups stores an optional logo path');
select has_column('public', 'events', 'image_path', 'events stores an optional image path');
select col_type_is('public', 'members', 'photo_path', 'text', 'Member photo path is text');
select col_type_is('public', 'life_groups', 'logo_path', 'text', 'Life Group logo path is text');
select col_type_is('public', 'events', 'image_path', 'text', 'Event image path is text');

select is(
  (select public from storage.buckets where id = 'horizon-uploads'),
  false,
  'horizon-uploads is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'horizon-uploads'),
  10485760::bigint,
  'the bucket has a bounded normalized-object limit'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'horizon-uploads'),
  array['image/webp']::text[],
  'the bucket accepts only normalized WebP objects'
);
select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  ),
  0::bigint,
  'Storage objects expose no browser-facing policy'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'b1000000-0000-4000-8000-000000000001',
  'uploads-leader@example.test',
  '{"name":"Uploads Leader"}'::jsonb
);

insert into public.life_groups (id, name, leader_profile_id)
values (
  'b2000000-0000-4000-8000-000000000002',
  'Uploads Group',
  'b1000000-0000-4000-8000-000000000001'
);

insert into public.members (id, first_name, last_name, life_group_id, qr_token)
values (
  'b3000000-0000-4000-8000-000000000003',
  'Upload',
  'Member',
  'b2000000-0000-4000-8000-000000000002',
  'uploads-member-token'
);

insert into public.events (
  id,
  type,
  title,
  event_date,
  counts_for_absence,
  created_by_profile_id
)
values (
  'b4000000-0000-4000-8000-000000000004',
  'harvest',
  'Uploads Harvest',
  '2026-09-20',
  false,
  'b1000000-0000-4000-8000-000000000001'
);

update public.members
set photo_path = 'members/b3000000-0000-4000-8000-000000000003/b5000000-0000-4000-8000-000000000005.webp'
where id = 'b3000000-0000-4000-8000-000000000003';
select ok((select photo_path is not null from public.members where id = 'b3000000-0000-4000-8000-000000000003'), 'valid Member path is accepted');

update public.life_groups
set logo_path = 'life-groups/b2000000-0000-4000-8000-000000000002/b6000000-0000-4000-8000-000000000006.webp'
where id = 'b2000000-0000-4000-8000-000000000002';
select ok((select logo_path is not null from public.life_groups where id = 'b2000000-0000-4000-8000-000000000002'), 'valid Life Group path is accepted');

update public.events
set image_path = 'events/b4000000-0000-4000-8000-000000000004/b7000000-0000-4000-8000-000000000007.webp'
where id = 'b4000000-0000-4000-8000-000000000004';
select ok((select image_path is not null from public.events where id = 'b4000000-0000-4000-8000-000000000004'), 'valid Event path is accepted');

do $$ begin
  begin
    update public.members
    set photo_path = 'members/../../secret.webp'
    where id = 'b3000000-0000-4000-8000-000000000003';
    raise exception 'path traversal Member path was accepted';
  exception when check_violation then null;
  end;
end $$;
select pass('Member path traversal is rejected');

do $$ begin
  begin
    update public.life_groups
    set logo_path = 'life-groups/b2000000-0000-4000-8000-000000000002/logo.svg'
    where id = 'b2000000-0000-4000-8000-000000000002';
    raise exception 'non-WebP Life Group path was accepted';
  exception when check_violation then null;
  end;
end $$;
select pass('non-WebP Life Group path is rejected');

do $$ begin
  begin
    update public.events
    set image_path = 'events/b3000000-0000-4000-8000-000000000003/b7000000-0000-4000-8000-000000000007.webp'
    where id = 'b4000000-0000-4000-8000-000000000004';
    raise exception 'wrong-owner Event path was accepted';
  exception when check_violation then null;
  end;
end $$;
select pass('an Event path must belong to the owning Event ID');

update public.members set photo_path = null where id = 'b3000000-0000-4000-8000-000000000003';
update public.life_groups set logo_path = null where id = 'b2000000-0000-4000-8000-000000000002';
update public.events set image_path = null where id = 'b4000000-0000-4000-8000-000000000004';
select ok((select photo_path is null from public.members where id = 'b3000000-0000-4000-8000-000000000003'), 'Member photo may be removed');
select ok((select logo_path is null from public.life_groups where id = 'b2000000-0000-4000-8000-000000000002'), 'Life Group logo may be removed');
select ok((select image_path is null from public.events where id = 'b4000000-0000-4000-8000-000000000004'), 'Event image may be removed');

select is(
  (select count(*) from storage.objects where bucket_id = 'horizon-uploads'),
  0::bigint,
  'migration creates no fabricated upload objects'
);

select * from finish();
rollback;
