drop function public.convert_visitor_to_member(uuid, uuid, text);

create function public.convert_visitor_to_member(
  p_visitor_id uuid,
  p_expected_life_group_id uuid,
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
  target_life_group_id uuid;
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

  if visitor_record.life_group_id is distinct from p_expected_life_group_id then
    return query select 'visitor_changed', null::uuid, null::uuid, null::text;
    return;
  end if;

  if p_expected_life_group_id is not null
    and p_life_group_id is not null
    and p_life_group_id is distinct from p_expected_life_group_id then
    return query select 'life_group_mismatch', null::uuid, null::uuid, null::text;
    return;
  end if;

  target_life_group_id := coalesce(p_expected_life_group_id, p_life_group_id);

  if target_life_group_id is null then
    return query select 'life_group_required', null::uuid, null::uuid, null::text;
    return;
  end if;

  select life_groups.is_active
  into target_life_group_active
  from public.life_groups
  where life_groups.id = target_life_group_id
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
    target_life_group_id,
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

comment on function public.convert_visitor_to_member(uuid, uuid, uuid, text) is
  'Atomic Visitor conversion that rejects stale affiliation, inherits current Visitor Life Group, or uses an authorized active group when unassigned.';

revoke all on function public.convert_visitor_to_member(uuid, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.convert_visitor_to_member(uuid, uuid, uuid, text)
to service_role;
