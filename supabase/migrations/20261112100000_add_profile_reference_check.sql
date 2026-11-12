-- Reports whether any domain row still references a Profile.
-- Every foreign key to public.profiles is ON DELETE RESTRICT, so a Profile
-- (and its Auth user) can be permanently deleted only when this returns false.
-- The check reads pg_constraint, so foreign keys added by later migrations are
-- covered without changing this function.
create function public.profile_has_references(p_profile_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reference record;
  found_reference boolean;
begin
  for reference in
    select
      namespace.nspname as schema_name,
      referencing.relname as table_name,
      attribute.attname as column_name
    from pg_catalog.pg_constraint as fk
    join pg_catalog.pg_class as referencing on referencing.oid = fk.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = referencing.relnamespace
    join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = fk.conrelid
     and attribute.attnum = fk.conkey[1]
    where fk.contype = 'f'
      and fk.confrelid = 'public.profiles'::regclass
      and array_length(fk.conkey, 1) = 1
  loop
    execute format(
      'select exists (select 1 from %I.%I where %I = $1)',
      reference.schema_name,
      reference.table_name,
      reference.column_name
    )
    into found_reference
    using p_profile_id;

    if found_reference then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

comment on function public.profile_has_references(uuid) is
  'True when any foreign key to public.profiles references the given Profile.';

revoke all on function public.profile_has_references(uuid) from public, anon, authenticated;
grant execute on function public.profile_has_references(uuid) to service_role;
