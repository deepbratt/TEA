# Contributing to TEA

Thanks for helping spill the TEA. TEA is for founders who can't write tests, so every change should make the report clearer, the checks sharper, or the setup simpler.

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

TEA is one npm package (`tea-qa`) with one folder per part. The example app in `examples/` is a separate npm workspace because it is a test target, not part of TEA.

| Package | What it does |
|---|---|
| `src/core` | Types, `tea.yaml` loading, secret masking, scope guard, scoring, route matching, plugin API, check catalog loader, logging |
| `checks/` | The check catalog: one YAML entry per check, a JSON Schema, and fix-prompt templates |
| `src/repo-map` | Repo discovery: generic heuristics, stack detection table, built-in stack plugins |
| `src/scanner` | Read-only URL scan: Playwright crawl and passive checks |
| `src/report` | `results.json`, `report.md`, `report.html`, feature map, plain-English summary |
| `src/cli` | The `tea-qa` / `tea` command and pipeline orchestration (`run()`) |
| `src/ui` | The local web UI (`tea-qa ui`): a loopback-only server, a single self-contained page, and the folder picker |
| `src/github` | Read-only GitHub access for the UI: connect (CLI login, device flow, token), repos, branches, live URLs, shallow clone |

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

Pro checks are never written into this repo. A pro entry here is a stub: id, title, category, severity and `pack: pro` only. The loader refuses anything more.
