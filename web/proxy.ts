import { NextResponse, type NextRequest } from 'next/server';

/**
 * Every request to the Workbench passes here. It only answers this computer, by its loopback name
 * (blocks DNS rebinding), and only browsers that opened the one-time link `tea-qa ui` printed (the
 * token becomes an HttpOnly, SameSite=Strict cookie). Writes must come from the Workbench's own
 * pages (blocks cross-site requests).
 */

const COOKIE = 'tea_ui';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

function sameSecret(a: string | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const deny = (status: number, message: string) =>
  new NextResponse(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export function proxy(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const hostname = host.replace(/:\d+$/, '');
  if (!LOOPBACK.has(hostname)) return deny(403, 'TEA only answers requests addressed to this computer.');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== host) return deny(403, 'Cross-site request blocked.');
  }

  const token = process.env.TEA_UI_TOKEN;
  if (!token) {
    // `next dev` without the launcher: loopback-only, no token. Production always has one.
    if (process.env.NODE_ENV === 'development') return NextResponse.next();
    return deny(503, 'Start the Workbench with `tea-qa ui`.');
  }

  const offered = req.nextUrl.searchParams.get('token');
  if (offered !== null) {
    if (!sameSecret(offered, token)) return deny(401, 'That link has the wrong token. Use the one `tea-qa ui` printed.');
    const clean = req.nextUrl.clone();
    clean.searchParams.delete('token');
    const res = NextResponse.redirect(clean, 303);
    res.cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'strict', path: '/' });
    return res;
  }
  if (!sameSecret(req.cookies.get(COOKIE)?.value, token)) {
    return deny(401, 'Open the Workbench with the link `tea-qa ui` printed in your terminal (it includes a one-time token).');
  }
  return NextResponse.next();
}

export const config = { matcher: '/:path*' };
