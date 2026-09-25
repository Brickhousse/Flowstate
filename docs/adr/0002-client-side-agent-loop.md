# 0002: Agent loop in the browser, thin server proxy

Status: Accepted (2026-09-25)

## Context
Claude's tool calls must edit the same state the user is editing, show up live, and undo as one step. The API key must not reach the browser.

## Decision
The server only proxies `messages.stream` over SSE and holds the key. The browser runs the loop: it applies each complete tool call through `src/ops` (the same functions the UI uses) inside one store transaction per turn, then posts tool results back.

## Consequences
One source of truth and no state sync. The server forwards a tool call only once the next block starts or the message ends with `tool_use`, so a call cut off by `max_tokens` is never applied. Moving to a hosted, multi-user setup later means adding auth in front of `/api/chat` and moving storage, not moving the loop.

Known limit: undo and redo are ignored while a canvas drag or an AI turn is in progress. If a canvas drag is still open when an AI turn ends, the turn's edits join the drag's undo entry, so the chat Undo button does not appear for that turn (Ctrl+Z still reverts it).
