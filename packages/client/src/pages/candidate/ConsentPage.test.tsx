import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConsentPage, consentStorageKey } from './ConsentPage.js';
import { CONSENT_CONTENT } from './consentContent.js';

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/candidate/:sessionToken/consent"
          element={<ConsentPage />}
        />
        <Route
          path="/exam/:sessionId"
          element={<div data-testid="exam-landed">exam</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<ConsentPage />', () => {
  beforeEach(() => {
    localStorage.clear();
    (import.meta.env as Record<string, string | undefined>).VITE_API_URL =
      'http://api.test';
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = ORIGINAL_FETCH;
    delete (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
    vi.restoreAllMocks();
  });

  it('renders all 4 sections in order with bilingual content from consentContent', () => {
    renderAt('/candidate/sess-abc/consent');
    const list = screen.getByTestId('consent-sections');
    const items = list.querySelectorAll('[data-section-id]');
    expect(items).toHaveLength(4);
    expect(Array.from(items).map((el) => el.getAttribute('data-section-id'))).toEqual([
      'privacy',
      'scope',
      'retention',
      'rights',
    ]);
    // Spot-check one section renders both zh + en (Option α)
    expect(screen.getByText(CONSENT_CONTENT.sections[0].title.zh)).toBeInTheDocument();
    expect(screen.getByText(CONSENT_CONTENT.sections[0].title.en)).toBeInTheDocument();
  });

  it('keeps submit disabled until the checkbox is checked', () => {
    renderAt('/candidate/sess-abc/consent');
    const submit = screen.getByTestId('consent-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('consent-checkbox'));
    expect(submit.disabled).toBe(false);

    fireEvent.click(screen.getByTestId('consent-checkbox'));
    expect(submit.disabled).toBe(true);
  });

  it('on 200 sets the per-session localStorage flag and navigates to /exam/:sessionToken', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      captured = { url: String(url), init: init ?? {} };
      return jsonResponse(200, {
        ok: true,
        sessionId: 'sess-abc',
        profile: null,
        consentAcceptedAt: '2026-04-20T10:00:00.000Z',
      });
    }) as typeof fetch;

    renderAt('/candidate/sess-abc/consent');
    fireEvent.click(screen.getByTestId('consent-checkbox'));
    fireEvent.click(screen.getByTestId('consent-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('exam-landed')).toBeInTheDocument();
    });

    expect(localStorage.getItem(consentStorageKey('sess-abc'))).toBe('1');
    expect(captured).not.toBeNull();
    // Brief #13 C5 · candidateApi uses relative URLs (vite proxy /api → :4000).
    expect(captured!.url).toBe('/api/candidate/profile/submit');
    expect(JSON.parse(String(captured!.init.body))).toEqual({
      sessionToken: 'sess-abc',
      consentAccepted: true,
    });
  });

  it('on 404 NOT_FOUND (nested envelope) surfaces an error block with data-error-code and skips localStorage', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(404, {
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      }),
    ) as typeof fetch;

    renderAt('/candidate/sess-missing/consent');
    fireEvent.click(screen.getByTestId('consent-checkbox'));
    fireEvent.click(screen.getByTestId('consent-submit'));

    const errEl = await screen.findByTestId('consent-error');
    expect(errEl.getAttribute('data-error-code')).toBe('NOT_FOUND');
    expect(errEl.textContent).toContain(CONSENT_CONTENT.errors.NOT_FOUND.zh);
    expect(errEl.textContent).toContain(CONSENT_CONTENT.errors.NOT_FOUND.en);

    expect(localStorage.getItem(consentStorageKey('sess-missing'))).toBeNull();
    expect(screen.queryByTestId('exam-landed')).not.toBeInTheDocument();
    // Submit re-enabled so the candidate can retry after fixing the link
    expect((screen.getByTestId('consent-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('on 401 flat legacy envelope renders AUTH_REQUIRED bilingual copy', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { error: 'Authentication required' }),
    ) as typeof fetch;

    renderAt('/candidate/sess-bad/consent');
    fireEvent.click(screen.getByTestId('consent-checkbox'));
    fireEvent.click(screen.getByTestId('consent-submit'));

    const errEl = await screen.findByTestId('consent-error');
    expect(errEl.getAttribute('data-error-code')).toBe('AUTH_REQUIRED');
    expect(errEl.textContent).toContain(CONSENT_CONTENT.errors.AUTH_REQUIRED.zh);
    expect(errEl.textContent).toContain(CONSENT_CONTENT.errors.AUTH_REQUIRED.en);

    expect(localStorage.getItem(consentStorageKey('sess-bad'))).toBeNull();
  });
});
