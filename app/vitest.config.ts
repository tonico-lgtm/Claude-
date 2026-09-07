import { defineConfig } from 'vitest/config';

// Testes do motor: puros, sem DOM. Separado do `vite.config.ts` porque o
// `vitest` 2 embute o seu próprio `vite`, e os tipos dos dois colidem.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
