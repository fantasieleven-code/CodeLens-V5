import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminRoutes } from './AdminLayoutPage.js';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminRoutes />} />
      </Routes>
    </MemoryRouter>,
  );
}

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
});
