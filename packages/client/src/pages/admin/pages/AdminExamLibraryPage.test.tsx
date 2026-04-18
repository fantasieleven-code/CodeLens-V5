import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminExamLibraryPage } from './AdminExamLibraryPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminExamLibraryPage />
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe('<AdminExamLibraryPage />', () => {
  it('renders an exam row for each fixture after load', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('admin-exam-library-root')).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId('admin-exam-row-exam-java-payment-mid'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('admin-exam-row-exam-go-logistics-senior'),
    ).toBeInTheDocument();
  });

  it('filters by level', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('admin-exam-library-root')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId('admin-exam-filter-level'), {
      target: { value: 'senior' },
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('admin-exam-row-exam-go-logistics-senior'),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('admin-exam-row-exam-java-payment-mid'),
      ).toBeNull();
    });
  });

  it('clicking an exam row populates the detail panel', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('admin-exam-library-root')).toBeInTheDocument(),
    );
    const detail = screen.getByTestId('admin-exam-detail');
    expect(detail).toHaveTextContent('选择一个题库实例');
    fireEvent.click(screen.getByTestId('admin-exam-row-exam-java-payment-mid'));
    expect(detail).toHaveTextContent('支付系统');
    expect(detail).toHaveTextContent('exam-java-payment-mid');
  });
});
