import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/client/vitest.config.ts',
      'packages/server/vitest.config.ts',
    ],
  },
});
