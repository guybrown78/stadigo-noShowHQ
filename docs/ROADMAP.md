# Roadmap

Work that is **not** in NoShowHQ today. [PLATFORM.md](PLATFORM.md) summarises this list under “What comes later”. If an item here is built, `/sync-docs` moves the behaviour into `PLATFORM.md` and the matching module document, then marks the item `shipped` instead of deleting it.

Status values:

| Status | Meaning |
| --- | --- |
| `idea` | Someone asked to remember it. No decision to build it. |
| `deferred` | The product has already chosen not to build this until a later decision. |
| `next` | The current branch or an explicit request has named this as the next slice. Still not built. |
| `shipped` | Now in the product. Kept here so the history of the idea is not lost. |

Do not treat `idea` or `deferred` as permission to start building.

## Deferred

These come from the current product boundaries and from notes already in the module documents. They are not a delivery commitment.

### Messaging

- **Status:** `deferred`
- **What:** Email, SMS, push, or a notification centre to staff or administrators. Probation chases and fit-note chases would leave the in-app queues.
- **Why it is waiting:** The product chases inside the app on purpose. Staff have no login and no outbound message is sent today.
- **Source:** Product boundary. `docs/design/README.md` listed SMS and a notification centre as out of scope. Probation and sickness docs say no email or SMS.

### Reliability scoring

- **Status:** `deferred`
- **What:** A reliability percentage, strike count, or serial-offender score on a person.
- **Why it is waiting:** Thresholds on the dashboard are counts against the tenant’s own settings. They do not score someone or change employment status.
- **Source:** `docs/design/README.md`. Not implemented in the dashboard or staff record.

### Document storage

- **Status:** `deferred`
- **What:** Upload and retain a fit note, certificate, or other file. Production notes mention Vercel Blob (`BLOB_READ_WRITE_TOKEN`) for when this exists.
- **Why it is waiting:** Privacy, access, and retention are not decided. Evidence today is a status row (Not recorded, Requested, Received, and so on), not a file. Import spreadsheets are read in the request and discarded.
- **Source:** `docs/absences.md` future sickness work. `README.md` production note.

### Self-serve password reset

- **Status:** `deferred`
- **What:** An emailed reset link for a locked-out user.
- **Why it is waiting:** `/forgot-password` redirects to `/login`. A signed-in user changes their own password in Profile. A super admin sets a temporary password from the tenant page. A `PasswordResetToken` model exists and is unused by a live flow.
- **Source:** `README.md` password-reset section. `src/app/(auth)/forgot-password/page.tsx`.

### Rota and true fill

- **Status:** `deferred`
- **What:** A rota or assignment of named staff to an event, and a fill rate based on that assignment rather than on logged absences.
- **Why it is waiting:** Fill rate is `max(0, staff required − active cancellations and AWOL) / staff required`. Sickness is excluded because it cannot reference an event.
- **Source:** `docs/events.md`.

### Fill-rate alerts

- **Status:** `deferred`
- **What:** A message or task when an event’s estimated fill rate drops through the warning or critical threshold.
- **Why it is waiting:** The event page colours the estimate. Crossing a threshold does not create a task or send anything.
- **Source:** `docs/events.md`.

### Working-day and certificate calendars

- **Status:** `deferred`
- **What:** Working days, bank holidays, fit-note coverage periods, or expiry of a received fit note.
- **Why it is waiting:** Fit-note day count uses calendar days, including weekends. A received fit note does not calculate coverage or expiry. Sickness span is calendar days between first working day and end date, and is not payroll days.
- **Source:** `docs/absences.md` sickness evidence and future work.

### Richer sickness operations

- **Status:** `deferred`
- **What:** Contact attempts, a first day back, and automatic closure of a sickness episode.
- **Why it is waiting:** End date, return to work, evidence, and archive are separate manual facts. None of them implies the others. Episodes are not auto-closed.
- **Source:** `docs/absences.md` “Future Sickness work”.

### Reports beyond the dashboard

- **Status:** `deferred`
- **What:** A separate reports area, exports, or charts that are not the dashboard already on `/dashboard`.
- **Why it is waiting:** The dashboard is the reporting surface that ships. The client mock’s extra report screens were not adopted as a spec.
- **Source:** `docs/design/README.md`. The mock is look-and-feel only.

## Ideas

None recorded yet. `/sync-docs` adds an idea here when the conversation or the branch describes future work that is not in the code and is not already listed above.

## Shipped

None recorded yet. When a deferred item is built, move its entry here with the branch, commit, and date, and update `PLATFORM.md`.
