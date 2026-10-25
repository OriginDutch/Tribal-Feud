// Balance simulations (minutes to hours). Settings via env: SEED, DAYS, OUT.
// Example: SEED=1 DAYS=1,3,5,10 OUT=/tmp/run1.txt npx vitest run --config vitest.sim.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.sim.test.ts'],
    environment: 'node',
    testTimeout: 0,
  },
});
