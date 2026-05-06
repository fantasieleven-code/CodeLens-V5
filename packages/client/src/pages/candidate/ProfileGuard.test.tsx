import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfileGuard } from './ProfileGuard.js';
import { consentStorageKey } from './ConsentPage.js';
import { profileStorageKey } from './ProfileSetup.js';

const fetchCandidateSessionStatus = vi.hoisted(() => vi.fn());

vi.mock('../../services/candidateApi.js', () => ({
  fetchCandidateSessionStatus,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/candidate/:sessionToken/profile"
          element={
            <ProfileGuard>
              <div data-testid="profile-children">form</div>
            </ProfileGuard>
          }
        />
        <Route
          path="/candidate/:sessionToken/consent"
          element={<div data-testid="consent-landed">consent</div>}
        />
        <Route
          path="/exam/:sessionId"
          element={<div data-testid="exam-landed">exam</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<ProfileGuard />', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchCandidateSessionStatus.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects to /candidate/:sessionToken/consent when server consent is absent', async () => {
    fetchCandidateSessionStatus.mockResolvedValue({
      ok: true,
      sessionId: 'sess-abc',
      status: 'CREATED',
      consentAcceptedAt: null,
      profileSubmitted: false,
    });

    renderAt('/candidate/sess-abc/profile');
    expect(screen.getByTestId('profile-guard-loading')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('consent-landed')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('profile-children')).not.toBeInTheDocument();
    expect(screen.queryByTestId('exam-landed')).not.toBeInTheDocument();
  });

  it('redirects to /exam/:sessionToken when server profile is already submitted', async () => {
    fetchCandidateSessionStatus.mockResolvedValue({
      ok: true,
      sessionId: 'sess-abc',
      status: 'CREATED',
      consentAcceptedAt: '2026-04-20T10:00:00.000Z',
      profileSubmitted: true,
    });

    renderAt('/candidate/sess-abc/profile');
    await waitFor(() => {
      expect(screen.getByTestId('exam-landed')).toBeInTheDocument();
    });
    expect(localStorage.getItem(consentStorageKey('sess-abc'))).toBe('1');
    expect(localStorage.getItem(profileStorageKey('sess-abc'))).toBe('1');
    expect(screen.queryByTestId('profile-children')).not.toBeInTheDocument();
  });

  it('renders children when server consent is set and profile is not yet submitted', async () => {
    fetchCandidateSessionStatus.mockResolvedValue({
      ok: true,
      sessionId: 'sess-abc',
      status: 'CREATED',
      consentAcceptedAt: '2026-04-20T10:00:00.000Z',
      profileSubmitted: false,
    });

    renderAt('/candidate/sess-abc/profile');
    await waitFor(() => {
      expect(screen.getByTestId('profile-children')).toBeInTheDocument();
    });
    expect(fetchCandidateSessionStatus).toHaveBeenCalledWith('sess-abc');
    expect(localStorage.getItem(consentStorageKey('sess-abc'))).toBe('1');
    expect(localStorage.getItem(profileStorageKey('sess-abc'))).toBeNull();
    expect(screen.queryByTestId('consent-landed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('exam-landed')).not.toBeInTheDocument();
  });

  it('does not let stale localStorage flags override server state', async () => {
    localStorage.setItem(consentStorageKey('sess-abc'), '1');
    localStorage.setItem(profileStorageKey('sess-abc'), '1');
    fetchCandidateSessionStatus.mockResolvedValue({
      ok: true,
      sessionId: 'sess-abc',
      status: 'CREATED',
      consentAcceptedAt: '2026-04-20T10:00:00.000Z',
      profileSubmitted: false,
    });

    renderAt('/candidate/sess-abc/profile');
    await waitFor(() => {
      expect(screen.getByTestId('profile-children')).toBeInTheDocument();
    });
    expect(localStorage.getItem(profileStorageKey('sess-abc'))).toBeNull();
  });
});
