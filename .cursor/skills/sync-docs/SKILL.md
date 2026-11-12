---
name: sync-docs
description: >-
  Update NoShowHQ product docs from the current branch. Use when the user
  runs /sync-docs, says "sync docs", or asks to fold branch work and roadmap
  ideas into PLATFORM.md, ROADMAP.md, or the module docs.
disable-model-invocation: true
---

# Sync docs

Bring `docs/PLATFORM.md`, `docs/ROADMAP.md`, and the module docs in line with the current branch. Shipped behaviour goes in the product brief. Ideas that are not in the code go on the roadmap. Never the other way around.

## Read first

1. [docs/PLATFORM.md](../../../docs/PLATFORM.md) — the paste-ready brief. Keep its headings.
2. [docs/ROADMAP.md](../../../docs/ROADMAP.md) — anything not built.
3. The module doc for each area the branch touches. The map is in [reference.md](reference.md).

## Gather evidence

Work from the branch, not from memory.

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD
git merge-base HEAD main
git log --oneline $(git merge-base HEAD main)..HEAD
git diff $(git merge-base HEAD main)...HEAD
git diff
```

Also use what the user said in this conversation. A sentence like "we should add X later" is a roadmap idea. It is not a feature.

Read the code the diff actually changes before rewriting a behaviour sentence. A commit message is a hint, not the spec.

## Sort each change

| Evidence | Write it in |
| --- | --- |
| Behaviour a user can do, or a rule the code enforces, on this branch (committed or uncommitted) | `PLATFORM.md`, and the module doc if the change is field-level for that area |
| A bugfix that makes the docs true again | The sentence that was wrong. Do not add a changelog entry. |
| An idea, a "later", a TODO that names unbuilt work, or a request to remember something | `ROADMAP.md` only |
| A refactor, test, or style change with no behaviour change | Nowhere, unless a doc describes the old behaviour |

If the code and a doc disagree, the code wins. Correct the doc.

## Write

- Preserve the headings in `PLATFORM.md`. Add detail under the heading that already covers it. Do not add a second product narrative.
- Keep `PLATFORM.md` pasteable. State the capability and the boundary. Leave field lists, indexes, and SQL to the module doc, and link to it.
- In the module doc, edit the section the branch changed. Do not rewrite the file.
- On the roadmap, use the statuses in `ROADMAP.md`: `idea`, `deferred`, `next`, `shipped`. Default a new note to `idea` unless the user called it next or the existing docs already defer it.
- Do not add a roadmap item that restates a boundary already in `PLATFORM.md` under "What it does not do", unless the user is proposing to lift that boundary later. Then record the proposal as an `idea` and leave the boundary in place.
- When an item ships, describe it in `PLATFORM.md`, remove it from the "What comes later" summary, and move the roadmap entry to `shipped` with branch, short commit, and date. Do not delete the entry.
- Update the "What comes later" summary so it matches the roadmap and does not grow items the roadmap does not have.
- Update the document-status table: date, branch, short commit. If the worktree is dirty, say the brief includes uncommitted work; if it is clean, say it describes that commit.
- Do not commit unless the user asks.

## Finish in chat

Say what shipped behaviour you wrote, which roadmap items you added or moved, which files you left alone, and anything you could not confirm from the code. Do not paste the whole brief back.
