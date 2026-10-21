import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { log } from '../core/index.js';

export const RESPONSIBLE_USE = `Responsible use: only test apps you own or are authorised to test.
Against a live URL TEA is read-only: it opens pages and never submits forms, logs in or sends write requests.
Load tests, active scans and destructive tests never run against production.
TEA scores are not a security guarantee, audit or certification.`;

const NOTICE_VERSION = 1;

/** Where TEA keeps per-user state. TEA_HOME overrides it (used by tests). */
export function teaHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.TEA_HOME || join(homedir(), '.tea-qa');
}

/** Show the responsible-use notice the first time TEA runs for this user. Returns true if shown. */
export function showNoticeOnce(env: NodeJS.ProcessEnv = process.env): boolean {
  const marker = join(teaHome(env), `notice-v${NOTICE_VERSION}`);
  if (existsSync(marker)) return false;
  log.info(`\n${RESPONSIBLE_USE}\n`);
  try {
    mkdirSync(teaHome(env), { recursive: true });
    writeFileSync(marker, `${new Date().toISOString()}\n`);
  } catch {
    /* read-only home: show it again next time */
  }
  return true;
}
