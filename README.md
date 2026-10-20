# TEA: Test Everything Automatically

**Spill the TEA on your app.**

TEA is a free, open-source (MIT) QA tester for vibe-coded apps: web apps and websites (mobile and desktop are coming) built mostly by AI tools like Lovable, Bolt, v0, Replit, Cursor, Windsurf or Claude Code. Point it at your live URL, your repo, or both. It works out your stack, pages and flows by itself, tests them in a real browser, and gives you one plain-English report: a TEA Score out of 100 and a list of what to fix first, each with a screenshot, the likely file, and a fix prompt you can paste straight into your AI coding tool. After you fix things, TEA retests.

No config. No test writing. No QA team.

> **Status: early build (step 1 of 14, see [BUILD-PROGRESS.md](BUILD-PROGRESS.md)).** Today TEA reads your code, opens every page of your app in a real browser, and reports crashes, broken links, failing API calls, JavaScript errors, broken images and slow pages. The agent-docs reader, code health, production-readiness checks, fix modes, retest, the AI functional tester, the MCP server, the GitHub Action and mobile/desktop runners come next.

<!-- Demo GIF placeholder: a 20-second recording of `npx tea-qa run` and the report opening. -->
<!-- ![TEA demo](docs/assets/demo.gif) -->

## Quick start (2 minutes)

You need Node.js 20 or newer.

> TEA is not on npm yet. Until the first release, run it from source: clone this repo, then `pnpm install && pnpm build`, and use `pnpm tea` wherever this README says `npx tea-qa`.

```bash
npx tea-qa run https://your-app.com
```

That's it. Open `tea-report/report.html` when it finishes.

Have the code too? Give TEA both, and every issue points to the file that most likely causes it:

```bash
npx tea-qa run https://your-app.com --repo ./your-app
```

Only have the code? TEA can start your app with its own dev script, but that runs code from your repo, so it asks first (or pass `--start` to skip the question, for example in CI). It never installs dependencies for you:

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

That's a real run against [`examples/buggy-nextjs`](examples/buggy-nextjs). Issue 1 is the classic vibe-coded launch bug: the pricing page loads fine but shows no plans, so nobody can pay.

The `tea-report/` folder holds:

| File | What it is |
|---|---|
| `report.html` | The report: TEA Score, scores per area, top fixes with screenshots and copy-paste fix prompts, feature map |
| `report.md` | The same report as Markdown, for PRs and issues |
| `results.json` | Machine-readable results (score, areas, findings) |
| `app-map.json` | Everything TEA learned about your app: stack, routes, API endpoints, forms, auth, payments, env var names |
| `feature-map.md` | Human-readable map of your pages and endpoints, what's live, what's broken, and what nothing links to |
| `screenshots/` | A full-page screenshot of every page TEA visited |

<!-- Score card placeholder: a shareable before/after score card image arrives with the report step. -->

### The TEA Score

Each area starts at 100 and loses points per issue: critical 25, high 12, medium 5, low 2. The overall score is a weighted average of the areas that ran. Any critical issue caps the overall score at 49, because a launch-blocker shouldn't hide behind good numbers elsewhere. Areas that didn't run show "not run yet" and don't count.

| Score | Verdict |
|---|---|
| 90–100 | Piping hot |
| 75–89 | A good brew |
| 50–74 | Lukewarm |
| 0–49 | Spilled |

### features.md (coming in step 4)

TEA reads the docs your AI agents wrote (CLAUDE.md, AGENTS.md, .cursorrules, README, TODO and so on) before your code, and turns every claimed feature into a check you can review once:

```markdown
## CSV export
- Given a signed-in user with orders
- When they click "Export CSV" on /orders
- Then a CSV with one row per order downloads
- Source: CLAUDE.md:42 · Status: claimed but missing
```

## Works with any stack

TEA has a generic core that works on any live URL and any repo. Stack-specific knowledge is in plugins that switch on automatically when TEA detects that stack.

- **Frameworks:** Next.js (app and pages router), React + Vite (React Router), Vue, Nuxt, Svelte, SvelteKit, Astro, Remix / React Router 7, Angular
- **Backends:** Express, NestJS, Fastify, Hono, FastAPI, Flask, Django, Rails
- **Data and auth:** Supabase, Firebase, Prisma, Drizzle, MongoDB, Postgres, Convex, NextAuth, Clerk, Auth0, Better Auth
- **Payments:** Stripe, RevenueCat, Lemon Squeezy, Paddle
- **Mobile:** Expo, React Native, Capacitor, Flutter (detected now, tested later)
- **Built with:** Lovable, Bolt, v0, Replit, Cursor, Windsurf, Claude Code

Unknown stack? TEA still crawls the live site and falls back to the links it finds in your source.

## Checks are data

Every check TEA runs is an entry in a catalog (`packages/core/checks/<category>/<id>.yaml`), validated by a JSON Schema, with a fix-prompt template next to it. The community can add checks without touching the engine.

All free checks are in this repo with their rules and prompts. TEA Pro adds deeper checks (multi-role IDOR probes, race conditions, Supabase RLS correctness, Stripe edge cases, database-at-scale proofs, AI cost and abuse). In this repo those exist only as stubs with an id and a title, so a free report can tell you what a deeper check would cover. Pro packs load at runtime with `TEA_LICENSE_KEY` and `TEA_PRO_PACK`.

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
  --start                   code-only: start the app with its dev script without asking
  --no-start                code-only: never start the app
  --trust-repo-plugins      load plugins listed in the repo's own tea.yaml (they run as code)
  --no-ai                   rules only, no LLM calls
  --no-screenshots          do not save page screenshots
  --dry-run                 show what TEA would do, and the estimated cost, without doing it
  -v, --verbose / -q, --quiet
```

`tea` works as a short alias for `tea-qa`.

## tea.yaml (optional)

TEA needs no config. Add a `tea.yaml` to your repo root only to change the defaults. See [`tea.example.yaml`](tea.example.yaml).

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
    password: ${TEA_USER_PASSWORD}   # read from the environment, masked everywhere
crawl:
  maxPages: 100
  slowPageMs: 3000
failOn: high
```

`${NAME}` works only in `accounts` email and password fields, and only for variables that start with `TEA_`, so a `tea.yaml` can't copy your other secrets into a URL.

## Responsible use

Only test apps you own or are authorised to test. TEA shows this notice the first time it runs.

- **Read-only against live URLs.** TEA only opens pages. It never submits forms, logs in, or sends POST/PUT/DELETE requests to a live site. Forms, logins and writes will only ever run in a sandbox you set up (step 10).
- **Only what you listed.** TEA visits only the hosts you gave it (plus your `allowlist`) and never visits routes in your `skip` list. Links to other sites are listed, never opened, and a page that redirects off your hosts is discarded.
- **No load tests or active scans against production.** They will run only in sandbox or staging mode with your explicit opt-in.
- **Your repo is untrusted input.** TEA never runs `npm install` (install scripts are how supply-chain malware gets in), asks before starting your app, refuses dev scripts that look like they download or evaluate code, and ignores plugins listed in a repo's own `tea.yaml` unless you pass `--trust-repo-plugins`. Docs and page text never change what TEA does.
- **Secrets are masked everywhere.** API keys, tokens, passwords, JWTs and credentials in URLs are masked in the terminal, the report and every JSON file. TEA records the *names* of your env vars, never their values.
- **Cost guard.** `--dry-run` shows the plan and estimated cost before anything runs. This version makes no LLM calls, so it costs $0.

**Badge disclaimer:** The TEA checked badge is not a security guarantee, audit or certification. It only shows the score from TEA's automated tests at the date of the last run.

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

List it under `plugins:` in a `tea.yaml` you pass with `--config` (an npm package name, or a path relative to that file). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md). Report vulnerabilities privately through GitHub's **Report a vulnerability**.

## License

[MIT](LICENSE). Free forever.
