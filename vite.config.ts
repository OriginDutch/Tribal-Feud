import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [preact()],
  worker: {
    format: 'es',
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
