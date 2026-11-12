# Sync map

Read this when `/sync-docs` needs to know which file owns a change. One level below the skill. Do not add a third layer.

## PLATFORM.md headings

Keep these, in this order. Add subsections under them. Do not rename them.

1. What it is
2. Who it is for
3. What it does today
4. What it does not do
5. How the product is organised
6. Rules that must not be broken
7. Where the detail lives
8. What comes later
9. Document status

The opening paragraphs before "What it is" stay: how to use the file, and the instruction that code wins until the next sync.

## Which file owns the change

| If the branch changes… | Update |
| --- | --- |
| A capability, role, screen, or product boundary a newcomer must know | `docs/PLATFORM.md` |
| Event, venue, catalogue, archive, fill rate, event import | `docs/events.md` and the events paragraph in the brief |
| Staff fields, managers, clearance, probation, staff import | `docs/staff.md` and the staff paragraph in the brief |
| Cancellation, AWOL, sickness, evidence, return to work, follow-ups, ledger, pay periods, notice, duplicates | `docs/absences.md` and the matching paragraph in the brief |
| Dashboard, watchlists, settings that only change a threshold already named in the brief | `docs/PLATFORM.md`. Use `docs/absences.md` when the ledger or watchlist query rules change. |
| Auth, tenancy, cron, deployment | `docs/PLATFORM.md`. The root `README.md` only when setup steps or environment variables change. |
| Look and feel, with no behaviour change | Do not edit the product docs. `docs/design/README.md` only if the visual reference itself changed. |
| Future work with no code | `docs/ROADMAP.md`, then the "What comes later" summary |

`docs/README.md` changes only when a document is added or removed.

## Roadmap entry

```markdown
### Short name

- **Status:** `idea`
- **What:** One sentence a later model can act on without this chat.
- **Why it is waiting:** What is true in the product today instead.
- **Source:** Conversation on this sync, or the file and symbol that suggested it.
```

Set `next` only when the user said this is the next slice. Set `deferred` only when the product has already refused to build it until a named decision (privacy, retention, payroll, messaging).
