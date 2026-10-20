import { mask } from './mask.js';

export type LogLevel = 'quiet' | 'normal' | 'verbose';

let level: LogLevel = 'normal';

export function setLogLevel(l: LogLevel): void {
  level = l;
}

/** All TEA output goes through here so secrets are always masked. */
export const log = {
  info(msg: string): void {
    if (level !== 'quiet') process.stdout.write(mask(msg) + '\n');
  },
  step(msg: string): void {
    if (level !== 'quiet') process.stdout.write(`☕ ${mask(msg)}\n`);
  },
  debug(msg: string): void {
    if (level === 'verbose') process.stdout.write(`  ${mask(msg)}\n`);
  },
  warn(msg: string): void {
    process.stderr.write(`! ${mask(msg)}\n`);
  },
  error(msg: string): void {
    process.stderr.write(`x ${mask(msg)}\n`);
  },
};
