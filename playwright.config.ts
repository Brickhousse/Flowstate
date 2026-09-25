import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npx concurrently -k "vite --port 5174 --strictPort" "tsx server/main.ts"',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    env: {
      FLOWSTATE_API_PORT: '8788',
      FLOWSTATE_WORKSPACE: '.e2e-workspace',
      ...(process.env.LIVE_API ? {} : { ANTHROPIC_API_KEY: '' }),
    },
  },
});
