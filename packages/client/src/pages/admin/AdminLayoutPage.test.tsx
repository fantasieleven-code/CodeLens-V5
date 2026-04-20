import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminRoutes } from './AdminLayoutPage.js';
import { __authStorageKey__, useAuthStore } from '../../stores/auth.store.js';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminRoutes />} />
        <Route
          path="/login"
          element={<div data-testid="login-landed">login</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function seedAuth(role: 'OWNER' | 'MEMBER' = 'OWNER'): void {
  useAuthStore.setState({
    token: 'jwt-ok',
    orgId: 'org-1',
    orgRole: role,
    expiresAt: Date.now() + 60_000,
  });
}

beforeEach(() => {
  localStorage.removeItem(__authStorageKey__);
  useAuthStore.setState({
    token: null,
    orgId: null,
    orgRole: null,
    expiresAt: null,
  });
  seedAuth();
});

afterEach(() => cleanup());

describe('<AdminRoutes />', () => {
  it('renders the layout chrome with all nav items', () => {
    renderAt('/admin');
    expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    expect(screen.getByTestId('admin-nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('admin-nav-create')).toBeInTheDocument();
    expect(screen.getByTestId('admin-nav-sessions')).toBeInTheDocument();
    expect(screen.getByTestId('admin-nav-exams')).toBeInTheDocument();
  });

  it('redirects /admin → /admin/dashboard by default', async () => {
    renderAt('/admin');
    await waitFor(() =>
      expect(screen.getByTestId('admin-dashboard-root')).toBeInTheDocument(),
    );
  });

  it('routes to create page', () => {
    renderAt('/admin/create');
    expect(screen.getByTestId('admin-create-root')).toBeInTheDocument();
  });

  it('routes to sessions list', async () => {
    renderAt('/admin/sessions');
    await waitFor(() =>
      expect(screen.getByTestId('admin-sessions-list-root')).toBeInTheDocument(),
    );
  });

  it('routes to exam library', async () => {
    renderAt('/admin/exams');
    await waitFor(() =>
      expect(screen.getByTestId('admin-exam-library-root')).toBeInTheDocument(),
    );
  });

  it('admin nav exposes an aria-label for screen readers', () => {
    renderAt('/admin');
    const nav = screen.getByRole('navigation', { name: 'Admin 主导航' });
    expect(nav).toBeInTheDocument();
  });

  it('renders the current org role in the header', () => {
    renderAt('/admin');
    expect(screen.getByTestId('admin-user-role')).toHaveTextContent('OWNER');
  });

  it('logout button clears auth store and navigates to /login', () => {
    renderAt('/admin');
    fireEvent.click(screen.getByTestId('admin-logout'));
    expect(useAuthStore.getState().token).toBeNull();
    expect(screen.getByTestId('login-landed')).toBeInTheDocument();
  });
});
