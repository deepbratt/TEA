# How TEA works

What TEA checks and how: the report and the TEA Score, the pipeline, the check catalog, every supported stack, safety, the roadmap and plugins. To use TEA, see the [guide](GUIDE.md).

## ☕ What you get

<table>
<tr>
<td width="55%" valign="top">

```text
Here's the TEA on your app: 68/100 (Lukewarm).
TEA opened 10 pages in your running app and read
your code (Next.js, React). It found 8 issues:
2 high, 4 medium, 2 low.

Top issues:
 1. [high] API call fails on /pricing:
    GET /api/plans (500)  app/api/plans/route.ts
 2. [high] Page crashes with a server error
    (500): /account  app/account/page.tsx
 3. [medium] JavaScript crashes on /about
 4. [medium] Broken link to /blog
 5. [medium] Broken link to /terms
```

A real run against [`examples/buggy-next-app`](../examples/buggy-next-app), a made-up tea shop full of seeded bugs (`npm run demo` reproduces it). Issue 1 is the classic launch bug: the pricing page loads, but shows no plans, so nobody can pay.

</td>
<td width="45%" valign="top">
<img src="assets/tea-score-card.svg" alt="Sample TEA score card: 81 out of 100 with sub-scores" width="100%">
<sub>A sample score card (shareable PNG export is planned).</sub>
</td>
</tr>
</table>

Every finding comes with a severity, evidence (a screenshot or URL), the likely `file:line`, steps to reproduce, and a **fix prompt** you can paste into Cursor, Claude or Lovable. Anything TEA observed on your site is quoted inside an `UNTRUSTED EVIDENCE` block, so your agent never follows instructions hidden in page text.

| In `tea-report/` | What it is |
|---|---|
| `report.html` | The report: TEA Score, area scores, top fixes with screenshots and copy-paste fix prompts, feature map |
| `report.md` | The same report in Markdown, for PRs and issues |
| `results.json` | Machine-readable results |
| `app-map.json` · `feature-map.md` | Your stack, pages, API endpoints, forms, auth, payments and env var *names*, plus what's live, what's broken and what nothing links to |
| `screenshots/` | A full-page screenshot of every page TEA visited |

### The TEA Score

```mermaid
flowchart LR
    F[Findings] --> A["Area scores<br/>each starts at 100<br/>critical −25 · high −12<br/>medium −5 · low −2"]
    A --> W[Weighted average of<br/>areas that ran]
    W --> C{Any critical?}
    C -->|yes| CAP[Capped at 49]
    C -->|no| S[TEA Score]
    CAP --> S
```

| Score | Verdict |
|---|---|
| 90–100 | ☕ Piping hot |
| 75–89 | 🍵 A good brew |
| 50–74 | 🫖 Lukewarm |
| 0–49 | 💦 Spilled |

Areas that didn't run show "not run yet" and don't count. The full set of sub-scores (features, security, performance, accessibility, code health, Prod Ready, UI wiring, DB scale) arrives with the steps that measure them.

## 🔍 How it works

```mermaid
flowchart LR
    A[Connect repo<br/>and/or URL] --> B[Read agent docs<br/>to features.md]
    B --> C[Scan URL<br/>read-only]
    B --> D[Code health<br/>static]
    B --> E[Production-<br/>readiness checks]
    C --> F[Report and scores<br/>TEA Score, Code health,<br/>Prod Ready, coverage]
    D --> F
    E --> F
    F --> G{Fix mode?}
    G -->|report| H[Fix prompts only]
    G -->|suggest| I[Patch files]
    G -->|autofix| J[Agent opens<br/>draft PR]
    H --> K[User or agent fixes]
    I --> K
    J --> L[tea-qa retest]
    K --> L
    L -->|still failing or new| F
    L -->|all fixed| M[User reviews<br/>and merges]
```

<details>
<summary><b>Code map</b> (one package, one folder per part under <code>src/</code>)</summary>

```mermaid
flowchart TB
    UI[web + workspace<br/>TEA Workbench, Next.js] --> CLI
    CLI[cli<br/>tea-qa commands] --> CORE[core<br/>config, safety, scoring,<br/>check catalog, results schema]
    MCP[mcp<br/>MCP server · planned] --> CORE
    CORE --> MAP[repo-map<br/>stack, routes, endpoints]
    CORE --> SCAN[scanner<br/>URL crawl, passive checks]
    CORE --> DOCS[docs-reader<br/>agent docs · planned]
    DOCS --> SPEC[spec<br/>features.md · planned]
    CORE --> CH[codehealth · planned]
    CORE --> PR[prodready · planned]
    CORE --> RUN[runners · planned]
    RUN --> RW[web<br/>Playwright]
    RUN --> RM[mobile<br/>Maestro / Appium]
    RUN --> RD[desktop<br/>Electron / Tauri]
    SPEC --> RUN
    MAP --> REP[report<br/>HTML, md, JSON, scores]
    SCAN --> REP
    CH --> REP
    PR --> REP
    RUN --> REP
    REP --> FIX[fix<br/>prompts, patches,<br/>agent hand-off · planned]
```

</details>

<details>
<summary><b>What happens during a run</b></summary>

```mermaid
sequenceDiagram
    autonumber
    actor You
    participant TEA as tea-qa
    participant Repo as Your repo
    participant App as Your app (browser)
    You->>TEA: npx tea-qa run URL --repo ./app
    TEA->>Repo: Read files (never installs or runs anything)
    Repo-->>TEA: Stack, routes, API endpoints, forms, env var names
    TEA->>TEA: Check the URL is reachable and in scope
    loop Every page, up to 50
        TEA->>App: GET page (writes and skipped routes blocked)
        App-->>TEA: Status, timing, console, network, screenshot
    end
    TEA->>TEA: Findings → catalog checks → scores
    TEA-->>You: tea-report/ + plain-English summary + exit code
```

</details>

## 🌍 Works with any stack

A generic core works on any live URL and any repo, in any language. TEA reads each ecosystem's manifest (`package.json`, `requirements.txt`, `pyproject.toml`, `Pipfile`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, `*.csproj`, `composer.json`, `Gemfile`, `mix.exs`, `pubspec.yaml`, `Package.swift`). Stack knowledge lives in plugins that switch on automatically when TEA detects the stack.

| | Detected today | Routes and endpoints read from code |
|---|---|---|
| **JavaScript / TypeScript** | Next.js, Remix / React Router 7, Nuxt, SvelteKit, Astro, Angular, React, Vue, Svelte, Solid, Qwik, Preact, Gatsby, Ember, htmx, Vite | Express, NestJS, Fastify, Hono, Koa, Elysia, plus every meta-framework |
| **Python** | FastAPI, Flask, Django, Starlette, Sanic, Litestar, Quart | ✓ |
| **Go** | net/http, Gin, Echo, Fiber, chi, Gorilla mux | ✓ (route groups too) |
| **Rust** | Axum, Actix Web, Rocket | ✓ |
| **Java / Kotlin** | Spring Boot, JAX-RS / Quarkus, Micronaut, Ktor | ✓ |
| **C# / .NET** | ASP.NET Core (minimal APIs and controllers), Blazor | ✓ |
| **PHP** | Laravel, Symfony, Slim | ✓ |
| **Ruby, Elixir, Swift** | Rails, Sinatra, Phoenix, Vapor | ✓ |
| **Mobile and desktop** | Expo, React Native, Flutter, iOS (Swift), Android, Capacitor, Ionic, Electron, Tauri | API calls (runners planned) |
| **Data and auth** | Supabase, Firebase, Prisma, Drizzle, SQLAlchemy, GORM, Diesel / SeaORM / SQLx, Entity Framework, JPA, Ecto, MongoDB, Postgres, MySQL, SQLite, Redis, Convex, NextAuth, Clerk, Auth0, Better Auth, Devise | |
| **Payments** | Stripe, RevenueCat, Lemon Squeezy, Paddle | |
| **Built with** | Lovable, Bolt, v0, Replit, Cursor, Windsurf, Claude Code | |

**API calls in any client language** feed the frontend-to-API wiring checks: `fetch`/`axios`/`useSWR`/Angular `HttpClient` (JS/TS), `requests`/`httpx` (Python), `net/http` (Go), `reqwest` (Rust), Retrofit/OkHttp/Ktor client/RestTemplate (JVM), `HttpClient` (C#), Laravel `Http`/Guzzle (PHP), Faraday/HTTParty (Ruby), `http`/Dio (Dart), `URLSession` (Swift). Calls to other hosts (Stripe, OpenAI…) are left out.

**Auto-detect.** Point TEA at a folder and it works out the rest:
- **One app or many.** A monorepo (npm/pnpm workspaces, Turborepo, Nx, `go.work`, or just `frontend/` + `backend/` folders) is split into its apps.
- **Frontend, backend or fullstack.** Each folder's role is decided from what's in it (`role: auto`, the default), so a React app and a Go API are wired together without any setup.
- **Where it runs.** TEA suggests the local URL from the app's own config or its framework's dev port, and checks which one is running right now.

Unknown stack? TEA still crawls the live site, and falls back to the links it finds in your source.

## 🧩 Checks are data

Every check is a catalog entry, not hard-coded logic, so checks can be added, ranked and updated without a TEA upgrade.

```yaml
# checks/functional/crawl.server-error.yaml
id: crawl.server-error
title: Page crashes with a server error (5xx)
description: "A page shows a server error (500) instead of its content."   # plain English, shown on the Rules page
category: functional
severity: high
detect: crawl
rule: scanner:crawl.server-error
fix_prompt: prompts/crawl/server-error.md   # template with {file}, {route}, {evidence}
suggest_only: false
version: 1
```

```mermaid
flowchart LR
    subgraph OSS["Everything is open source · MIT"]
      E[TEA engine] --- FC[Built-in checks<br/>rules + fix prompts]
      E --- PL[Planned checks<br/>listed as coming soon]
      E --- CR[Your own rules<br/>tea.config.yaml]
      E --- CP[Community check packs<br/>TEA_CHECKS folders]
    end
    E --> R[Your report]
```

**Nothing is locked.** Every check ships in this repo, free and open source, and anyone can contribute new ones ([how](../CONTRIBUTING.md#adding-a-check)). Checks whose detector isn't built yet are listed on the Rules page as *Coming soon*: multi-role IDOR probes, race conditions, Supabase RLS correctness, Stripe edge cases, database-at-scale proofs, and AI cost and abuse. They need the sandbox tester from [step 10](#%EF%B8%8F-roadmap). Point `TEA_CHECKS` at extra folders (separated like `PATH`) to load community check packs in the same format.

## 📜 features.md: claimed vs reality

*Planned (step 4).* TEA reads the docs your AI agents wrote **before** the code: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.cursor/rules/*`, `.windsurfrules`, `replit.md`, `.lovable/`, `.bolt/`, README, PRD/SPEC/TODO/CHANGELOG and `docs/`. It turns every claimed feature into a Given/When/Then check linked to its source line, and labels it *found in code*, *claimed but missing* or *built but undocumented*. You review it once (about 2 minutes); after that it is the source of truth.

```markdown
## CSV export
- Given a signed-in user with orders
- When they click "Export CSV" on /orders
- Then a CSV with one row per order downloads
- Source: CLAUDE.md:42 · Status: claimed but missing
```

Docs are untrusted data: TEA never follows instructions in them, and secrets found in docs are reported as leaked (and masked).

## 🛠️ Fix modes

*Planned (steps 8, 11, 12).* Set per repo in `tea.yaml`.

```mermaid
flowchart TD
    F[Finding] --> M{Fix mode in tea.yaml}
    M -->|report or not set| R[Fix prompt only<br/>no code change]
    M -->|suggest| S[Fix prompt plus<br/>patches/*.diff]
    M -->|autofix| A{Agent connected<br/>AND autofix: true?}
    A -->|No| R
    A -->|Yes| X{Touches auth, payments,<br/>secrets or DB migrations?}
    X -->|Yes| S
    X -->|No| B[Agent fixes on a new branch<br/>draft PR, named files only]
    B --> T[tea-qa retest]
    T --> O{Passes and no<br/>other files changed?}
    O -->|Yes| OK[Mark fixed]
    O -->|No| FAIL[Mark failed]
    OK --> U[You review and merge]
    R --> U2[You or your agent fix,<br/>then retest]
    S --> U2
```

| Mode | What TEA does |
|---|---|
| `report` (default) | Report, scores and copy-paste fix prompts. Changes no code. |
| `suggest` | Everything in `report`, plus patch files in `tea-report/patches/*.diff` for you to apply. |
| `autofix` | Hands each finding to a connected agent (Claude, Cursor, GitLab Duo or any MCP client), which opens a **draft PR** touching only the files the finding names. TEA retests and marks it fixed or failed. |

TEA never merges and never pushes to main. Findings that touch auth, payments, secrets or database migrations always stay suggest-only.

## 🛡️ Responsible use

**Only test apps you own or are authorised to test.** TEA shows this notice the first time it runs.

```mermaid
flowchart LR
    R[Every request<br/>the browser makes] --> H{Host you listed?}
    H -->|no, page navigation| X1[Blocked]
    H -->|no, image or script| OK1[Loads like for<br/>any visitor]
    H -->|yes| M{GET or HEAD?}
    M -->|no: POST, PUT, DELETE| X2[Blocked]
    M -->|yes| S{On the skip list?}
    S -->|yes| X3[Blocked]
    S -->|no| D{Redirect?}
    D -->|to a skipped route<br/>or, for pages, another host| X4[Blocked]
    D -->|no / safe| OK2[Allowed]
```

- **Read-only against live URLs.** TEA opens pages and never submits forms, logs in or sends write requests, even from your page's own scripts. Forms, logins and writes will only run in a sandbox you set up (step 10).
- **No load tests, active scans or fuzzing against production.**
- **Your repo is untrusted input.** TEA never runs `npm install` (install scripts are how supply-chain malware gets in), asks before starting your app, refuses dev scripts that look like they download or evaluate code, and ignores plugins and targets from a `tea.yaml` it wasn't given.
- **Docs and page content never change what TEA does.**
- **Secrets are masked everywhere:** the terminal, the report and every JSON file. TEA records env var *names*, never values.
- **Cost guard.** `--dry-run` shows the plan and estimated cost first. This version makes no LLM calls, so it costs $0.

> [!WARNING]
> **Badge disclaimer:** The TEA checked badge is not a security guarantee, audit or certification. It only shows the score from TEA's automated tests at the date of the last run.

## 🗺️ Roadmap

```mermaid
flowchart LR
    S1[1 Skeleton<br/>and hygiene]:::doing --> S2[2 Buggy<br/>example app]:::part --> S3[3 URL scan]:::part --> S4[4 Docs reader<br/>features.md] --> S5[5 Code health]
    S5 --> S6[6 Prod<br/>readiness] --> S7[7 Report<br/>and score]:::part --> S8[8 Fix prompts] --> S9[9 Retest] --> S10[10 AI functional<br/>tester]
    S10 --> S11[11 MCP server] --> S12[12 GitHub Action<br/>GitLab CI] --> S13[13 Mobile and<br/>desktop runners] --> S14[14 AI design<br/>review]
    classDef doing fill:#f05d61,stroke:#b3262c,color:#141517
    classDef part fill:#c9ccd1,stroke:#5c5f66,color:#141517
```

<sub>Red: in progress · grey: partly built · outlined: planned. Live status: [BUILD-PROGRESS.md](../BUILD-PROGRESS.md).</sub>

| Step | What it adds |
|---|---|
| 3 · URL scan | Security headers, cookies, HTTPS/TLS, secrets in JS bundles and source maps, exposed endpoints, Supabase/Firebase client config, Lighthouse and axe |
| 4 · Docs reader | `features.md`: claimed vs reality from your agent docs |
| 5 · Code health | Duplication, circular imports, dead code, complexity, committed `.env`, leftover `console.log`, mock data in production → `CODE-HEALTH.md` |
| 6 · Prod readiness | Auth on every route, rate limits, input validation, CORS, CSP/HSTS, error handling, health checks, migrations, indexes, Stripe webhook signatures, privacy/terms, account deletion → **Prod Ready** score |
| 8–9 · Fix + retest | `FIXES.md`, one `FIX-PROMPT.md` per finding, patch files, and before/after scores |
| 10 · AI tester | Generated Playwright tests per feature in a sandbox: happy path, edge cases, IDOR between two test accounts, persistence; saved to `tea-tests/` |
| 11–12 · MCP + CI | `tea-qa mcp` for Claude Code, Cursor, Windsurf, Copilot and Codex; a GitHub Action that comments "☕ TEA Report" on PRs and runs nightly |
| 13–14 | Mobile (Expo/React Native) and desktop (Electron/Tauri) runners with app-store readiness; AI design review |

Every LLM step will be optional and pluggable (OpenAI, Anthropic, Gemini, or local Ollama for $0).

## 🔌 Writing a plugin

A plugin adds knowledge about one stack, and switches on when that stack is detected:

```ts
import { definePlugin } from 'tea-qa';

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

List it under `plugins:` in a `tea.yaml` you pass with `--config`.

---

TEA is created and maintained by [DeepBratt](https://github.com/deepbratt). [Using TEA](GUIDE.md) · [Website](https://deepbratt.github.io/TEA/)

