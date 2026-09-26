# 0007: Pin each AI turn to the board it was sent from

Status: Accepted (2026-09-26)

## Context
Each chat message carries a summary of the active board, and Claude refers to steps by per-board ids (`s1`, `e4`). Tool calls that omit `board` originally resolved to whatever board was active when the call ran. Because nearly every board has an `s1`, switching tabs mid-turn made the rest of the turn edit same-numbered steps on the wrong board, silently.

## Decision
`sendMessage` (`src/chat/send.ts`) pins the turn to the board that was active when the message was sent, and `storeToolContext` returns that pin as `activeBoardId()` for the executor. The pin moves only when `create_board` switches boards. A tool call on a pinned board that has since been deleted fails with a readable error instead of falling back to another board.

Rejected:
- Follow the active board (the original): silent edits to the wrong board.
- Block tab switching during a turn: adds friction for a rare case and contradicts letting the user keep working while Claude edits.
- Do nothing.

## Consequences
Claude keeps editing the board it was told about even while the user looks at another one. Glow and reveal feedback still target the currently visible board, so after a mid-turn tab switch the highlight can land on same-numbered steps there; the edits themselves are correct.
