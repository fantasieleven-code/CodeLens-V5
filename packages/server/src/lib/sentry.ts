/**
 * Sentry integration — optional, no-op when SENTRY_DSN not configured.
 *
 * Install: npm install @sentry/node
 * Configure: Set SENTRY_DSN env var
 *
 * The module is dynamically imported to avoid build errors when @sentry/node
 * is not installed (optional peer dependency).
 */
import { env } from '../config/env.js';
import { logger } from './logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sentry: any = null;
let _initialized = false;

export async function initSentry(): Promise<void> {
  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    logger.info('Sentry: disabled (no SENTRY_DSN)');
    return;
  }

  try {
    _sentry = await import('@sentry/node' as string);
    _sentry.init({
      dsn,
      environment: env.SENTRY_ENVIRONMENT,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
      beforeSend(event: Record<string, unknown>) {
        // Scrub sensitive headers
        const req = event.request as Record<string, unknown> | undefined;
        if (req?.headers && typeof req.headers === 'object') {
          const headers = req.headers as Record<string, unknown>;
          delete headers['authorization'];
          delete headers['cookie'];
        }
        return event;
      },
    });
    _initialized = true;
    logger.info('Sentry: initialized', { environment: env.SENTRY_ENVIRONMENT });
  } catch (err) {
    logger.warn('Sentry: failed to initialize — install @sentry/node to enable', err);
  }
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!_sentry || !_initialized) return;

  if (context) {
    _sentry.withScope((scope: { setExtra: (k: string, v: unknown) => void }) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      _sentry.captureException(err);
    });
  } else {
    _sentry.captureException(err);
  }
}

export function setUser(user: { id: string; role?: string }): void {
  if (_sentry && _initialized) {
    _sentry.setUser(user);
  }
}

export function isSentryEnabled(): boolean {
  return _initialized;
}
