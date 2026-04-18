import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminDashboardPage } from './AdminDashboardPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminDashboardPage />
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe('<AdminDashboardPage />', () => {
  it('renders the 4 KPI cards with data from the mock api', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('admin-dashboard-root')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('admin-dashboard-total')).toBeInTheDocument();
    expect(screen.getByTestId('admin-dashboard-completed')).toBeInTheDocument();
    expect(screen.getByTestId('admin-dashboard-completion-rate')).toHaveTextContent(/%/);
    expect(screen.getByTestId('admin-dashboard-avg-composite')).toBeInTheDocument();
  });

  it('renders a bar for each grade level', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('admin-dashboard-grade-distribution')).toBeInTheDocument(),
    );
    for (const g of ['S+', 'S', 'A', 'B+', 'B', 'C', 'D']) {
      expect(screen.getByTestId(`grade-bar-${g}`)).toBeInTheDocument();
    }
  });

  it('renders a bar for each suite', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('admin-dashboard-suite-distribution')).toBeInTheDocument(),
    );
    for (const s of ['full_stack', 'architect', 'ai_engineer', 'quick_screen', 'deep_dive']) {
      expect(screen.getByTestId(`suite-bar-${s}`)).toBeInTheDocument();
    }
  });
});
