import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from '../config/env.js';

export function securityMiddleware(app: Express) {
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
}
