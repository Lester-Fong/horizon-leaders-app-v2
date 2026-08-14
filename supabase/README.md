# Supabase local development

Phase 1A establishes a migration-first local Supabase workflow and the first approved Horizon schema slice. It does not create or link a hosted Supabase project.

## CLI method

Supabase CLI `2.114.0` is pinned exactly in the root `package.json`. Install root dependencies with `npm install`, then use the root npm scripts. This resolves the repository-pinned CLI rather than an unknown global installation.

```bash
npm run supabase -- --version
npm run supabase:start
npm run supabase:reset
npm run supabase:test
npm run supabase:types
npm run supabase:stop
```

Equivalent one-off CLI commands may be run with `npx supabase <command>` after root dependencies are installed. See the official [Supabase CLI guide](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Version-controlled files

- `config.toml` — local-only service configuration; it contains no production credentials
- `migrations/20260814150026_create_profiles.sql` — the first approved schema migration
- `tests/database/profiles.test.sql` — transactional pgTAP coverage for schema and security invariants
- `.gitignore` — excludes Supabase CLI temporary/branch state and local environment keys

No seed file exists because this slice does not require persistent development data.

## Daily workflow

Docker must be running before starting Supabase.

1. Run `npm run supabase:start`.
2. After changing migrations, run `npm run supabase:reset` to destroy and recreate the disposable local database from the full migration chain.
3. Run `npm run supabase:test` to verify database behavior.
4. Run `npm run supabase:types` to regenerate `backend/src/types/database.types.ts` from the applied local schema.
5. Run `npm run supabase:stop` when local services are no longer needed.

The normal `supabase db reset` command targets the local project. Never add `--linked` unless a later task explicitly creates and authorizes a disposable remote development environment.

## Profiles slice

`public.profiles` is the only Horizon application table in this phase. It has a one-to-one UUID relationship with the primary key of `auth.users` and contains only:

- `id`
- `name`
- `role`
- `is_active`
- `created_at`
- `updated_at`

`public.app_role` permits exactly `admin` and `leader`.

An Auth-user insert trigger creates the matching profile. It may copy user-controlled metadata only into the display name. It never trusts metadata for role or activation state, always defaults the role to `leader`, and therefore cannot create an `admin` through self-supplied signup metadata. Missing names fall back deterministically to the email local part and then `New user`.

Public signup is disabled by top-level `auth.enable_signup = false` in `config.toml` because Horizon intends controlled staff accounts. The email provider remains enabled so those existing controlled users can sign in with a password; the global setting still rejects registration. Phase 2 tests create random disposable users through the local admin API and remove them afterward. No production seeder or default account exists. See the official [Supabase Auth configuration guidance](https://supabase.com/docs/guides/auth/general-configuration).

## RLS baseline

RLS is enabled on `public.profiles`. This phase creates no `anon` or `authenticated` policies and explicitly revokes their direct table privileges. The table grants the `service_role` server-side access for future Express use.

Service-role or secret credentials must never appear in frontend code. Express verifies the caller's access token with Supabase Auth, then uses its backend-only service-role client to load `profiles` and enforce Horizon authorization. Any future direct browser data access requires an explicit policy migration and tests. See the official [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Deliberately deferred

The local configuration disables nonessential services for this slice, including Storage, Realtime, Studio, local SMTP, Edge Runtime, and Analytics. No Storage buckets, Cron jobs, remote link, hosted credentials, CRUD, or other Horizon domain tables are included.
