import { PrismaClient } from '@prisma/client';

// Connection pool is configured via DATABASE_URL query params:
//   ?connection_limit=10&pool_timeout=30
// For production with 200 concurrent interviews, set connection_limit=20
// or use PgBouncer as a connection pooling proxy.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});
