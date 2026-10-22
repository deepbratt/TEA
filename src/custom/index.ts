import { z } from 'zod';
import { globToRegExp, SEVERITIES, type Area, type Finding, type PageVisit, type Route } from '../core/index.js';
import { createRepoContext, isTestPath, lineOf } from '../repo-map/context.js';

/**
 * Custom rules: checks anyone can add in the config file (or the Workbench) without writing code.
 *   forbid-text    some text must NOT appear in the code (e.g. "console.log(", "TODO", "localhost:")
 *   require-text   some text MUST appear somewhere in the code (e.g. a cookie banner component)
 *   require-file   a file must exist (e.g. ".env.example", "README*")
 *   require-route  a page or endpoint must exist (e.g. "/privacy", "/api/health")
 * They are read-only like every other check: TEA only reads files and the pages it already visited.
 */

export const CUSTOM_RULE_TYPES = ['forbid-text', 'require-text', 'require-file', 'require-route'] as const;

export const CustomRuleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Use lowercase letters, numbers and dashes'),
    title: z.string().min(3).max(120),
    description: z.string().max(400).optional(),
    type: z.enum(CUSTOM_RULE_TYPES),
    severity: z.enum(SEVERITIES).default('medium'),
    enabled: z.boolean().default(true),
    /** forbid-text / require-text: the text to look for. */
    text: z.string().min(1).max(200).optional(),
    /** Treat `text` as a regular expression. */
    regex: z.boolean().optional(),
    /** Which files to look in (glob, e.g. "src/**\/*.ts"); default: all source files. Or, for require-file, the file to find. */
    files: z.string().min(1).max(200).optional(),
    /** require-route: the path that must exist, e.g. "/privacy". Globs work: "/api/health*". */
    path: z.string().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if ((r.type === 'forbid-text' || r.type === 'require-text') && !r.text) ctx.addIssue({ code: 'custom', path: ['text'], message: 'Say which text to look for.' });
    if (r.type === 'require-file' && !r.files) ctx.addIssue({ code: 'custom', path: ['files'], message: 'Say which file must exist.' });
    if (r.type === 'require-route' && !r.path?.startsWith('/')) ctx.addIssue({ code: 'custom', path: ['path'], message: 'Give a path that starts with "/", like /privacy.' });
    if (r.regex && r.text) {
      try {
        new RegExp(r.text);
      } catch {
        ctx.addIssue({ code: 'custom', path: ['text'], message: 'That is not a valid regular expression.' });
      }
    }
  });

export type CustomRule = z.infer<typeof CustomRuleSchema>;

/** Ready-made rules the Workbench offers with one click. */
export const CUSTOM_RULE_TEMPLATES: Omit<CustomRule, 'enabled'>[] = [
  { id: 'no-console-log', title: 'No console.log left in the code', type: 'forbid-text', severity: 'low', text: 'console.log(', files: '**/*.{js,jsx,ts,tsx,mjs,vue,svelte}', description: 'Debug output left in production code can leak data and clutters the browser console.' },
  { id: 'no-todo', title: 'No TODO or FIXME comments', type: 'forbid-text', severity: 'info', text: '\\b(TODO|FIXME)\\b', regex: true, description: 'Unfinished work your AI agent left behind.' },
  { id: 'no-localhost-urls', title: 'No hard-coded localhost addresses', type: 'forbid-text', severity: 'medium', text: 'localhost:', description: 'A localhost address in the code breaks as soon as the app is deployed.' },
  { id: 'no-test-stripe-keys', title: 'No Stripe test keys in the code', type: 'forbid-text', severity: 'high', text: '(sk|rk)_test_[A-Za-z0-9]{8,}', regex: true, description: 'Keys belong in environment variables, never in the code.' },
  { id: 'privacy-page', title: 'Has a privacy policy page', type: 'require-route', severity: 'medium', path: '/privacy*', description: 'Most countries and app stores require one.' },
  { id: 'terms-page', title: 'Has a terms of service page', type: 'require-route', severity: 'low', path: '/terms*' },
  { id: 'health-endpoint', title: 'Has a health check endpoint', type: 'require-route', severity: 'low', path: '/api/health*', description: 'Lets your host restart the app when it stops answering.' },
  { id: 'env-example', title: 'Has a .env.example file', type: 'require-file', severity: 'low', files: '**/.env.example', description: 'Shows the settings the app needs, without the secret values.' },
  { id: 'readme', title: 'Has a README', type: 'require-file', severity: 'info', files: 'README*' },
];

/** Glob with {a,b} alternatives, matched against a relative file path (case-insensitive). */
function fileMatcher(glob: string | undefined): (file: string) => boolean {
  if (!glob) return () => true;
  const alternatives = /\{([^}]*)\}/.exec(glob);
  const globs = alternatives ? alternatives[1]!.split(',').map((alt) => glob.replace(alternatives[0], alt)) : [glob];
  const res = globs.map((g) => new RegExp(globToRegExp(g.replace(/^\*\*\//, '')).source.replace(/^\^/, '^(?:.*/)?'), 'i'));
  return (file) => res.some((re) => re.test(file));
}

const TEXT_FILE = /\.(m?[jt]sx?|cjs|vue|svelte|astro|py|rb|php|go|java|kts?|scala|cs|fs|rs|exs?|dart|swift|erb|cshtml|razor|html?|css|scss|md|ya?ml|json|toml|env\w*|example|txt|sql|prisma|graphql)$/i;

function finding(rule: CustomRule, area: Area, where: string, summary: string, evidence?: Finding['evidence'], steps?: string[]): Finding {
  return {
    id: `custom.${rule.id}:${where}`,
    area,
    severity: rule.severity,
    title: rule.title,
    summary: rule.description ? `${summary} ${rule.description}` : summary,
    steps,
    evidence,
    source: 'custom-rule',
  };
}

export interface CustomRuleInputs {
  /** Code folders, with the name used to prefix file paths when there are several. */
  sources: { name: string; path: string }[];
  routes: Route[];
  pages: PageVisit[];
}

/** Run the enabled custom rules. Returns findings and the areas that were checked. */
export async function customFindings(rules: CustomRule[], inputs: CustomRuleInputs): Promise<{ findings: Finding[]; ran: Area[] }> {
  const active = rules.filter((r) => r.enabled !== false);
  if (!active.length) return { findings: [], ran: [] };
  const findings: Finding[] = [];
  const ran = new Set<Area>();

  const codeRules = active.filter((r) => r.type !== 'require-route');
  if (codeRules.length && inputs.sources.length) {
    ran.add('code');
    const many = inputs.sources.length > 1;
    const files: { rel: string; read: () => Promise<string> }[] = [];
    for (const src of inputs.sources) {
      const ctx = await createRepoContext(src.path);
      for (const f of ctx.files) files.push({ rel: many ? `${src.name}/${f}` : f, read: () => ctx.read(f) });
    }
    for (const rule of codeRules) {
      const match = fileMatcher(rule.files);
      if (rule.type === 'require-file') {
        if (!files.some((f) => match(f.rel))) findings.push(finding(rule, 'code', rule.files!, `No file matches "${rule.files}".`, undefined, [`Add a file matching ${rule.files} to your code.`]));
        continue;
      }
      const re = rule.regex ? new RegExp(rule.text!, 'g') : new RegExp(rule.text!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const candidates = files.filter((f) => TEXT_FILE.test(f.rel) && !isTestPath(f.rel) && match(f.rel));
      const hits: { file: string; line: number }[] = [];
      for (const f of candidates) {
        const text = await f.read();
        re.lastIndex = 0;
        const m = re.exec(text);
        if (m) hits.push({ file: f.rel, line: lineOf(text, m.index) });
        if (rule.type === 'require-text' && hits.length) break;
      }
      if (rule.type === 'forbid-text') {
        for (const h of hits.slice(0, 50)) {
          findings.push(finding(rule, 'code', h.file, `Found "${rule.text}" in ${h.file}:${h.line}.`, { file: h.file, line: h.line }, [`Open ${h.file} at line ${h.line}.`]));
        }
      } else if (!hits.length) {
        findings.push(finding(rule, 'code', rule.text!, `"${rule.text}" doesn't appear anywhere in ${rule.files ?? 'the code'}.`));
      }
    }
  }

  for (const rule of active.filter((r) => r.type === 'require-route')) {
    if (!inputs.routes.length && !inputs.pages.length) continue;
    ran.add('functional');
    const re = globToRegExp(rule.path!);
    const exists = inputs.routes.some((r) => re.test(r.path)) || inputs.pages.some((p) => re.test(p.path) && (p.status ?? 200) < 400 && !p.softNotFound);
    if (!exists) findings.push(finding(rule, 'functional', rule.path!, `Your app has no page or endpoint at ${rule.path}.`, undefined, [`Add ${rule.path} to your app.`]));
  }

  return { findings, ran: [...ran] };
}
