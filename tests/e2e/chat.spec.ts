import { expect, test, type Page } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { links, open, seed } from './fixtures';

function sse(events: Array<[string, unknown]>): string {
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
}

async function mockChat(page: Page, rounds: string[]): Promise<unknown[]> {
  const bodies: unknown[] = [];
  await page.route('**/api/chat', async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: rounds[Math.min(bodies.length - 1, rounds.length - 1)] });
  });
  return bodies;
}

const seedTwo = (request: Parameters<typeof seed>[0]) =>
  seed(request, (b) => {
    const a = addStep(b, { title: 'Intake', x: 0, y: 0 });
    addStep(b, { title: 'Approve', after: a });
  });

test('explains a missing API key', async ({ page, request }) => {
  test.skip(!!process.env.LIVE_API, 'The live run has a key');
  await open(page, await seedTwo(request));
  await page.getByLabel('Message').fill('Add a step');
  await page.getByLabel('Message').press('Enter');
  await expect(page.locator('.chat-error')).toHaveText('ANTHROPIC_API_KEY is not set. Add it to .env and restart the dev server.');
});

test('applies tool calls live, summarises them, and undoes the turn in one click', async ({ page, request }) => {
  const tool = { type: 'tool_use', id: 'tu1', name: 'insert_between', input: { from: 's1', to: 's2', step: { title: 'Review', actor: 'agent', duration: '1h' } } };
  const bodies = await mockChat(page, [
    sse([['text', { delta: 'Adding a review step.' }], ['tool', tool], ['done', { content: [{ type: 'text', text: 'Adding a review step.' }, tool], stop_reason: 'tool_use' }]]),
    sse([['text', { delta: ' Done.' }], ['done', { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' }]]),
  ]);
  await open(page, await seedTwo(request));
  await page.getByLabel('Message').fill('Put an agent review between intake and approve');
  await page.getByLabel('Message').press('Enter');
  await expect(page.locator('.chat-chip')).toHaveText('1 step added, 1 arrow added');
  await expect(page.locator('.chat-text').last()).toHaveText('Adding a review step. Done.');
  expect(await links(page)).toEqual(['Intake>Review', 'Review>Approve']);
  expect(JSON.stringify(bodies[0])).toContain('<board>');
  const second = bodies[1] as { messages: Array<{ content: Array<{ type: string; tool_use_id?: string }> }> };
  expect(second.messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu1' });
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await links(page)).toEqual(['Intake>Approve']);
});

test('mentions insert a step reference', async ({ page, request }) => {
  const bodies = await mockChat(page, [sse([['done', { content: [{ type: 'text', text: 'Ok.' }], stop_reason: 'end_turn' }]])]);
  await open(page, await seedTwo(request));
  const input = page.getByLabel('Message');
  await input.fill('Flag @Int');
  await page.getByRole('option', { name: /Intake/ }).waitFor();
  await input.press('Enter');
  await input.pressSequentially('as risky');
  await input.press('Enter');
  await expect.poll(() => bodies.length).toBe(1);
  expect(JSON.stringify(bodies[0])).toContain('Flag \\"Intake\\" (s1) as risky');
});

test('Stop cancels a running turn', async ({ page, request }) => {
  await page.route('**/api/chat', () => new Promise(() => {}));
  await open(page, await seedTwo(request));
  await page.getByLabel('Message').fill('Take your time');
  await page.getByLabel('Message').press('Enter');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.chat-error')).toHaveText('Stopped.');
});

test('Ctrl+/ hides and shows the chat, Ctrl+K focuses it', async ({ page, request }) => {
  await open(page, await seedTwo(request));
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+/');
  await expect(page.locator('.chat')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(page.getByLabel('Message')).toBeFocused();
});

test('Enter picks a valid mention after the list shrinks', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, await seedTwo(request));
  const input = page.getByLabel('Message');
  const options = page.getByRole('listbox', { name: 'Mention a step' }).getByRole('option');
  await input.fill('@');
  await expect(options).toHaveCount(2);
  await input.press('ArrowDown');
  await page.evaluate(() =>
    window.__flowstate!.getState().change((draft) => {
      draft.boards[0].nodes = draft.boards[0].nodes.filter((n) => n.id !== 's2');
    }),
  );
  await expect(options).toHaveCount(1);
  await input.press('Enter');
  await expect(input).toHaveValue('@Intake ');
  expect(errors).toEqual([]);
});

test('mentions survive hiding and showing the panel', async ({ page, request }) => {
  const bodies = await mockChat(page, [sse([['done', { content: [{ type: 'text', text: 'Ok.' }], stop_reason: 'end_turn' }]])]);
  await open(page, await seedTwo(request));
  const input = page.getByLabel('Message');
  await input.fill('Flag @Int');
  await page.getByRole('option', { name: /Intake/ }).waitFor();
  await input.press('Enter');
  await page.keyboard.press('Control+/');
  await expect(page.locator('.chat')).toHaveCount(0);
  await page.keyboard.press('Control+/');
  await expect(input).toHaveValue('Flag @Intake ');
  await input.press('Enter');
  await expect.poll(() => bodies.length).toBe(1);
  expect(JSON.stringify(bodies[0])).toContain('Flag \\"Intake\\" (s1)');
});
