# Horizon Church V2 Decision Register

## How to use this register

This file prevents future implementation sessions from reinterpreting settled Horizon V2 rules. Entries marked **LOCKED** are authoritative until an approved change replaces them. Entries marked **OPEN** describe missing decisions; they are not implicit approval for any proposed behavior.

Changing a locked decision requires updating this register, the affected source-of-truth documents, and any implementation or tests that enforce it.

## Locked decisions

### DEC-001 — V2 is a new application

**Status:** LOCKED

Horizon Church V2 starts from scratch. No application code, framework architecture, schema, or incidental behavior is copied from the former Laravel/Vue application. Old material may be used only as product reference when explicitly supplied.

### DEC-002 — One repository contains separately deployable applications

**Status:** LOCKED

The repository physically separates `frontend/`, `backend/`, `supabase/`, and `docs/`. Frontend and backend must remain independently deployable even though they share one repository.

### DEC-003 — The target technology stack is fixed

**Status:** LOCKED

The frontend uses React, TypeScript, Vite, and Tailwind CSS. The backend uses Node.js, TypeScript, and Express 5. The platform uses Supabase PostgreSQL, Auth, Storage, and later Supabase Cron where appropriate.

### DEC-004 — Supabase Auth establishes identity; Horizon authorizes application behavior

**Status:** LOCKED

Supabase Auth will manage authentication sessions. Horizon maintains application profiles and roles and enforces business authorization in the backend.

### DEC-005 — Domain behavior is centralized behind Express

**Status:** LOCKED

React generally calls the Express API for Horizon domain operations. Conversion, follow-up deduplication, attendance thresholds, and permissions must not be scattered through client-side code or implemented by exposing privileged Supabase access in the browser.

### DEC-006 — Authenticated roles are Admin and Leader

**Status:** LOCKED

The MVP authenticated roles are `admin` and `leader`. Horizon does not implement a complex permission framework in the MVP.

### DEC-007 — Tracked people are Members and Visitors

**Status:** LOCKED

Authenticated users and tracked people are separate concepts. The tracked-person types for MVP product behavior are Member and Visitor.

### DEC-008 — Care Notes are excluded from MVP

**Status:** LOCKED

Care Notes do not appear in MVP product behavior or the conceptual data model.

### DEC-009 — OpenCell is standalone

**Status:** LOCKED

OpenCell is a Programme → Sessions → Participant attendance module. It is not an Event type.

### DEC-010 — Life Group Gatherings are not Events

**Status:** LOCKED

Gatherings belong directly to a Life Group and have their own attendance. They are not represented as generic Events.

### DEC-011 — Member Life Group assignment is current-state only

**Status:** LOCKED

A Member has at most one current Life Group. Admin directly assigns, moves, or removes the Member's current assignment. The MVP has no historical Life Group membership tracking.

### DEC-012 — A Gathering has an approved minimum record shape

**Status:** LOCKED

A Life Group Gathering records its Life Group, date, location, topic/title, description/minutes/notes, Members who attended, and creator.

### DEC-013 — Gathering absence does not trigger Follow Up

**Status:** LOCKED

Absence from a Life Group Gathering never automatically creates a Follow Up under current MVP rules.

### DEC-014 — Generic Event types are limited

**Status:** LOCKED

Generic MVP Event types are Sunday Service (`service`), Harvest, and Other. Life Group and OpenCell are expressly excluded as Event types.

### DEC-015 — Events use an open/closed lifecycle

**Status:** LOCKED

The MVP Event lifecycle is the simple pair `open` and `closed`. No additional lifecycle states are approved.

### DEC-016 — Sunday attendance records presence only

**Status:** LOCKED

Sunday Service attendance is Member presence captured through QR or manual check-in. Absence is derived from a missing presence record. There is no attendance time-in/time-out and no excused attendance state.

### DEC-017 — Consecutive Sunday absence threshold defaults to five

**Status:** LOCKED

The default Follow Up trigger threshold is 5 consecutive Sunday absences. It must be represented by a clearly named application constant or configuration value.

### DEC-018 — Sunday presence resets the absence streak

**Status:** LOCKED

A Member's Sunday presence resets the consecutive absence streak. One absence alone creates no Follow Up.

### DEC-019 — The Sunday absence reason identifier and label are fixed

**Status:** LOCKED

The internal reason identifier is `consecutive_sunday_absence`. Its UI label is exactly `Consecutive Sunday absences`.

### DEC-020 — Harvest is visitor-focused

**Status:** LOCKED

Staff register Visitors for Harvest. Harvest has no generic Member QR attendance requirement.

### DEC-021 — Harvest attendance alone does not create Follow Up

**Status:** LOCKED

A Leader must later explicitly mark that a Visitor is interested in Sunday Service. Positive interest, not mere Harvest attendance, creates the Follow Up.

### DEC-022 — The Harvest interest label is fixed

**Status:** LOCKED

The Harvest-originated Follow Up UI reason is exactly `Interested in Sunday Service`.

### DEC-023 — Other Event absence has no automatic Follow Up

**Status:** LOCKED

Other Events may support ordinary attendance, but a missing attendance record does not automatically create a Follow Up.

### DEC-024 — Follow Up is pastoral contact, not task management

**Status:** LOCKED

Follow Up represents a Member or Visitor needing human/pastoral attention or private contact. It is not a generic project-management task system.

### DEC-025 — The active Follow Up list is shared

**Status:** LOCKED

All Leaders see the shared active Follow Up list rather than private assignee queues.

### DEC-026 — Active Follow Ups are deduplicated by person and reason

**Status:** LOCKED

Only one active Follow Up may exist for the same person and same reason at a time. A duplicate trigger creates no second active record. Different reasons for the same person may be active simultaneously. After completion, a future independent trigger may create another Follow Up for that person and reason.

### DEC-027 — Follow Up completion preserves history

**Status:** LOCKED

A Leader marks a Follow Up completed and may add an optional note. The system records who completed it and when. Completed records leave the default active list but remain accessible in shared Follow Up History.

### DEC-028 — OpenCell participation threshold defaults to 75 percent

**Status:** LOCKED

When the relevant OpenCell Programme finishes, a participant meeting the default 75% participation threshold creates a Follow Up, subject to deduplication. The threshold must be a clearly named application constant or configuration value.

### DEC-029 — The OpenCell Follow Up label and context are fixed

**Status:** LOCKED

The UI reason is exactly `Attended most OpenCell sessions`. The Follow Up retains enough context to display the participant's attendance count and percentage.

### DEC-030 — OpenCell participants originate as Visitors

**Status:** LOCKED

OpenCell participants are Visitors unless or until converted to Members. Historical OpenCell records keep their Visitor reference after conversion.

### DEC-031 — Visitor conversion creates a Member and preserves the Visitor

**Status:** LOCKED

Conversion creates a new Member, marks the original Visitor `converted`, and links the Visitor to that Member. Historical Harvest, OpenCell, and Follow Up records keep referencing the Visitor; future member activity references the Member.

### DEC-032 — Visitor conversion is one-way and duplicate-guarded

**Status:** LOCKED

Converted Visitors are excluded from the normal active Visitor list. Conversion cannot be reversed in the MVP, and duplicate-Member prevention must occur before conversion.

### DEC-033 — Asia/Manila is the church time zone

**Status:** LOCKED

Sunday Service scheduling and later automation are intended to operate in `Asia/Manila`.

### DEC-034 — Scheduling implementation is deferred

**Status:** LOCKED

Supabase Cron may be used where appropriate later, but no schedule, job, or automation is implemented in Phase 0.

### DEC-035 — Phase 0 has no database schema

**Status:** LOCKED

Phase 0 produces a conceptual data model only. It does not configure Supabase, initialize a remote project, create migrations, or create tables.

### DEC-036 — MVP exclusions are explicit

**Status:** LOCKED

The MVP excludes donations/finance, sermon/media streaming, push notifications, a member self-service portal, a complex permission framework, historical Life Group membership tracking, attendance time-in/time-out, and excused attendance, in addition to Care Notes covered by DEC-008.

## Open decisions

### OPEN-001 — Admin and Leader permission matrix

**Status:** OPEN

Admin control of Member Life Group assignment is locked, but create/read/update/archive permissions for the remaining modules and whether Admin participates in every Leader-visible workflow have not been specified.

### OPEN-002 — User profile relationship to tracked people and Life Groups

**Status:** OPEN

Whether an authenticated profile may link to a Member or Visitor, and whether a Leader belongs to or leads one or more Life Groups, has not been approved.

### OPEN-003 — Ministry model

**Status:** OPEN

Ministry fields, member cardinality, leadership, status/archive behavior, and permission rules are unspecified.

### OPEN-004 — Sunday visitor registration

**Status:** OPEN

Sunday visitor registration can be supported, but its inclusion in the MVP, required fields, duplicate handling, and relationship to an existing Visitor are not decided.

### OPEN-005 — Harvest public registration

**Status:** OPEN

Public Harvest registration may be supported, but its MVP inclusion, identity matching, moderation, and confirmation flow are not decided.

### OPEN-006 — Other Event attendance

**Status:** OPEN

Other Events may support normal attendance, but whether attendance is enabled per event and whether it can include Members, Visitors, or both are not decided.

### OPEN-007 — Visitor duplicate prevention

**Status:** OPEN

The matching fields, confidence rules, operator choices, and behavior when a possible Member duplicate exists before conversion are not decided. Silent merging is not approved.

### OPEN-008 — Sunday absence eligibility and correction behavior

**Status:** OPEN

The rules for when a Member begins accruing absences, which Service records qualify, cancelled Services, late attendance edits, retroactive Member changes, and recalculation are not decided.

### OPEN-009 — OpenCell participation edge cases

**Status:** OPEN

The attendance denominator, rounding, cancelled or added sessions, participant enrollment timing, and conversion during an active Programme are not decided.

### OPEN-010 — Existing Follow Up behavior on a repeated trigger

**Status:** OPEN

Deduplication prevents a second active record, but whether a repeated trigger updates context, records an occurrence, or makes no change beyond suppression is not decided.

### OPEN-011 — Manual or other Follow Up reason

**Status:** OPEN

A manual/other reason is allowed as a possible future/simple extension, but its inclusion in MVP and any fields or permissions are not approved.

### OPEN-012 — Dashboard content

**Status:** OPEN

Metrics, filters, date ranges, role visibility, refresh behavior, and drill-down destinations are not decided.

### OPEN-013 — Upload behavior

**Status:** OPEN

Allowed purposes, file types and sizes, access policies, retention, deletion, ownership, and entity attachments are not decided.

### OPEN-014 — Automation mechanics

**Status:** OPEN

The exact Supabase Cron schedule, job ownership, idempotency strategy, retries, alerting, and treatment of missed jobs are deferred.

### OPEN-015 — Physical database design

**Status:** OPEN

Names, columns, identifiers, keys, constraints, indexes, row-level security policies, archive conventions, and migration details are not approved in Phase 0.
