import { mask } from './mask.js';

export type LogLevel = 'quiet' | 'normal' | 'verbose';
/** `result` is the end-of-run summary printed for the terminal; the UI shows its own instead. */
export type LogKind = 'info' | 'step' | 'debug' | 'warn' | 'error' | 'result';

export interface LogEvent {
  kind: LogKind;
  /** Already masked. */
  message: string;
  at: string;
}

let level: LogLevel = 'normal';
const listeners = new Set<(e: LogEvent) => void>();

export function setLogLevel(l: LogLevel): void {
  level = l;
}

/** Receive every log line (all levels, masked), e.g. to stream progress to the local UI. */
export function onLog(listener: (e: LogEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(kind: LogKind, raw: string): string {
  const message = mask(raw);
  if (listeners.size) {
    const e = { kind, message, at: new Date().toISOString() };
    for (const l of listeners) l(e);
  }
  return message;
}

function print(line: string): void {
  if (level !== 'quiet') process.stdout.write(`${line}\n`);
}

/** All TEA output goes through here so secrets are always masked. */
export const log = {
  info(msg: string): void {
    print(emit('info', msg));
  },
  step(msg: string): void {
    print(`☕ ${emit('step', msg)}`);
  },
  result(msg: string): void {
    print(emit('result', msg));
  },
  debug(msg: string): void {
    const m = emit('debug', msg);
    if (level === 'verbose') process.stdout.write(`  ${m}\n`);
  },
  warn(msg: string): void {
    process.stderr.write(`! ${emit('warn', msg)}\n`);
  },
  error(msg: string): void {
    process.stderr.write(`x ${emit('error', msg)}\n`);
  },
};
