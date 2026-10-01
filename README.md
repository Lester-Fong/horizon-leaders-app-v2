# Horizon Church V2

Horizon Church V2 is a new church leadership application for managing people, ministries, Life Groups, gatherings, events, attendance, visitors, follow-up, Harvest, and OpenCell. This repository starts fresh and does not reuse the architecture of the previous Laravel/Vue application.

Phase 0 established runnable application skeletons and the V2 product source of truth. Phase 1A added a reproducible local Supabase workflow and `public.profiles`. Phase 2 added controlled authentication and reusable Admin/Leader authorization. Phase 3 added the responsive application shell. Phase 4 adds the first domain slice: `public.life_groups`, authenticated reads, Admin management, Leader assignment safeguards, and a responsive Admin/Leader screen. Members, Ministries, Gatherings, hosted Supabase, and deployment remain intentionally unconfigured.

## Stack

- Frontend: React, TypeScript, Vite, and Tailwind CSS
- Backend: Node.js, TypeScript, and Express 5
- Platform: Supabase PostgreSQL and Auth locally; Storage and Cron remain planned for later phases

## Repository structure

```text
frontend/   React application
backend/    Express API
supabase/   Local configuration, migrations, and database tests
docs/       Product, decision, data-model, and delivery documentation
```

## Prerequisites

- Node.js `20.19.x`, `22.13+`, or `24+`
- npm
- Docker Desktop or another Docker-compatible runtime for local Supabase

Use a currently supported Node.js LTS release for development and deployment.

## Supabase local development

The repository pins Supabase CLI `2.114.0` as a root development dependency. Install it and run all local commands from the repository root:

```bash
npm install
npm run supabase:start
npm run supabase:reset
npm run supabase:test
npm run supabase:types
npm run supabase:stop
```

`supabase:reset` destroys and recreates only the disposable local database from version-controlled migrations. `supabase:types` regenerates `backend/src/types/database.types.ts` from that applied local schema.

The local project is not linked to a hosted Supabase project. Public signup is disabled, and credentials printed by the local CLI are development-only and must not be committed or reused as production secrets. See [supabase/README.md](supabase/README.md) for the workflow and security baseline.

## Local demo church

With Docker/local Supabase running, root and backend dependencies installed,
and `backend/.env` configured with the local `SUPABASE_URL` and backend-only
`SUPABASE_SERVICE_ROLE_KEY`, run from the repository root:

```bash
npm run demo:seed
```

This requires an empty local database and creates 1 Admin, 7 Leaders, 7 Life
Groups, 46 Members (44 active), 18 Visitors (2 converted), 5 Ministries,
28 Gatherings, 14 Sunday Services, 2 Harvest Events, and 3 OpenCell Programmes.
Follow Ups are generated through the real workflows; the command verifies the
dataset and prints the final counts.

| Local demo login | Password |
| --- | --- |
| `admin@example.test` | `Admin123!Aa` |
| `leader1@example.test` through `leader7@example.test` | `Leader123!Aa` |

For a repeatable fresh dataset:

```bash
npm run demo:reset
```

**Reset destroys all data in this project's disposable local database.** It
runs the existing pinned `supabase:reset` command before seeding. `demo:seed`
never deletes existing data; it refuses non-empty or partially seeded databases
and directs you to the explicit reset command. Do not run concurrent seed/reset
commands.

Both commands reject remote/unknown Supabase URLs before connecting or resetting.
Only HTTP loopback endpoints on the configured local API port `54321` are
accepted. Demo passwords/records are development fixtures, never production
defaults. Privileged keys come only from backend environment configuration.

The modules under `backend/src/demo/` use the real conversion, Sunday closing
and absence evaluation, Harvest interest, OpenCell finish, and Follow Up
completion services. Relative dates use Asia/Manila. Base Member timestamps are
backdated before recording historical attendance so close-time eligibility is
authentic; snapshots, absence state, QR tokens, and generated Follow Ups are not
fabricated. The demo includes archived history, varied demographics, late
OpenCell enrollment, cancelled Sessions, and converted Visitor history.

On January dates, the This Year chart naturally contains only qualifying Sundays
already elapsed in that year; Last 4/8/12 retains the cross-year history.
Targeted seeder tests: `npm --prefix backend test -- src/demo/demo.test.ts`.

## Browser end-to-end tests

QA-003 uses Playwright with the installed Microsoft Edge Chromium channel. With
Docker running and the local frontend/backend environment files configured, run
the deterministic seeded suite from the repository root:

```bash
npm run test:e2e:seeded
```

This command intentionally resets only the guarded loopback Supabase project,
seeds the local demo church, starts the frontend/backend test servers, and runs
the critical Admin and Leader browser journeys. To rerun against the current
already-seeded local database without another reset, use `npm run test:e2e`.

QA-005 adds automated accessibility/responsive checks plus Edge, Firefox, and
WebKit browser coverage:

```bash
npm run test:e2e:qa005
```

Sunday QR camera access is requested only after `Start camera`. Production use
requires HTTPS; localhost is suitable for development. The connected-scanner
input and manual attendance remain available when camera access is denied or no
camera exists.

Manual phone/tablet camera check after starting the local app (or an HTTPS test
deployment):

1. Sign in, open an open Sunday Service, then open `QR check-in`.
2. Choose `Camera`, press `Start camera`, and grant permission; confirm the rear
   camera is selected where the device supports it.
3. Scan a downloaded Member QR and confirm the Member success message and
   attendance refresh without closing the scanner.
4. Keep the same code in frame to confirm requests are not spammed, then scan it
   again after a pause to confirm the normal `already present` response.
5. Scan another authorized Member, then try an unknown or out-of-scope QR and
   confirm safe feedback without identity disclosure.
6. Press `Stop camera`, close the dialog, and navigate away; confirm the device
   camera indicator turns off each time.
7. Deny permission once and confirm `Scanner input` still accepts a connected
   USB/Bluetooth scanner with Enter submission.

## Frontend

Copy `frontend/.env.example` to `frontend/.env.local` and use only the local browser-safe Supabase publishable (or legacy anon) key reported by `supabase status`. Never put a service-role or secret key in a `VITE_` variable.

Authenticated Admins and Leaders share the responsive Horizon shell. Life Groups is implemented at `/life-groups`: Admins can create, edit, archive/reactivate, and reassign groups, while Leaders have a read-only active-group view. The other planned domain routes remain intentional placeholders. Users remains visible and accessible only to Admins in the frontend, while all sensitive authorization remains a backend responsibility.

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run build
```

## Backend

Copy `backend/.env.example` to `backend/.env` and supply the local Supabase URL and backend-only service-role key reported by `supabase status`. Never commit the resulting `.env` file or copy its privileged values into frontend configuration.

```bash
cd backend
npm install
npm run dev
npm run lint
npm test
npm run build
npm start
```

The API health check is available at `GET /api/health`. `GET /api/me` requires `Authorization: Bearer <access-token>` and returns only the trusted active Horizon actor loaded from `public.profiles`.

Life Group endpoints are authenticated. `GET /api/life-groups` and `GET /api/life-groups/:id` serve approved role-aware reads. Admin-only operations are `GET /api/life-groups/leaders`, `POST /api/life-groups`, `PATCH /api/life-groups/:id`, and `PATCH /api/life-groups/:id/status`. Normal product behavior has no Life Group DELETE endpoint.

The integration tests create and delete disposable controlled local users and Life Groups through supported Supabase APIs. Authentication integration additionally requires `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`); Life Group integration requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`:

```bash
npm run test:integration
```

Public signup remains disabled. There is no public registration route or committed default account.

## Source of truth

- [Product specification](docs/PRODUCT_SPEC.md)
- [Locked decisions](docs/DECISIONS.md)
- [Data model](docs/DATA_MODEL.md)
- [Development checklist](docs/DEVELOPMENT_CHECKLIST.md)

Only the local Supabase foundation, `profiles` and `life_groups` migrations, authentication/RBAC foundation, application shell, and Life Group foundation are configured. Remote linking, Member/Ministry/Gathering schema, other domain tables, Storage, Cron, and deployment begin in later explicitly approved phases.
