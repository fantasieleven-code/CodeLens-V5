/**
 * Playwright config for full-mock E2E tests.
 *
 * Points the AI Router at a local mock server (port 9876) so the entire
 * interview flow runs without real AI APIs or E2B sandbox.
 *
 * Usage:
 *   npm run test:e2e:mock
 *   npx playwright test --config=e2e/playwright.mock.config.ts
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const MOCK_AI_PORT = 9876;

export default defineConfig({
  testDir: '.',
  testMatch: 'full-interview-flow.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 90_000,

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    // 1. Mock AI server
    {
      command: `npx tsx "${path.join(__dirname, 'fixtures', 'mock-ai-server.ts')}"`,
      port: MOCK_AI_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
    // 2. Backend — all AI traffic routed to mock, no E2B
    {
      command: 'npm run dev',
      port: 4000,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ARK_API_KEY: 'mock-key',
        ARK_BASE_URL: `http://localhost:${MOCK_AI_PORT}/v1`,
        ARK_MODEL_PRO: 'mock-model',
        ARK_MODEL_LITE: 'mock-model',
        DEEPSEEK_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        E2B_API_KEY: '',
      },
    },
    // 3. Frontend
    {
      command: 'npm run dev:client',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
