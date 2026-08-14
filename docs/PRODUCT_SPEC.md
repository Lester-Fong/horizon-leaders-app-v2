# Horizon Church V2 Product Specification

## Document authority

This document defines the currently approved product scope and behavior for Horizon Church V2. It is the product source of truth for implementation work unless a later, explicitly approved decision updates it and `docs/DECISIONS.md`.

Horizon Church V2 is a new application. The former Laravel/Vue application is not an implementation baseline. It may be consulted only as product reference when that material is explicitly supplied, and its code, framework architecture, schema, and incidental behavior must not be carried into V2 by default.

Current delivery scope: **MVP planning, with Phase 0 limited to documentation and runnable project foundations.** Phase 0 does not include Supabase configuration, schema, authentication, domain CRUD, automation, uploads, or deployment.

## Product purpose

Horizon Church V2 supports church leaders as they maintain people records, organize ministries and Life Groups, record selected attendance, identify people who need personal attention, and preserve the history of that follow-up.

The product is for church operations by authenticated staff or leaders. It is not an attendee self-service portal, a finance system, a streaming platform, or a general task-management product.

## People and access model

Horizon distinguishes authenticated application users from people tracked by the church.

### Authenticated users

The MVP application roles are:

- `admin`
- `leader`

Supabase Auth will eventually establish identity and issue sessions. Horizon's application profile and backend authorization will determine what an authenticated identity may do. The complete admin-versus-leader permission matrix is not yet approved; see the OPEN items in `docs/DECISIONS.md`.

### Tracked people

The MVP tracks:

- **Member** — a church member whose current ministry, Life Group, event, and attendance activity may be managed.
- **Visitor** — a person first tracked through visitor-oriented activity such as Harvest or OpenCell and who may later be converted to a Member.

An authenticated user is not automatically the same record as a Member or Visitor. Any association between a user profile and a tracked-person record remains an explicit future design decision.

## MVP modules

The MVP includes these product modules:

1. Authentication
2. Users
3. Members
4. Ministries
5. Life Groups
6. Life Group Gatherings
7. Events
8. Sunday Service Attendance
9. Visitors
10. Follow Up
11. Harvest
12. OpenCell
13. Dashboard
14. Uploads

Inclusion in this list establishes product scope, not completion. Phase 0 implements none of the domain modules.

## Explicitly outside the MVP

The following are not part of the MVP:

- Care Notes
- donations or finance
- sermon or media streaming
- push notifications
- a member self-service portal
- a complex permission framework
- historical Life Group membership tracking
- attendance time-in/time-out
- excused attendance

These exclusions must not re-enter implementation through legacy compatibility work or speculative schema design.

## Visitor-to-Member conversion

Conversion is a deliberate, one-way MVP operation:

1. The system checks for a possible duplicate Member before conversion.
2. Conversion creates a new Member; it does not repurpose or delete the Visitor.
3. The original Visitor is preserved and becomes `converted`.
4. The Visitor stores a relationship to the newly created Member.
5. Historical Harvest, OpenCell, and Follow Up records continue to reference the Visitor.
6. Future member activity references the new Member.
7. Converted Visitors are excluded from the normal active Visitor list.
8. The MVP provides no conversion reversal.

The duplicate matching rules and the operator flow when a possible duplicate is found are OPEN. Implementations must not guess those rules or silently merge records.

## Members and Ministries

Members are the tracked people used for member-oriented activity, including Sunday Service attendance and Life Group membership.

Ministries are an MVP module, but their fields, member-to-ministry cardinality, leadership rules, and archive behavior are not yet approved. Those details must be decided before database implementation.

## Life Groups

### Current membership

- A Member has at most one current Life Group.
- An Admin directly controls Member Life Group assignment.
- Moving a Member means replacing or removing the Member's current Life Group assignment.
- The MVP does not retain historical Life Group membership periods.

### Gatherings

A Life Group can have Gatherings. A Life Group Gathering is a domain record belonging to its Life Group; it is not a generic Event.

Each Gathering records:

- its Life Group
- date
- location
- topic or title
- description, minutes, or notes
- the Members who attended
- the authenticated user who created it

Gathering attendance records presence. A Member's absence from a Life Group Gathering does **not** automatically create a Follow Up.

## Events

Generic Events have only these MVP product types:

- **Sunday Service**, conceptually identified as `service`
- **Harvest**
- **Other**

Life Group and OpenCell are not Event types:

- Life Group meetings are Gatherings under a Life Group.
- OpenCell is a standalone programme/session module.

Events use a simple `open` / `closed` lifecycle for the MVP. No additional event lifecycle states are approved.

### Sunday Service

Sunday Service supports Member attendance through QR or manual check-in.

- An attendance record means the Member was present.
- Absence is derived from the lack of a presence record for a relevant Sunday Service.
- There is no time-in or time-out.
- There is no `excused` state.
- One absence alone does not create a Follow Up.
- A presence resets the Member's consecutive Sunday absence streak.
- The default trigger is **5 consecutive Sunday absences**.
- The threshold must live behind a clearly named application constant or configuration value so it can be changed intentionally later.

Sunday visitor registration can be supported, but whether it is required in the MVP and its exact workflow remain OPEN.

### Harvest

Harvest is visitor-focused.

- Staff register Visitors.
- Public registration may be supported; it is not yet a locked MVP commitment.
- Harvest does not require generic Member QR attendance.
- Merely attending Harvest does not create a Follow Up.
- A Leader later explicitly records whether a Visitor is interested in attending Sunday Service.
- A positive expression of that interest creates a Follow Up whose UI reason is exactly `Interested in Sunday Service`.

### Other Events

An Other Event may support ordinary attendance. Its exact attendance scope is OPEN.

Absence from an Other Event never creates an automatic Follow Up under the current MVP rules.

## Follow Up

### Purpose

Follow Up identifies a Member or Visitor who needs human or pastoral attention or private contact. It is not a generic project-management task system.

The active Follow Up page is shared across Leaders. Follow-up completion history remains visible so Leaders can see who completed the contact and when.

### Approved trigger reasons

The current approved reasons are:

| Source | Product condition | UI reason |
| --- | --- | --- |
| Sunday Service | Member reaches the consecutive absence threshold | `Consecutive Sunday absences` |
| OpenCell | Participant meets the participation threshold when the programme finishes | `Attended most OpenCell sessions` |
| Harvest | Visitor is explicitly marked interested in Sunday Service | `Interested in Sunday Service` |

The Sunday absence reason has the approved internal identifier `consecutive_sunday_absence`. Internal identifiers for the other two reasons have not been approved and must not be invented in this product specification.

An optional manual or “other” reason is a possible future/simple extension, not a currently locked MVP requirement.

### Sunday absence trigger

- The default threshold is 5 consecutive Sunday absences.
- A presence resets the streak.
- A single absence creates no Follow Up.
- The threshold is represented by a clearly named application constant or configuration value.
- No excused attendance state modifies the calculation.

The detailed eligibility and recalculation behavior for cancelled services, newly added Members, late attendance corrections, and similar edge cases remains OPEN.

### OpenCell participation trigger

- The default threshold is 75% participation.
- The threshold is represented by a clearly named application constant or configuration value.
- Evaluation occurs when the relevant OpenCell Programme finishes.
- A qualifying participant receives a Follow Up with the exact UI reason `Attended most OpenCell sessions`.
- The Follow Up retains enough context to show the participant's attendance count and percentage.

The denominator, rounding rule, and behavior for added, removed, or cancelled sessions remain OPEN.

### Deduplication

- At most one **active** Follow Up may exist for the same person and the same reason at the same time.
- A repeated identical trigger while that active Follow Up exists does not create another record.
- The same person may have different active reasons simultaneously.
- After a Follow Up is completed, a later independent trigger may create a new Follow Up for the same person and reason.

Whether a suppressed repeated trigger updates the existing Follow Up's contextual details is OPEN.

### Completion and history

A Leader completes a Follow Up by marking it followed up/completed. Completion records:

- an optional note
- the authenticated user who followed up
- when it was completed

A completed record leaves the default active list but remains accessible in Follow Up History. The shared history identifies which Leader completed the follow-up.

## OpenCell

OpenCell is a standalone programme/session feature, not an Event subtype.

Its product structure is:

```text
OpenCell Programme
└── Sessions
    └── Participant attendance
```

Participants begin as Visitors unless or until converted to Members. Conversion preserves the Visitor and all historical OpenCell references. The detailed behavior for a participant converted during an active Programme is OPEN.

When a Programme finishes, participation is evaluated against the default 75% threshold. A qualifying participant creates a Follow Up subject to the shared active Follow Up deduplication rule. Complete OpenCell database design is explicitly deferred beyond Phase 0.

## Dashboard

Dashboard is an MVP module. Its metrics, filters, time windows, role-specific visibility, and drill-down behavior are not yet approved. It must report from authoritative module data rather than introduce a separate source of truth.

## Uploads

Uploads is an MVP module intended to use Supabase Storage. Allowed file purposes, formats, sizes, access rules, retention, and ownership behavior are OPEN. No upload behavior is implemented in Phase 0.

## Scheduling and time zone

Sunday Service scheduling and future automation are intended to operate in the `Asia/Manila` church time zone.

Supabase Cron may be used where appropriate later. The exact job schedule, trigger design, retry behavior, and Supabase Cron implementation are deferred. Phase 0 performs no scheduling or automation.

## Technical boundaries

The approved target stack is:

- React, TypeScript, Vite, and Tailwind CSS for the frontend
- Node.js, TypeScript, and Express 5 for the backend
- Supabase PostgreSQL, Auth, Storage, and later Cron where appropriate

The frontend and backend live in one repository but remain physically separate and independently deployable. Domain operations should flow through the Express API so conversion, attendance, authorization, threshold, and deduplication rules have one server-side home. Supabase service credentials must never be exposed to the browser.

No database schema is approved in Phase 0. `docs/DATA_MODEL.md` is conceptual only.

## OPEN product questions

The authoritative register of unresolved matters is in `docs/DECISIONS.md`. In summary, implementation must still resolve:

- the Admin/Leader permission matrix
- Ministry fields and membership/leadership rules
- Sunday visitor registration scope and workflow
- public Harvest registration scope and workflow
- attendance rules for Other Events
- duplicate detection and resolution before Visitor conversion
- Sunday absence eligibility and recalculation edge cases
- OpenCell percentage edge cases and mid-program conversion behavior
- repeated-trigger context handling for an existing active Follow Up
- whether a manual/other Follow Up reason belongs in the MVP
- Dashboard metrics and visibility
- Upload purpose, validation, access, and retention rules

OPEN items are not permission to choose an implementation silently. They require an explicit product decision before the affected behavior is built.
