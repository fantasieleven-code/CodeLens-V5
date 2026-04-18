import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminSessionsListPage } from './AdminSessionsListPage.js';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/sessions']}>
      <Routes>
        <Route path="/admin/sessions" element={<AdminSessionsListPage />} />
        <Route
          path="/admin/sessions/:sessionId"
          element={<div data-testid="detail-stub" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe('<AdminSessionsListPage />', () => {
  it('renders the table with at least one row after load', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('admin-sessions-list-root')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('admin-sessions-table')).toBeInTheDocument();
    expect(screen.getByTestId('admin-sessions-row-sess-00001')).toBeInTheDocument();
  });

  it('filters by suite', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('admin-sessions-list-root')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId('admin-sessions-filter-suite'), {
      target: { value: 'architect' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('admin-sessions-row-sess-00002')).toBeInTheDocument();
      // full_stack rows should be hidden.
      expect(screen.queryByTestId('admin-sessions-row-sess-00001')).toBeNull();
    });
  });

  it('filters by status', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('admin-sessions-list-root')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId('admin-sessions-filter-status'), {
      target: { value: 'COMPLETED' },
    });
    await waitFor(() => {
      // IN_PROGRESS session should disappear.
      expect(screen.queryByTestId('admin-sessions-row-sess-00003')).toBeNull();
      expect(screen.getByTestId('admin-sessions-row-sess-00001')).toBeInTheDocument();
    });
  });

  it('paginates when total exceeds page size', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('admin-sessions-pager')).toBeInTheDocument(),
    );
    const pageLabel = screen.getByTestId('admin-sessions-page-label');
    expect(pageLabel).toHaveTextContent(/第 1/);
    fireEvent.click(screen.getByTestId('admin-sessions-next'));
    await waitFor(() =>
      expect(screen.getByTestId('admin-sessions-page-label')).toHaveTextContent(/第 2/),
    );
  });

  it('clicking a row navigates to /admin/sessions/:id', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('admin-sessions-row-sess-00001')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('admin-sessions-row-sess-00001'));
    await waitFor(() =>
      expect(screen.getByTestId('detail-stub')).toBeInTheDocument(),
    );
  });
});
