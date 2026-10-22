import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const here = dirname(fileURLToPath(import.meta.url));
const dev = process.env.NODE_ENV === 'development';

// The Workbench only ever talks to itself: no third-party scripts, styles, frames or connections.
// Next.js needs inline scripts for hydration ('unsafe-eval' only in dev for React's tooling).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const config: NextConfig = {
  // The shared design tokens live one level up (theme/tea.css), next to the engine.
  turbopack: { root: resolve(here, '..') },
  outputFileTracingRoot: resolve(here, '..'),
  serverExternalPackages: ['playwright', 'playwright-core'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

/**
 * The website demo (NEXT_PUBLIC_TEA_DEMO=1): a static export under a base path, built into its own
 * folder so the local app's build is untouched. Only .tsx files route, which leaves out the API
 * (route.ts) and the request guard (proxy.ts): the demo has no server, and nothing to protect.
 */
const demo: NextConfig = {
  turbopack: config.turbopack,
  outputFileTracingRoot: config.outputFileTracingRoot,
  poweredByHeader: false,
  output: 'export',
  distDir: 'demo-out',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  trailingSlash: true,
  pageExtensions: ['tsx'],
  images: { unoptimized: true },
};

export default process.env.NEXT_PUBLIC_TEA_DEMO === '1' ? demo : config;
