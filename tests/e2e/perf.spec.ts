import { expect, test, type Page } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { board, open, seed } from './fixtures';

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
  const first = page.locator('.react-flow__node-step').first();
  const id = (await first.getAttribute('data-id'))!;
  const before = (await board(page)).nodes.find((n) => n.id === id)!;
  const target = (await first.boundingBox())!;
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
