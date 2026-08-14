# Horizon Church V2

Horizon Church V2 is a new church leadership application for managing people, ministries, Life Groups, gatherings, events, attendance, visitors, follow-up, Harvest, and OpenCell. This repository starts fresh and does not reuse the architecture of the previous Laravel/Vue application.

Phase 0 established runnable application skeletons and the V2 product source of truth. Phase 1A added a reproducible local Supabase workflow and the first approved schema slice, `public.profiles`. Phase 2 added controlled email/password login, session restoration, an Express authentication boundary, `/api/me`, inactive-account enforcement, and reusable Admin/Leader role middleware. Phase 3 adds the authenticated responsive application shell, role-aware navigation, placeholder route contracts, and shared accessible UI patterns. Hosted Supabase, domain features, and deployment remain intentionally unconfigured.

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

## Frontend

Copy `frontend/.env.example` to `frontend/.env.local` and use only the local browser-safe Supabase publishable (or legacy anon) key reported by `supabase status`. Never put a service-role or secret key in a `VITE_` variable.

Authenticated Admins and Leaders share the responsive Horizon shell. Dashboard and the planned domain routes are intentionally empty placeholders until their owning feature phases; the Users route is visible and accessible only to Admins in the frontend, while all sensitive authorization remains a backend responsibility.

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

The integration test creates and deletes a random controlled local user through the supported Supabase admin API. It runs only when `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`) are present in the test process:

```bash
npm run test:integration
```

Public signup remains disabled. There is no public registration route or committed default account.

## Source of truth

- [Product specification](docs/PRODUCT_SPEC.md)
- [Locked decisions](docs/DECISIONS.md)
- [Data model](docs/DATA_MODEL.md)
- [Development checklist](docs/DEVELOPMENT_CHECKLIST.md)

Only the local Supabase foundation, `profiles` migration, authentication/RBAC foundation, and application shell are configured. Remote linking, other domain tables, Storage, Cron, and deployment begin in later explicitly approved phases.
