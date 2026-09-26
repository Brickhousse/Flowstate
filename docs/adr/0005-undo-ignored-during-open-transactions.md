# 0005: Undo and redo are ignored while a transaction is open

Status: Accepted (2026-09-25)

## Context
A drag, a resize, a direction flip with tidy, and a whole AI turn each wrap their changes in `begin()`/`commit()` so they become one undo entry (`src/store/store.ts`). The plan's first version made `undo()` force-commit every open transaction level first. Review traced the effect: Ctrl+Z mid-drag turned every later pointer move into its own history entry (flooding the 200-entry cap), and an AI turn's final `commit()` returned null, so its chat Undo button never appeared. Redo during a transaction also discarded the transaction's edits.

## Decision
While `tx` is open, `undo()` and `redo()` do nothing. Every real change clears `future`, inside a transaction or not. The owner of a transaction is always the one that closes it: drags close on drag stop, on canvas unmount, and when the dragged node disappears; an AI turn closes only if the open transaction is still the one it began (`tx.base` identity).

Rejected:
- Force-commit on undo (the plan's version): splits the owner's later changes into many entries.
- Revert to `tx.base` and keep the transaction open: more coherent in theory, but the owner's later changes would then apply on top of state the user just undid, which is harder to reason about than waiting.
- Do nothing: history grouping stays broken.

## Consequences
Ctrl+Z is inert until a drag ends or an AI turn finishes; the user waits a moment. If a canvas drag is still open when an AI turn ends, the turn's edits join the drag's single entry, so that turn shows no chat Undo button (Ctrl+Z still reverts it). This is the known limit also recorded in ADR 0002. Token-owned transactions would remove it if it ever matters in practice.
