# 0012: Right-click menu opens on pointerup and yields to right-drag panning

Status: Accepted (2026-09-26)

## Context
Right-drag already pans (`panOnDrag={[1, 2]}`). The browser's `contextmenu` event fires on mousedown on macOS, before any movement is known.

## Decision
- Capture-phase `preventDefault` on `contextmenu` inside the canvas, except in text editors.
- Open our menu on a right-button pointerup that moved less than 4px.
- Shift+F10 and the ContextMenu key open it at the selection.

Rejected:
- An off-the-shelf menu (Radix) that opens on `contextmenu`: it breaks right-drag panning on macOS and adds a dependency.
- Moving pan off the right button: it changes existing muscle memory.

## Consequences
A slow right-click with a 4px wobble pans instead of opening the menu. A right-drag pan that returns within 4px of its start opens the menu, because only the start and end points are compared. On macOS, a Ctrl+click reports button 0, so it opens no menu inside the canvas; a two-finger click (button 2) does.
