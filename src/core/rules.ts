import { z } from 'zod';
import { checkIdOf, type Catalog } from './catalog.js';
import { SEVERITIES, type Finding, type Severity } from './types.js';

/**
 * Rules: the user's quality profile. One entry per check id; anything not listed uses the
 * catalog's defaults. Stored in the workspace config file and editable in the UI.
 */
export const RuleSchema = z
  .object({
    enabled: z.boolean().optional(),
    severity: z.enum(SEVERITIES).optional(),
    params: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
  })
  .strict();

export const RulesSchema = z.record(RuleSchema);

export type Rule = z.infer<typeof RuleSchema>;
export type Rules = z.infer<typeof RulesSchema>;

export interface EffectiveRule {
  id: string;
  enabled: boolean;
  severity: Severity;
  params: Record<string, number | string | boolean>;
}

/** The rule that applies to a check: catalog defaults overlaid with the user's settings. */
export function effectiveRule(catalog: Catalog, rules: Rules, id: string): EffectiveRule | undefined {
  const entry = catalog.get(id);
  if (!entry) return undefined;
  const r = rules[id] ?? {};
  const params: Record<string, number | string | boolean> = {};
  for (const [name, spec] of Object.entries(entry.params ?? {})) params[name] = spec.default;
  return { id, enabled: r.enabled ?? true, severity: r.severity ?? entry.severity, params: { ...params, ...(r.params ?? {}) } };
}

/** A numeric rule parameter, e.g. ruleNumber(catalog, rules, 'crawl.slow', 'thresholdMs'). */
export function ruleNumber(catalog: Catalog, rules: Rules, id: string, param: string): number | undefined {
  const v = effectiveRule(catalog, rules, id)?.params[param];
  return typeof v === 'number' ? v : undefined;
}

/** Drop findings of disabled checks and apply severity overrides. */
export function applyRules(findings: Finding[], catalog: Catalog, rules: Rules): Finding[] {
  const out: Finding[] = [];
  for (const f of findings) {
    const id = checkIdOf(f.id);
    const rule = rules[id];
    if (rule?.enabled === false) continue;
    out.push(rule?.severity && catalog.get(id) ? { ...f, severity: rule.severity } : f);
  }
  return out;
}

/** Problems in a rules object against the catalog: unknown checks, unknown or mistyped params. */
export function validateRules(catalog: Catalog, rules: Rules): string[] {
  const problems: string[] = [];
  for (const [id, rule] of Object.entries(rules)) {
    const entry = catalog.get(id);
    if (!entry) {
      problems.push(`Unknown check "${id}".`);
      continue;
    }
    for (const [name, value] of Object.entries(rule.params ?? {})) {
      const spec = entry.params?.[name];
      if (!spec) problems.push(`${id}: unknown setting "${name}".`);
      else if (typeof value !== typeof spec.default) problems.push(`${id}: "${name}" must be a ${typeof spec.default}.`);
      else if (typeof value === 'number' && ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max))) {
        problems.push(`${id}: "${name}" must be between ${spec.min ?? '-∞'} and ${spec.max ?? '∞'}.`);
      }
    }
  }
  return problems;
}
