# Horizon Church V2

Horizon Church V2 is a new church leadership application for managing people, ministries, Life Groups, gatherings, events, attendance, visitors, follow-up, Harvest, and OpenCell. This repository starts fresh and does not reuse the architecture of the previous Laravel/Vue application.

Phase 0 establishes runnable application skeletons and the V2 product source of truth. Supabase, authentication, business features, and deployment are intentionally not configured yet.

## Stack

- Frontend: React, TypeScript, Vite, and Tailwind CSS
- Backend: Node.js, TypeScript, and Express 5
- Planned platform: Supabase PostgreSQL, Auth, Storage, and Cron

## Repository structure

```text
frontend/   React application
backend/    Express API
supabase/   Placeholder for a future Supabase workflow
docs/       Product, decision, data-model, and delivery documentation
```

## Prerequisites

- Node.js `20.19.x`, `22.13+`, or `24+`
- npm

Use a currently supported Node.js LTS release for development and deployment.

## Frontend

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run build
```

## Backend

Copy `backend/.env.example` to `backend/.env` if local values need to differ from the safe defaults. Never commit the resulting `.env` file.

```bash
cd backend
npm install
npm run dev
npm run lint
npm test
npm run build
npm start
```

The API health check is available at `GET /api/health` while the backend is running.

## Source of truth

- [Product specification](docs/PRODUCT_SPEC.md)
- [Locked decisions](docs/DECISIONS.md)
- [Conceptual data model](docs/DATA_MODEL.md)
- [Development checklist](docs/DEVELOPMENT_CHECKLIST.md)

Supabase project setup, database migrations, authentication, and deployment begin in later phases only.
