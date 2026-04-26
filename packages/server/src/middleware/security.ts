import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from '../config/env.js';

// Dev/CI bind asymmetry: vite defaults to [::1]:5173, backend listens *:4000.
// Depending on how the browser resolves localhost, page Origin can be either
// http://localhost:5173 or http://127.0.0.1:5173 — the Express cors middleware,
// when given a string, echoes that string unconditionally as ACAO and any
// mismatch fails the browser-side check. Function form makes ACAO echo the
// request's actual Origin (only when it's in the allowlist), which is the safe
// pattern. Production CORS_ORIGIN contains no 'localhost' so .replace() is a
// no-op there and the set degenerates to a single entry.
const ALLOWED_ORIGINS = new Set([
  env.CORS_ORIGIN,
  env.CORS_ORIGIN.replace('localhost', '127.0.0.1'),
]);

export function securityMiddleware(app: Express) {
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.has(origin)) return callback(null, origin);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
}
