# Contributing to TEA

Thanks for helping spill the TEA. TEA is created and maintained by [DeepBratt](https://github.com/deepbratt). TEA is for founders who can't write tests, so every change should make the report clearer, the checks sharper, or the setup simpler.

## Setup

You need Node.js 22+ and npm (TEA itself runs on Node 20+; its unit-test runner needs 22).

```bash
npm install          # install scripts are disabled in .npmrc (supply-chain safety)
npm run build
npm run browsers     # headless Chromium for the crawler
npm test
```

## Try it against the example app

```bash
npm run demo         # builds TEA and the example, starts it, runs TEA, verifies the seeded bugs
npm run demo -- --skip-build --keep   # reuse builds and leave the example running
node scripts/verify-example.mjs tea-report
```

`examples/buggy-next-app` (Leaf & Kettle, a made-up tea shop) has a bug planted for every check in the plan, listed in `tea-seeded-bugs.json` with the step that catches it. CI runs `npm run demo`, which fails if a bug an existing check covers is missed, or if TEA reports anything that isn't a seeded bug. When you add a check, add `caughtBy` to its bugs in the manifest.

## Layout

TEA is one npm package (`tea-qa`) with one folder per part. The example app in `examples/` and the Workbench in `web/` are npm workspaces: the example because it is a test target, the Workbench because it is a Next.js app with its own build.

Run everything with `npm start` (installs, builds what changed, opens the Workbench). Working on the Workbench: `npm run ui:dev` (hot reload on 127.0.0.1:4747, no token in dev), and `node scripts/workbench-e2e.mjs` drives it in a real browser, including axe in light and dark mode.

The website demo is the same Workbench, built as a static export (`NEXT_PUBLIC_TEA_DEMO=1`) from a real recorded analysis: `node scripts/build-demo.mjs` records and builds it, `node scripts/demo-e2e.mjs` clicks through it. In demo builds, pages render once at build time (`web/lib/live.ts`), browser API calls are answered from recorded data (`web/lib/demo.ts`), and links and images go through `web/lib/mode.ts` so they work under `/TEA/demo/`. When you add an API call to a page, give it a demo answer in `demoApi`.

| Package | What it does |
|---|---|
| `src/core` | Types, `tea.yaml` loading, secret masking, scope guard, scoring, route matching, plugin API, check catalog loader, logging |
| `checks/` | The check catalog: one YAML entry per check, a JSON Schema, and fix-prompt templates |
| `src/repo-map` | Repo discovery: manifests for every ecosystem, generic heuristics and API-call extraction, the stack table, built-in stack plugins (`plugins/polyglot.ts` for non-JS backends), project and role auto-detection |
| `src/scanner` | Read-only URL scan: Playwright crawl and passive checks |
| `src/report` | `results.json`, `report.md`, `report.html`, feature map, plain-English summary |
| `src/cli` | The `tea-qa` / `tea` command and pipeline orchestration (`run()`) |
| `src/wiring` | Frontend-to-API wiring checks: calls nothing serves, wrong methods, endpoints nothing calls |
| `src/workspace` | The Workbench backend: `tea.config.yaml` (projects, rules, gate; validated, comment-keeping writes), analyses (`RunManager`), folder picker |
| `web/` | The TEA Workbench (`tea-qa ui`): a Next.js app. Pages are server components that call the engine from `dist/`; API routes under `web/app/api`; `proxy.ts` enforces loopback, the one-time token and same-origin writes |
| `theme/` | Design tokens shared by the Workbench and the HTML report |

## Rules

- **Generic first.** The core must work on any URL and any repo. Put stack-specific knowledge in a plugin (`src/repo-map/plugins/`) or a row in the stack table (`src/repo-map/detect.ts`).
- **Safe by default.** Nothing that writes data, sends email, pays, or loads a server runs without an explicit flag. Never run the target's install scripts.
- **Never leak secrets.** Print through `log`, write reports through `writeReport`; both mask. Record env var names, never values.
- **Founder-readable findings.** Every finding needs a plain-English `summary`, `steps`, the likely `file`, and a `fix` written as a prompt someone can paste into Cursor, Lovable or Claude.
- **Tests.** Every check gets a unit test, and a planted bug in the example app when it applies.

## Pull requests

Keep PRs focused, describe what a founder would notice, and make sure `npm run build && npm run lint && npm test` passes. CI also runs gitleaks over the whole history; only `examples/` may hold (deliberately fake) secrets, so build fake keys in tests at runtime.

## Adding a check

1. Add `checks/<category>/<id>.yaml` (see `check.schema.json`) and its fix-prompt template under `checks/prompts/`.
2. Implement the detector the entry's `rule` points to, and emit findings whose id starts with the check id (`<check id>:<location>`).
3. Plant the bug in the example app and assert TEA catches it.

Every check is open source and lives here; there are no locked or licensed checks. Give each entry a one-sentence `description` a non-technical founder understands: it is what the Rules page shows. A check whose detector isn't built yet has no `rule` and shows as *Coming soon*; add the `rule`, the `fix_prompt` and the detector together when you build it.

Don't need a detector at all? Many checks people want are custom rules (forbid or require text, require a file or a route). Add a template to `CUSTOM_RULE_TEMPLATES` in `src/custom/index.ts` and it appears as a one-click idea on the Rules page.
