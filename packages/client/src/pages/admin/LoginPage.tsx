/**
 * LoginPage — admin email/password form → POST /auth/login.
 *
 * On success stashes the JWT in `useAuthStore` (persists to localStorage) and
 * navigates to the redirect target provided by AdminGuard (state.from) or
 * /admin by default. Error states map 1:1 to LoginError.kind so the messaging
 * stays deterministic.
 */

import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store.js';
import { LoginError, postLogin } from '../../services/authApi.js';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
} from '../../lib/tokens.js';

type ErrorState = { kind: LoginError['kind']; message: string } | null;

function messageFor(kind: LoginError['kind'], fallback: string): string {
  switch (kind) {
    case 'invalid_credentials':
      return '邮箱或密码错误。';
    case 'rate_limited':
      return '登录尝试次数过多,请 15 分钟后再试。';
    case 'validation':
      return `请求无效:${fallback}`;
    case 'network':
      return '无法连接到服务器,请检查网络后重试。';
    default:
      return fallback;
  }
}

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ErrorState>(null);

  const from =
    (location.state as { from?: string } | null)?.from ?? '/admin';

  // Already-authenticated visitors skip the form; honor `from` so a bookmarked
  // deep-link survives the round trip through the login route.
  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (email.trim().length === 0 || password.length === 0) {
      setError({ kind: 'validation', message: '请输入邮箱和密码。' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await postLogin(email.trim(), password);
      login({
        token: result.token,
        orgId: result.orgId,
        orgRole: result.orgRole,
        expiresIn: result.expiresIn,
      });
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof LoginError) {
        setError({ kind: err.kind, message: messageFor(err.kind, err.message) });
      } else {
        setError({
          kind: 'unknown',
          message: err instanceof Error ? err.message : '登录失败',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.root} data-testid="admin-login-root">
      <form style={styles.card} onSubmit={onSubmit} data-testid="admin-login-form">
        <h1 style={styles.title}>管理员登录</h1>
        <p style={styles.hint}>使用 Org 管理员邮箱访问 CodeLens Admin。</p>

        <label style={styles.label}>
          邮箱
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            required
            data-testid="admin-login-email"
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            data-testid="admin-login-password"
            style={styles.input}
          />
        </label>

        {error && (
          <div
            role="alert"
            data-testid="admin-login-error"
            data-error-kind={error.kind}
            style={styles.error}
          >
            {error.message}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          data-testid="admin-login-submit"
          style={{
            ...styles.submit,
            ...(submitting ? styles.submitDisabled : {}),
          }}
        >
          {submitting ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.base,
    color: colors.text,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: spacing.xxl,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
  },
  title: {
    margin: 0,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  hint: {
    margin: 0,
    color: colors.subtext0,
    fontSize: fontSizes.sm,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    fontSize: fontSizes.sm,
    color: colors.subtext0,
  },
  input: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.base,
    color: colors.text,
    border: `1px solid ${colors.surface0}`,
    fontFamily: 'inherit',
    fontSize: fontSizes.md,
  },
  error: {
    padding: spacing.md,
    borderRadius: radii.sm,
    color: colors.red,
    border: `1px solid ${colors.red}`,
    backgroundColor: 'rgba(243,139,168,0.12)',
    fontSize: fontSizes.sm,
  },
  submit: {
    padding: spacing.md,
    borderRadius: radii.sm,
    border: 'none',
    backgroundColor: colors.blue,
    color: colors.crust,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontSize: fontSizes.md,
  },
  submitDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
};
