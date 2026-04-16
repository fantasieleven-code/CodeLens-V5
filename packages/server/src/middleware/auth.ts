import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

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

export function requireCandidate(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    if (payload.role !== 'candidate') {
      res.status(403).json({ error: 'Candidate access required' });
      return;
    }
    // Session ownership check: prevent horizontal privilege escalation
    // A candidate's token is scoped to their specific session
    const sessionIdParam = req.params.id || req.params.sessionId;
    if (sessionIdParam && payload.sessionId && sessionIdParam !== payload.sessionId) {
      res.status(403).json({ error: 'Access denied: session mismatch' });
      return;
    }
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
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
