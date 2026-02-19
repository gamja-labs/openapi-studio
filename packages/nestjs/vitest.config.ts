import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    // Skip tsconfig extends resolution — the base tsconfig path
    // can't be resolved by vite's esbuild plugin in this monorepo layout.
    tsconfigRaw: '{}',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
