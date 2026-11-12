# NoShowHQ

Product brief for people and for other models. Paste this file when a model needs to work on NoShowHQ without guessing what the product is.

This file says what the platform is, what it does today, what it refuses to do, and what is only recorded as later work. Field-level rules live in the module documents listed under [Where the detail lives](#where-the-detail-lives). Ideas that are not built live in [ROADMAP.md](ROADMAP.md). The short list under [What comes later](#what-comes-later) is a summary of that file, not a second backlog.

If this file and the code disagree, the code is what ships. Run `/sync-docs` to correct the documents. Do not treat a roadmap item as a feature you should build unless the person asking has asked for that item.

## What it is

NoShowHQ is a multi-tenant operations system for event-staffing businesses. An organisation keeps a staff directory and a calendar of events, then records when someone cancels, does not attend (AWOL), or is off sick. Administrators review those records, chase probation and fit-note follow-ups inside the app, and see who is crossing the organisation’s own attendance thresholds.

The product name is **NoShowHQ**. Do not rename it Stadigo. Stadigo is the company context around this repository. Centre Circle is a customer organisation, not the product. A tenant whose name or slug matches Centre Circle is seeded with that customer’s known venues. Everyone else starts with an empty venue list and the same event-type catalogue.

NoShowHQ records operational attendance. It is not a payroll system, a medical record, a rota, or a messaging product.

## Who it is for

Two kinds of signed-in user exist.

| Role | Where they work | What they are for |
| --- | --- | --- |
| `SUPER_ADMIN` | `/admin` | The platform owner. Creates organisations and their first administrators, sets a temporary password when an admin is locked out, and can open a tenant to see that tenant’s app. |
| `ADMIN` | The tenant app | An organisation administrator. The only person who runs day-to-day work: staff, events, absences, follow-ups, and settings. |

A staff record is not a login. Creating, importing, or editing staff never creates a `User`, never sends email or SMS, and never invites the worker into NoShowHQ.

There is no staff self-service, no manager login, and no role between platform owner and tenant administrator.

## What it does today

A tenant administrator can do the following. A platform owner can do the same things while they are inside a tenant they have opened. A banner stays on screen until they return to `/admin`.

### See the organisation

The dashboard shows cancellations, AWOL, and sickness for a date range or for one pay period, compared with the previous range or the previous numbered pay period. It lists people absent more than once in that window, a trend, and venue and event context for event-linked absences.

Venue and event filters narrow cancellation and AWOL. Sickness is not tied to an event, so those filters do not select sickness rows.

Separate from that window, the dashboard shows:

- How many non-deleted staff are in each watched employment status: Monitoring, Long-term sick, Contact required, Disabled, Inactive. Active staff are not in that watch strip.
- People at or above the cancellation threshold in the open pay period, and people who also hit that threshold in the previous pay period.
- People at or above the AWOL threshold inside the tenant’s AWOL window (default 3 AWOL records in 30 days).

Thresholds are settings. Crossing one does not change employment status, event status, or send a message. Cancelling or postponing an event does not remove AWOL records already logged against it.

### Log and review absences

Three absence types share one record and one ledger:

| Type | Attached to | What the administrator records |
| --- | --- | --- |
| Cancellation | One staff member and one event | Reason, reported date, optional reported time. The system stores event and venue snapshots and calculates notice. |
| AWOL | One staff member and one event | Date recorded, event snapshots, and a same-day confirmation when the event has no briefing or start time. No reason, no notice. |
| Sickness | One staff member. The absence itself has no event. | Date reported, first working day affected, optional start, optional end, and a short operational issue summary. The administrator can also name the booked shifts that sickness covers. The ledger shows the count, including zero. The individual shifts stay on the record. Not a diagnosis. |

Logging an absence does not change employment status, event status, or staffing figures, and does not send email or SMS.

The ledger at `/ledger` is a read of those records. It defaults to all active absences, with Cancellations, AWOL, and Sickness as views of the same list. Archived rows stay hidden until “Show archived” is on. Opening a row shows detail in a drawer; a full page exists at `/absence/[id]`. The ledger does not copy rows into another table and does not write an audit event just because someone looked.

Corrections and archive are the edit path. There is no hard delete. Archiving frees the duplicate slot so a replacement can be logged. Archiving a sickness record is not a recovery, an end date, or a return to work.

Pay periods are names for date ranges that absences are filed under. They do not calculate wages. A tenant with no pay periods can still log an absence, unfiled. Once any pay period exists, a new absence needs an open period or an explicit period. Only one period is open at a time, and dates must not overlap.

### Follow up inside the app

Manual follow-ups can be added, edited, completed, and cancelled on an active cancellation, AWOL, or sickness record. The queue is `/follow-ups`. Completed and cancelled rows stay as history. Archiving the parent hides open follow-ups from the queue and does not delete them.

Ongoing sickness and active AWOL also appear in that queue without a follow-up row and without a due date. Opening one does not remove it. It leaves when the sickness ends or the AWOL is archived. If that absence already has an open follow-up, the follow-up is the only row and is labelled Ongoing sickness or Unresolved AWOL. Completing or cancelling the last one brings the absence back while it still qualifies. Due-date filters, and the dashboard overdue, due today, and upcoming counts, stay counts of dated follow-ups. The navigation badge also counts a qualifying absence that has no open follow-up.

Sickness also has two system follow-ups, created by a daily job and by evidence saves:

- When a confirmed episode reaches the tenant’s fit-note day and no fit note is received or currently requested, the app opens a “request fit note” task.
- Marking that fit note Requested completes the request and opens one chase, due the tenant’s chase interval after the request date (default day 8, then 5 days).
- Marking it Received completes that chase. Completing the chase in the queue does not mark the fit note received.

Fit note and self-certification are administrative status rows. They do not upload a document, calculate coverage, or expire. “Fit note” is the Centre Circle term for that evidence.

Return to work is a separate manual status on a sickness record: Not recorded, Not required, Outstanding, or Completed. It does not move the episode, the evidence, the archive flag, or any follow-up.

### Keep the staff directory

Staff are tenant records: staff ID, name, role, optional department and manager, employment status, a clearance summary, and probation. Employment statuses are Active, Monitoring, Contact required, Disabled, Inactive, and Long-term sick. Clearance is a summary only. Valid or Expired requires an expiry date. Nothing here stores a certificate file.

New tenants start with a 90-day probation default, changed under Settings → Probation. A change applies only to cycles started afterwards. Review is due 28 days before the current end date. The in-app queue chases weekly until the end date, then keeps a single overdue item. Acknowledge, snooze (up to 7 days, not once overdue), extend, pass, or not continued are administrator actions. Passing or not continuing never silently rewrites employment status. A daily cron and ordinary page loads reconcile missing tasks. No email or SMS.

Bulk import creates new staff only. It does not update existing people, create logins, or send messages. A blocking row rejects the whole file. The spreadsheet is not stored.

### Keep the event calendar

Events belong to one tenant: name, optional reference, date, optional briefing and start and end times, overnight flag, staff required, fill-rate thresholds, status, type, subtype, and venue. Statuses are Planned, Confirmed, Cancelled, Postponed, and Completed.

The event page counts active cancellations and AWOL logged against it and shows an estimated fill rate from `staff required` minus those absences. Sickness is not included, including shifts named on a sickness record. There is no rota, and dropping under a threshold does not send an alert.

Events can be archived and restored. Archived events stay readable and editable and are hidden from the working lists and from absence event search. Soft-deleted events disappear from normal lists.

Venues are per tenant. Names are unique after trim and case-folding. An inactive venue stays on past events and drops out of the create-event picker. New tenants receive the standard type and subtype catalogue. Centre Circle tenants also receive that customer’s known venues.

Bulk import validates the whole file, confirms venues, then creates events in one transaction. A completed import does not create them twice. The spreadsheet is not stored. Limits are 5 MB and 5,000 data rows.

### Run the organisation

Settings hold probation length, fit-note day and chase interval, cancellation reasons, short-notice hours (default 24), cancellation threshold (default 3 in the open pay period), AWOL threshold and window (default 3 in 30 days), pay periods, and venues. Changing the fit-note day or chase interval writes a settings audit with the actor and the old and new values. Probation length records who changed it and when. Neither change rewrites existing cycles or episodes unless an administrator explicitly backfills fit-note policy.

Profile, from the account menu, changes the signed-in user’s own password and chooses light or dark. The choice is stored on the user.

### Run the platform

A super admin signs in, creates a tenant with its first admin, watches when each admin last signed in or was active, adds further admins, and sets a temporary password. Self-serve email reset is not available. `/forgot-password` sends people back to login. A locked-out tenant admin asks the platform owner.

Production is Vercel and Neon. The build runs migrations and can seed the first super admin from environment variables. Two daily cron routes, both at 00:15 UTC, need `Authorization: Bearer $CRON_SECRET`:

- `/api/cron/probation-reconcile`
- `/api/cron/sickness-evidence-evaluate`

## What it does not do

These are product boundaries, not missing polish. Do not add them as a side effect of other work.

- No payroll, wages, charges, or payment status. Pay periods only name the dates an absence is filed under.
- No medical record. Issue summary is an operational note. It is not shown in search, staff history lists, or the ledger row. Fit notes do not store documents or clinical judgments.
- No rota, shift pattern, or check-in feed. Fill rate is an estimate from logged cancellations and AWOL. Shifts named on a sickness record are not a rota and are not part of that estimate.
- No email, SMS, push, or notification centre. Probation and fit-note chasing happen in the app.
- No staff, manager, or worker login.
- No self-serve password reset by email.
- No automatic change to employment status or event status because an absence, a threshold, a probation outcome, or a fit note was saved.
- No reliability score, strike count, or serial-offender model.
- No hard delete of absences, probation history, evidence, or return-to-work rows.
- No file upload yet. `BLOB_READ_WRITE_TOKEN` is reserved for a later decision. Spreadsheet import reads the file in the request and does not keep it.

## How the product is organised

```text
Platform owner (SUPER_ADMIN)
  └── Tenant (one staffing organisation)
        ├── Users with role ADMIN
        ├── Settings (timezone, probation, evidence, thresholds, pay periods)
        ├── Venues, event types, events
        ├── Staff and probation cycles
        └── Absences → cancellation | AWOL | sickness
              ├── snapshots of the event or staff as recorded
              ├── booked shifts a sickness covers
              ├── evidence and return to work (sickness only)
              └── follow-ups
```

Tenant identity and the acting user always come from the server session (`requireTenant()` or the platform admin equivalent). Clients do not send `tenantId`, `createdById`, or `updatedById`. A cross-tenant id returns the same not-found result as a missing id.

Each tenant has an IANA timezone, default `Europe/London`. AWOL and sickness “today” use that timezone. Cancellation notice still uses `Europe/London`, so older cancellation behaviour stays stable. There is no silent fallback to the browser or the server clock.

Dates that mean a calendar day are stored as UTC midnight. Do not persist a browser-local timestamp that can move the day.

## Rules that must not be broken

1. **One tenant boundary.** Every read and write filters by the session tenant. Imports, crons, and backfills included.
2. **Staff are not users.** Do not create a login, send a message, or require an email address in order to record a person.
3. **Absences do not mutate neighbours.** Saving or archiving an absence must not change employment status, event status, or the other absence workflows (evidence, return to work, and manual follow-ups stay independent).
4. **Snapshots stay.** Cancellation and AWOL keep the event and venue text the administrator saw. Sickness keeps the staff name and staff ID as recorded. Live links are for navigation. Later edits to the event or the person must not rewrite history.
5. **Sickness has no event.** The parent sickness record cannot store an event id; a payload that includes one is rejected. Booked shifts the sickness covers are separate rows. They do not attach the sickness to an event, change fill rate, or turn the days in between into shifts. Search and filters must not pretend the sickness itself has an event.
6. **Duplicate slots.** At most one active cancellation or AWOL per staff member per event. At most one active sickness per staff member per first working day. A booked shift on a sickness cannot occupy a staff member and event that already has an active cancellation, AWOL, or missed shift, and the reverse is refused too. Archive frees the slot. Idempotency keys make a double-submit return the original row for 24 hours. The same key with a different payload creates nothing.
7. **Audit is append-only.** Absence history, probation history, and settings audit have no edit or delete screen. Sensitive text (issue summary, fit-note note, return-to-work note) appears on the authorised detail and its history, and is redacted everywhere else.
8. **Policy changes are forward.** A new probation length or fit-note day applies to later cycles and episodes. Existing rows change only through an explicit, confirmed backfill where one exists.
9. **Forms share one schema.** Data-entry forms validate with the same Zod schema on the client and the server, with the shared field-error UI. Do not use the browser’s native validation bubble. Filter forms that only change the query string are exempt.
10. **This Next.js is not the one in older training data.** Before changing framework code, read the guides in `node_modules/next/dist/docs/` and `AGENTS.md`.

## Where the detail lives

Read the module document before changing that area. This brief is the map. Those files are the field contract.

| Document | Read it for |
| --- | --- |
| [events.md](events.md) | Event, venue, type, archive, fill-rate estimate, event import. |
| [staff.md](staff.md) | Staff fields, managers, probation dates, reminder cadence, staff import. |
| [absences.md](absences.md) | Cancellation, AWOL, sickness, evidence, return to work, follow-ups, ledger, pay-period filing, notice, duplicates. |
| [ROADMAP.md](ROADMAP.md) | Work that is not built. |
| [design/README.md](design/README.md) | Visual reference only. The PDF is not a product spec. |

Repository layout an implementer needs:

- `src/app/(app)/` — tenant screens. Server actions sit next to the route they serve.
- `src/app/(platform)/admin/` — tenant provisioning.
- `src/lib/` — domain rules, Zod schemas, and Prisma queries. Prefer these over reimplementing a rule in a component.
- `prisma/schema.prisma` — the data model.
- Tests are Vitest. Tenant-isolation cases need local Postgres (`npm test`).

Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Auth.js (NextAuth v5) credentials, Prisma, PostgreSQL. Node 22 or newer.

## What comes later

Nothing in this section is built. Do not implement an item from it unless the task asks for that item. The working list, with status and source, is [ROADMAP.md](ROADMAP.md).

Recorded deferrals, as of the last sync:

- Email and SMS to staff or administrators, and a notification centre.
- A reliability score, strike count, or serial-offender model.
- Document upload, including storing a fit note or certificate file.
- Self-serve password reset by email.
- A rota, or a fill rate based on anything other than logged absences.
- An alert when fill rate crosses a threshold.
- Working-day calendars, bank holidays, and fit-note coverage or expiry.
- Sickness contact attempts, a first day back, or automatic closure of an episode.
- A reports area beyond the dashboard that already ships.

Recorded ideas, with no decision to build:

- An AWOL dealt-with state, so an AWOL can leave Follow-ups and stay on the ledger. Archive stays for a record logged by mistake.

## Document status

| | |
| --- | --- |
| Last synced | 12 November 2026 |
| Branch | `feat/automatic-ongoing-follow-ups` |
| Commit | `e6b90ae` |
| Describes | This branch, including follow-up visibility on top of `e6b90ae`. |
