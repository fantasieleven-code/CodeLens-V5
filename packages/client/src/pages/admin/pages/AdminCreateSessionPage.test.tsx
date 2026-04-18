import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminCreateSessionPage } from './AdminCreateSessionPage.js';
import { ADMIN_SESSIONS } from '../mock/admin-sessions-fixtures.js';

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  // Remove any sessions created during the test so the mock fixture stays
  // deterministic for subsequent test cases.
  while (ADMIN_SESSIONS.length > 10) ADMIN_SESSIONS.shift();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminCreateSessionPage />
    </MemoryRouter>,
  );
}

describe('<AdminCreateSessionPage />', () => {
  it('starts at step 1 with 6 position cards', () => {
    renderPage();
    expect(screen.getByTestId('admin-create-step-1')).toBeInTheDocument();
    for (let i = 0; i < 6; i++) {
      expect(
        screen.getByTestId(`admin-create-step1-position-${i}`),
      ).toBeInTheDocument();
    }
  });

  it('advances from step 1 to step 2 after picking a position', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('admin-create-step1-position-0'));
    expect(screen.getByTestId('admin-create-step-2')).toBeInTheDocument();
    expect(screen.getByTestId('admin-create-step2-level-junior')).toBeInTheDocument();
    expect(screen.getByTestId('admin-create-step2-level-mid')).toBeInTheDocument();
    expect(screen.getByTestId('admin-create-step2-level-senior')).toBeInTheDocument();
  });

  it('picks junior level → recommends quick_screen on step 3', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('admin-create-step1-position-0'));
    fireEvent.click(screen.getByTestId('admin-create-step2-level-junior'));
    await waitFor(() =>
      expect(screen.getByTestId('admin-create-step-3')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('admin-create-step3-reasoning')).toHaveTextContent(
      /快速筛选|quick/,
    );
    expect(screen.getByTestId('admin-create-step3-suite-quick_screen')).toBeInTheDocument();
  });

  it('step 3 loads exam instances matching the selected level', async () => {
    renderPage();
    // mid + backend payment → full_stack + exams with level=mid.
    fireEvent.click(screen.getByTestId('admin-create-step1-position-0'));
    fireEvent.click(screen.getByTestId('admin-create-step2-level-mid'));
    await waitFor(() =>
      expect(screen.getByTestId('admin-create-step-3')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('admin-create-step3-exam-exam-java-payment-mid')).toBeInTheDocument();
  });

  it('submits + shows shareable link on step 4', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('admin-create-step1-position-0'));
    fireEvent.click(screen.getByTestId('admin-create-step2-level-mid'));
    await waitFor(() =>
      expect(screen.getByTestId('admin-create-step-3')).toBeInTheDocument(),
    );
    // The effect auto-selects the first mid exam; name/email are empty so the
    // submit button remains disabled.
    fireEvent.change(screen.getByTestId('admin-create-step3-candidate-name'), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByTestId('admin-create-step3-candidate-email'), {
      target: { value: 'alice@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('admin-create-submit'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('admin-create-success')).toBeInTheDocument(),
    );
    const link = screen.getByTestId('admin-create-shareable-link') as HTMLInputElement;
    expect(link.value).toMatch(/^\/share\/report\/tok-sess-/);
    expect(screen.getByTestId('admin-create-copy-link')).toBeInTheDocument();
  });

  it('copy link button invokes navigator.clipboard.writeText', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('admin-create-step1-position-0'));
    fireEvent.click(screen.getByTestId('admin-create-step2-level-mid'));
    await waitFor(() =>
      expect(screen.getByTestId('admin-create-step-3')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId('admin-create-step3-candidate-name'), {
      target: { value: 'Bob' },
    });
    fireEvent.change(screen.getByTestId('admin-create-step3-candidate-email'), {
      target: { value: 'bob@example.com' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('admin-create-submit'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('admin-create-copy-link')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('admin-create-copy-link'));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1),
    );
  });

  it('disables submit until candidate info is present', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('admin-create-step1-position-0'));
    fireEvent.click(screen.getByTestId('admin-create-step2-level-mid'));
    await waitFor(() =>
      expect(screen.getByTestId('admin-create-step-3')).toBeInTheDocument(),
    );
    const submit = screen.getByTestId('admin-create-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('admin-create-step3-candidate-name'), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByTestId('admin-create-step3-candidate-email'), {
      target: { value: 'alice@example.com' },
    });
    expect(submit.disabled).toBe(false);
  });

  it('senior + archStyle position recommends architect', async () => {
    renderPage();
    // pos-architect-logistics is index 2 by our fixture order.
    fireEvent.click(screen.getByTestId('admin-create-step1-position-2'));
    fireEvent.click(screen.getByTestId('admin-create-step2-level-senior'));
    await waitFor(() =>
      expect(screen.getByTestId('admin-create-step-3')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('admin-create-step3-suite-architect')).toBeInTheDocument();
    expect(screen.getByTestId('admin-create-step3-reasoning')).toHaveTextContent(
      /Architect|架构/,
    );
  });
});
