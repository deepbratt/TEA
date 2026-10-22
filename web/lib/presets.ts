// One-click setups for people who don't want to tune every check. Each preset is a set of
// overrides on top of every check's defaults; the Rules and Gate pages apply them and the user saves.

export type RuleOverride = { enabled?: boolean; severity?: string; params?: Record<string, number> };

export interface Preset<T> {
  id: string;
  name: string;
  emoji: string;
  description: string;
  value: T;
}

export const RULE_PRESETS: Preset<Record<string, RuleOverride>>[] = [
  {
    id: 'relaxed',
    name: 'Relaxed',
    emoji: '🌱',
    description: 'For prototypes. Only real breakage counts; noise and tips are off.',
    value: {
      'crawl.console-errors': { enabled: false },
      'wiring.unused-endpoint': { enabled: false },
      'crawl.missing-assets': { severity: 'low' },
      'crawl.slow': { params: { thresholdMs: 5000 } },
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    emoji: '☕',
    description: "TEA's defaults. A good fit for most apps.",
    value: {},
  },
  {
    id: 'strict',
    name: 'Strict',
    emoji: '🛡️',
    description: 'Before launch. Everything is on, and slow pages and leftovers count more.',
    value: {
      'crawl.slow': { severity: 'high', params: { thresholdMs: 2000 } },
      'crawl.console-errors': { severity: 'medium' },
      'crawl.broken-images': { severity: 'medium' },
      'wiring.unused-endpoint': { severity: 'low' },
    },
  },
];

type Condition = { metric: string; op: 'lt' | 'gt'; value: number };

export const GATE_PRESETS: Preset<Condition[]>[] = [
  {
    id: 'relaxed',
    name: 'Relaxed',
    emoji: '🌱',
    description: 'Fail only on critical issues or a very low score.',
    value: [
      { metric: 'critical', op: 'gt', value: 0 },
      { metric: 'score', op: 'lt', value: 40 },
    ],
  },
  {
    id: 'balanced',
    name: 'Balanced',
    emoji: '☕',
    description: 'No critical issues, at most 3 high ones, and a score of 60 or more.',
    value: [
      { metric: 'critical', op: 'gt', value: 0 },
      { metric: 'high', op: 'gt', value: 3 },
      { metric: 'score', op: 'lt', value: 60 },
    ],
  },
  {
    id: 'strict',
    name: 'Strict',
    emoji: '🛡️',
    description: 'Ready to launch: no critical or high issues, few medium ones, a score of 80 or more.',
    value: [
      { metric: 'critical', op: 'gt', value: 0 },
      { metric: 'high', op: 'gt', value: 0 },
      { metric: 'medium', op: 'gt', value: 5 },
      { metric: 'score', op: 'lt', value: 80 },
    ],
  },
];

/** Plain words for each severity. */
export const SEVERITY_WORDS: Record<string, string> = {
  critical: 'Critical: must fix',
  high: 'High: fix soon',
  medium: 'Medium',
  low: 'Low',
  info: 'Just a tip',
};

/** Friendly names for the catalog's categories. */
export const CATEGORY_NAMES: Record<string, { name: string; emoji: string }> = {
  functional: { name: 'Pages and features', emoji: '🧭' },
  performance: { name: 'Speed', emoji: '⚡' },
  wiring: { name: 'Frontend ↔ API wiring', emoji: '🔌' },
  security: { name: 'Security', emoji: '🔒' },
  'db-scale': { name: 'Database at scale', emoji: '🗄️' },
  'prod-ready': { name: 'Production readiness', emoji: '🚀' },
  'code-health': { name: 'Code health', emoji: '🧹' },
  accessibility: { name: 'Accessibility', emoji: '♿' },
  seo: { name: 'Search and sharing', emoji: '🔎' },
  features: { name: 'Features', emoji: '📋' },
  ux: { name: 'User experience', emoji: '✨' },
};
