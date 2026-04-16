import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    log?: typeof logger;
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.requestId = requestId;
  req.log = logger.child({ requestId });
  res.setHeader('x-request-id', requestId);
  next();
}
