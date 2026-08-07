import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'happy-dom',
    include: ['lib/**/*.test.ts'],
    setupFiles: ['vitest.setup.ts'],
  },
});
