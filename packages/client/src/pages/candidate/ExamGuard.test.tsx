import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExamGuard } from './ExamGuard.js';
import { consentStorageKey } from './ConsentPage.js';

const fetchCandidateSessionStatus = vi.hoisted(() => vi.fn());

vi.mock('../../services/candidateApi.js', () => ({
  fetchCandidateSessionStatus,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/exam/:sessionId"
          element={
            <ExamGuard>
              <div data-testid="exam-protected">protected</div>
            </ExamGuard>
          }
        />
        <Route
          path="/candidate/:sessionToken/consent"
          element={<div data-testid="consent-landed">consent</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<ExamGuard />', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchCandidateSessionStatus.mockReset();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders children when the server says consent is accepted', async () => {
    fetchCandidateSessionStatus.mockResolvedValue({
      ok: true,
      sessionId: 'sess-abc',
      status: 'CREATED',
      consentAcceptedAt: '2026-04-20T10:00:00.000Z',
      profileSubmitted: false,
    });

    renderAt('/exam/sess-abc');

    expect(screen.getByTestId('exam-guard-loading')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('exam-protected')).toBeInTheDocument();
    });
    expect(fetchCandidateSessionStatus).toHaveBeenCalledWith('sess-abc');
    expect(localStorage.getItem(consentStorageKey('sess-abc'))).toBe('1');
    expect(screen.getByTestId('exam-protected')).toBeInTheDocument();
    expect(screen.queryByTestId('consent-landed')).not.toBeInTheDocument();
  });

  it('redirects to /candidate/:sessionId/consent when server consent is absent', async () => {
    fetchCandidateSessionStatus.mockResolvedValue({
      ok: true,
      sessionId: 'sess-xyz',
      status: 'CREATED',
      consentAcceptedAt: null,
      profileSubmitted: false,
    });

    renderAt('/exam/sess-xyz');
    await waitFor(() => {
      expect(screen.getByTestId('consent-landed')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('exam-protected')).not.toBeInTheDocument();
  });

  it('does not let a stale localStorage flag override server denial', async () => {
    localStorage.setItem(consentStorageKey('sess-xyz'), '1');
    fetchCandidateSessionStatus.mockResolvedValue({
      ok: true,
      sessionId: 'sess-xyz',
      status: 'CREATED',
      consentAcceptedAt: null,
      profileSubmitted: false,
    });

    renderAt('/exam/sess-xyz');
    await waitFor(() => {
      expect(screen.getByTestId('consent-landed')).toBeInTheDocument();
    });
    expect(localStorage.getItem(consentStorageKey('sess-xyz'))).toBeNull();
  });
});
