import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for V5.0 Golden Path E2E.
 *
 * Runs golden-path.spec.ts (B3 deliverable) against full stack:
 * - Backend :4000 (npm run dev · server package)
 * - Frontend :5173 (npm run dev:client · client package)
 *
 * Pre-requisite: `db:seed:canonical` must run before this config invokes
 * (CI handles via ci.yml step · local dev handles manually OR add globalSetup V5.0.5).
 *
 * Root playwright.config.ts is scoped to smoke.spec.ts via testMatch ·
 * no overlap with this config.
 */
export default defineConfig({
  testDir: './',
  // Smoke + golden-path share one playwright invocation so the e2e job
  // spawns a single backend/frontend webServer pair. Two back-to-back
  // `npx playwright test` invocations in the same CI step raced on port
  // 4000 lifecycle (smoke teardown overlapping golden-path spawn) which
  // surfaced as a "无法连接到服务器" network error in the golden-path
  // login step. Hotfix #11 §E E4 root-cause fix.
  testMatch: ['**/golden-path.spec.ts', '**/smoke.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  timeout: 180_000,

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: [
    {
      command: 'npm run dev',
      port: 4000,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { NODE_ENV: 'test' },
    },
    {
      command: 'npm run dev:client',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
