import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    // Default is 5000ms — the same as the raised asyncUtilTimeout in
    // setupTests.ts, meaning a test's own timeout and its waitFor
    // calls' timeout could fire at effectively the same moment under
    // load. Headroom here lets an individual waitFor's more generous
    // timeout actually matter instead of racing the whole test's clock.
    testTimeout: 10000,
  },
});
