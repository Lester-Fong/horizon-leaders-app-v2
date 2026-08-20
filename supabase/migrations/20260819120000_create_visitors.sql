create type public.visitor_status as enum ('active', 'converted');

create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  first_name text not null
    constraint visitors_first_name_not_blank check (btrim(first_name) <> ''),
  last_name text not null
    constraint visitors_last_name_not_blank check (btrim(last_name) <> ''),
  phone text
    constraint visitors_phone_not_blank check (phone is null or btrim(phone) <> ''),
  normalized_phone text generated always as (
    public.normalize_member_phone(phone)
  ) stored,
  email text
    constraint visitors_email_not_blank check (email is null or btrim(email) <> ''),
  normalized_email text generated always as (
    public.normalize_member_email(email)
  ) stored,
  status public.visitor_status not null default 'active',
  converted_member_id uuid
    constraint visitors_converted_member_id_fkey
      references public.members (id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint visitors_converted_member_id_key unique (converted_member_id),
  constraint visitors_conversion_state_check check (
    (status = 'active' and converted_member_id is null)
    or (status = 'converted' and converted_member_id is not null)
  )
);

create unique index visitors_normalized_email_key
on public.visitors (normalized_email)
where normalized_email is not null;

create unique index visitors_normalized_phone_key
on public.visitors (normalized_phone)
where normalized_phone is not null;

create index visitors_status_name_idx
on public.visitors (status, last_name, first_name);

comment on table public.visitors is
  'Tracked Visitors with a one-way active-to-converted lifecycle.';

comment on column public.visitors.normalized_email is
  'Generated lowercase/trimmed email used only for Visitor duplicate integrity.';

comment on column public.visitors.normalized_phone is
  'Generated digit-normalized phone used only for Visitor duplicate integrity.';

comment on column public.visitors.converted_member_id is
  'Unique Member created atomically by one-way Visitor conversion.';

alter table public.visitors enable row level security;

revoke all on table public.visitors from anon, authenticated;
grant select, insert, update, delete on table public.visitors to service_role;

create trigger set_visitors_updated_at
before update on public.visitors
for each row
execute function public.set_profiles_updated_at();

create function public.convert_visitor_to_member(
  p_visitor_id uuid,
  p_life_group_id uuid,
  p_qr_token text
)
returns table (
  outcome text,
  created_member_id uuid,
  conflicting_member_id uuid,
  conflict_field text
)
language plpgsql
set search_path = ''
as $$
declare
  visitor_record public.visitors%rowtype;
  member_conflict_id uuid;
  new_member_id uuid;
  target_life_group_active boolean;
begin
  select visitors.*
  into visitor_record
  from public.visitors
  where visitors.id = p_visitor_id
  for update;

  if not found then
    return query select 'visitor_not_found', null::uuid, null::uuid, null::text;
    return;
  end if;

  if visitor_record.status <> 'active'::public.visitor_status then
    return query select 'visitor_not_active', null::uuid, null::uuid, null::text;
    return;
  end if;

  select life_groups.is_active
  into target_life_group_active
  from public.life_groups
  where life_groups.id = p_life_group_id
  for share;

  if not found then
    return query select 'life_group_not_found', null::uuid, null::uuid, null::text;
    return;
  end if;

  if not target_life_group_active then
    return query select 'inactive_life_group', null::uuid, null::uuid, null::text;
    return;
  end if;

  if visitor_record.normalized_email is not null then
    select members.id
    into member_conflict_id
    from public.members
    where members.normalized_email = visitor_record.normalized_email
    order by members.created_at, members.id
    limit 1;

    if found then
      return query select 'duplicate_member', null::uuid, member_conflict_id, 'email';
      return;
    end if;
  end if;

  member_conflict_id := null;
  if visitor_record.normalized_phone is not null then
    select members.id
    into member_conflict_id
    from public.members
    where members.normalized_phone = visitor_record.normalized_phone
    order by members.created_at, members.id
    limit 1;

    if found then
      return query select 'duplicate_member', null::uuid, member_conflict_id, 'phone';
      return;
    end if;
  end if;

  insert into public.members (
    first_name,
    last_name,
    phone,
    email,
    life_group_id,
    qr_token
  )
  values (
    visitor_record.first_name,
    visitor_record.last_name,
    visitor_record.phone,
    visitor_record.email,
    p_life_group_id,
    p_qr_token
  )
  returning members.id into new_member_id;

  update public.visitors
  set
    status = 'converted',
    converted_member_id = new_member_id
  where visitors.id = p_visitor_id;

  return query select 'converted', new_member_id, null::uuid, null::text;
end;
$$;

comment on function public.convert_visitor_to_member(uuid, uuid, text) is
  'Narrow atomic boundary that locks an active Visitor, checks Member contacts, creates one Member, and links the preserved Visitor.';

revoke all on function public.convert_visitor_to_member(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.convert_visitor_to_member(uuid, uuid, text)
to service_role;
