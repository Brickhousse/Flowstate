# Flowstate

A keyboard-first flowchart canvas for redesigning processes into agentic workflows, with a Claude assistant that can make any edit you can.

## Run it

1. Node 24 or newer.
2. `npm install`
3. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` (from console.anthropic.com). The chat stays disabled without it; everything else works.
4. `npm run dev`, then open http://localhost:5173

The dev API listens on port 8797 by default; set `FLOWSTATE_API_PORT` to override it.

Projects are saved as JSON files in `workspace/`.

## Privacy and cost

Nothing leaves your machine until you send a chat message. Each message sends the current board's structure and text (steps, arrows, lanes, flags, notes) to Anthropic's API and is billed to your key. Sonnet 5 is the default; Opus 5.5 costs about twice as much per token.

The local API only answers pages served from localhost (ADR 0004), so other websites cannot use your key or read your projects.

## Known limits

- Ctrl+Z is ignored while you are dragging or while the assistant is replying (ADR 0005).
- Every chat message resends the whole board, so long chats cost more. "New chat" resets the history.
- Two tabs open on the same project overwrite each other's edits.
- Steps resize from their corners only; the middle of each edge holds the + button.

## Keys

| Key | Action |
|---|---|
| Tab | Add the next connected step (while typing: save and add the next) |
| Enter | Add a parallel sibling (while typing: save) |
| Typing, F2, double-click | Edit the title |
| 1 to 9 | Shape: process, decision, start/end, data, document, database, preparation, connector, sticky |
| A | Cycle actor: person, system, AI agent, none |
| B / W / Q | Add a blocker, warning or question |
| T | Free text at the cursor |
| C | Critical path |
| L | Tidy layout |
| Arrow keys | Move to the nearest step in that direction |
| Delete, Shift+Delete | Delete, or delete and reconnect around it |
| Ctrl+Z, Ctrl+Shift+Z | Undo, redo (a whole assistant turn is one undo) |
| Ctrl+C, Ctrl+V, Ctrl+D, Ctrl+A | Copy, paste, duplicate, select all |
| Shift+drag, Alt+drag | Move in a straight line, or move without snapping |
| Ctrl+' | Snap to grid on or off (the Layout menu switches each assist) |
| Shift+1 | Fit the board |
| Space+drag, middle or right drag | Pan |
| Ctrl+K, Ctrl+/ | Focus the assistant, show or hide it |

Shift+click a board tab to view it read-only beside the active board.

## Tests

- `npm test` for unit tests
- `npm run test:e2e` for browser tests (they never call the real API)
- Live API check, PowerShell: `$env:LIVE_API=1; npx playwright test tests/e2e/live.spec.ts`
