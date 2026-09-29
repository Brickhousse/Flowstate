# 0017: Colour fields accept any string in the file and only colours in operations

Status: Accepted (2026-09-28)

## Context
Steps have a `color` since layout assists, and arrows gain one in schema 2 (a playtest request). Project files are validated against a full schema on load and save (ADR-0006), so a strict field fails the whole project over one stray value. The step field has always been `z.string().nullable()`, and a test relies on a non-colour step value loading.

## Decision
- In the file schema, step and arrow `color` are both `z.string().nullable()`, required, with no default (`src/model/migrate.ts`).
- Drawing resolves a value through `fillOf` (`src/model/color.ts`): a tint name, a `#rrggbb` hex, or anything else drawn as the default.
- Operations reject values `isColor` refuses, with one shared check for steps and arrows (`src/ops/color.ts`).

Rejected:
- A strict `refine(isColor)` on the arrow field only: one field stricter than its twin, and one typo stops the project opening.
- Strict on both fields: the same failure for steps, and an existing file with a stray step colour would no longer open.

## Consequences
- A hand-edited or imported bad colour loads and draws as the default, with no warning.
- The two fields change together: tightening one alone makes them disagree again.
