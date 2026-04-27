import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { AuthenticationError, AuthorizationError } from './errorHandler.js';

export interface AuthPayload {
  sub: string;
  role: 'candidate' | 'admin';
  sessionId?: string;
  orgId?: string;
  orgRole?: 'OWNER' | 'MEMBER';
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthPayload;
    orgId?: string;
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }
  // SECURITY NOTE (M5-3 audit): Query param token is used ONLY for WebSocket
  // upgrade requests where Authorization headers cannot be set by the browser.
  // WS connections are short-lived and tokens expire in 90min (candidate) / 8h (admin).
  // For HTTP API calls, clients MUST use Authorization: Bearer <token>.
  // SECURITY: Reject array parameters (?token[]=x&token[]=y) to prevent bypass
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  return null;
}

export async function requireCandidate(req: Request, _res: Response, next: NextFunction) {
  const headerToken = extractToken(req);

  // Path A — Authorization: Bearer header present (original flow).
  if (headerToken) {
    try {
      const payload = jwt.verify(headerToken, env.JWT_SECRET) as AuthPayload;
      if (payload.role !== 'candidate') {
        return next(new AuthorizationError('Candidate access required'));
      }
      // Session ownership check: prevent horizontal privilege escalation.
      const sessionIdParam = req.params.id || req.params.sessionId;
      if (sessionIdParam && payload.sessionId && sessionIdParam !== payload.sessionId) {
        return next(new AuthorizationError('Access denied: session mismatch'));
      }
      req.auth = payload;
      return next();
    } catch {
      return next(new AuthenticationError('Invalid or expired token'));
    }
  }

  // Path B — no header · body-token fallback. Accepts either the
  // randomly-generated `Session.candidateToken` (the original V5.0 contract)
  // OR `Session.id` (the sessionId-as-token contract introduced by Hotfix
  // #12 Path A's `shareableUrl = /exam/${sessionId}` change). The candidate
  // URL exposes only sessionId, so the frontend's ConsentPage/ProfileSetup
  // pass that into the request body. Without the OR clause, the body-token
  // path becomes unreachable from the new URL shape — Brief #13 §E E5
  // diagnosis. JWT Bearer (Path A) is unaffected.
  const bodyToken =
    typeof req.body?.sessionToken === 'string' && req.body.sessionToken.length > 0
      ? req.body.sessionToken
      : null;
  if (!bodyToken) {
    return next(new AuthenticationError('Authentication required'));
  }
  try {
    const session = await prisma.session.findFirst({
      where: { OR: [{ candidateToken: bodyToken }, { id: bodyToken }] },
      select: { id: true },
    });
    if (!session) {
      return next(new AuthenticationError('Invalid or expired token'));
    }
    const sessionIdParam = req.params.id || req.params.sessionId;
    if (sessionIdParam && sessionIdParam !== session.id) {
      return next(new AuthorizationError('Access denied: session mismatch'));
    }
    req.auth = { sub: session.id, role: 'candidate', sessionId: session.id };
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    if (payload.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    req.auth = payload;
    // Inject orgId for multi-tenant data scoping
    if (payload.orgId) {
      req.orgId = payload.orgId;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Require authenticated org member (OWNER or MEMBER). Injects req.orgId. */
export function requireOrg(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    if (payload.role !== 'admin' || !payload.orgId) {
      res.status(403).json({ error: 'Organization membership required' });
      return;
    }
    req.auth = payload;
    req.orgId = payload.orgId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Require org OWNER role. */
export function requireOrgOwner(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    if (payload.role !== 'admin' || !payload.orgId || payload.orgRole !== 'OWNER') {
      res.status(403).json({ error: 'Organization owner access required' });
      return;
    }
    req.auth = payload;
    req.orgId = payload.orgId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
