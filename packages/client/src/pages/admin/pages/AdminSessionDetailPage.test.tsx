import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminSessionDetailPage } from './AdminSessionDetailPage.js';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/sessions/:sessionId"
          element={<AdminSessionDetailPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe('<AdminSessionDetailPage />', () => {
  it('shows an error banner when the session id is unknown', async () => {
    renderAt('/admin/sessions/no-such-session');
    await waitFor(() =>
      expect(screen.getByTestId('admin-session-detail-error')).toBeInTheDocument(),
    );
  });

  it('renders candidate + session info for a known session', async () => {
    renderAt('/admin/sessions/sess-00001');
    await waitFor(() =>
      expect(screen.getByTestId('admin-session-detail-root')).toBeInTheDocument(),
    );
    const candidate = screen.getByTestId('admin-session-detail-candidate');
    expect(candidate).toHaveTextContent('李明');
    expect(candidate).toHaveTextContent('liam@example.com');
    const sessionCard = screen.getByTestId('admin-session-detail-session');
    expect(sessionCard).toHaveTextContent('sess-00001');
  });

  it('shows report block + link when status is COMPLETED', async () => {
    renderAt('/admin/sessions/sess-00001');
    await waitFor(() =>
      expect(screen.getByTestId('admin-session-detail-report')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('admin-session-detail-report-link')).toBeInTheDocument();
  });

  it('shows pending block when status is not COMPLETED', async () => {
    renderAt('/admin/sessions/sess-00003');
    await waitFor(() =>
      expect(
        screen.getByTestId('admin-session-detail-report-pending'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('admin-session-detail-report-link')).toBeNull();
  });
});
