/**
 * Secret masking. Every string TEA prints, logs or writes to a report goes through mask().
 * Two layers: exact values we know are secret (env vars, login passwords) and
 * well-known secret patterns (API keys, JWTs, private keys).
 */

const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|PASSWD|PWD|PRIVATE|API_?KEY|ACCESS_?KEY|CREDENTIAL|AUTH|SERVICE_ROLE|DSN|DATABASE_URL|CONNECTION_STRING)/i;

const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}\b/g, // Stripe
  /\bwhsec_[A-Za-z0-9]{16,}\b/g, // Stripe webhook secret
  /\bsk-(proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g, // OpenAI / Anthropic
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API key
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, // GitHub tokens
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, // Slack
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/gi, // credentials in URLs
];

const MIN_SECRET_LENGTH = 6;

export class Masker {
  private values = new Set<string>();

  /** Register an exact value to mask wherever it appears. */
  add(value: string | undefined | null): void {
    if (!value) return;
    const v = String(value);
    if (v.length >= MIN_SECRET_LENGTH) this.values.add(v);
  }

  /** Register every env var whose name looks secret. */
  addFromEnv(env: NodeJS.ProcessEnv = process.env): void {
    for (const [name, value] of Object.entries(env)) {
      if (value && SECRET_NAME.test(name)) this.add(value);
    }
  }

  mask(input: string): string {
    if (!input) return input;
    let out = input;
    // Longest first, so a value containing another value is fully masked.
    for (const v of [...this.values].sort((a, b) => b.length - a.length)) {
      out = out.split(v).join(redact(v));
    }
    for (const re of PATTERNS) {
      out = out.replace(re, (m) => {
        // Keep the scheme for URL credentials so the message stays readable.
        const url = /^([a-z][a-z0-9+.-]*:\/\/)/i.exec(m);
        if (url && m.endsWith('@')) return `${url[1]}****:****@`;
        return redact(m);
      });
    }
    return out;
  }

  /** Deep-mask every string in a JSON-serialisable value. */
  maskDeep<T>(value: T): T {
    if (typeof value === 'string') return this.mask(value) as T;
    if (Array.isArray(value)) return value.map((v) => this.maskDeep(v)) as T;
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = this.maskDeep(v);
      return out as T;
    }
    return value;
  }
}

/** Show only a short prefix so a human can tell which key it was. */
export function redact(value: string): string {
  const keep = value.length > 12 ? 4 : 0;
  return `${value.slice(0, keep)}****`;
}

export function looksSecretName(name: string): boolean {
  return SECRET_NAME.test(name);
}

/** Process-wide masker used by the logger and report writers. */
export const masker = new Masker();
export const mask = (s: string) => masker.mask(s);
