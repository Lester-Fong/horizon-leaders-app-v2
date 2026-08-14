# Horizon Church V2 Development Checklist

## Checklist policy

This is a fresh V2 checklist. V1 behavior does not count as V2 completion.

- Mark an item `[x]` only after the implementation exists in this repository and its stated verification passes.
- Do not pre-check an item because a former application implemented something similar.
- Resolve relevant OPEN decisions in `docs/DECISIONS.md` before implementing behavior that depends on them.
- Keep changes within the active phase. Do not begin a later phase merely because its design appears obvious.
- Update source-of-truth documentation whenever an approved decision changes.

All items start unchecked for Phase 0 reconciliation. The Phase 0 implementer must mark only items it has actually inspected or verified.

## Phase 0 — Foundation and source of truth

### Repository baseline

- [x] **FND-001** Confirm the current branch and record it in the Phase 0 report.
- [x] **FND-002** Run `git status --short` before changes and preserve every pre-existing file/change.
- [x] **FND-003** Inspect all existing repository files and report whether the repository was actually empty.
- [x] **FND-004** Create the top-level `frontend/`, `backend/`, `supabase/`, and `docs/` structure without unnecessary infrastructure.

### Frontend foundation

- [x] **FND-005** Create a minimal Vite React TypeScript application in `frontend/`.
- [x] **FND-006** Configure Tailwind CSS without adding an application shell or speculative design system.
- [x] **FND-007** Remove Vite demo content and render only a minimal Horizon Church V2 verification page.
- [x] **FND-008** Provide working frontend `dev`, `build`, and `lint` scripts.
- [x] **FND-009** Install frontend dependencies successfully.
- [x] **FND-010** Run the frontend lint command successfully.
- [x] **FND-011** Run the frontend production build successfully.
- [x] **FND-012** Verify the frontend development server starts and serves the minimal page.

### Backend foundation

- [x] **FND-013** Create a minimal Express 5 TypeScript application in `backend/`.
- [x] **FND-014** Separate Express app creation from server startup.
- [x] **FND-015** Implement only `GET /api/health` with an uncomplicated JSON health response.
- [x] **FND-016** Add a safe backend `.env.example` and use environment variables for runtime configuration.
- [x] **FND-017** Provide working backend `dev`, `build`, `start`, `test`, and `lint` scripts.
- [x] **FND-018** Add a minimal automated health-endpoint test if practical with the selected lightweight test setup.
- [x] **FND-019** Install backend dependencies successfully.
- [x] **FND-020** Run the backend lint command successfully.
- [x] **FND-021** Run the backend test command successfully.
- [x] **FND-022** Run the backend TypeScript production build successfully.
- [x] **FND-023** Verify the backend starts and `GET /api/health` returns the expected health response.

### Repository conventions and documentation

- [x] **FND-024** Leave `supabase/` as a documented placeholder; do not configure a project, migration, or schema.
- [x] **FND-025** Create authoritative `PRODUCT_SPEC.md`, `DECISIONS.md`, `DATA_MODEL.md`, and `DEVELOPMENT_CHECKLIST.md` documents.
- [x] **FND-026** Create a concise root README with purpose, stack, structure, prerequisites, commands, and source-of-truth links.
- [x] **FND-027** Configure `.gitignore` so secret-bearing `.env` files are ignored and `.env.example` files remain trackable.
- [x] **FND-028** Verify no secret values or generated dependency/build artifacts are included.
- [x] **FND-029** Run `git diff --check` successfully.
- [x] **FND-030** Run final `git status --short` and include it in the Phase 0 report.
- [x] **FND-031** Report created files, added dependencies, exact selected versions, verification commands/outcomes, warnings, and unresolved decisions.
- [x] **FND-032** Stop after Phase 0 without configuring Supabase, implementing domain features, deploying, committing, or pushing.

## Phase 1 — Supabase and database foundation

- [ ] **DB-001** Resolve all OPEN decisions that affect the first approved schema slice.
- [ ] **DB-002** Create/connect the intended Supabase project and document local/environment setup without committing secrets.
- [ ] **DB-003** Establish a repeatable Supabase CLI and migration workflow.
- [ ] **DB-004** Establish physical-schema conventions and an incremental review/approval process; do not preserve legacy tables merely for compatibility.
- [ ] **DB-005** Implement only the first approved foundation schema slice needed by the next application phase.
- [ ] **DB-006** Define indexes, constraints, transaction boundaries, and archive behavior for that approved slice.
- [ ] **DB-007** Define and test RLS/database policies for that approved slice while keeping privileged service credentials server-only.
- [ ] **DB-008** Verify the approved migrations from an empty database and document rollback/recovery expectations.
- [ ] **DB-009** Keep later domain tables in their owning feature phases rather than creating the complete conceptual model up front.

## Phase 2 — Authentication and Admin/Leader RBAC

- [ ] **AUTH-001** Resolve and document the Admin/Leader permission matrix.
- [ ] **AUTH-002** Implement Supabase email/password authentication and session handling in the frontend.
- [ ] **AUTH-003** Verify Supabase access tokens in Express.
- [ ] **AUTH-004** Load the Horizon Profile and reject inactive/unauthorized users.
- [ ] **AUTH-005** Enforce approved Admin/Leader permissions on the server, including Admin-only Member Life Group assignment.
- [ ] **AUTH-006** Ensure authentication secrets and privileged Supabase credentials never reach the browser.
- [ ] **AUTH-007** Add authentication, authorization, inactive-user, and failure-path tests.

## Phase 3 — Application shell and design system

- [ ] **UI-001** Define the minimal responsive layout, navigation, and routing structure.
- [ ] **UI-002** Add accessible shared typography, color, spacing, form, table, empty, loading, and error patterns.
- [ ] **UI-003** Show navigation and actions according to the approved role matrix.
- [ ] **UI-004** Add not-found, unauthorized, and unexpected-error experiences.
- [ ] **UI-005** Verify keyboard use, focus behavior, labels, contrast, and responsive layouts.

## Phase 4 — Members and Ministries

- [ ] **MEM-001** Resolve Ministry fields, cardinality, leadership, lifecycle, and permissions.
- [ ] **MEM-002** Add the approved Member, Ministry, and relationship schema through reviewed migrations.
- [ ] **MEM-003** Implement approved Member list, search/filter, detail, create, and edit behavior.
- [ ] **MEM-004** Implement the approved Ministry management behavior.
- [ ] **MEM-005** Implement approved Member-to-Ministry relationships.
- [ ] **MEM-006** Add server-side validation, authorization, duplicate safeguards, and error handling.
- [ ] **MEM-007** Add API, domain, and critical UI tests for Members and Ministries.

## Phase 5 — Life Groups and Gatherings

- [ ] **LG-001** Resolve Life Group fields, lifecycle, and Leader relationship.
- [ ] **LG-002** Add approved Life Group, current-assignment, Gathering, and Gathering-attendance schema through reviewed migrations.
- [ ] **LG-003** Implement Life Group management according to approved permissions.
- [ ] **LG-004** Implement Admin-controlled current Member assignment with at most one Life Group per Member.
- [ ] **LG-005** Verify moving/removing a Member changes current state without creating membership history.
- [ ] **LG-006** Implement Gatherings under Life Groups, not as Events.
- [ ] **LG-007** Record Gathering Life Group, date, location, topic/title, description/minutes/notes, creator, and Member presence.
- [ ] **LG-008** Verify Gathering absence never creates Follow Up.
- [ ] **LG-009** Add API, domain, and critical UI tests for Life Groups and Gatherings.

## Phase 6 — Visitors and Visitor-to-Member conversion

- [ ] **VIS-001** Resolve Visitor fields, active-list semantics, and duplicate-Member matching/operator rules.
- [ ] **VIS-002** Add the approved Visitor and one-way conversion relationship schema through reviewed migrations.
- [ ] **VIS-003** Implement approved Visitor list, search/filter, detail, create, and edit behavior.
- [ ] **VIS-004** Implement transactional one-way conversion that creates a Member, preserves and marks the Visitor `converted`, and links both records.
- [ ] **VIS-005** Exclude converted Visitors from the normal active Visitor list while keeping them accessible for history.
- [ ] **VIS-006** Preserve historical Harvest, OpenCell, and Follow Up Visitor references after conversion.
- [ ] **VIS-007** Ensure future member activity references the new Member.
- [ ] **VIS-008** Prevent conversion until duplicate-Member checks complete; never silently merge.
- [ ] **VIS-009** Add concurrency, rollback, duplicate, authorization, and history-preservation tests.

## Phase 7 — Sunday Service Events and attendance

- [ ] **SUN-001** Resolve Sunday visitor registration and Sunday absence eligibility/correction OPEN decisions.
- [ ] **SUN-002** Add approved Event and Sunday-attendance schema through reviewed migrations using only the locked Event classifications and lifecycle.
- [ ] **SUN-003** Implement Sunday Service Events using the `service` type and `open`/`closed` lifecycle.
- [ ] **SUN-004** Implement manual Member presence check-in.
- [ ] **SUN-005** Implement secure QR Member check-in without exposing privileged credentials.
- [ ] **SUN-006** Represent attendance as presence only, with no time-in/out and no excused state.
- [ ] **SUN-007** Derive absence from missing presence for an eligible Sunday Service.
- [ ] **SUN-008** Implement approved Sunday visitor registration only if OPEN-004 is resolved into MVP scope.
- [ ] **SUN-009** Add duplicate-check-in, correction, authorization, lifecycle, and critical UI tests.

## Phase 8 — Follow Up

- [ ] **FU-001** Resolve physical subject references, stable identifiers for non-Sunday reasons, repeated-trigger handling, and manual/other reason scope.
- [ ] **FU-002** Add approved Follow Up schema through reviewed migrations, including enforcement of one active record per person plus reason.
- [ ] **FU-003** Implement the shared active Follow Up list for Leaders.
- [ ] **FU-004** Support Member and Visitor subjects without conflating their histories.
- [ ] **FU-005** Enforce one active Follow Up per person plus reason while allowing different active reasons.
- [ ] **FU-006** Implement completion with optional note, completing user, and completion time.
- [ ] **FU-007** Remove completed records from the default active view and retain them in shared History.
- [ ] **FU-008** Display the exact approved UI labels for Sunday, OpenCell, and Harvest reasons.
- [ ] **FU-009** Allow a future independent same-reason trigger after prior completion.
- [ ] **FU-010** Add concurrency, deduplication, completion, authorization, and history tests.

## Phase 9 — Harvest

- [ ] **HAR-001** Resolve public registration scope and the physical Harvest participation model.
- [ ] **HAR-002** Add approved Harvest participation/registration schema through reviewed migrations.
- [ ] **HAR-003** Implement Harvest using the Harvest Event type and `open`/`closed` lifecycle.
- [ ] **HAR-004** Implement staff Visitor registration without requiring generic Member QR attendance.
- [ ] **HAR-005** Implement public registration only if explicitly approved.
- [ ] **HAR-006** Implement the later explicit Sunday Service interest decision by a Leader.
- [ ] **HAR-007** Create a deduplicated Follow Up with exact label `Interested in Sunday Service` only for positive interest.
- [ ] **HAR-008** Verify attendance/registration alone creates no Follow Up.
- [ ] **HAR-009** Add interest, no-interest, deduplication, conversion-history, authorization, and UI tests.

## Phase 10 — OpenCell

- [ ] **OC-001** Resolve Programme/session fields, lifecycle, participation denominator/rounding, cancellation, enrollment, and mid-program conversion behavior.
- [ ] **OC-002** Add approved OpenCell Programme, Session, participant, and attendance schema through reviewed migrations.
- [ ] **OC-003** Implement OpenCell as a standalone Programme module, never as an Event subtype.
- [ ] **OC-004** Implement Sessions belonging to a Programme.
- [ ] **OC-005** Implement Visitor participation and Session presence.
- [ ] **OC-006** Preserve historical Visitor participation after conversion.
- [ ] **OC-007** Expose an explicit, authorized Programme finish operation suitable for later automation.
- [ ] **OC-008** Add Programme, Session, attendance, conversion-history, authorization, and UI tests.

## Phase 11 — Scheduling and automation

- [ ] **AUTO-001** Resolve exact job schedules, idempotency, retry, missed-job, correction, and observability rules.
- [ ] **AUTO-002** Define clearly named configuration/constants with defaults of 5 Sunday absences and 75% OpenCell participation.
- [ ] **AUTO-003** Implement Sunday streak evaluation using `Asia/Manila` and approved eligibility rules.
- [ ] **AUTO-004** Reset the Sunday streak on presence and create no Follow Up for one absence alone.
- [ ] **AUTO-005** Create a deduplicated Follow Up at the configured consecutive-absence threshold with identifier `consecutive_sunday_absence` and exact UI label.
- [ ] **AUTO-006** Evaluate OpenCell participation when the relevant Programme finishes.
- [ ] **AUTO-007** Create a deduplicated qualifying OpenCell Follow Up with exact label `Attended most OpenCell sessions` and attendance count/percentage context.
- [ ] **AUTO-008** Verify Life Group and Other Event absence never creates automatic Follow Up.
- [ ] **AUTO-009** Configure Supabase Cron only if the approved design requires it.
- [ ] **AUTO-010** Add boundary, time-zone, retry, idempotency, correction, and duplicate-trigger tests.

## Phase 12 — Dashboard

- [ ] **DASH-001** Approve Dashboard metrics, filters, time windows, role visibility, and drill-down behavior.
- [ ] **DASH-002** Implement Dashboard data contracts from authoritative module data.
- [ ] **DASH-003** Implement accessible loading, empty, error, and populated states.
- [ ] **DASH-004** Verify metrics against source records and authorized visibility.
- [ ] **DASH-005** Add query/performance and critical UI tests.

## Phase 13 — Uploads

- [ ] **UP-001** Approve upload purposes, types, size limits, ownership, access, retention, and deletion rules.
- [ ] **UP-002** Configure Supabase Storage buckets and policies from the approved design.
- [ ] **UP-003** Implement server-authorized upload and retrieval flows.
- [ ] **UP-004** Validate files and handle rejected, interrupted, duplicate, and deleted uploads safely.
- [ ] **UP-005** Verify privileged credentials and private files are not exposed.
- [ ] **UP-006** Add authorization, validation, failure-path, and critical UI tests.

## Phase 14 — Testing and polish

- [ ] **QA-001** Review every locked decision against implementation and automated coverage.
- [ ] **QA-002** Complete unit/integration coverage for domain invariants and failure paths.
- [ ] **QA-003** Complete end-to-end coverage for critical Admin and Leader journeys.
- [ ] **QA-004** Test concurrency-sensitive conversion, check-in, and Follow Up deduplication.
- [ ] **QA-005** Complete accessibility, responsive, cross-browser, and usability checks.
- [ ] **QA-006** Review security boundaries, validation, authorization, RLS, secrets, and dependency risks.
- [ ] **QA-007** Review performance for lists, attendance, automation, Dashboard, and uploads.
- [ ] **QA-008** Finalize operational documentation, recovery steps, and known limitations.

## Phase 15 — Free-tier-friendly deployment

- [ ] **DEP-001** Select and document approved frontend and backend hosting targets and free-tier constraints.
- [ ] **DEP-002** Configure independently deployable frontend and backend builds.
- [ ] **DEP-003** Configure production Supabase, environment values, secrets, CORS, and allowed origins safely.
- [ ] **DEP-004** Apply approved migrations and Storage/Cron configuration through repeatable workflows.
- [ ] **DEP-005** Add health checks, logging, monitoring, and practical failure alerts within chosen tier limits.
- [ ] **DEP-006** Verify production authentication, authorization, core workflows, automation, uploads, and time-zone behavior.
- [ ] **DEP-007** Document release, rollback, backup/recovery, and incident procedures.
- [ ] **DEP-008** Complete a final smoke test and record the deployed versions without committing secrets.
