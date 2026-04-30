/**
 * CSRF Protection Middleware (double-submit cookie pattern)
 *
 * Protects state-changing requests (POST/PUT/PATCH/DELETE) by requiring
 * a CSRF token that matches between a cookie and a request header.
 *
 * JWT-in-Authorization-header requests are inherently CSRF-safe (browsers
 * don't auto-attach custom headers), but this adds defense-in-depth for
 * any cookie-based auth flows (e.g., admin sessions).
 *
 * Skip conditions:
 *   - GET/HEAD/OPTIONS requests (safe methods)
 *   - Requests with Authorization: Bearer header (already CSRF-safe)
 *   - Webhook callbacks (server-to-server, no browser context)
 */

import { randomBytes } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const TOKEN_LENGTH = 32;

/** Parse a specific cookie from the Cookie header (avoids cookie-parser dependency) */
function parseCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const match = header.split(';').find((c) => c.trim().startsWith(`${name}=`));
  return match ? match.split('=')[1]?.trim() : undefined;
}

/** Generate a new CSRF token and set it as a cookie */
export function csrfTokenMiddleware(req: Request, res: Response, next: NextFunction) {
  // Always ensure a CSRF cookie exists (for client to read and send back as header)
  if (!parseCookie(req, CSRF_COOKIE)) {
    const token = randomBytes(TOKEN_LENGTH).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // Client JS needs to read it for double-submit
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours (match admin JWT expiry)
    });
  }
  next();
}

/** Validate CSRF token on state-changing requests */
export function csrfValidationMiddleware(req: Request, res: Response, next: NextFunction) {
  // Safe methods don't need CSRF protection
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF in test environment (E2E tests use programmatic API calls)
  if (env.NODE_ENV === 'test') {
    return next();
  }

  // Requests with Bearer token are inherently CSRF-safe
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }

  // Skip webhook callbacks (server-to-server)
  if (req.path.startsWith('/api/webhooks') || req.path.startsWith('/chat-stream') || req.path.includes('callback')) {
    return next();
  }

  // Skip auth endpoints (no token yet, inherently not CSRF-vulnerable)
  if (req.path.includes('/login') || req.path.includes('/register') || req.path.includes('/lead')) {
    return next();
  }

  // Double-submit validation: cookie must match header
  const cookieToken = parseCookie(req, CSRF_COOKIE);
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: { code: 'CSRF_VALIDATION_FAILED', message: 'CSRF token mismatch' } });
    return;
  }

  next();
}
