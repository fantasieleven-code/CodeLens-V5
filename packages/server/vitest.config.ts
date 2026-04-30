import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    include: ['src/**/*.test.ts'],
    exclude: ['src/services/archive/**', '**/node_modules/**'],
    environment: 'node',
    setupFiles: ['src/test/setup-env.ts'],
  },
});
