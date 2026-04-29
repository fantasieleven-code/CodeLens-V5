import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';
import { captureException } from '../lib/sentry.js';

// ── Error class hierarchy ──

export class AppError extends Error {
  public readonly code: string;

  constructor(
    public statusCode: number,
    message: string,
    code?: string,
    public isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code ?? 'APP_ERROR';
  }
}

export class ValidationError extends AppError {
  public readonly details?: Array<{ path: string; message: string }>;

  constructor(message: string, details?: Array<{ path: string; message: string }>) {
    super(400, message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class SandboxError extends AppError {
  constructor(message = 'Sandbox service unavailable') {
    super(503, message, 'SANDBOX_ERROR');
    this.name = 'SandboxError';
  }
}

export class AIProviderError extends AppError {
  constructor(message = 'AI provider error') {
    super(502, message, 'AI_PROVIDER_ERROR');
    this.name = 'AIProviderError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, message, 'AUTH_REQUIRED');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, message, 'FORBIDDEN');
    this.name = 'AuthorizationError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(409, message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(429, message, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

// ── Helper: extract error info from unknown errors ──

type PrismaKnownRequestLike = Error & {
  code?: string;
  meta?: { cause?: string };
};

type ZodErrorLike = Error & {
  issues?: Array<{ path?: unknown; message?: unknown }>;
};

function mapToAppError(err: Error): AppError | null {
  // Prisma PrismaClientKnownRequestError (P2025 = NotFound)
  const maybePrisma = err as PrismaKnownRequestLike;
  if (err.constructor?.name === 'PrismaClientKnownRequestError' && maybePrisma.code === 'P2025') {
    return new NotFoundError(maybePrisma.meta?.cause ?? 'Record not found');
  }

  // ZodError
  const maybeZod = err as ZodErrorLike;
  if (err.name === 'ZodError' && Array.isArray(maybeZod.issues)) {
    const details = maybeZod.issues.map((issue) => ({
      path: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path),
      message: String(issue.message),
    }));
    return new ValidationError('Validation failed', details);
  }

  return null;
}

// ── Global error handler middleware ──

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  // Already an AppError — use directly
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: {
        code: err.code,
        message: err.message,
        ...(err instanceof ValidationError && err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Try auto-mapping (Prisma, Zod, etc.)
  const mapped = mapToAppError(err);
  if (mapped) {
    const body: Record<string, unknown> = {
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped instanceof ValidationError && mapped.details ? { details: mapped.details } : {}),
      },
    };
    res.status(mapped.statusCode).json(body);
    return;
  }

  // Unhandled — log and report to Sentry
  logger.error('Unhandled error', err);
  captureException(err, { url: _req.originalUrl, method: _req.method });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
}
