# 0019: The note panel saves whenever it closes, Escape included

Status: Accepted (2026-09-29)

## Context
Step notes grew from a one-line toolbar field into a multi-paragraph panel (spec `docs/superpowers/specs/2026-09-28-step-notes-design.md`). Elsewhere Escape cancels: the title editor and the toolbar fields throw the edit away. The panel also closes on things the user did not aim at it: a click outside, a wheel outside, a window resize, focus moving to another element, a board tab switch, opening another step's note, page unload.

## Decision
- Every close saves the note when its trimmed text differs from the stored note, Escape included. There is no cancel key; Ctrl+Z undoes the whole open-edit-close session as one step.
- A close with no change adds no undo entry.
- The save is pinned to the board the panel was opened on, and dropped if the step no longer exists (`src/canvas/note/noteSession.ts`).
- The panel stays open on window blur, so alt-tabbing away mid-note loses nothing.
- The panel registers its close as a draft (`src/store/drafts.ts`), which `beforeunload` runs before its unsaved-work check (`src/boot.ts`).

Rejected:
- Escape cancels, as in the title editor: a long note is lost to one stray key.
- A confirmation on close: friction on every close for a rare mistake.
- Saving on every keystroke: floods undo, or needs a transaction held open while the panel is open, which blocks undo everywhere else (ADR-0005).
- Closing on window blur: alt-tab would close the panel and take the writer's place with it.

## Consequences
- Escape means "done" in the note panel and "cancel" in the title editor and toolbar fields. The README says so.
- The panel closes and saves when focus moves to another element in the page, which covers Shift+Tab, and on Tab, which it takes itself: Tab from the end of the page would move focus to the browser, a window blur the panel ignores. It also closes when the Note button, the marker or Shift+F2 is used a second time. Keys pressed in the panel never reach the board's shortcuts.
