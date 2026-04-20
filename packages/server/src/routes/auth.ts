/**
 * Auth routes — Task 15b Deliverable §3.
 *
 * POST /auth/login — bcrypt compare against OrgMember.passwordHash, then
 * signAdminToken with { adminId, orgId, orgRole }. authLimiter (15min / 20)
 * is applied per-route, stricter than apiLimiter (60s / 100).
 *
 * V5.0 baseline: no 2FA, no refresh, no OAuth, no password reset. Those are
 * V5.0.5 scope per brief §3.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';

import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { signAdminToken } from '../services/auth.service.js';
import { logger } from '../lib/logger.js';

export interface LoginRequestBody {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  orgId: string;
  orgRole: 'OWNER' | 'MEMBER';
  /** JWT expiry in seconds from now. */
  expiresIn: number;
}

/**
 * Convert a JWT expiry string ('8h', '90m', '30s', or a bare number) to
 * seconds. Centralized here so the `expiresIn` response field stays aligned
 * with what `jsonwebtoken` actually encodes in the token.
 */
export function parseJwtExpiryToSeconds(raw: string): number {
  const match = /^(\d+)([smhd]?)$/.exec(raw.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 60 * 60 * 24;
    default:
      return value;
  }
}

function sendInvalidCredentials(res: Response): void {
  res.status(401).json({ error: 'Invalid credentials', code: 'AUTH_INVALID' });
}

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as Partial<LoginRequestBody>;
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body required');
    }
    const { email, password } = body;
    if (typeof email !== 'string' || email.length === 0) {
      throw new ValidationError('email required');
    }
    if (typeof password !== 'string' || password.length === 0) {
      throw new ValidationError('password required');
    }

    const member = await prisma.orgMember.findFirst({
      where: { email },
    });
    if (!member) {
      sendInvalidCredentials(res);
      return;
    }

    const ok = await bcrypt.compare(password, member.passwordHash);
    if (!ok) {
      sendInvalidCredentials(res);
      return;
    }

    const role: 'OWNER' | 'MEMBER' = member.role === 'OWNER' ? 'OWNER' : 'MEMBER';
    const token = signAdminToken(member.id, member.orgId, role);

    await prisma.orgMember.update({
      where: { id: member.id },
      data: { lastLoginAt: new Date() },
    });

    const response: LoginResponse = {
      token,
      orgId: member.orgId,
      orgRole: role,
      expiresIn: parseJwtExpiryToSeconds(env.JWT_ADMIN_EXPIRY),
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

export const authRouter = Router();
authRouter.post('/login', authLimiter, loginHandler);

logger.debug('[auth] routes wired (POST /auth/login)');
