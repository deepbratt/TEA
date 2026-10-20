# Contributing to TEA

Thanks for helping spill the TEA. TEA is for founders who can't write tests, so every change should make the report clearer, the checks sharper, or the setup simpler.

## Setup

You need Node.js 22.13+ (for pnpm 11; TEA itself runs on Node 20+) and pnpm.

```bash
pnpm install
pnpm build
pnpm --filter @tea-qa/browser-agent exec playwright install chromium
pnpm test
```

## Try it against the example app

```bash
pnpm example:build
PORT=3000 pnpm example:start            # in one terminal
pnpm tea run http://localhost:3000 --repo examples/buggy-nextjs
node scripts/verify-example.mjs tea-report
```

`examples/buggy-nextjs` has a bug planted for every check TEA ships (see its README). CI runs TEA against it and fails if any planted bug is missed. When you add a check, plant a bug for it and add it to `scripts/verify-example.mjs`.

## Layout

| Package | What it does |
|---|---|
| `packages/core` | Types, `tea.yaml` loading, secret masking, scope guard, scoring, route matching, plugin API |
| `packages/scanner` | Repo discovery: generic heuristics, stack detection table, built-in stack plugins |
| `packages/browser-agent` | Read-only Playwright crawler and crawl findings (AI agent in milestone 2) |
| `packages/report` | `results.json`, `report.md`, `report.html`, feature map, plain-English summary |
| `packages/cli` | The `tea-qa` / `tea` command and pipeline orchestration |

## Rules

- **Generic first.** The core must work on any URL and any repo. Put stack-specific knowledge in a plugin (`packages/scanner/src/plugins/`) or a row in the stack table (`packages/scanner/src/detect.ts`).
- **Safe by default.** Nothing that writes data, sends email, pays, or loads a server runs without an explicit flag. Never run the target's install scripts.
- **Never leak secrets.** Print through `log`, write reports through `writeReport`; both mask. Record env var names, never values.
- **Founder-readable findings.** Every finding needs a plain-English `summary`, `steps`, the likely `file`, and a `fix` written as a prompt someone can paste into Cursor, Lovable or Claude.
- **Tests.** Every check gets a unit test, and a planted bug in the example app when it applies.

## Pull requests

Keep PRs focused, describe what a founder would notice, and make sure `pnpm build && pnpm test` passes.
