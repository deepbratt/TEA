/**
 * Scope guard: TEA only ever navigates to hosts the user listed, and never to skipped routes.
 */

export interface ScopeOptions {
  urls: string[];
  allowlist?: string[];
  skip?: string[];
}

export class Scope {
  readonly hosts: Set<string>;
  private skipRes: RegExp[];

  constructor(opts: ScopeOptions) {
    this.hosts = new Set<string>();
    for (const u of opts.urls) this.hosts.add(new URL(u).host.toLowerCase());
    for (const h of opts.allowlist ?? []) this.hosts.add(normaliseHost(h));
    this.skipRes = (opts.skip ?? []).map(globToRegExp);
  }

  /** True when the URL is on an allowed host and http(s). */
  isAllowed(url: string | URL): boolean {
    let u: URL;
    try {
      u = typeof url === 'string' ? new URL(url) : url;
    } catch {
      return false;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return this.hosts.has(u.host.toLowerCase());
  }

  isSkipped(pathOrUrl: string): boolean {
    let path = pathOrUrl;
    try {
      path = new URL(pathOrUrl).pathname;
    } catch {
      /* already a path */
    }
    return this.skipRes.some((re) => re.test(path));
  }

  /** Allowed and not skipped. */
  canVisit(url: string): boolean {
    return this.isAllowed(url) && !this.isSkipped(url);
  }
}

function normaliseHost(h: string): string {
  try {
    return new URL(h.includes('://') ? h : `https://${h}`).host.toLowerCase();
  } catch {
    return h.toLowerCase();
  }
}

/** Minimal glob: "*" matches within a path segment, "**" matches across segments. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // "/**" at the end also matches the bare prefix ("/admin/**" matches "/admin").
        if (glob[i - 1] === '/' && i + 2 === glob.length) {
          re = re.slice(0, -1) + '(?:/.*)?';
        } else {
          re += '.*';
        }
        i++;
      } else {
        re += '[^/]*';
      }
    } else if ('\\^$+?.()|{}[]'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}/?$`);
}

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$|\.localhost(:\d+)?$|\.test(:\d+)?$/i;
const NON_PROD_LABEL = /(^|[.-])(staging|stage|dev|develop|test|qa|sandbox|preview|uat)([.-]|$)/i;
// Vercel/Netlify branch previews, e.g. app-git-feature-team.vercel.app, deploy-preview-12--app.netlify.app.
const PREVIEW_HOSTS = /-git-[a-z0-9-]+\.vercel\.app(:\d+)?$|^deploy-preview-\d+--/i;

/**
 * Best-effort guess whether a URL is production. Used to demand --i-own-this-server for
 * load tests and active scans (milestone 4). Unknown public hosts count as production,
 * including bare *.vercel.app / *.lovable.app hosts, which are often a vibe-coder's live site.
 */
export function classifyUrl(url: string): 'local' | 'preview' | 'production' {
  const host = new URL(url).host;
  if (LOCAL_HOSTS.test(host)) return 'local';
  // Ignore the TLD: "myapp.dev" is not a dev environment, "dev.myapp.com" is.
  const labels = host.split(':')[0]!.split('.').slice(0, -1).join('.');
  if (NON_PROD_LABEL.test(labels) || PREVIEW_HOSTS.test(host)) return 'preview';
  return 'production';
}
