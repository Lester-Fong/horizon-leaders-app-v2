-- Append-only log of staff account changes made through the Users workflow.
-- Actor and target are stored as plain UUIDs with name snapshots instead of
-- foreign keys: a foreign key to public.profiles would count as "history" in
-- profile_has_references and permanently block deleting any audited user, and
-- the log must outlive deleted accounts.
create table public.user_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null check (
    action in (
      'user_created',
      'user_updated',
      'user_deactivated',
      'user_reactivated',
      'password_reset',
      'password_changed',
      'user_deleted'
    )
  ),
  actor_profile_id uuid not null,
  actor_name text not null check (btrim(actor_name) <> ''),
  target_user_id uuid not null,
  target_name text not null check (btrim(target_name) <> ''),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.user_audit_events is
  'Append-only Admin/User account activity log (DEC-073). Written only by Express.';

create index user_audit_events_target_created_idx
  on public.user_audit_events (target_user_id, created_at desc);
create index user_audit_events_actor_created_idx
  on public.user_audit_events (actor_profile_id, created_at desc);

alter table public.user_audit_events enable row level security;

revoke all on table public.user_audit_events from public, anon, authenticated;
grant select, insert on table public.user_audit_events to service_role;
