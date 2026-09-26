# 0006: Validate project files against a full schema on load and save

Status: Accepted (2026-09-26)

## Context
`migrateProject` originally checked only `id`, `name`, `schemaVersion` and that `boards` was a non-empty array. A hand-edited export (a board missing `nodes`, a node missing `flags`) passed import, was saved by the server, became the newest project, and crashed rendering on every launch until the file was deleted from `workspace/` by hand.

## Decision
`src/model/migrate.ts` validates the whole structure with a zod schema that mirrors `src/model/types.ts` field for field (boards, nodes, edges, lanes, flags, `nextId`, and every enum), and throws `ProjectFormatError` with a readable message. The same function runs on client load, server load (422) and server save (400, nothing written), and on import. Boot skips a project it cannot load and opens another one with a toast; a root error boundary offers "Open another project" if rendering still fails. Referential integrity (an edge pointing at a missing step) is deliberately not validated, because the ops already tolerate dangling references.

Rejected:
- Top-level checks only (the original): lets a malformed file brick the app.
- An error boundary alone: recovers the UI but keeps saving and reloading the bad file.
- Do nothing.

## Consequences
Every future change to the saved format needs a schema update and a migration step in `MIGRATIONS`; a file missing a field that older code did not write is refused instead of loaded. Unknown keys are stripped on parse, so data outside the model is not preserved.
