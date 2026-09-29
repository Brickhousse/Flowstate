import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { createProject } from '../../src/model/factory';
import type { Board, Project } from '../../src/model/types';

export async function seed(request: APIRequestContext, build: (board: Board, project: Project) => void = () => {}, name = 'E2E'): Promise<Project> {
  const project = createProject(name);
  build(project.boards[0], project);
  const res = await request.put(`/api/projects/${project.id}`, { data: project });
  expect(res.ok()).toBe(true);
  return project;
}

export async function open(page: Page, project: Project): Promise<void> {
  await page.goto(`/?project=${project.id}`);
  await page.locator('.react-flow__pane').waitFor();
}

export async function board(page: Page): Promise<Board> {
  return page.evaluate(() => {
    const s = window.__flowstate!.getState();
    return JSON.parse(JSON.stringify(s.project.boards.find((b) => b.id === s.activeBoardId)));
  });
}

export async function titles(page: Page): Promise<string[]> {
  return (await board(page)).nodes.filter((n) => n.kind === 'step').map((n) => n.title);
}

export async function links(page: Page): Promise<string[]> {
  const b = await board(page);
  const title = (id: string) => b.nodes.find((n) => n.id === id)?.title ?? id;
  return b.edges.map((e) => `${title(e.source)}>${title(e.target)}`).sort();
}

export function node(page: Page, id: string) {
  return page.getByTestId(`node-${id}`);
}

// Resolves once the "Reset zoom to 100%" animation has landed, so no click or pan races it.
export async function zoomSettled(page: Page): Promise<void> {
  await expect.poll(() => page.locator('.react-flow__viewport').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)).toBe(1);
}
