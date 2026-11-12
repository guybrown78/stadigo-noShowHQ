# Documentation

Start with [PLATFORM.md](PLATFORM.md). That file is the product brief: what NoShowHQ is, what it does today, what it refuses to do, and what is only planned. Paste it into another model when that model needs to work on this repository without guessing.

| Document | Use it for |
| --- | --- |
| [PLATFORM.md](PLATFORM.md) | The brief to paste. Product, boundaries, and the rules that must survive a change. |
| [ROADMAP.md](ROADMAP.md) | Ideas and deferred work. Nothing in here is built. |
| [events.md](events.md) | Event, venue, catalogue, fill-rate estimate, and event import. |
| [staff.md](staff.md) | Staff records, managers, probation, and staff import. |
| [absences.md](absences.md) | Cancellation, AWOL, sickness, evidence, return to work, follow-ups, ledger, and pay periods. |
| [design/README.md](design/README.md) | Visual reference for screens that already exist. Not a product spec. |

`/sync-docs` updates this set from the current branch. It writes shipped behaviour into `PLATFORM.md` and the module document for that area, and it writes anything not yet built into `ROADMAP.md`.
