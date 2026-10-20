import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@tea-qa/core': pkg('core'),
      '@tea-qa/scanner': pkg('scanner'),
      '@tea-qa/browser-agent': pkg('browser-agent'),
      '@tea-qa/report': pkg('report'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
