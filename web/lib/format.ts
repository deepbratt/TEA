// Small display helpers shared by server and client components (no engine imports here).

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;

export function when(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function duration(from?: string, to?: string): string {
  if (!from || !to) return '';
  const s = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
