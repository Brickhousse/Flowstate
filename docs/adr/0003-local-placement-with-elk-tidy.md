# 0003: Local placement for edits, ELK only on request

Status: Accepted (2026-09-25)

## Context
Users arrange boards by hand. Re-running a global layout after every AI edit would move everything they placed.

## Decision
Ops place new steps next to their anchor and shift only downstream steps when room is needed (`src/layout/place.ts`). ELK layered layout runs only for Tidy, direction changes, and the AI `tidy` tool.

## Consequences
Small edits never disturb the board. Large AI restructures can look crowded until Tidy runs; the system prompt tells Claude to call `tidy` after heavy restructuring.
