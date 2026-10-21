import { spawn } from 'node:child_process';

/**
 * Ways to get a GitHub token for the local UI. Tokens are kept in memory only, never written
 * to disk, and registered with the masker by the caller.
 */

export const GITHUB_OAUTH = 'https://github.com';

/** Read-only scope for the OAuth device flow: repo contents and metadata. */
const DEVICE_SCOPE = 'repo read:user';

/** The token of the GitHub CLI (`gh auth token`), if gh is installed and signed in. */
export function ghCliToken(timeoutMs = 10_000): Promise<string | null> {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn('gh', ['auth', 'token'], { stdio: ['ignore', 'pipe', 'ignore'], shell: false, windowsHide: true });
    } catch {
      return resolve(null);
    }
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, timeoutMs);
    child.stdout!.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      const token = out.trim();
      resolve(code === 0 && /^[A-Za-z0-9_]{20,255}$/.test(token) ? token : null);
    });
  });
}

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresAt: number;
}

async function post(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'tea-qa' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json()) as Record<string, unknown>;
}

/** Start GitHub's OAuth device flow: the user enters `userCode` at `verificationUri`. */
export async function startDeviceFlow(clientId: string, base = GITHUB_OAUTH): Promise<DeviceCode> {
  const d = await post(`${base}/login/device/code`, { client_id: clientId, scope: DEVICE_SCOPE });
  if (typeof d.device_code !== 'string' || typeof d.user_code !== 'string') {
    throw new Error(`GitHub did not start sign-in${typeof d.error === 'string' ? ` (${d.error})` : ''}.`);
  }
  return {
    deviceCode: d.device_code,
    userCode: d.user_code,
    verificationUri: typeof d.verification_uri === 'string' ? d.verification_uri : 'https://github.com/login/device',
    interval: Number(d.interval ?? 5),
    expiresAt: Date.now() + Number(d.expires_in ?? 900) * 1000,
  };
}

export type DevicePoll = { status: 'pending' } | { status: 'slow_down'; interval: number } | { status: 'done'; token: string } | { status: 'failed'; reason: string };

/** One poll of the device flow. Call no faster than the interval GitHub gave. */
export async function pollDeviceFlow(clientId: string, deviceCode: string, base = GITHUB_OAUTH): Promise<DevicePoll> {
  const d = await post(`${base}/login/oauth/access_token`, {
    client_id: clientId,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });
  if (typeof d.access_token === 'string') return { status: 'done', token: d.access_token };
  if (d.error === 'authorization_pending') return { status: 'pending' };
  if (d.error === 'slow_down') return { status: 'slow_down', interval: Number(d.interval ?? 10) };
  const reasons: Record<string, string> = {
    expired_token: 'The code expired. Start again.',
    access_denied: 'Sign-in was cancelled on GitHub.',
  };
  return { status: 'failed', reason: reasons[String(d.error)] ?? `GitHub sign-in failed (${String(d.error ?? 'unknown error')}).` };
}
