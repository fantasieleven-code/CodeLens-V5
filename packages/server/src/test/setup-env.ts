process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/codelens_test';
process.env.JWT_SECRET ??= 'test-secret-key-at-least-16-chars';
process.env.LOG_LEVEL ??= 'error';
