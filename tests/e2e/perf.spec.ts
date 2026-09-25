import { expect, test } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { open, seed } from './fixtures';

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
  const frames = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        const tick = (now: number) => {
          times.push(now - last);
          last = now;
          if (times.length < 240) requestAnimationFrame(tick);
          else resolve(times);
        };
        requestAnimationFrame(tick);
      }),
  );
  const box = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i % 2 ? 150 : -150);
  await page.mouse.down({ button: 'middle' });
  for (let i = 0; i < 40; i++) await page.mouse.move(box.x + box.width / 2 - i * 15, box.y + box.height / 2 - i * 8);
  await page.mouse.up({ button: 'middle' });
  const times = (await frames).slice(5).sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];
  console.log(`1000 steps: average frame ${avg.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms`);
  await test.info().attach('frame-times', { body: JSON.stringify({ avg, p95 }), contentType: 'application/json' });
  expect(p95).toBeLessThan(50);
});
