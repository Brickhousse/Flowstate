import { readFile, stat } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { open, seed } from './fixtures';

test('exports PNG, SVG and JSON, and imports the JSON back', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'Export me', x: 0, y: 0 });
    addStep(b, { title: 'Second', after: a });
  }, 'Exporter');
  await open(page, p);
  const menu = page.getByRole('button', { name: 'Export' });

  await menu.click();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'PNG image' }).click()]);
  expect(png.suggestedFilename()).toBe('exporter-board-1.png');
  const bytes = await readFile((await png.path())!);
  expect(bytes.readUInt32BE(16)).toBe((432 + 96) * 2);
  expect(bytes.readUInt32BE(20)).toBe((72 + 96) * 2);

  await menu.click();
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'SVG image' }).click()]);
  expect((await stat((await svg.path())!)).size).toBeGreaterThan(1000);

  await menu.click();
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Project JSON' }).click()]);
  const jsonPath = (await json.path())!;
  expect(JSON.parse(await readFile(jsonPath, 'utf8')).id).toBe(p.id);

  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByTestId('import-input').setInputFiles(jsonPath);
  await expect(page.locator('.project-name')).toHaveText('Exporter (imported)');
  await expect(page).not.toHaveURL(new RegExp(p.id));
  await expect(page.getByText('Export me')).toBeVisible();
});

test('exports steps that are off screen', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Near', x: 0, y: 0 });
    addStep(b, { title: 'Far', x: 6000, y: 3000 });
  }, 'Wide');
  await open(page, p);
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
  await page.getByRole('button', { name: 'Export' }).click();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'PNG image' }).click()]);
  const bytes = await readFile((await png.path())!);
  expect(bytes.readUInt32BE(16)).toBe((6180 + 96) * 2);
});
