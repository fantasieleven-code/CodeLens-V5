import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExamGuard } from './ExamGuard.js';
import { consentStorageKey } from './ConsentPage.js';

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
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders children when the per-session consent flag is set', () => {
    localStorage.setItem(consentStorageKey('sess-abc'), '1');
    renderAt('/exam/sess-abc');
    expect(screen.getByTestId('exam-protected')).toBeInTheDocument();
    expect(screen.queryByTestId('consent-landed')).not.toBeInTheDocument();
  });

  it('redirects to /candidate/:sessionId/consent when the flag is absent', () => {
    renderAt('/exam/sess-xyz');
    expect(screen.getByTestId('consent-landed')).toBeInTheDocument();
    expect(screen.queryByTestId('exam-protected')).not.toBeInTheDocument();
    // Per-session namespace — a flag for a different session must not unlock this one
    localStorage.setItem(consentStorageKey('sess-other'), '1');
    cleanup();
    renderAt('/exam/sess-xyz');
    expect(screen.getByTestId('consent-landed')).toBeInTheDocument();
  });
});
