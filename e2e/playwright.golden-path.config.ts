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
  testMatch: [
    '**/golden-path.spec.ts',
    '**/cold-start-validation.spec.ts',
    '**/smoke.spec.ts',
  ],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  // Brief #19 C9 Bug #2 · 180→300s · σ HTTP fallback added 5 fetch calls
  // per session (~250ms latency total) and full scoring against real (not
  // silent-dropped) metadata · waitForScoringComplete polling needs more
  // wall-time than the original 180s. V5.0.5 housekeeping captures the
  // scoring-hydrate caching optimization to bring this back down.
  timeout: 300_000,

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
      // adminApi.shouldUseMock() returns mock when VITE_API_URL is unset;
      // mock fixtures don't include the canonical exam ID, so the driver's
      // `admin-create-step3-exam-${CANONICAL_EXAM_ID}` click would fail.
      // Explicit toggle forces real mode through the vite /api proxy
      // (Brief #13 D12 · adminApi relative URL refactor).
      env: { VITE_ADMIN_API_MOCK: 'false', VITE_API_URL: 'http://localhost:4000' },
    },
  ],
});
