import { rm } from 'node:fs/promises';

export default async function globalSetup(): Promise<void> {
  await rm('.e2e-workspace', { recursive: true, force: true });
}
