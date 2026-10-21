/** @type {import('next').NextConfig} */
const nextConfig = {
  // BUG (exposed source map): ships the full original source to every visitor.
  productionBrowserSourceMaps: true,
  // BUG (missing security headers): no headers() config, so no CSP, HSTS or X-Frame-Options.
};

export default nextConfig;
