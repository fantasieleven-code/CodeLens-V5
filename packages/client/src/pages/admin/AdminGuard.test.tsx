import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AdminGuard } from './AdminGuard.js';
import { __authStorageKey__, useAuthStore } from '../../stores/auth.store.js';

function resetAuth(): void {
  localStorage.removeItem(__authStorageKey__);
  useAuthStore.setState({
    token: null,
    orgId: null,
    orgRole: null,
    expiresAt: null,
  });
}

function LoginProbe() {
  const location = useLocation();
  const state = location.state as { from?: string } | null;
  return (
    <div data-testid="login-probe" data-from={state?.from ?? ''}>
      login
    </div>
  );
}

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/admin/*"
          element={
            <AdminGuard>
              <div data-testid="admin-inner">inner</div>
            </AdminGuard>
          }
        />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<AdminGuard />', () => {
  beforeEach(() => resetAuth());
  afterEach(() => cleanup());

  it('renders children when the store reports an authenticated session', () => {
    useAuthStore.setState({
      token: 'jwt',
      orgId: 'org-1',
      orgRole: 'OWNER',
      expiresAt: Date.now() + 60_000,
    });
    renderAt('/admin');
    expect(screen.getByTestId('admin-inner')).toBeInTheDocument();
  });

  it('redirects to /login when unauthenticated and stashes the original path in state.from', () => {
    renderAt('/admin/sessions?page=2');
    const probe = screen.getByTestId('login-probe');
    expect(probe).toBeInTheDocument();
    expect(probe.getAttribute('data-from')).toBe('/admin/sessions?page=2');
  });

  it('redirects to /login when the token has already expired', () => {
    useAuthStore.setState({
      token: 'jwt',
      orgId: 'org-1',
      orgRole: 'OWNER',
      expiresAt: Date.now() - 1,
    });
    renderAt('/admin');
    expect(screen.getByTestId('login-probe')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-inner')).not.toBeInTheDocument();
  });
});
