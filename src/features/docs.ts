import { cleanEvidence } from '../core/index.js';
import type { ClaimStatus } from './types.js';

/**
 * Read the docs an AI coding agent works from (CLAUDE.md, AGENTS.md, .cursorrules, README, TODO,
 * PRDs) and pull out the lines that say a feature is built or coming. Only list items count, and
 * only under headings that are about features, or with a checkbox: rules, setup and stack notes
 * are not features.
 */

export interface RawClaim {
  text: string;
  file: string;
  line: number;
  status: ClaimStatus;
}

/** Headings over lists of planned work. Checked first: "Planned features" is planned. */
const PLAN_HEAD = /\b(todo|to-?do|roadmap|planned|plans?|next( steps)?|backlog|coming|future|ideas?|not (yet )?(built|done|started)|later|upcoming|milestones?|wish ?list|in progress|wip)\b/i;
/** Headings over lists of things that are built. */
const DONE_HEAD = /\b(what'?s (built|done|working|in it)|built|done|features?|what it does|capabilit(y|ies)|shipped|completed?|implemented|functionality|highlights)\b/i;
/** Headings that are never about features. */
const SKIP_HEAD =
  /\b(rules?|conventions?|guidelines?|style|stack|tech|setup|install(ation)?|getting started|quick ?start|usage|how to|contribut\w*|licen[cs]e|test(s|ing)?|deploy\w*|env(ironment)?|commands?|scripts?|structure|architecture|notes?|faq|support|security|credits?|authors?|acknowledg\w*|requirements?|prerequisites|changelog|links?|documentation|docs|tips|troubleshoot\w*|config\w*)\b/i;
/** Item text that says it isn't built yet. */
const PLANNED_ITEM = /\((not started|pending[^)]*|planned|todo|wip|in progress|coming soon|later|tbd|soon|next)\)|\b(not (yet )?(started|built|done|implemented)|coming soon|todo:|wip\b|tbd\b)/i;

const LIST_ITEM = /^(\s{0,6})(?:[-*+]|\d{1,3}[.)])\s+(?:\[( |x|X)\]\s+)?(.+)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;

type Section = 'done' | 'planned' | 'skip' | 'other';

function sectionOf(raw: string): Section {
  // "Next.js setup" is not about next steps.
  const heading = raw.replace(/\b[\w-]+\.js\b/gi, '');
  if (PLAN_HEAD.test(heading)) return 'planned';
  if (SKIP_HEAD.test(heading) && !DONE_HEAD.test(heading.replace(SKIP_HEAD, ''))) return 'skip';
  if (DONE_HEAD.test(heading)) return 'done';
  return 'other';
}

/** Markdown down to plain words: no emphasis, code ticks or link targets. */
function plain(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

const MAX_PER_FILE = 200;

export function parseClaims(file: string, text: string): RawClaim[] {
  const name = file.split('/').pop()!.toLowerCase();
  // A TODO or roadmap file is planned work all the way down, unless a box is ticked.
  const planFile = /^(todo|roadmap|plan|backlog)/.test(name);
  // Cursor and Windsurf rule files are instructions, not feature lists: only checkboxes count.
  const rulesFile = /^\.(cursor|windsurf|cline)rules$|\.mdc$|copilot-instructions/.test(name);
  let section: Section = planFile ? 'planned' : 'other';
  let inFence = false;
  const out: RawClaim[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && out.length < MAX_PER_FILE; i++) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = HEADING.exec(line);
    if (h) {
      section = sectionOf(plain(h[2]!));
      if (planFile && section === 'other') section = 'planned';
      continue;
    }
    const m = LIST_ITEM.exec(line);
    if (!m) continue;
    const box = m[2];
    const body = plain(m[3]!);
    if (body.length < 3 || /^~~/.test(m[3]!) || /^(npm|npx|pnpm|yarn|bun|pip|\$|cd |git )/.test(body)) continue;
    let status: ClaimStatus | undefined;
    if (box !== undefined) status = box === ' ' ? 'planned' : 'done';
    else if (rulesFile || section === 'skip' || section === 'other') continue;
    else status = section;
    if (section === 'skip' && box === undefined) continue;
    if (status === 'done' && PLANNED_ITEM.test(body)) status = 'planned';
    out.push({ text: cleanEvidence(body, 200), file, line: i + 1, status });
  }
  return out;
}
