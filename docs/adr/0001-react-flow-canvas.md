# 0001: React Flow for the canvas

Status: Accepted (2026-09-25)

## Context
Flowstate needs an infinite canvas where diagrams are graphs (steps and connected arrows) so that AI edits, dependencies and critical path work on structure, not pixels.

## Decision
Use `@xyflow/react` (MIT) with custom node and edge components. Rejected: tldraw (freeform drawing model, commercial licence for production) and a custom canvas (months of work before parity).

## Consequences
Freehand drawing is out of scope. The board model stays our own (`src/model`); React Flow is only the view, so a future renderer swap does not touch the data.
