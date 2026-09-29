# Step notes design

**Date:** 2026-09-28
**Status:** Draft. Written while the user was away, on their standing instruction to take the recommended option; every choice made on their behalf is marked *(choice)* for review.

## 1. Goal

Let a step carry a longer explanation, such as what a presenter says aloud about it, without cluttering the board. Today `note` is a one-line toolbar input, shown on the box as one italic line cut off with an ellipsis, and it cannot be read in the reference view.

Success:
- A note keeps its paragraphs.
- The box still shows one quiet line, plus a marker when there is more to read.
- Anyone can read the whole note, in the editor and in the reference view, in one click.
- The assistant puts explanations in the note instead of the title, and never truncates a note it edits.

Out of scope: rich text (bold, lists, links), notes on arrows, lanes or groups, and the export side panel (the HTML export spec already shows the full note there).

## 2. Data

No schema change. `BoardNode.note` stays a `string`; paragraphs are separated by a blank line (`\n\n`) and single line breaks are kept as typed. On save the editor trims leading and trailing whitespace only.

## 3. On the box

- The note line shows the note's first line (the text before the first line break), in the current style: one line, italic, ellipsis on overflow.
- A small note marker (lucide `notebook-text`, or the nearest notebook icon in the installed version) sits at the end of that line when there is more to read: the note has a line break, or its first line overflows the box. Overflow is measured in the existing `fitTitle` layout effect, which already reads the box layout, so no new layout pass is added.
- The marker is a button: a click opens the note panel (section 4) and does not select, drag or start editing the step. It shows in the reference view too. It is hidden in PNG and SVG exports *(choice: exports are for reading the board, and the marker would point at nothing)*.

## 4. The note panel

One popover, anchored under the step, built on the shared `Popup` (portal, clamping, dismissal).

- **Opening it:** the marker; a new "Note" button in the step toolbar, which replaces the note field in "More details" *(choice: a note needs room, and the toolbar row is one line high)*; and Shift+F2 on a single selected step *(choice: it pairs with F2 for the title, and a new single letter would take another letter from typing-to-edit)*.
- **Editing (editable view):** a textarea about 320px wide that grows with its content up to about 12 lines, then scrolls. Enter adds a line break. The note saves when the panel closes: Escape, Ctrl+Enter, a click outside, or opening another step's note *(choice: Escape saves rather than cancels, so a long note is never lost to a stray key; Ctrl+Z undoes it)*. One open-edit-close session is one undo step, and closing without a change adds no undo step.
- **Reading (reference view):** the same popover shows the note as paragraphs, read-only, with no textarea.
- The panel closes on Escape, outside click, wheel and window resize, as other popups do, and when the step is deleted or the board changes.

## 5. The assistant

- `add_steps` and `update_steps` describe `note` as: "Longer explanation of the step, such as what a presenter would say about it. Separate paragraphs with a blank line. update_steps replaces the whole note."
- The system prompt gains one line: put explanations, rationale and anything the user would say aloud about a step in its note, as short paragraphs, and keep titles short.
- **Board summary:** each note appears quoted as today, cut to its first 300 characters *(choice: keeps long boards cheap to send every turn)*. A cut note ends with `…` and the step line gains ` note-truncated`.
- **New tool `read_notes`:** input `{ board?: string; ids: string[] }`, returns the full note of each step. The `update_steps` description tells the assistant to call it before changing a note the summary marks `note-truncated`, so an edit never drops the hidden part.
- The stats line counts note changes under the existing "steps updated" wording; no new stat.

## 6. Structure

| Unit | Responsibility |
|---|---|
| `src/model/note.ts` | Pure note text rules: first line, whether there is more than the first line, trimming on save, summary excerpt |
| `src/canvas/note/NoteMarker.tsx` | The marker button on the box |
| `src/canvas/note/NotePanel.tsx` | The popover: textarea when editable, paragraphs when read-only |
| `src/canvas/note/useNotePanel.ts` | Which step's note is open, opening and closing, the single save on close |
| `src/canvas/StepNode.tsx` | Draws the note line and marker; reports overflow from `fitTitle` |
| `src/canvas/FloatingToolbar.tsx` | The Note button; the note field leaves "More details" |
| `src/canvas/useKeyboard.ts` | Shift+F2 |
| `src/analysis/summary.ts`, `src/ai/*` | Summary excerpt, `read_notes`, descriptions, prompt line |

## 7. Performance

Notes add no work to drags or routing. The only new per-box work is one overflow comparison inside the existing layout effect. The arrow routing budget (drag p95, open, pan) must still pass.

## 8. Testing

- Unit: `note.ts` rules (first line, more-to-read, trim, excerpt at 300 characters); summary excerpt and `note-truncated`; `read_notes` (unknown ids refused, full text returned); tool descriptions.
- Browser: write a two-paragraph note from the toolbar button, close with Escape, one undo step, box shows the first line and the marker; the marker opens the panel without selecting or dragging; Shift+F2; closing with no change adds no undo step; reference view shows paragraphs read-only; marker hidden in PNG export.

## 9. Slices

1. The note panel, marker, toolbar button and Shift+F2 (a human playtest follows this slice).
2. The assistant: descriptions, prompt line, summary excerpt, `read_notes`.
