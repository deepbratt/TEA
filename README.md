# TEA: Test Everything Automatically

**Spill the TEA on your app.**

TEA is a free, open-source (MIT) AI QA agent for apps built with Lovable, Bolt, v0, Replit, Cursor, Windsurf or Claude Code. Point it at your live URL, your repo, or both. It works out your stack, pages and flows by itself, tests them in a real browser, and gives you one clear health report: a TEA Score out of 100 and a plain-English list of what to fix first, with a screenshot, the likely file, and a fix you can paste straight into your AI tool.

No config. No test writing. No QA team.

> **Status: milestone 1 of 5.** Today TEA reads your code, opens every page of your app in a real browser, and reports crashes, broken links, failing API calls, JavaScript errors, broken images and slow pages. Sign-up/login/checkout journeys, API and auth tests, secret and malware scanning, security, accessibility, load and mobile testing are on the [roadmap](#roadmap).

<!-- Demo GIF placeholder: a 20-second recording of `npx tea-qa run` and the report opening. -->
<!-- ![TEA demo](docs/assets/demo.gif) -->

## Quick start (2 minutes)

You need Node.js 20 or newer.

> TEA is not on npm yet. Until the first release, run it from source: clone this repo, then `pnpm install && pnpm build` and use `pnpm tea` wherever this README says `npx tea-qa`.

```bash
npx tea-qa run https://your-app.com
```

That's it. Open `tea-report/report.html` when it finishes.

Have the code too? Give TEA both, and every issue points to the file that most likely causes it:

```bash
npx tea-qa run https://your-app.com --repo ./your-app
```

Code only? TEA starts your app locally if its dependencies are already installed, then tests it:

```bash
npx tea-qa run ./your-app
```

Want to see what TEA will do first? Nothing is opened or changed in a dry run:

```bash
npx tea-qa run https://your-app.com --repo ./your-app --dry-run
```

The first run downloads a headless Chromium. If it doesn't, run `npx playwright install chromium`.

## What you get

```text
Here's the TEA on your app: 68/100 (Lukewarm). TEA opened 10 pages in your running app and read
your code (Next.js, React). It found 8 issues: 2 high, 4 medium, 2 low. Fix this first: API call
fails on /pricing: GET /api/plans (500).

Top issues:
  1. [high] API call fails on /pricing: GET /api/plans (500)  (app/api/plans/route.ts)
  2. [high] Page crashes with a server error (500): /account  (app/account/page.tsx)
  3. [medium] JavaScript crashes on /about  (app/about/page.tsx)
  4. [medium] Broken link to /blog
  5. [medium] Broken link to /terms
```

That's a real run against [`examples/buggy-nextjs`](examples/buggy-nextjs). Issue 1 is the classic vibe-coded launch bug: the paywall loads fine but shows no plans, so nobody can pay.

The `tea-report/` folder holds:

| File | What it is |
|---|---|
| `report.html` | The report: TEA Score, scores per area, top fixes with screenshots and copy-paste fix prompts, feature map |
| `report.md` | The same report as Markdown, for PRs and issues |
| `results.json` | Machine-readable results (score, areas, findings) |
| `app-map.json` | Everything TEA learned about your app: stack, routes, API endpoints, forms, auth, payments, env var names |
| `feature-map.md` | Human-readable map of your pages and endpoints, what's live, what's broken, and what nothing links to |
| `screenshots/` | A full-page screenshot of every page TEA visited |

<!-- Score card placeholder: the shareable before/after image arrives in milestone 5. -->

### The TEA Score

Each area starts at 100 and loses points per issue: critical 25, high 12, medium 5, low 2. The overall score is a weighted average of the areas that ran. Any critical issue caps the overall score at 49, because a launch-blocker shouldn't hide behind good numbers elsewhere. Areas that didn't run show "not run yet" and don't count.

| Score | Verdict |
|---|---|
| 90–100 | Piping hot |
| 75–89 | A good brew |
| 50–74 | Lukewarm |
| 0–49 | Spilled |

## Works with any stack

TEA has a generic core that works on any live URL and any repo. Stack-specific knowledge is in plugins that switch on automatically when TEA detects that stack.

- **Frameworks:** Next.js (app and pages router), React + Vite (React Router), Vue, Nuxt, Svelte, SvelteKit, Astro, Remix / React Router 7, Angular
- **Backends:** Express, NestJS, Fastify, Hono, FastAPI, Flask, Django, Rails
- **Data and auth:** Supabase, Firebase, Prisma, Drizzle, MongoDB, Postgres, Convex, NextAuth, Clerk, Auth0, Better Auth
- **Payments:** Stripe, RevenueCat, Lemon Squeezy, Paddle
- **Mobile:** Expo, React Native, Capacitor, Flutter (detected now, tested in milestone 5)
- **Built with:** Lovable, Bolt, v0, Replit, Cursor, Windsurf, Claude Code

Unknown stack? TEA still crawls the live site and falls back to the links it finds in your source.

## Options

```text
npx tea-qa run [url-or-folder] [options]

  --url <url>               URL of the running app to test
  --repo <path>             folder with the app source code
  -o, --out <dir>           where to write the report (default: tea-report)
  -c, --config <file>       tea.yaml to use (default: <repo>/tea.yaml or ./tea.yaml)
  --max-pages <n>           most pages to visit (default: 50)
  --fail-on <severity>      exit 1 when an issue is at least this severe: critical (default), high, medium, low, none
  --skip <glob>             route to never visit, e.g. "/admin/**" (repeatable)
  --allow <host>            extra host TEA may visit (repeatable)
  --login <email:password>  test account to use (masked everywhere)
  --no-ai                   rules only, no LLM calls
  --no-screenshots          do not save page screenshots
  --no-start                never start the app locally in code-only mode
  --dry-run                 show what TEA would do, and the estimated cost, without doing it
  -v, --verbose / -q, --quiet
```

`tea` works as a short alias for `tea-qa`.

## tea.yaml (optional)

TEA needs no config. Add a `tea.yaml` to your repo root only to change the defaults. `${NAME}` is replaced with the environment variable, so secrets stay out of the file. See [`tea.example.yaml`](tea.example.yaml).

```yaml
urls:
  - https://staging.your-app.com
skip:
  - /admin/**
  - /logout
allowlist:
  - api.your-app.com
accounts:
  - role: user
    email: tea-user@your-app.com
    password: ${TEA_USER_PASSWORD}
crawl:
  maxPages: 100
  slowPageMs: 3000
failOn: high
```

## Safe by default

- **Read-only.** In this version TEA only opens pages (GET requests). It never clicks buttons, submits forms or fills inputs, so it can't change your data.
- **Only what you listed.** TEA only visits the hosts you gave it (plus your `allowlist`) and never visits routes in your `skip` list. Links to other sites are listed, never opened.
- **Never runs your installs.** In code-only mode TEA starts your app only if its dependencies are already installed. It never runs `npm install`, because install scripts are how supply-chain malware gets in, and it refuses to run a dev script that looks like it downloads or evaluates code.
- **Secrets are masked everywhere.** API keys, tokens, passwords, JWTs and credentials in URLs are masked in the terminal, the report and every JSON file. TEA records the *names* of your env vars, never their values.
- **Heavier tests need explicit flags.** Load tests, active security scans and destructive actions (milestone 4) will need `--allow-load`, `--aggressive` or `--allow-destructive`, plus the domain in your allowlist, plus `--i-own-this-server` for production URLs.
- **Cost guard.** `--dry-run` shows the plan and estimated cost before anything runs. This version makes no LLM calls, so it costs $0.

## Roadmap

1. **Discover + report** ✅ code and UI discovery, app map, feature map, crawl checks, TEA Score, HTML/MD/JSON report
2. **UI agent:** an AI agent that signs up its own test account and runs sign-up, login, password reset, CRUD, checkout and edge cases (empty, invalid, unicode, "+" in emails, double submit, back button, mobile viewport); every passing journey exported as a plain Playwright spec in `tests/tea/`
3. **API + code scan:** auth bypass and IDOR, unprotected paid features, unverified webhooks; leaked secrets, keys in client bundles and source maps, committed `.env` files, supply-chain malware in install scripts, open Supabase RLS / Firebase rules, CVEs
4. **Security, performance, accessibility, load:** OWASP ZAP baseline, headers/cookies/TLS, Lighthouse, axe-core, capped k6 load tests
5. **Mobile, CI, Docker, score card:** Maestro flows for Expo/React Native, app-store readiness (account deletion, Terms/Privacy on the paywall, demo login), a GitHub Action that comments the TEA Score on every PR and runs nightly against staging, a Docker image, and a shareable before/after score card

Every LLM step will be optional and pluggable (OpenAI, Anthropic, Gemini, or local Ollama for zero cost).

## Writing a plugin

A plugin adds knowledge about one stack. It switches on when its stack is detected:

```ts
import { definePlugin } from '@tea-qa/core';

export default definePlugin({
  name: 'my-framework',
  activatesOn: ['my-framework'], // or a detect(ctx) function
  async discover(ctx) {
    const routes = ctx.find((f) => f.startsWith('routes/')).map((file) => ({
      path: '/' + file.slice('routes/'.length).replace(/\.ts$/, ''),
      kind: 'page' as const, file, dynamic: false, source: 'code' as const,
    }));
    return { routes };
  },
});
```

List it in `tea.yaml` under `plugins:` (an npm package name, or a path relative to your repo). See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Free forever.
