import preact from '@preact/preset-vite';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [preact()],
  worker: {
    format: 'es',
  },
  test: {
    include: ['src/**/*.test.ts'],
    // long balance simulations: npx vitest run --config vitest.sim.config.ts
    exclude: [...configDefaults.exclude, 'src/**/*.sim.test.ts'],
    environment: 'node',
  },
});
