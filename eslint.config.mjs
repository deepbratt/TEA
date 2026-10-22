import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', 'examples/**', 'tea-report/**', '**/*.d.ts', 'web/next-env.d.ts', '_site/**', '**/demo-out/**', '.demo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'error', // print through log so secrets are masked
    },
  },
  {
    // Code evaluated inside the browser page by Playwright.
    files: ['src/scanner/crawl.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // The Workbench (Next.js): server code runs in Node, components in the browser.
    files: ['web/**/*.{ts,tsx}', 'site/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['scripts/**', '**/*.test.ts'],
    rules: { 'no-console': 'off' },
  },
);
