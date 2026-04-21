import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfileGuard } from './ProfileGuard.js';
import { consentStorageKey } from './ConsentPage.js';
import { profileStorageKey } from './ProfileSetup.js';

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
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects to /candidate/:sessionToken/consent when consent flag is absent', () => {
    renderAt('/candidate/sess-abc/profile');
    expect(screen.getByTestId('consent-landed')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-children')).not.toBeInTheDocument();
    expect(screen.queryByTestId('exam-landed')).not.toBeInTheDocument();
  });

  it('redirects to /exam/:sessionToken when profile flag is already set (re-submit block)', () => {
    localStorage.setItem(consentStorageKey('sess-abc'), '1');
    localStorage.setItem(profileStorageKey('sess-abc'), '1');
    renderAt('/candidate/sess-abc/profile');
    expect(screen.getByTestId('exam-landed')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-children')).not.toBeInTheDocument();
  });

  it('renders children when consent is set and profile is not yet submitted', () => {
    localStorage.setItem(consentStorageKey('sess-abc'), '1');
    renderAt('/candidate/sess-abc/profile');
    expect(screen.getByTestId('profile-children')).toBeInTheDocument();
    expect(screen.queryByTestId('consent-landed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('exam-landed')).not.toBeInTheDocument();
  });
});
