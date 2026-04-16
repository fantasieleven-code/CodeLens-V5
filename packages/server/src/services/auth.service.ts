import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthPayload } from '../middleware/auth.js';

export function signCandidateToken(candidateId: string, sessionId: string): string {
  const options: SignOptions = { expiresIn: env.JWT_CANDIDATE_EXPIRY as unknown as number };
  return jwt.sign(
    { sub: candidateId, role: 'candidate', sessionId } satisfies AuthPayload,
    env.JWT_SECRET,
    options,
  );
}

export function signAdminToken(adminId: string, orgId?: string, orgRole?: 'OWNER' | 'MEMBER'): string {
  const options: SignOptions = { expiresIn: env.JWT_ADMIN_EXPIRY as unknown as number };
  const payload: AuthPayload = { sub: adminId, role: 'admin' };
  if (orgId) payload.orgId = orgId;
  if (orgRole) payload.orgRole = orgRole;
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, env.JWT_SECRET) as AuthPayload;
}

/** Generate a share token for viewing a session report (7-day expiry, no role needed) */
export function signShareToken(sessionId: string): string {
  return jwt.sign(
    { sub: 'share', purpose: 'report_share', sessionId },
    env.JWT_SECRET,
    { expiresIn: '7d' },
  );
}

/** Verify and extract sessionId from a share token */
export function verifyShareToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;
    if (payload.purpose !== 'report_share' || typeof payload.sessionId !== 'string') {
      return null;
    }
    return payload.sessionId;
  } catch {
    return null;
  }
}
