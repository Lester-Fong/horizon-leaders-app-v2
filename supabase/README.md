# Supabase local operations

The root `README.md` is the primary setup and recovery runbook. This directory contains the reproducible local platform definition:

- `config.toml` — local Supabase services and ports
- `migrations/` — ordered schema, function, Storage, and Cron changes
- `tests/database/` — transactional pgTAP coverage

The root package pins Supabase CLI `2.114.0`. Use the root scripts rather than an unrelated global CLI:

```bash
npm run supabase -- --version
npm run supabase:start
npm run supabase -- status
npm run supabase:reset
npm run supabase:test
npm run supabase:types
npm run supabase:stop
```

Docker must be running. `supabase:reset` destroys only the disposable local database and replays the complete migration chain. SQL seeding is disabled; the guarded demo tooling is `npm run demo:seed` or the destructive local-only `npm run demo:reset`.

## Migration policy

Use migration-first development. Do not edit previously released migrations to add later behavior. Add a timestamped forward migration, verify both `migration up` and a clean local reset when appropriate, run pgTAP, regenerate database types, and inspect the diff.

Never add `--linked`, run a remote push, or use hosted credentials without explicit deployment authorization.

## Security and services

- Public signup and anonymous sign-in are disabled.
- Domain tables/functions and the private `horizon-uploads` bucket expose no direct `anon`/`authenticated` CRUD policies.
- Express uses the backend-only service role after authentication and domain authorization.
- Storage is enabled locally for private Member/Life Group/Event images.
- `pg_cron` schedules Sunday reconciliation at `0 19 * * *` UTC.
- Realtime, Studio, local SMTP, Edge Runtime, and Analytics remain disabled in the local configuration because Horizon does not require them.

Credentials printed by the local CLI are development-only. Never commit them or copy service-role/secret values into frontend variables.
