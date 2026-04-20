import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './LoginPage.js';
import { __authStorageKey__, useAuthStore } from '../../stores/auth.store.js';

const ORIGINAL_FETCH = globalThis.fetch;

function resetAuth(): void {
  localStorage.removeItem(__authStorageKey__);
  useAuthStore.setState({
    token: null,
    orgId: null,
    orgRole: null,
    expiresAt: null,
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderAt(initial: string, state?: unknown) {
  const entry =
    state === undefined
      ? initial
      : ({ pathname: initial, search: '', hash: '', state, key: 'test' } as const);
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/admin"
          element={<div data-testid="admin-home">admin</div>}
        />
        <Route
          path="/admin/sessions"
          element={<div data-testid="admin-sessions">sessions</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<LoginPage />', () => {
  beforeEach(() => {
    resetAuth();
    (import.meta.env as Record<string, string | undefined>).VITE_API_URL =
      'http://api.test';
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = ORIGINAL_FETCH;
    delete (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
    vi.restoreAllMocks();
  });

  it('renders the form', () => {
    renderAt('/login');
    expect(screen.getByTestId('admin-login-form')).toBeInTheDocument();
    expect(screen.getByTestId('admin-login-email')).toBeInTheDocument();
    expect(screen.getByTestId('admin-login-password')).toBeInTheDocument();
  });

  it('on 200 stores auth + redirects to /admin by default', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, {
        token: 'jwt-ok',
        orgId: 'org-1',
        orgRole: 'OWNER',
        expiresIn: 28_800,
      }),
    ) as typeof fetch;

    renderAt('/login');
    fireEvent.change(screen.getByTestId('admin-login-email'), {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(screen.getByTestId('admin-login-password'), {
      target: { value: 'pw' },
    });
    fireEvent.submit(screen.getByTestId('admin-login-form'));

    await waitFor(() =>
      expect(screen.getByTestId('admin-home')).toBeInTheDocument(),
    );
    expect(useAuthStore.getState().token).toBe('jwt-ok');
    expect(useAuthStore.getState().orgRole).toBe('OWNER');
  });

  it('redirects to location.state.from after login when provided', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, {
        token: 'jwt-ok',
        orgId: 'org-1',
        orgRole: 'OWNER',
        expiresIn: 3600,
      }),
    ) as typeof fetch;

    renderAt('/login', { from: '/admin/sessions' });
    fireEvent.change(screen.getByTestId('admin-login-email'), {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(screen.getByTestId('admin-login-password'), {
      target: { value: 'pw' },
    });
    fireEvent.submit(screen.getByTestId('admin-login-form'));

    await waitFor(() =>
      expect(screen.getByTestId('admin-sessions')).toBeInTheDocument(),
    );
  });

  it('shows "邮箱或密码错误" on 401', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { error: 'Invalid credentials', code: 'AUTH_INVALID' }),
    ) as typeof fetch;

    renderAt('/login');
    fireEvent.change(screen.getByTestId('admin-login-email'), {
      target: { value: 'x@y.z' },
    });
    fireEvent.change(screen.getByTestId('admin-login-password'), {
      target: { value: 'bad' },
    });
    fireEvent.submit(screen.getByTestId('admin-login-form'));

    const err = await screen.findByTestId('admin-login-error');
    expect(err).toHaveAttribute('data-error-kind', 'invalid_credentials');
    expect(err.textContent).toMatch(/邮箱或密码错误/);
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('shows rate-limit message on 429', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(429, { error: 'Too many authentication attempts' }),
    ) as typeof fetch;

    renderAt('/login');
    fireEvent.change(screen.getByTestId('admin-login-email'), {
      target: { value: 'x@y.z' },
    });
    fireEvent.change(screen.getByTestId('admin-login-password'), {
      target: { value: 'pw' },
    });
    fireEvent.submit(screen.getByTestId('admin-login-form'));

    const err = await screen.findByTestId('admin-login-error');
    expect(err).toHaveAttribute('data-error-kind', 'rate_limited');
    expect(err.textContent).toMatch(/15 分钟/);
  });

  it('shows network message when fetch itself rejects', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    }) as typeof fetch;

    renderAt('/login');
    fireEvent.change(screen.getByTestId('admin-login-email'), {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(screen.getByTestId('admin-login-password'), {
      target: { value: 'pw' },
    });
    fireEvent.submit(screen.getByTestId('admin-login-form'));

    const err = await screen.findByTestId('admin-login-error');
    expect(err).toHaveAttribute('data-error-kind', 'network');
  });

  it('redirects to /admin immediately if already authenticated', () => {
    useAuthStore.setState({
      token: 'existing',
      orgId: 'org-1',
      orgRole: 'OWNER',
      expiresAt: Date.now() + 60_000,
    });
    renderAt('/login');
    expect(screen.getByTestId('admin-home')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-login-form')).not.toBeInTheDocument();
  });
});
