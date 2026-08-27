# Events data model

Tenant-scoped operational events. This module is the record other features (absences, fill-rate, risk alerts, bulk import) will attach to.

## Entities

### Event
Belongs to exactly one tenant. Soft-deleted with `deletedAt` / `deletedById`; deleted events are excluded from lists, search, and normal get/edit.

Key fields: `name`, optional tenant-unique `reference`, `eventDate` (`DATE`, Europe/London calendar date stored as UTC midnight), optional local `briefingTime` / `startTime` / `endTime` (`HH:mm` strings; the form sets hour and minutes separately, with minutes in 5-minute steps), `endsNextDay` for overnight events (briefing must be earlier than start; end must be later than start unless this flag is set), `staffRequired`, `warningFillRate` (default 90) and `criticalFillRate` (default 85, must be strictly lower), `status` (`PLANNED` | `CONFIRMED` | `CANCELLED` | `COMPLETED`).

`tenantId`, `createdById`, and `updatedById` always come from the authenticated session, never from the client.

### EventType / EventSubtype
Per-tenant taxonomy, seeded when a tenant is provisioned (and on first Events visit for existing tenants). Subtypes belong to one type. The database enforces the pairing with a composite foreign key `(eventSubtypeId, eventTypeId)`.

Default types: Sporting, Music and Entertainment, Festival, Community and Gathering, Other.

### Venue
Per-tenant venue. Names are unique after trimming and lowercasing (`nameNormalized`). Known Centre Circle venues are seeded for tenants whose name/slug matches Centre Circle.

Manage the list in **Settings → Event settings**: add, edit name/address/postcode, and mark a venue inactive so it stays on past events but is hidden from the add-event form. When a search on the event form finds no match, you can create a venue there; it is saved with the event and reused next time. Inline create reuses an existing match instead of inserting a duplicate.

### EventImport
Audit record for a bulk upload. Stores the initiator, sanitised filename, file hash, preflight counts, venue resolution counts, created counts, status and timestamps. Child `EventImportRow` and `EventImportVenue` rows hold mapping and validation results for review. The raw spreadsheet is not stored.

Statuses: `UPLOADED`, `VALIDATION_FAILED`, `AWAITING_VENUE_CONFIRMATION`, `VENUES_CONFIRMED`, `AWAITING_EVENT_CONFIRMATION`, `COMPLETED`, `FAILED`, `CANCELLED`.

## Bulk import

Administrators import from **Events → Import events**. The flow is:

1. Download the tenant-specific `.xlsx` template (Events, Instructions, Reference Data sheets) or upload a UTF-8 CSV with the same headers.
2. Upload is parsed and fully validated. No venues or events are created at this step.
3. If any row is invalid, the import is blocked. Download an error report, correct the file, and upload again.
4. If the file is valid, confirm venues. New venues are created first (or reused if another user created the same name during review). Matched existing venues still require confirmation. Inactive name matches are reused and reactivated.
5. Confirm the event preview. Events are created in one transaction using `eventInputSchema` and `createEventsBatch` (the same write rules as `createEvent`). Refreshing or retrying a completed import does not create events twice.

Limits (`src/lib/events/import/constants.ts`): 5 MB and 5,000 data rows. Tenant identity always comes from `requireTenant()`.

## Tenant isolation

All queries filter by `tenantId` from `requireTenant()`. Cross-tenant identifiers return the same not-found outcome as a missing id.
