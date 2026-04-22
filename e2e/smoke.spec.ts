/**
 * Task CI-Green-Up · C1 · Playwright "No tests found" unblocker.
 *
 * Minimal smoke test: verify the backend boots under Playwright's webServer
 * orchestration and `GET /health` returns 200. Intentionally scoped to the
 * single endpoint (OQ3-α) — anything broader couples the smoke to routes that
 * do not yet exist and grows the flake surface.
 *
 * F1 note: the root `playwright.config.ts` baseURL points at the frontend
 * (http://localhost:5173); `/health` lives on the backend (:4000). Use an
 * explicit URL instead of relying on baseURL so we do not trip through the
 * Vite dev server.
 *
 * Shape-shallow body assertion: only confirm the response is JSON with a
 * `status` field. The `/health` payload also includes `services`, `sandbox`,
 * `modelProviders`, `eventBuffer` — coupling to those shapes would turn smoke
 * into a regression gate for subsystems this task does not own.
 */
import { test, expect } from '@playwright/test';

test.describe('Server bootstrap smoke', () => {
  test('GET /health returns 200', async ({ request }) => {
    const res = await request.get('http://localhost:4000/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
  });
});
