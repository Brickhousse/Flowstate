import { expect, test, type Page } from '@playwright/test';
import type { Board, Project } from '../../src/model/types';
import { addStep } from '../../src/ops/steps';
import { board, open, seed, zoomSettled } from './fixtures';
import { crossRowBoard, detourArrows, noteSteps, routingBoard, separateCrossings, separateSkips } from './routingBoards';

function sampleFrames(page: Page, count = 240): Promise<number[]> {
  return page.evaluate(
    (n) =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        const tick = (now: number) => {
          times.push(now - last);
          last = now;
          if (times.length < n) requestAnimationFrame(tick);
          else resolve(times);
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}

function p95(times: number[]): number {
  const sorted = times.slice(5).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)];
}

function viewportMatrix(page: Page): Promise<{ a: number; f: number }> {
  return page.locator('.react-flow__viewport').evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { a: m.a, f: m.f };
  });
}

function stepOnScreen(page: Page, margin = 100): Promise<string> {
  return page.evaluate((m) => {
    const pane = document.querySelector('.react-flow__pane')!.getBoundingClientRect();
    const inside = (r: DOMRect) => r.left >= pane.left + m && r.top >= pane.top + m && r.right <= pane.right - m && r.bottom <= pane.bottom - m;
    const step = [...document.querySelectorAll('.react-flow__node-step')].find((el) => inside(el.getBoundingClientRect()));
    if (!step) throw new Error('no step on screen');
    return step.getAttribute('data-id')!;
  }, margin);
}

test('pans and zooms a 1000-step board without long frames', async ({ page, request }) => {
  test.setTimeout(120_000);
  const p = await seed(request, (b) => {
    for (let row = 0; row < 50; row++) {
      let prev = addStep(b, { title: `R${row} C0`, x: 0, y: row * 140 });
      for (let col = 1; col < 20; col++) prev = addStep(b, { title: `R${row} C${col}`, after: prev });
    }
  }, 'Perf');
  await open(page, p);
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
  const frames = sampleFrames(page);
  const box = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i % 2 ? 150 : -150);
  await page.mouse.down({ button: 'middle' });
  for (let i = 0; i < 40; i++) await page.mouse.move(box.x + box.width / 2 - i * 15, box.y + box.height / 2 - i * 8);
  await page.mouse.up({ button: 'middle' });
  const times = await frames;
  const avg = times.slice(5).reduce((a, b) => a + b, 0) / (times.length - 5);
  const worst = p95(times);
  console.log(`1000 steps: average frame ${avg.toFixed(1)}ms, p95 ${worst.toFixed(1)}ms`);
  await test.info().attach('frame-times', { body: JSON.stringify({ avg, p95: worst }), contentType: 'application/json' });
  expect(worst).toBeLessThan(50);
});

test('drags on a 1000-step board with guides on without long frames', async ({ page, request }) => {
  test.setTimeout(120_000);
  const p = await seed(request, (b) => {
    for (let row = 0; row < 50; row++) {
      let prev = addStep(b, { title: `R${row} C0`, x: 0, y: row * 140 });
      for (let col = 1; col < 20; col++) prev = addStep(b, { title: `R${row} C${col}`, after: prev });
    }
  }, 'Perf drag');
  await open(page, p);
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
  await zoomSettled(page);
  const id = await stepOnScreen(page);
  const before = (await board(page)).nodes.find((n) => n.id === id)!;
  const target = (await page.getByTestId(`node-${id}`).boundingBox())!;
  const frames = sampleFrames(page);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 60; i++) await page.mouse.move(target.x + target.width / 2 + i * 4, target.y + target.height / 2 + i * 3);
  await page.mouse.up();
  const worst = p95(await frames);
  console.log(`1000 steps drag: p95 ${worst.toFixed(1)}ms`);
  expect(worst).toBeLessThan(50);
  expect((await board(page)).nodes.find((n) => n.id === id)).not.toMatchObject({ x: before.x, y: before.y });
});

// Medians measured on the last commit before arrow routing (spec section 4, ADR-0015).
const BASELINE = { dragP95Ms: 33.4, openMs: 484 };
// Pan p95 median measured with React Flow culling on (onlyRenderVisibleElements), at commit 189df81.
const CULLED_PAN_BASELINE = { panP95Ms: 16.8 };
// Noted over plain open median ratio, pairs alternating order: median of five full perf-suite runs at 80029fd, before step notes.
const NOTED_RATIO_BASELINE = { openRatio: 1.066 };
const ENFORCE_BUDGET = !!process.env.PERF_BUDGET;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function recordFrames(page: Page, action: () => Promise<void>): Promise<number[]> {
  const state = await page.evaluateHandle(() => {
    const s = { times: [] as number[], on: true };
    let last = performance.now();
    const tick = (now: number) => {
      s.times.push(now - last);
      last = now;
      if (s.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return s;
  });
  await action();
  return page.evaluate((s) => {
    s.on = false;
    return s.times;
  }, state);
}

async function dragRuns(page: Page, project: Project, title: string): Promise<number[]> {
  await open(page, project);
  const id = (await board(page)).nodes.find((n) => n.title === title)!.id;
  const runs: number[] = [];
  for (let run = 0; run < 3; run++) {
    const c = (await page.getByTestId(`node-${id}`).boundingBox())!;
    const dir = run % 2 ? -1 : 1;
    const times = await recordFrames(page, async () => {
      await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 60; i++) await page.mouse.move(c.x + c.width / 2 + dir * i * 2, c.y + c.height / 2 + dir * i);
      await page.mouse.up();
    });
    runs.push(p95(times));
  }
  return runs;
}

async function openTime(page: Page, project: Project): Promise<number> {
  await page.goto(`/?project=${project.id}`);
  await page.locator('.react-flow__edge-path').first().waitFor({ state: 'attached' });
  return page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(performance.now()))));
}

const MEASURED_OPENS = 3;

async function openRuns(page: Page, project: Project): Promise<number[]> {
  const runs: number[] = [];
  for (let run = 0; run <= MEASURED_OPENS; run++) {
    const at = await openTime(page, project);
    if (run > 0) runs.push(at);
  }
  return runs;
}

const OPEN_PAIRS = 10;

async function freshOpenTime(page: Page, project: Project): Promise<number> {
  const tab = await page.context().newPage();
  try {
    return await openTime(tab, project);
  } finally {
    await tab.close();
  }
}

// why: repeated opens in one tab drift slower, so each open gets a fresh tab. Pairs swap which board opens first,
// so neither gains from going second, and both medians see the same machine load, so their ratio does not drift with it.
async function pairedOpenRuns(page: Page, plain: Project, noted: Project): Promise<{ plain: number[]; noted: number[] }> {
  const plainRuns: number[] = [];
  const notedRuns: number[] = [];
  for (let run = 0; run <= OPEN_PAIRS; run++) {
    const plainFirst = run % 2 === 0;
    const first = await freshOpenTime(page, plainFirst ? plain : noted);
    const second = await freshOpenTime(page, plainFirst ? noted : plain);
    if (run === 0) continue;
    plainRuns.push(plainFirst ? first : second);
    notedRuns.push(plainFirst ? second : first);
  }
  return { plain: plainRuns, noted: notedRuns };
}

async function panRuns(page: Page, project: Project, ready: (page: Page) => Promise<void> = async () => {}): Promise<number[]> {
  await open(page, project);
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
  await zoomSettled(page);
  await ready(page);
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  const offsetY = pane.y + (await viewportMatrix(page)).f;
  // why: a point between rows (board y 136 + 200k) stays between rows as the board moves with the pointer.
  const betweenRows = Math.round((pane.y + pane.height / 2 + 120 - offsetY - 136) / 200) * 200 + 136;
  const grab = { x: pane.x + pane.width / 2 + 300, y: betweenRows + offsetY };
  const runs: number[] = [];
  for (let run = 0; run < 3; run++) {
    const dir = run % 2 ? 1 : -1;
    const from = run % 2 ? { x: grab.x - 600, y: grab.y - 240 } : grab;
    const times = await recordFrames(page, async () => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down({ button: 'middle' });
      for (let i = 1; i <= 60; i++) await page.mouse.move(from.x + dir * i * 10, from.y + dir * i * 4);
      await page.mouse.up({ button: 'middle' });
    });
    runs.push(p95(times));
  }
  return runs;
}

function withinDragBudget(name: string, runs: number[]): void {
  const worst = median(runs);
  console.log(`${name} drag p95 per run ${runs.map((r) => r.toFixed(1)).join(', ')}ms, median ${worst.toFixed(1)}ms`);
  if (ENFORCE_BUDGET) expect(worst).toBeLessThanOrEqual(BASELINE.dragP95Ms + 2);
}

function withinOpenBudget(name: string, runs: number[]): void {
  const typical = median(runs);
  console.log(`${name} open per run ${runs.map((r) => r.toFixed(0)).join(', ')}ms, median ${typical.toFixed(0)}ms`);
  if (ENFORCE_BUDGET) expect(typical).toBeLessThanOrEqual(BASELINE.openMs * 1.1);
}

function withinNotedOpenRatio(runs: { plain: number[]; noted: number[] }): void {
  const ratio = median(runs.noted) / median(runs.plain);
  const list = (xs: number[]) => xs.map((x) => x.toFixed(0)).join(', ');
  console.log(`notes open ${list(runs.noted)}ms, median ${median(runs.noted).toFixed(0)}ms; plain open ${list(runs.plain)}ms, median ${median(runs.plain).toFixed(0)}ms; ratio ${ratio.toFixed(3)}`);
  if (ENFORCE_BUDGET) expect(ratio).toBeLessThanOrEqual(NOTED_RATIO_BASELINE.openRatio * 1.05);
}

function withinPanBudget(name: string, runs: number[]): void {
  const worst = median(runs);
  console.log(`${name} pan p95 per run ${runs.map((r) => r.toFixed(1)).join(', ')}ms, median ${worst.toFixed(1)}ms`);
  if (ENFORCE_BUDGET) expect(worst).toBeLessThanOrEqual(CULLED_PAN_BASELINE.panP95Ms + 2);
}

function skipsSeparate(b: Board): void {
  routingBoard(b);
  separateSkips(b);
}

function crossingsSeparate(b: Board): void {
  crossRowBoard(b);
  separateCrossings(b);
}

function skipsSeparateWithDetours(b: Board): void {
  skipsSeparate(b);
  detourArrows(b);
}

function skipsSeparateWithNotes(b: Board): void {
  skipsSeparate(b);
  noteSteps(b);
}

async function expectNoteMarkers(page: Page): Promise<void> {
  const shownIn = (note: string) => page.locator(note).getByRole('button', { name: 'Open note' }).first();
  await expect(shownIn('.fs-note.has-more')).toBeVisible();
  await expect(shownIn('.fs-note[data-overflow]:has-text("Overflows")')).toBeVisible();
}

test('drags a step on a 200-arrow board within the routing budget', async ({ page, request }) => {
  test.setTimeout(120_000);
  withinDragBudget('routing', await dragRuns(page, await seed(request, skipsSeparate, 'Perf routing'), 'R0 C5'));
});

test('opens a 200-arrow board within the routing budget', async ({ page, request }) => {
  test.setTimeout(120_000);
  withinOpenBudget('routing', await openRuns(page, await seed(request, skipsSeparate, 'Perf open')));
});

test('pans a 200-arrow board at 100% within the routing budget', async ({ page, request }) => {
  test.setTimeout(120_000);
  withinPanBudget('routing', await panRuns(page, await seed(request, skipsSeparate, 'Perf pan')));
});

test('pans a 200-arrow board with 20 long detours at 100% within the routing budget', async ({ page, request }) => {
  test.setTimeout(120_000);
  const culledDrawn = async (page: Page) => expect(await page.locator('.fs-culled-arrow').count()).toBeGreaterThan(0);
  withinPanBudget('detours', await panRuns(page, await seed(request, skipsSeparateWithDetours, 'Perf detours'), culledDrawn));
});

test('drags a step on a 200-arrow board with shifted arrows within the routing budget', async ({ page, request }) => {
  test.setTimeout(120_000);
  withinDragBudget('shifted', await dragRuns(page, await seed(request, crossingsSeparate, 'Perf shifted'), 'R0 C8'));
});

test('opens a 200-arrow board with shifted arrows within the routing budget', async ({ page, request }) => {
  test.setTimeout(120_000);
  withinOpenBudget('shifted', await openRuns(page, await seed(request, crossingsSeparate, 'Perf shifted open')));
});

test('opens a 200-arrow board with notes within 5% of its ratio to the plain board before notes', async ({ page, request }) => {
  test.setTimeout(120_000);
  const plain = await seed(request, skipsSeparate, 'Perf notes open, plain');
  const noted = await seed(request, skipsSeparateWithNotes, 'Perf notes open');
  const runs = await pairedOpenRuns(page, plain, noted);
  await open(page, noted);
  await expectNoteMarkers(page);
  withinNotedOpenRatio(runs);
});

test('drags a noted step on a 200-arrow board with notes within the routing budget', async ({ page, request }) => {
  test.setTimeout(120_000);
  const runs = await dragRuns(page, await seed(request, skipsSeparateWithNotes, 'Perf notes drag'), 'R0 C5');
  await expectNoteMarkers(page);
  withinDragBudget('notes', runs);
});

test('pans a 200-arrow board with notes at 100% within the routing budget', async ({ page, request }) => {
  test.setTimeout(120_000);
  withinPanBudget('notes', await panRuns(page, await seed(request, skipsSeparateWithNotes, 'Perf notes pan'), expectNoteMarkers));
});
