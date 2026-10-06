alter table public.visitors
add column converted_at timestamp with time zone;

alter table public.visitors
add constraint visitors_active_converted_at_check
check (status <> 'active'::public.visitor_status or converted_at is null);

comment on column public.visitors.converted_at is
  'Authoritative instant when Horizon successfully converted this Visitor; historical conversions without a trustworthy timestamp remain null.';

create function public.guard_visitor_converted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'active'::public.visitor_status
    and new.status = 'converted'::public.visitor_status then
    new.converted_at := transaction_timestamp();
  elsif new.converted_at is distinct from old.converted_at then
    raise exception 'Visitor converted_at is immutable'
      using errcode = '23514',
            constraint = 'visitors_converted_at_immutable';
  end if;

  return new;
end;
$$;

comment on function public.guard_visitor_converted_at() is
  'Database-controlled conversion timestamp stamp and immutability guard for Visitor lifecycle transitions.';

revoke all on function public.guard_visitor_converted_at()
from public, anon, authenticated;

create trigger guard_visitors_converted_at
before update of status, converted_at on public.visitors
for each row
execute function public.guard_visitor_converted_at();

create or replace function public.convert_visitor_to_member(
  p_visitor_id uuid, p_expected_life_group_id uuid, p_life_group_id uuid, p_qr_token text
)
returns table (outcome text, created_member_id uuid, conflicting_member_id uuid, conflict_field text)
language plpgsql set search_path = '' as $$
declare
  visitor_record public.visitors%rowtype;
  member_conflict_id uuid;
  new_member_id uuid;
  target_life_group_id uuid;
  target_life_group_active boolean;
begin
  select * into visitor_record from public.visitors where id = p_visitor_id for update;
  if not found then return query select 'visitor_not_found', null::uuid, null::uuid, null::text; return; end if;
  if visitor_record.status <> 'active'::public.visitor_status then return query select 'visitor_not_active', null::uuid, null::uuid, null::text; return; end if;
  if exists (select 1 from public.opencell_enrollments e join public.opencell_programmes p on p.id = e.programme_id where e.visitor_id = p_visitor_id and p.status = 'active') then
    return query select 'active_opencell_enrollment', null::uuid, null::uuid, null::text; return;
  end if;
  if visitor_record.life_group_id is distinct from p_expected_life_group_id then return query select 'visitor_changed', null::uuid, null::uuid, null::text; return; end if;
  if p_expected_life_group_id is not null and p_life_group_id is not null and p_life_group_id is distinct from p_expected_life_group_id then return query select 'life_group_mismatch', null::uuid, null::uuid, null::text; return; end if;
  target_life_group_id := coalesce(p_expected_life_group_id, p_life_group_id);
  if target_life_group_id is null then return query select 'life_group_required', null::uuid, null::uuid, null::text; return; end if;
  select is_active into target_life_group_active from public.life_groups where id = target_life_group_id for share;
  if not found then return query select 'life_group_not_found', null::uuid, null::uuid, null::text; return; end if;
  if not target_life_group_active then return query select 'inactive_life_group', null::uuid, null::uuid, null::text; return; end if;
  if visitor_record.normalized_email is not null then
    select id into member_conflict_id from public.members where normalized_email = visitor_record.normalized_email order by created_at, id limit 1;
    if found then return query select 'duplicate_member', null::uuid, member_conflict_id, 'email'; return; end if;
  end if;
  if visitor_record.normalized_phone is not null then
    select id into member_conflict_id from public.members where normalized_phone = visitor_record.normalized_phone order by created_at, id limit 1;
    if found then return query select 'duplicate_member', null::uuid, member_conflict_id, 'phone'; return; end if;
  end if;
  insert into public.members(first_name,last_name,phone,email,life_group_id,qr_token) values (visitor_record.first_name,visitor_record.last_name,visitor_record.phone,visitor_record.email,target_life_group_id,p_qr_token) returning id into new_member_id;
  update public.visitors
  set status = 'converted',
      converted_member_id = new_member_id,
      converted_at = transaction_timestamp()
  where id = p_visitor_id;
  return query select 'converted', new_member_id, null::uuid, null::text;
end;
$$;

comment on function public.convert_visitor_to_member(uuid, uuid, uuid, text) is
  'Atomic Visitor conversion with active OpenCell protection and a database-authored authoritative conversion timestamp.';
