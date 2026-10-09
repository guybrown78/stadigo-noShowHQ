# Absence data model

Tenant-scoped unified absence records. Cancellation, AWOL, and Sickness attach to the same parent without changing tenant, staff, type, or audit relationships.

Logging an absence does **not** change staff employment status, event status, or staffing figures, and does not send email or SMS.

## Entities

### Absence
Shared parent for `CANCELLATION`, `AWOL`, and `SICKNESS`. Belongs to exactly one tenant. `tenantId`, `createdById`, and `updatedById` always come from the authenticated session, never the client.

Key fields: required same-tenant `staffId` (non-deleted for new writes), optional `eventId` (required for Cancellation and AWOL; **must be null for Sickness**), `reportedDate` (`DATE`, local calendar date stored as UTC midnight), optional `reportedTime` (`HH:mm`, Cancellation only), optional `reason` (required for Cancellation, `null` for AWOL and Sickness), optional `notes` (`null` for Sickness so Issue summary is not duplicated), optional `firstWorkingDaySick` (denormalised Sickness duplicate key; `null` for other types), `followUpType` / `followUpStatus`, `recordStatus` (`ACTIVE` | `ARCHIVED`).

A type-aware check constraint `Absence_event_required_by_type` requires an Event for Cancellation and AWOL and forbids one for Sickness.

Cancellation, AWOL, and Sickness writes still set `followUpType = REVIEW` and `followUpStatus = PENDING` on the parent so the shared schema stays valid. Those columns are a placeholder. They are not the follow-up workflow and they are not shown as Ledger status.

Manual follow-ups are child `AbsenceFollowUp` rows linked to the parent Absence. An authorised administrator can add, edit, complete, and cancel them on an active Cancellation, AWOL, or Sickness record, and work from the tenant queue at `/follow-ups`. Completed and cancelled rows stay as history. Archiving the parent leaves existing follow-ups unchanged and removes open ones from the queue. There is no assignee, priority, automatic creation, certificate rule, notification, or hard delete. Marking evidence received does not complete a follow-up.

NoShowHQ tracks attendance only. Follow-up never represents money, wages, or contact with staff, so avoid payment, charge, or payroll wording in this area.

### CancellationDetail
One-to-one type-specific row. Stores Event/Venue **snapshots** (name, date, start time, venue id/name) plus calculated notice (`noticeCalendarDays`, optional `noticeMinutes`, `noticeBasis`, `isShortNotice`).

Keep the live Event foreign key and the snapshots. The link is for navigation and reporting. Snapshots preserve what the administrator saw if the Event is later edited or logically deleted.

### AwolDetail
One-to-one type-specific row for AWOL. Stores Event/Venue snapshots used as operational evidence:

- `eventNameSnapshot`, optional `eventReferenceSnapshot`
- `eventDateSnapshot` (the missed attendance date)
- optional start/end time snapshots
- optional venue id/name snapshots
- optional `eventTypeSnapshot` / `eventSubtypeSnapshot` (missing type displays as Unspecified; never inferred later from the live Event)
- `sameDayStartUnknownConfirmed` — `true` only when the Event date is the tenant-local current date, the Event has no start time, and the administrator confirmed non-attendance

Do not copy Internal notes into `Absence.reason`. AWOL has no notice, payment, follow-up, impact, or shift columns.

### SicknessDetail
One-to-one type-specific row for a Sickness report:

- `firstWorkingDaySick` — first booked working day or shift affected (not verified against a rota)
- optional `sicknessStartedDate` — when the sickness itself began, on or before the first working day
- optional `sicknessEndedDate` — last calendar date this episode affected the staff member. Date-only, tenant-local, inclusive for the derived Calendar-day span. Not a first day back, recovery date, or return-to-work date
- `episodeState` — `NOT_CONFIRMED` (default for new and migrated Part 1 records), `ONGOING` (explicit confirmation that no end date is recorded), or `ENDED` (a valid end date is recorded). Missing end date is not inferred as ongoing
- optional `issueSummary` — short operational summary, not a diagnosis. Outer whitespace trimmed, blank normalised to null, max 1,000 Unicode code points, inner line breaks preserved and rendered as escaped text
- `staffFirstNameSnapshot`, `staffLastNameSnapshot`, `staffIdNumberSnapshot` — historical Staff display for the Ledger and lists. Written server-side from trusted same-tenant Staff on create and Staff correction. Not used for authorisation, duplicate checks, or Staff mutations

`ENDED` requires a non-null end date. `NOT_CONFIRMED` and `ONGOING` require a null end date. Calendar-day span is derived (`end date − first day sick from work + 1`) and is not stored. It is not working days absent, payroll days or certification days, and is not shown without an end date.

`Absence.firstWorkingDaySick` is a denormalised copy of the detail date used only for the race-safe active duplicate index. Writes copy both values in the same transaction.

Sickness is an operational absence record, not a medical record. Issue summary is never previewed in Staff history or general lists. Raw text is returned only on the authorised Sickness detail and correction paths, and in the tenant-scoped `AbsenceHistory` payload rendered on that detail page. The Sickness Ledger returns only an **Issue summary recorded** presence flag. Episode state and end date appear on authorised detail, Ledger Context, Staff history and audit History; they are not placed in URLs, search, or unauthorised responses.

Advance-report acknowledgement is request-only. When a future first working day is saved, the create or correction audit event records `futureFirstWorkingDayConfirmed` with the confirmed date. It is not stored on `SicknessDetail`.

An `ACTIVE` Sickness record is operationally discoverable; it does not mean the Staff member is currently sick. Archive is not a sickness end, recovery or return-to-work action. Recording an end date does not archive the record.

### Sickness evidence

Manual evidence belongs only to a Sickness Absence. It is separate from episode state (`NOT_CONFIRMED`, `ONGOING`, `ENDED`), Absence status (`ACTIVE`, `ARCHIVED`), and return-to-work state. Saving evidence does not change those. It can complete or create only the system follow-up linked to that evidence row. Manual follow-ups are never completed or cancelled by evidence saves.

Centre Circle term: **Fit note**.

Confirmed statuses:

- Self-certification, one row per episode: Not recorded, Not required, Awaiting, Received. No dates.
- Fit note, repeatable rows: Not recorded, Not required, Required, Requested, Received. No coverage period.

A missing self-certification row, and an episode with no fit notes, display **Not recorded**. Rows are not hard-deleted. A later correction may set a saved row back to Not recorded.

New episodes store the tenant's fit note day count and the calculated requirement date. Day 1 is `sicknessStartedDate` when recorded, otherwise `firstWorkingDaySick`. The requirement date is day 1 plus the count minus one. Calendar days include weekends. `NOT_CONFIRMED` does not infer a fit note requirement. `ONGOING` is measured through the tenant-local today. `ENDED` is measured through the recorded end date. Defaults are day 8 and a chase of 5 calendar days after the request date. Counts must be a whole number from 1 to 730.

Settings live on the tenant (`fitNoteRequiredFromDay`, `fitNoteChaseAfterDays`) under **Settings → Sickness evidence**. Changes are audited in `TenantSettingsAudit` with the actor and old/new values, and apply only to episodes created afterwards and to fit notes first saved as Requested afterwards. Episodes from before the feature keep a null policy until an administrator previews the counts and confirms backfill. Backfill is idempotent and does not rewrite rows that already have a policy.

When a confirmed episode reaches its requirement date and has no Received fit note and no current Requested fit note, evaluation creates one system `REQUEST_FIT_NOTE` follow-up, due on the requirement date. Recording Requested completes that task and creates one `CHASE_FIT_NOTE` follow-up for that row, due on the snapshotted chase date. Recording Received completes that chase. Completing a chase in the follow-up queue does not mark the fit note Received and does not create another chase. A Received fit note blocks the automatic request task for the episode; it does not calculate coverage or expiry. One Received row does not cancel chases for other still-requested rows. Generated follow-up text is fixed operational copy and never includes the issue summary or fit note note. Open system tasks are unique per episode (request) or fit note (chase). Terminal tasks are not reopened; an administrator can create a replacement. Archive hides open follow-ups from queues and does not cancel them.

Date requested is required only when the fit note status is Requested, and date received must be empty. Date received is required only when the status is Received; date requested may be kept. Other statuses store neither date. Retrospective dates are allowed. Future dates are rejected using the tenant timezone. The optional administrative note is trimmed, blank becomes null, and uses the existing 2,000-character note limit. It is plain text.

The first real save does not need a correction reason. Changing a saved self-certification or fit note requires a 2–500 character reason. A no-change edit writes nothing and adds no History event. One successful save writes one `EVIDENCE_RECORDED` or `EVIDENCE_CORRECTED` event in the same transaction as the evidence row. Stale writes use the evidence row `updatedAt`. Evidence saves do not bump `Absence.updatedAt`.

Idempotency operations: `SICKNESS_SELF_CERT_UPDATE`, `SICKNESS_FIT_NOTE_CREATE`, `SICKNESS_FIT_NOTE_UPDATE`.

Access is the same as other Sickness writes: tenant ADMIN, or SUPER_ADMIN acting in that tenant, via `requireTenant()`. Archived Sickness shows the saved evidence and History, with Edit, Add fit note, and Add follow-up hidden.

The Evidence section is on the Sickness full page and in the Ledger drawer, from the same detail query. Fit note notes stay off Ledger rows, Staff Absence History, search, analytics, URLs, and generic logs. Authorised detail History shows the note; the public-feed redaction replaces it with **Fit note note changed**.

Evaluation runs inside the evidence and episode transactions, on a reviewed backfill, and once a day from `POST /api/cron/sickness-evidence-evaluate` (`Authorization: Bearer $CRON_SECRET`, same daily Vercel slot as probation). Each run uses the tenant IANA timezone. A missed run catches up on the next one because open system tasks are unique. The app shell does not scan every episode on page view. Last-run counts are stored on `SicknessEvidenceEvaluationRun` and shown on the settings page. They do not include staff names or fit note notes.

This version does not calculate working days, bank holidays, certificate coverage, or expiry. It does not upload documents or complete return-to-work.

### Return to work

Manual return-to-work tracking belongs only to a Sickness Absence. It is separate from episode state (`NOT_CONFIRMED`, `ONGOING`, `ENDED`), evidence, Absence status (`ACTIVE`, `ARCHIVED`), and shared follow-up state. Recording it does not change those. Changing the episode, evidence, archive status, or a follow-up does not create, complete, or reset it.

Process, fields, and access for this release:

- An administrator chooses the position. There is no automatic requirement and no automatic state transition.
- One optional row per Sickness episode. A missing row displays **Not recorded**. Existing episodes are not backfilled. Rows are not hard-deleted.
- Statuses: Not recorded, Not required, Outstanding, Completed.
- An active Sickness episode can be recorded in any episode state, including Not confirmed and Ongoing. `ENDED` remains the last sickness-affected date. It does not mean returned to work or that return-to-work is completed.
- **Completion date** is required only when the status is Completed. Other statuses store no date. It is an actual completion date, not a planned follow-up date, and it is not derived from the sickness end date. Retrospective dates are allowed. Future dates are rejected using the tenant timezone.
- Changing a Completed record to another status clears the current completion date in the same save. The previous date stays in History. The form states that before saving.
- Optional administrative note, trimmed, blank becomes null, max 2,000 characters, plain text. There is no meeting-conductor field. The recording actor is the signed-in administrator (`createdBy` / `updatedBy`). Not required does not need its own reason.
- The first real save does not need a correction reason. Later changes require a 2–500 character reason. A no-change edit writes nothing and adds no History event. One successful save writes one `RETURN_TO_WORK_RECORDED` or `RETURN_TO_WORK_CORRECTED` event in the same transaction. Stale writes use the row `updatedAt`. Saves do not bump `Absence.updatedAt`.
- Idempotency operation: `SICKNESS_RETURN_TO_WORK_UPDATE`.
- Access is the same as other Sickness writes: tenant ADMIN, or SUPER_ADMIN acting in that tenant, via `requireTenant()`. The note is shown on the authorised Sickness detail, the Ledger drawer, and that History. It stays off Ledger rows, Staff Absence History, search, analytics, URLs, and generic logs. The public-feed redaction replaces it with **Return to work note changed**.
- Archived Sickness shows the saved position and History, with Correct and Add follow-up hidden.
- Add follow-up uses the existing manual follow-up flow. Completing either workflow does not update the other.

This does not create deadlines, reminders, queues, reports, document uploads, or a clinical assessment.

### AbsenceHistory
Append-only. Actions: `CREATED`, `CORRECTED`, `ARCHIVED`, `EPISODE_UPDATED`, `FOLLOW_UP_CREATED`, `FOLLOW_UP_UPDATED`, `FOLLOW_UP_COMPLETED`, `FOLLOW_UP_CANCELLED`, `EVIDENCE_RECORDED`, `EVIDENCE_CORRECTED`, `RETURN_TO_WORK_RECORDED`, `RETURN_TO_WORK_CORRECTED`. Stores actor, timestamp, optional reason, and JSON `{ field, previous, next }` changes. There is no edit/delete UI. Compact history is shown on the detail page. On AWOL detail, `reportedDate` is labelled **Date recorded**. On Sickness detail, history actions are labelled **Sickness report created/corrected/archived**, **Sickness status updated**, **Evidence recorded/corrected**, and **Return to work recorded/corrected**.

Raw Issue summary old/new values belong only on the authorised Sickness detail. A public-feed helper redacts them to **Issue summary changed**.

### AbsenceIdempotencyKey
Used by AWOL create (`AWOL_CREATE`), Sickness create (`SICKNESS_CREATE`), Sickness episode update (`SICKNESS_EPISODE_UPDATE`), follow-up writes, Sickness evidence writes (`SICKNESS_SELF_CERT_UPDATE`, `SICKNESS_FIT_NOTE_CREATE`, `SICKNESS_FIT_NOTE_UPDATE`), and return-to-work writes (`SICKNESS_RETURN_TO_WORK_UPDATE`). Unique on `(tenantId, actorId, operation, key)`. Stores a payload fingerprint and the resulting Absence id, and where needed the follow-up or fit note id. Identical retries return the original record. The same key with a different payload is rejected and creates nothing. Rows expire after 24 hours; expired keys for that actor are deleted lazily on the next matching write.

## Tenant timezone

`Tenant.timezone` is a required IANA timezone. Existing and new tenants default to `Europe/London`. Missing or invalid values fail with an administrator-facing configuration error. There is no silent fallback to the browser, server, or database timezone.

- **AWOL** eligibility, Date recorded default, correction eligibility, and Ledger date bounds use `tenant.timezone`.
- **Sickness** reported date default, future-date rejection, advance-report confirmation, and sickness end-date future rejection use `tenant.timezone` (Center Circle: `Europe/London`).
- **Cancellation** notice calculation remains `Europe/London` (`OPERATING_TIMEZONE`) so existing Cancellation behaviour is unchanged.

## AWOL date semantics

- **Event date** is snapshotted from the selected Event. The administrator does not type a second occurrence date.
- **Date recorded** is stored in `reportedDate` and labelled Date recorded in the AWOL UI. It defaults to the tenant-local current date, cannot be in the future, and cannot be earlier than the Event date.
- A past Event is eligible. A future Event is not.
- A same-day Event with a known start time is eligible only when tenant-local now is at or after that start. Overnight Events use the stored start date/time.
- A same-day Event with no start time requires `sameDayStartUnknownConfirmed`.
- Client previews are usability only. The server recalculates at save using trusted Event values and a controllable clock in tests.

## Sickness date semantics

- **Date sickness reported** is stored in `reportedDate`. It defaults to tenant-local today and cannot be in the future. It may be before, equal to, or after the first working day affected.
- **First day sick from work** has no default. It cannot be more than 31 calendar days after the reported date. A future first working day requires an advance-report confirmation checkbox.
- **Sickness started**, when present, cannot be in the future and cannot be after the first working day.
- **Sickness ended**, when recorded, is the last calendar date the episode affected the staff member. It cannot be in the future, cannot be before the first working day, and cannot be before Sickness started when that date exists. It may be before Date sickness reported for retrospective reports, and may equal the first working day for a one-day episode.
- There is no maximum historical age.
- Client date widgets are usability only. The server revalidates with tenant-local today.

## Notice calculation

Operating timezone is `Europe/London`. Calendar dates use `parseLocalDate` / UTC midnight, same as Events and Staff.

- `noticeCalendarDays` = event date − reported date (date-only; negative values are kept).
- If both reported time and event start time exist, combine each with its calendar date in London, store signed `noticeMinutes`, and set `noticeBasis = EXACT_TIME`. Short notice is `noticeMinutes < 1440`.
- Otherwise `noticeBasis = CALENDAR_DATE`, `noticeMinutes` is null, and short notice is `noticeCalendarDays <= 0`.
- Retrospective confirmation is required only when the report is **after** event start (exact) or **after** event date (calendar). Same-day calendar reports are short notice, not retrospective.
- Overnight `endsNextDay` does not affect notice (notice is to event start).
- Client preview uses the same helper; the server always recalculates from the trusted Event and reported date/time. Never persist a browser-supplied notice value.

AWOL and Sickness do not calculate or display notice.

## Duplicate protection and idempotency

At most one **active** Cancellation **or** AWOL per tenant/staff/event. Sickness is excluded from that slot. Enforced by a SQL partial unique index:

`(tenantId, staffId, eventId) WHERE recordStatus = 'ACTIVE' AND eventId IS NOT NULL AND type IN ('CANCELLATION', 'AWOL')`

At most one **active** Sickness per tenant/staff/first working day. Enforced by:

`(tenantId, staffId, firstWorkingDaySick) WHERE recordStatus = 'ACTIVE' AND type = 'SICKNESS' AND firstWorkingDaySick IS NOT NULL`

Sickness does not conflict with Cancellation or AWOL solely because the Staff member is the same. The service pre-checks and maps Prisma `P2002` to a field error that links to the existing same-tenant record. Archiving frees the unique slot so a replacement can be logged.

AWOL and Sickness create also use an idempotency key so double-click, refresh, and retry return the original successful result. Sickness episode updates use a separate `SICKNESS_EPISODE_UPDATE` key.

AWOL and Sickness correct/archive, and Sickness episode update, lock the Absence row (`SELECT … FOR UPDATE`), assert `recordStatus = ACTIVE`, and require a matching `updatedAt` precondition. A stale writer is rejected and must reload. A no-change Sickness correction or episode update is rejected with no audit event. Changing or clearing an existing ended date requires the established 2–500 character correction reason. Changing Ended to Ongoing also requires explicit confirmation that the previous end date was incorrect.

A Part 1 correction that would put First day sick from work or Sickness started after an existing end date is rejected. Update the episode first.

## Tenant isolation

All queries and mutations use `tenantId` from `requireTenant()`. Cross-tenant Staff, Event, Venue, or Absence identifiers return the same not-found outcome as a missing id.

## Write path

Server actions in `src/app/(app)/absence/actions.ts` authenticate with `requireTenant()`, parse FormData with the shared Zod schema, and call `createCancellation` / `correctCancellation` / `archiveCancellation`, `createAwol` / `correctAwol` / `archiveAwol`, or `createSickness` / `correctSickness` / `updateSicknessEpisode` / `archiveSickness`. Those functions load same-tenant live Staff (and Event where required), and write Absence + type detail + history in one transaction. A Sickness request that contains an Event ID or another type's fields is rejected, not silently corrected. The initial Sickness report remains a fast entry form and does not require an end date.

## Archive

Logical deletion: `recordStatus = ARCHIVED` plus `archivedAt` / `archivedById` / `archiveReason`. Archived records stay reachable by URL for audit. They are excluded from default staff Absence History and from the active Ledger. Hard deletion is not supported. Archiving a Sickness report does **not** record recovery or return to work.

Staff history has a **Show archived** control that includes authorised archived Sickness rows only. Archived Cancellation, AWOL and Sickness rows are discoverable from the Ledger when **Show archived** is enabled. They are excluded from the default active Ledger.

## Ledger

`/ledger` is a tenant-scoped read-only All absences list. It does not copy rows into a separate Ledger table, mutate records, or show payment / recovery status. Ledger status stays Active or Archived. Follow-up notes are not listed on Ledger rows. Viewing the Ledger does not create operational audit events. Correction and archive stay on type-specific detail pages. The Ledger drawer can show the same follow-up section and, for Sickness, the same Evidence and Return to work sections as the full absence page. Fit note notes and return-to-work notes are not listed on Ledger rows.

Default view is All absences (`/ledger`, unknown `view` values fall back here). Focused views filter the same query: `view=cancellations`, `view=awol`, `view=sickness`. Active records only unless `includeArchived=1`.

Shared date projections (display and query only; they do not change source records):

- **Recorded** — Cancellation reported date, AWOL date recorded, Sickness date reported (`Absence.reportedDate`).
- **Affected date** — Cancellation/AWOL Event date snapshot, Sickness first day sick from work.

Default All absences order is Recorded descending, then Affected date, `createdAt`, then `id`. Allowed shared sorts are `type`, `staff`, `reported`, `affected`, `created`. Focused views also allow `notice` (Cancellations), `event` (Cancellations/AWOL), `sicknessStarted` (Sickness). `eventDate` and `firstDay` are aliases of `affected`. Sort fields are allow-listed server-side.

Search covers Staff name/ID (live Staff plus Sickness snapshots) and Event name/reference for Cancellation and AWOL. It never searches Cancellation reasons, AWOL notes, Sickness Issue summary, or fit note notes. The Sickness search placeholder is **Staff name or Staff ID**; event-linked views use **Staff name, Staff ID, Event name or reference**.

Filters: Recorded From/To (`reportedFrom`/`reportedTo`), Affected From/To (`affectedFrom`/`affectedTo`; older `eventFrom`/`eventTo` and `firstDayFrom`/`firstDayTo` still parse), Venue and Event type for All, Cancellations and AWOL only. Event filters exclude Sickness because Sickness has no Event. A Sickness URL that still carries `venue` or `eventType` is normalised: those params are ignored for query, omitted from the active-filter summary, and redirected out of the address bar. Compatible params (`q`, dates, `includeArchived`, sort, direction) are kept. Shared compatible filter state continues when switching views.

The results summary distinguishes filtered matching counts from overall active totals. When filters are off, All absences shows the active total plus type totals. When filters are on, it shows the matching count (and matching types on All), then an explicitly labelled overall active total. Show archived is called out on the matching line. Page size is 25.

The table uses shared columns (Type, Staff, Recorded, Affected date, Context, Status, View) plus a compact type-aware Context cell: Cancellation event/venue/notice, AWOL event/venue/reference, Sickness episode status (and end date when Ended), started date, and **Issue summary recorded** when present. Raw Issue summary, full notes, and full Cancellation reasons are never selected or returned. Staff display uses live Staff for Cancellation/AWOL and Sickness snapshots. Status is Active or Archived only. Ended active Sickness records remain in default active results and counts.

**View** opens a type-aware detail drawer on the Ledger immediately from the row already on the page. The click writes `?detail=[absence-id]` with the history API and does not reload the list, so the current filters, sort, and page stay put. The header and the fields already on the row (type, status, staff, dates, and type context) show at once. Issue summary text, reasons, notes, staff role, created and updated by, Evidence, return to work, follow-ups, history, and the Correct, Archive, and Update sickness actions load after the drawer is open, with skeleton placeholders until `getAbsenceForTenant` returns. An icon at the top of the drawer opens `/absence/[id]` for Cancellation, AWOL, and Sickness. Desktop uses a right-hand sheet; narrow screens use a full-screen sheet. Cancellation detail shows the stored Venue name snapshot from `CancellationDetail` (the same snapshot as the Ledger row), not a live Event lookup. Closing the drawer (Close, Escape, or Back) restores the originating View action and does not reset filters. Sickness Issue summary and fit note notes stay on authorised detail views and are never placed in the URL.

Indexes (reviewed against the mixed query; no extra Ledger migration added):

- `Absence (tenantId, type, recordStatus, reportedDate)` — type list and Recorded range.
- `Absence (tenantId, type, recordStatus, firstWorkingDaySick)` — Sickness first-day range.
- `CancellationDetail (tenantId, eventDateSnapshot)` — Cancellation affected-date sort.
- `AwolDetail (tenantId, eventDateSnapshot)` — AWOL affected-date sort.
- `SicknessDetail (tenantId, firstWorkingDaySick)` — Staff history Sickness sort.
- `Absence (tenantId, staffId, firstWorkingDaySick)` — Sickness duplicate lookup.

## Routes

- `/ledger` — All absences Ledger (default). `detail=[absence-id]` opens the type-aware review drawer.
- `/ledger?view=cancellations` — Cancellations
- `/ledger?view=awol` — AWOL
- `/ledger?view=sickness` — Sickness (`q`, `reportedFrom`, `reportedTo`, `affectedFrom`, `affectedTo`, `includeArchived=1`, `evidenceStatus=required_unrequested|requested_pending|overdue|received`, `sort`, `direction`, `page`)
- `/absence/new` — log Cancellation, AWOL, or Sickness (`?staffId=` preselects Staff, `?type=awol` or `?type=sickness` opens that form)
- `/absence/[id]` — type-aware detail
- `/absence/[id]/edit` — type-aware correction
- Staff profile Absence History lists active Cancellation, AWOL, and Sickness rows (bounded, 10 per page), ordered by coalesced Event date snapshot or Sickness first working day, then reported date, then created at, then id. `?absenceArchived=1` includes archived Sickness.

## Future Sickness work

Documents, contact attempts, first day back, automatic closure, and reliability scoring are not in this release. Fit-note evidence records administrative receipt only. It does not upload documents or calculate certificate coverage. The fit note day and chase interval are tenant settings with internal follow-ups. Manual return-to-work records the administrative position only. Digital sick-note storage remains deferred until storage, privacy, access, and retention decisions are approved. Working-day calendars and richer Sickness management views remain later slices. Re-plan each later slice against Centre Circle workflow and privacy/retention decisions. Do not expose empty compliance, document, or contact panels before those rules exist. After any Sickness row exists, rollback must not restore `eventId NOT NULL`, delete Sickness data, invent Event IDs, or discard a recorded end date — disable new writes and use a reviewed forward fix.

### Migration verification

```sql
-- Preflight: every Cancellation/AWOL has an Event
SELECT COUNT(*) FROM "Absence"
WHERE "type" IN ('CANCELLATION', 'AWOL') AND "eventId" IS NULL;
-- Must be 0 before and after the Sickness migration.

-- Constraint and duplicate index
SELECT conname FROM pg_constraint WHERE conname = 'Absence_event_required_by_type';
SELECT indexname FROM pg_indexes
WHERE indexname = 'Absence_tenantId_staffId_firstWorkingDaySick_active_sickness_key';
```
