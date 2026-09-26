# 0010: Layout assist switches are per-user browser prefs, not project data

Status: Accepted (2026-09-26)

## Context
Each layout assist can be switched off: grid snap, smart guides, spacing guides, resize snap and Ctrl+arrow nudge. The switches express how one person likes to edit, not anything about the flow being drawn. Project files are the unit that will later be shared through hosted storage and co-editing (ADR 0002, ADR 0004). If the switches lived there, one person turning grid snap off would turn it off for everyone who opens the project.

## Decision
The five switches live in a small zustand store, `src/store/layoutPrefs.ts`. It is persisted to the browser's localStorage under `flowstate.layoutPrefs`, and all five default to on.

Reads and writes are wrapped. A blocked, full or corrupt store falls back to the defaults and keeps working in memory. Non-boolean stored values are ignored per key.

The Layout menu in the top bar and Ctrl+' are the ways to change them. The planned right-click menu will repeat the switches.

Rejected:
- Storing the switches in the project file: they would leak between people once projects are shared, and every toggle would become an undoable project change.
- A server-side per-user settings file: there are no users or authentication yet, so it adds an API for no gain today.
- Doing nothing (always on): the user asked for every assist to be switchable.

## Consequences
The switches do not follow a person across browsers or machines. Clearing site data resets them to all on.

When team sharing arrives, per-user settings move to the account. This store is the single place to swap for that.

Unit tests in `src/store/layoutPrefs.test.ts` cover the fallbacks. `tests/e2e/assists.spec.ts` covers persistence across a reload.
