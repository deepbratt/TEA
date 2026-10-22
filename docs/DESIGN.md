# TEA v1 design (Test Everything Automatically)

Tagline: "Spill the TEA on your app."

> The build now follows the 14-step order in [BUILD-PROGRESS.md](../BUILD-PROGRESS.md).
> This doc keeps the original intent and the calls made in the first milestone. Where they
> differ, BUILD-PROGRESS.md wins. This repo is the open-source (MIT) engine; paid "pro" check
> rules and ranked fix prompts live in a separate private repo and never land here.

## Who it's for

A solo founder who vibe-coded a real, paid product (Lovable, Bolt, v0, Replit, Cursor,
Windsurf, Claude Code) and is about to launch. No QA or security person, has only ever
tested the happy path by hand, can't write tests. Any stack: Next.js, React/Vite, Vue/Nuxt,
Svelte/SvelteKit, Express, NestJS, FastAPI, Django, Rails; Supabase, Firebase, Postgres,
Prisma; Stripe, RevenueCat; hosted anywhere.

The moment that matters: about five minutes after `npx tea-qa run <url or repo>` they get a
TEA Score (say 41/100) and a plain-English top-5 list. Each item has a screenshot, file and
line, and a fix they can paste into their AI tool. They fix it, rerun, hit 86, and post the
before/after score card. That share is how TEA spreads.

## What TEA must catch (common vibe-coder failures)

- OAuth broken on the live domain (e.g. domain not in Firebase authorised domains).
- Committed `.env*` files with secrets; secret keys (Stripe, Supabase service role, OpenAI)
  in the browser bundle or source maps.
- Supply-chain malware: obfuscated loaders injected into npm scripts / install hooks.
- Paywall shows no plans (store products never load), so nobody can pay.
- App-store readiness: demo login, account deletion, Terms/Privacy links on the paywall.
- Supabase RLS off / Firebase rules open → IDOR by changing an ID.
- Paid features unlockable via direct API calls; unverified Stripe webhooks.
- Broken flows: password reset 500s, sign-up accepts empty email or crashes on "+",
  double submit duplicates, Upgrade button off-screen on mobile.

## Principles

1. **Zero setup.** `tea-qa run <url-or-repo>` works with no config file. TEA works out the
   stack, routes, features and flows itself. `tea.yaml` only overrides.
2. **Generic core, stack plugins on top.** The crawler works on any live URL; the scanner
   works on any repo. Stack-specific knowledge (route conventions, Supabase RLS, Firebase
   rules, Stripe webhooks, RevenueCat) lives in plugins that switch on when detected.
3. **Web first.** v1 targets web apps; mobile (Maestro) is milestone 5.
4. **Unattended.** One command locally; a GitHub Action on every PR and nightly against
   staging that comments the TEA score and fails on critical issues.
5. **Safe by default.** Read-only. Never run the target repo's install scripts. Only touch
   URLs the user gave (plus allowlist). Secrets masked everywhere. Load, active scans and
   destructive actions need explicit flags + allowlist (+ `--i-own-this-server` for prod).
6. **AI optional.** Every LLM step is optional (`--no-ai`); providers pluggable
   (OpenAI, Anthropic, Gemini, Ollama).

## Architecture

One npm package (`tea-qa`) with one folder per part under `src/`, TypeScript, Node 20+. (Originally a multi-package monorepo; merged into one codebase on 2026-10-21, with a local web UI added. On 2026-10-22 the UI became the TEA Workbench: a Next.js app in `web/` over `src/workspace`, with projects of several source folders, frontend-to-API wiring checks, rules and a quality gate in one `tea.config.yaml`; see `docs/WORKBENCH-PROMPT.md`.)

| Package | Role |
|---|---|
| `@tea-qa/core` | types (AppMap, Finding, Results), config loading, secret masking, safety/scope guard, scoring, plugin API |
| `@tea-qa/repo-map` | repo discovery: file walk, generic heuristics, built-in stack plugins |
| `@tea-qa/scanner` | read-only Playwright URL scan and passive checks |
| `@tea-qa/report` | results.json, report.md, report.html, feature map, (score card M5) |
| `tea-qa` (cli) | `tea-qa` / `tea` binaries, orchestration |
| `src/wiring` | frontend-to-API wiring: calls nothing serves, endpoints nothing calls |
| `src/workspace` + `web/` | the Workbench: config file, analyses, Next.js UI on 127.0.0.1 |
| later: `docs-reader`, `spec`, `codehealth`, `prodready`, `fix`, `mcp`, `runners/*` | see BUILD-PROGRESS.md |

Plugin API (core): `{ name, detect(ctx) => Detection | null, discover?(ctx) => Partial<AppMap>,
checks?(ctx) => Finding[] }`. Built-in plugins ship in the scanner; third-party plugins
are npm packages listed in `tea.yaml` `plugins:`.

## Pipeline (v1 over milestones)

1. Discover (M1): code + UI → `app-map.json`, `feature-map.md`, page screenshots.
2. Plan (M2): LLM or rules → editable `plan.json` of journeys + edge cases.
3. Functional UI (M2): agent runs plan via Playwright accessibility snapshots, signs up its
   own test account on the target, self-heals once, exports passing journeys to `tests/tea/`.
4. API (M3): Schemathesis / generated requests, auth bypass, IDOR, leaks.
5. Static and vibe-code smells (M3): secrets, bundles, supply-chain, RLS/rules, stubs, CVEs.
6. Security, performance, accessibility, load (M4).
7. Mobile, GitHub Action, Docker, docs, score card (M5).
8. Report: "Here's the TEA on your app: NN/100".

## Milestone 1 scope (this PR)

- Monorepo, build, unit tests, CI.
- CLI: `tea-qa run [target] [--repo] [--url] [--out tea-report] [--max-pages] [--no-ai]
  [--dry-run] [--fail-on critical|high|medium|low|none] [--config tea.yaml]`.
  Positional target: a URL → `--url`; an existing path → `--repo`.
- Config: optional `tea.yaml` (base URLs, skip routes, allowlist, accounts, limits, LLM).
- Code discovery: stack detection for all listed stacks; route discovery for Next.js
  (app + pages router), SvelteKit, Nuxt, React Router/Vue Router literals, Express/NestJS,
  FastAPI, Django, Rails, plus a generic fallback; API endpoints; forms; auth method;
  env var names (never values) with client-exposed flags; `.env*` files present; DB schema
  (Prisma models, SQL migrations); payments; OpenAPI spec files.
- UI discovery: same-origin, read-only (GET navigation only, no clicks/submits) BFS crawl
  seeded with code routes; per page: status, timing, console errors, failed requests,
  4xx/5xx, broken images, links, buttons, forms, full-page screenshot.
- Merge into `app-map.json` + `feature-map.md` (code routes not reachable from UI, UI pages
  with no code route, pages erroring).
- Crawl findings (broken links/images, console errors, 5xx, failed calls, pages > 3s) feed
  the functional and performance scores; areas not yet run show "not run".
- Report skeleton: `report.html` (self-contained), `report.md`, `results.json`.
- Code-only: if no URL, start the app locally only when deps are already installed
  (never run install); otherwise code-only discovery.
- Demo: `examples/buggy-next-app` deliberately buggy app, tested end to end in CI (`npm run demo`).

## Decided by the builder (my calls)

- Crawler in M1 never clicks or submits; self sign-up arrives with the M2 agent.
- TEA never runs `npm install`/`pip install` on the target (install scripts are an attack vector).
- Code-only auto-start runs the repo's own dev/start script only when deps are installed, prints
  the exact command first, and refuses scripts that look like they download or eval code.
- Score: each area starts at 100, minus per finding critical 25 / high 12 / medium 5 / low 2,
  floor 0; overall = weighted average of areas that ran; any critical caps overall at 49.
- Bare `*.vercel.app` / `*.lovable.app` hosts count as production (they are often the live site);
  only labelled hosts (staging., dev., preview, branch-preview URLs) count as non-production.
- `${ENV}` in tea.yaml is expanded and the value masked, so passwords stay out of the file.
- Error pages don't also produce JS/console findings; "Failed to load resource" console lines
  are reported from the network instead (one bug, one finding).
- Commander for CLI, `yaml` + `zod` for config, Vitest for tests, plain `tsc` builds.
- Repo development needs Node 22+ (Vitest 5); the published CLI supports Node 20+ and CI
  runs the end-to-end demo on both.
