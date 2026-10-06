# Horizon Church V2

Horizon Church V2 is an authenticated church operations application built with React, Express, and Supabase. The implemented MVP covers Admin/Leader authorization, Life Groups, Members, Ministries, Gatherings, Visitors and conversion, Sunday Services, Harvest, Follow Up, OpenCell, automation, Dashboard reporting, permanent Member QR attendance, and private domain images.

This README is the tracked local-development and operations runbook. Product decisions remain in the intentionally local/ignored `docs/` directory when that directory is present in the working copy.

## Prerequisites

- Node.js `20.19.x`, `22.13+`, or `24+` (`24.15.0` is the verified development version)
- npm (`11.12.1` is verified)
- Docker Desktop or another Docker-compatible runtime
- Root dependencies, which provide the repository-pinned Supabase CLI `2.114.0`
- Microsoft Edge for the default Playwright project; Firefox/WebKit binaries for the QA-005 matrix

Do not use production credentials for local development or tests.

## Clean local setup

Run commands from the repository root unless a section says otherwise.

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
npm run supabase:start
npm run supabase:reset
npm run supabase -- status -o env
```

`supabase:reset` is destructive to this repository's disposable local database. It replays every migration and does not seed demo records.

Copy the environment templates:

```text
backend/.env.example  -> backend/.env
frontend/.env.example -> frontend/.env.local
```

Use only values printed by the local `supabase status -o env` command. Then keep two terminals running:

```bash
npm --prefix backend run dev
```

```bash
npm --prefix frontend run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. The backend health endpoint is `http://127.0.0.1:3000/api/health`.

Stop local Supabase when finished:

```bash
npm run supabase:stop
```

## Environment variables

### Frontend-safe variables

These are required by Vite and are compiled into browser code:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Express origin, normally `http://127.0.0.1:3000` |
| `VITE_SUPABASE_URL` | Local Supabase API URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe local publishable key |
| `VITE_SUPABASE_ANON_KEY` | Legacy alternative when no publishable key is available |

Configure exactly one of the two public-key variables. Never place a service-role key, secret key, database password, or JWT secret in any `VITE_` variable.

### Backend-only variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Privileged server-only domain access |
| `NODE_ENV` | No | Defaults to `development` |
| `PORT` | No | Defaults to `3000` |
| `FRONTEND_ORIGIN` | No | CORS origin; defaults to `http://127.0.0.1:5173` |

The service-role value belongs only in `backend/.env` or a secure deployment secret store. It must never appear in frontend files, API responses, logs, screenshots, or committed configuration.

### Test-only variables

- Integration tests use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Auth integration additionally uses `SUPABASE_PUBLISHABLE_KEY` or legacy `SUPABASE_ANON_KEY`.
- Playwright optionally accepts `E2E_FRONTEND_URL` and `E2E_BACKEND_URL`; defaults are the normal local origins.

If `E2E_FRONTEND_URL` is overridden, `FRONTEND_ORIGIN` must use the same exact scheme, host, and port so Express CORS remains intentional.

There are no V2 AES variables. Upload bucket/limits, signed-URL lifetime, church timezone, Sunday threshold, and OpenCell threshold are named code/database constants rather than environment inputs.

## Database and migrations

Migrations live under `supabase/migrations/` and are applied in filename order. Previously released migrations are immutable: make schema or function changes with a new forward migration rather than editing history.

Normal local verification:

```bash
npm run supabase:reset
npm run supabase:test
npm run supabase:types
git diff --check
```

For a non-destructive forward application to the running local database:

```bash
npm run supabase -- migration up
```

After schema/function changes, regenerate `backend/src/types/database.types.ts` with `supabase:types` and review its diff. Important recent migrations include:

- `20260904100000_sunday_automation.sql`
- `20260916100000_create_private_domain_uploads.sql`
- `20261005100000_add_dashboard_performance_aggregates.sql`

Never use `--linked`, `db push`, or remote credentials unless a later deployment task explicitly authorizes the target.

## Local demo data

With local Supabase running and `backend/.env` configured:

```bash
npm run demo:seed
```

The seed command is local-only, refuses unknown/non-loopback Supabase URLs, and refuses a non-empty or partially seeded database. It creates known development-only Admin and Leader accounts and interconnected records through real domain workflows.

| Demo account | Development-only password |
| --- | --- |
| `admin@example.test` | `Admin123!Aa` |
| `leader1@example.test` through `leader7@example.test` | `Leader123!Aa` |

To explicitly destroy and rebuild only disposable local demo data:

```bash
npm run demo:reset
```

Do not point either command at arbitrary developer, shared, hosted, or production data. Do not run seed/reset concurrently.

## Sunday automation operations

- Closing a counting Sunday Service evaluates absence synchronously.
- Admin closed-attendance/counting corrections synchronize affected evaluations.
- Supabase Cron runs `public.reconcile_sunday_services()` daily at `0 19 * * *` UTC, which is 03:00 in `Asia/Manila`.
- Reconciliation processes oldest pending closed counting Services that lack a successful `sunday_service_evaluations` row.
- One Service failure is recorded and does not prevent later pending Services from being attempted.
- `automation_runs` records run status, counts, timestamps, and bounded error summaries.
- `sunday_absence_threshold_occurrences` preserves immutable threshold crossings for idempotency.

Inspect `automation_runs`, `sunday_service_evaluations`, and `sunday_absence_threshold_occurrences` with an authorized PostgreSQL client when diagnosing automation. Do not hand-edit attendance, occurrence, evaluation, or Follow Up rows to force an outcome. Correct the authoritative Service attendance/counting state through the application and allow synchronous evaluation or reconciliation to recover it.

## Private image operations

The private `horizon-uploads` bucket supports only Member photos, Life Group logos, and implemented Event images. Express authorizes the owning record and returns short-lived signed URLs (15 minutes). The browser never receives privileged Storage credentials.

- Input is limited to 5 MB and validated as JPEG, PNG, or WebP content.
- The server applies orientation, strips metadata, bounds dimensions to 1600x1600, and stores WebP.
- Replacement uploads the new object and updates the database before deleting the old object.
- Removal clears the database pointer before best-effort object deletion.
- Archive/close operations retain images.

Recovery behavior:

- Failed validation, processing, or upload leaves the old image authoritative.
- A database update failure triggers best-effort cleanup of the newly uploaded orphan.
- Failed obsolete-object cleanup leaves the new pointer authoritative; remove the confirmed orphan later with privileged tooling.
- A missing referenced object degrades to the normal placeholder; repair/clear the domain pointer deliberately rather than making the bucket public.
- An expired signed URL is normal—request the image again through Horizon.

## Verification matrix

| Scope | Command |
| --- | --- |
| Backend unit/full local suite | `npm --prefix backend test` |
| Backend integrations, serialized | `npm --prefix backend run test:integration` |
| Windows-safe serialized/thread regression | `npm --prefix backend test -- --pool=threads --maxWorkers=1 --no-file-parallelism` |
| All pgTAP database tests | `npm run supabase:test` |
| One pgTAP file | `npm run supabase -- test db supabase/tests/database/<name>.test.sql` |
| Frontend unit tests | `npm --prefix frontend test` |
| Current seeded browser state | `npm run test:e2e` |
| Destructive reset + seed + E2E | `npm run test:e2e:seeded` |
| Accessibility/responsive/browser matrix | `npm run test:e2e:qa005` |
| Backend lint/build | `npm --prefix backend run lint` / `npm --prefix backend run build` |
| Frontend lint/build | `npm --prefix frontend run lint` / `npm --prefix frontend run build` |
| Git whitespace | `git diff --check` |

Integration suites require local Supabase and the test variables above. `test:e2e:seeded` and `demo:reset` destroy disposable local data. On Windows, if Vitest worker IPC/fork startup is unstable, use the documented thread pool with one worker and disabled file parallelism rather than treating an IPC failure as a domain-test failure.

## Troubleshooting and recovery

### Local Supabase is unavailable

1. Confirm Docker is running.
2. Run `npm run supabase -- status`.
3. Run `npm run supabase:start`.
4. Use `npm run supabase:reset` only when the local database is disposable and a full migration replay is appropriate.

### A migration fails

Read the first failing filename/error from `supabase:reset` or `migration up`, fix the newest forward migration when appropriate, and replay locally. Do not casually rewrite an already released migration; add a corrective forward migration.

### Demo seed refuses to run

This is a safety feature: the database is non-empty, partially seeded, or not loopback-local. Use `demo:reset` only when destroying the local data is intended. Never weaken the locality/emptiness guards.

### Auth integration is skipped

Provide the local browser-safe key as `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY` in the test environment. Do not hardcode it and do not substitute the service-role key.

### Sunday automation has a pending/failed evaluation

Inspect the run/evaluation tables and the underlying Service state. Pending Services are retried by reconciliation. Avoid direct edits to derived Follow Up or occurrence history unless the full transactional impact is understood.

### Camera scanning is unavailable

Camera access requires localhost or HTTPS, an available camera, and browser permission. Permission denial, unsupported/insecure context, or absent hardware should use Scanner Input or manual attendance. Closing the dialog or navigating away must stop the camera.

### Git reports LF/CRLF conversion warnings

These warnings are informational on Windows and are not the same as a `git diff --check` whitespace failure. Review the actual diff; do not normalize unrelated files opportunistically.

## Known limitations

### Manual verification remaining

- Real phone/tablet camera behavior still needs a physical-device smoke test; automated tests cover lifecycle and failure boundaries but cannot claim hardware verification.

### Intentional MVP exclusions

- Other Event participation/attendance behavior
- Public Harvest registration
- Care Notes
- DYH modeling
- Member participation in OpenCell
- Attendance time-in/time-out, late, or excused states

### Deferred data work

- Authoritative `visitors.converted_at` is populated for new conversions. Historical null dates remain unknown, and conversion-period analytics must never infer them from `updated_at`.

### Deployment hardening

- Ingress rate limiting for sensitive mutation endpoints
- Centralized token revocation and operational logging
- Hosted environment/secrets/CORS configuration and deployment procedures
- A live dependency registry audit in an internet-enabled environment

### Future scale work

- Server pagination and large-list rendering before substantially larger datasets
- Reducing full Sunday workspace refetch payloads if roster size materially grows
- Optimizing very large historical Sunday/OpenCell evaluation workloads if measured deployment volume requires it

These are exclusions, manual checks, or scale/hardening concerns—not known failures in the current local MVP.

## Physical Sunday QR smoke test (pending)

Do not mark this passed until it is performed on real hardware.

1. Open Horizon over HTTPS on a real phone/tablet.
2. Open an open Sunday Service and choose **QR Check-in → Camera**.
3. Start the camera and confirm the rear camera is selected when supported.
4. Scan a valid Member QR displayed on another device or printout.
5. Confirm attendance succeeds.
6. Keep/re-scan the same QR and confirm cooldown plus server `already_present` behavior.
7. Scan a different authorized Member without reopening the scanner.
8. As Leader, scan an unauthorized/out-of-scope Member QR and confirm safe rejection.
9. Stop the camera and confirm the operating-system camera indicator turns off.
10. Repeat while closing the modal and while navigating away; confirm the camera stops.
11. Deny camera permission and confirm Scanner Input remains usable.
12. Confirm manual attendance remains usable.

## Modal behavior

All implemented dialogs use the shared accessible modal foundation. Read-only dialogs may close while loading. Mutation dialogs lock incidental close routes only while a mutation is actively in flight. X, Cancel/Close, backdrop, and Escape are consistent; Escape affects only the top dialog. Focus is restored to the trigger, background scroll/inert state is reference-counted for nested dialogs, and modal content scrolls internally on constrained viewports.

## Security baseline

Supabase Auth provides identity; Express loads the trusted Profile and enforces all domain authorization. Browser roles do not have direct table or Storage CRUD policies. Public signup is disabled locally. Never expose service-role credentials or treat hidden frontend controls as authorization.

DEP-001 selects Cloudflare Pages Free for the static frontend, a Render Free Web Service for initial low-traffic API deployment/testing, and the existing hosted Supabase project for PostgreSQL, Auth, private Storage, and Cron. DEP-002 makes both package directories independently buildable, adds fail-fast public/server environment validation, and supplies a minimal Render Blueprint. Nothing is deployed or remotely configured yet. See `docs/DEPLOYMENT.md` for the reproducible build contract, provider settings, current free-tier constraints, and upgrade triggers.
