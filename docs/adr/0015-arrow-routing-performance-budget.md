# 0015: Arrow routing is held to a measured drag and load budget

Status: Accepted (2026-09-28)

## Context
The arrow routing spec (section 4) makes performance a hard requirement. On a board of 200 steps, 200 arrows and 20 separate arrows, routing may add at most 2ms to the p95 drag frame, and opening a 200-arrow board may take at most 10% longer. The spec also defines two scale-back steps if the budget is missed, each needing an ADR.

## Decision
- `tests/e2e/perf.spec.ts` builds that board (`routingBoard`), measures three drags and three page opens after a warm-up, and compares their medians with `BASELINE`, measured before any routing change on the development machine: drag p95 33.4ms, open 484ms.
- The budget assertions run when `PERF_BUDGET` is set, because the baselines belong to one machine. The plan's checkpoints and final verification ran them.
- Frame times land on the 60Hz grid (about 16.7, 33.4 or 50ms), so the 2ms margin means the drag must not drop to a slower frame cadence.
- Only separate arrows trigger the board-wide pass, and it compares an arrow only with arrows whose bounding box comes within 30px of its own (`SHIFT_STEP * 3` in `apart.ts`).
- Open time varies from about 463 to 542ms between runs on this machine, so one failing run is rerun and only two consecutive failures count.
- No scale-back was needed. Medians (drag p95, open):
  - After drawing (slice 1): 33.4ms, 518ms.
  - After "Don't merge" (slice 3): 33.4ms in all three runs; 503, 479 and 498ms.
  - Cross-row board (commit acef28d): 33.3 to 33.4ms, 465 to 485ms. One run of the original board reached 530ms, under the 532.4ms limit.
  - After the refactor: 33.4ms; 479 and 487ms.
  - Final run: 33.4ms, 494ms on the original board; 33.4ms, 497ms on the cross-row board (all four budget tests passed on the first run).

Rejected:
- Always enforcing the budget: the baselines would fail on any other machine.
- Timing only the routing functions in unit tests: that misses the rendering cost the user feels.

## Consequences
- A change to routing reruns the budget before merging: `PERF_BUDGET=1 npx playwright test tests/e2e/perf.spec.ts -g "routing budget" --workers=1`.
- The original perf board never shifts a separate arrow (every arrow stays in one row), so a second board where they do shift (`crossRowBoard`) covers that path. `src/canvas/crossRowBoard.test.ts` imports the shared builder from `tests/e2e/routingBoards.ts` on purpose, because `tsconfig` includes both.
- On a new machine, re-measure as in the arrow routing plan's Task 0 and update `BASELINE`.
- Panning at 100% has its own baseline and margin, measured with React Flow's culling on, on the routing board and on a board with long detours (`CULLED_PAN_BASELINE` in `tests/e2e/perf.spec.ts`, ADR-0018).
