# Horizon Church V2 Conceptual Data Model

> **DRAFT — no database schema has been approved yet.**

This document describes domain concepts and required relationships only. It is not SQL, a migration plan, or approval of table names, columns, keys, indexes, or row-level security policies.

The model is derived from Horizon V2 product rules rather than from the former Laravel/Vue schema. Legacy tables are not retained for compatibility.

## Modeling principles

- Authentication identity and Horizon application profile are separate concepts.
- Authenticated users and tracked people are separate concepts.
- Member and Visitor remain distinct records through Visitor conversion.
- Historical Visitor-originated activity remains attached to the Visitor after conversion.
- A Member stores only a current Life Group relationship; there is no Life Group membership history in MVP.
- Life Group Gatherings, generic Events, and OpenCell Programmes/Sessions are separate concepts.
- Attendance represents presence. Sunday absence is derived rather than stored as an `absent` or `excused` attendance state.
- Follow Up can concern either a Member or a Visitor and must enforce the active person-plus-reason rule.
- Threshold values belong to clearly named application configuration/constants unless a later decision approves another configuration mechanism.

## Conceptual relationship overview

```text
Supabase Auth Identity
└── Horizon Profile (admin | leader)

Member
├── current Life Group (zero or one)
├── Ministry relationship(s) [cardinality OPEN]
├── Gathering presence records
├── Event presence records
└── Follow Ups

Life Group
└── Gatherings
    └── Member presence records

Visitor
├── optional converted Member (one-way conversion)
├── Harvest participation / Sunday-interest decision
├── OpenCell participation and session presence
└── Follow Ups

Event (service | harvest | other; open | closed)
├── applicable attendance / registration records
└── Harvest-specific visitor context where applicable

OpenCell Programme
└── Sessions
    └── Visitor participant presence
```

This overview is deliberately conceptual. It does not mandate foreign-key layout or physical association tables.

## Identity and authorization concepts

### Supabase Auth Identity

Represents the external authentication identity managed by Supabase Auth.

Conceptual relationship:

- has one corresponding Horizon Profile when provisioned for application access

This is platform-owned identity data, not a Horizon-maintained password record.

### Horizon Profile

Represents an authenticated Horizon operator.

Likely conceptual attributes:

- link to Supabase Auth Identity
- display name
- role: `admin` or `leader`
- active/inactive state

Conceptual relationships:

- creates Life Group Gatherings
- may create or modify other domain records according to the future permission matrix
- may complete Follow Ups

OPEN: profile-to-Member/Visitor association and profile-to-Life-Group leadership or membership have not been approved.

## People concepts

### Member

Represents a church member used for member-oriented activity.

Required conceptual relationships:

- belongs to zero or one current Life Group
- may relate to Ministry records; exact cardinality is OPEN
- may have Gathering attendance records
- may have Event attendance records, including Sunday Service presence
- may be the subject of Follow Ups
- may be the Member created from exactly one converted Visitor in the ordinary conversion flow; database cardinality and duplicate policy still require approval

No historical Life Group membership collection belongs in the MVP model.

### Visitor

Represents a visitor and preserves visitor-originated history.

Required conceptual state and relationships:

- has a lifecycle state sufficient to distinguish the normal active Visitor list from `converted`
- may link to the Member created during conversion
- may have Harvest participation/registration context
- may have OpenCell participation and attendance history
- may be the subject of Follow Ups

Conversion does not delete or mutate the Visitor into a Member. The Visitor remains the historical subject of its Harvest, OpenCell, and Follow Up records.

### Visitor conversion relationship

This conceptual relationship captures the one-way conversion outcome:

```text
Visitor (converted) ──creates/links to──> Member
```

Required invariants:

- duplicate-Member prevention occurs before conversion
- conversion creates a new Member
- the Visitor is preserved and marked `converted`
- converted Visitors are excluded from the normal active list
- historical Visitor records retain their Visitor relationship
- future member activity uses the Member
- reversal is outside MVP

The physical transaction, uniqueness constraints, matching algorithm, and conflict UI are OPEN.

## Organization concepts

### Ministry

Represents a church ministry.

The module is in MVP, but its attributes and relationships beyond a relationship with Members are not approved. The database design must wait for decisions about:

- whether Members may belong to one or multiple Ministries
- leadership/ownership
- active/archive behavior
- required descriptive fields

### Life Group

Represents a Life Group.

Required conceptual relationships:

- has zero or more current Members
- has zero or more Gatherings

A Member's current group is modeled from the Member side as zero or one assignment. Reassignment replaces/removes that current relationship and creates no membership-history record.

OPEN: Life Group descriptive fields, lifecycle/archive rules, and Leader association.

### Life Group Gathering

Represents a meeting belonging to one Life Group. It is not an Event.

Required conceptual attributes/relationships:

- one Life Group
- date
- location
- topic/title
- description/minutes/notes
- creator Profile
- zero or more Member attendance records

### Gathering Attendance

Represents a Member's presence at one Life Group Gathering.

Conceptual relationships:

- one Gathering
- one Member

There is no `absent` or `excused` Gathering attendance record. Missing Gathering attendance never creates Follow Up automatically.

## Event concepts

### Event

Represents a generic Event.

Required conceptual classifications:

- type: Sunday Service (`service`), Harvest, or Other
- lifecycle: `open` or `closed`

OpenCell and Life Group Gathering are explicitly not Event types.

Shared event fields such as title, location, scheduled time, description, and creator are plausible but have not yet been approved as a complete field set.

### Event Attendance

Represents presence at an Event when attendance applies.

Locked behavior:

- Sunday Service attendance is Member presence through QR or manual check-in.
- No time-in/time-out is recorded as attendance meaning.
- No `absent` or `excused` record exists.
- Other Events may support attendance, but subjects and enablement rules are OPEN.
- Harvest does not require generic Member QR attendance.

The physical model may ultimately use specialized or shared attendance structures; Phase 0 does not choose between them.

### Harvest participation or registration

Represents Visitor-specific participation in a Harvest Event and the later explicit decision about Sunday Service interest.

Required conceptual relationships/behavior:

- one Harvest Event
- one Visitor
- records enough information for an authorized Leader to explicitly mark Sunday Service interest
- positive interest triggers a Visitor Follow Up with UI reason `Interested in Sunday Service`
- attendance/registration without positive interest creates no Follow Up

Whether this is a registration entity, attendance entity, event-participant entity, or another physical shape is OPEN. Public registration is also OPEN.

### Sunday visitor registration

Sunday visitor registration is a possible capability, not a locked physical entity or confirmed MVP workflow. No schema should be created until OPEN-004 in `docs/DECISIONS.md` is resolved.

## Follow Up concepts

### Follow Up

Represents the need for human/pastoral attention or private contact for exactly one tracked person: a Member or a Visitor.

Required conceptual information:

- subject: Member or Visitor
- reason identity
- reason display label
- active/completed state
- source context sufficient to explain the trigger
- creation/trigger time
- optional completion note
- completing Profile
- completion time

Required reason behavior:

| Trigger | Approved identifier | Exact UI label | Required context |
| --- | --- | --- | --- |
| Consecutive Sunday absence | `consecutive_sunday_absence` | `Consecutive Sunday absences` | Enough to explain the qualifying absence trigger |
| OpenCell participation | OPEN | `Attended most OpenCell sessions` | Attendance count and percentage |
| Harvest Sunday interest | OPEN | `Interested in Sunday Service` | Enough to identify the Harvest interest source |

An internal identifier marked OPEN must be approved before schema or code treats it as stable.

Required active-record invariant:

```text
At most one active Follow Up for the same tracked person + same reason.
```

Member and Visitor identifiers may occupy different physical domains, so the eventual database design must define “same tracked person” unambiguously and enforce the invariant safely. Different active reasons for one person are allowed. Completion permits a later independent Follow Up with the same person and reason.

Completion preserves the record in shared Follow Up History and records who completed it and when. The optional note belongs to completion/history rather than being required to close the item.

OPEN: the physical subject-reference strategy, database enforcement mechanism, source-context representation, and behavior of a suppressed repeated trigger.

## OpenCell concepts

The detailed OpenCell schema is intentionally deferred. Only the minimum concepts implied by the approved product rules are listed.

### OpenCell Programme

Represents the relevant programme whose completion initiates participation evaluation.

Conceptual relationships:

- has Sessions; minimum and maximum cardinality are OPEN
- has participant enrollments/relationships

A complete lifecycle has not been approved. The model will need an unambiguous definition of “finishes” before automation is implemented.

### OpenCell Session

Represents one session belonging to an OpenCell Programme.

Conceptual relationship:

- belongs to one Programme
- has participant attendance/presence records

Session fields, cancellation behavior, and schedule rules are OPEN.

### OpenCell Participant

Represents a Visitor participating in a Programme.

Participants are Visitors unless or until converted. Historical participation remains attached to the Visitor. How future sessions within the same Programme behave after conversion is OPEN.

### OpenCell Attendance

Represents participant presence at one Session.

At Programme finish, attendance is evaluated against the default configurable 75% threshold. A qualifying participant generates a deduplicated Follow Up with exact UI label `Attended most OpenCell sessions`; the Follow Up must retain attendance count and percentage.

The denominator, rounding, enrollment window, and cancelled-session treatment are OPEN.

## Configuration concepts

The following are application configuration/constants, not approved database entities:

- consecutive Sunday absence threshold, default `5`
- OpenCell participation threshold, default `75%`
- church time zone, `Asia/Manila`

The exact configuration mechanism and override/deployment strategy are not yet approved. Names must be clear and domain-specific when implementation begins.

## Upload concepts

Supabase Storage is the intended platform for the MVP Uploads module, but no domain attachment entity or storage schema is approved. File purposes, ownership, access, validation, retention, and deletion rules must be decided first.

## Derived information and automation

The following are derived or process behavior, not automatically separate persisted entities:

- Sunday absence is derived from missing presence for a relevant Service.
- Consecutive absence streak resets on presence.
- OpenCell percentage is calculated from attendance and an as-yet-unresolved denominator.
- Dashboard values are read models derived from authoritative module data.
- Scheduled evaluations will eventually use `Asia/Manila` and may use Supabase Cron.

Whether streaks, calculated percentages, automation runs, or dashboard aggregates are persisted is an OPEN physical-design matter.

## Explicitly absent concepts

The conceptual MVP model does not include:

- donations or finance
- sermon/media streaming
- push notifications
- member self-service portal accounts or features
- historical Life Group memberships
- attendance time-in/time-out
- excused attendance
- generic task/project management

## Schema approval gate

Before any migration or table is created, the team must resolve the affected OPEN decisions, choose a physical design, document constraints and RLS/authorization responsibilities, and approve the schema. This draft alone is not authorization to implement database objects.
