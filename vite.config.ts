import preact from '@preact/preset-vite';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [preact()],
  // always the same address: saves live per address (localhost:5173 and :5174 are different
  // storage to the browser), so never fall back to another port
  server: {
    port: 5173,
    strictPort: true,
  },
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
