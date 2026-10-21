# TEA build progress

The build follows 14 steps, one at a time. A step is ticked only when its tests pass and CI is green, and each step is committed as `step N: ...`. A new session reads this file and continues from the first unticked step.

**Repo split.** This repo (`deepbratt/TEA`) is the public, MIT-licensed engine: CLI, scanners, the check catalog with all **free** checks, the report, retest, MCP and the GitHub Action. Paid **pro** checks appear here only as stub catalog entries (`pack: pro`, id and title, no rule, no prompt). Their real rules, the ranked fix prompts and TEA Cloud live in the private `deepbratt/Tea-paid` repo.

**Code map.** One npm package (`tea-qa`), one folder per part of the plan's package map: `src/cli`, `src/core`, `src/scanner` (URL scan), `src/repo-map` (repo discovery: stack, routes, endpoints, forms, env var names; added because every later step needs it), `src/report`, `src/ui` (local web UI, added on request), plus `src/docs-reader`, `src/spec`, `src/codehealth`, `src/prodready`, `src/fix`, `src/mcp` and `src/runners/{web,mobile,desktop}`, each created in its step. The check catalog lives in `checks/`.

## Steps

- [x] **1. Repo skeleton and hygiene.** Monorepo, CI (lint, typecheck, test, gitleaks with `.gitleaks.toml` allowlisting only `examples/`), LICENSE, README, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, `.gitignore` with `.env`, check catalog schema and loader (free and pro packs, `TEA_LICENSE_KEY` pack loader), responsible-use notice on first run, badge disclaimer.
  - Done: npm workspaces monorepo, TypeScript builds, Vitest, CI for typecheck/test on Node 20 and 22, LICENSE (MIT), README, CONTRIBUTING.md, `.gitignore`, config loader, secret masking, scope guard, plugin API.
- [ ] **2. Example app** `examples/buggy-next-app`, with agent docs (CLAUDE.md, TODO.md) that over-claim, and the seeded bugs from the plan.
  - Done in this step: Leaf & Kettle (made-up tea shop) on Next.js 16 with 56 seeded bugs from the plan (2.4a–2.4f, 2.5), CLAUDE.md/TODO.md that over-claim, and `tea-seeded-bugs.json` mapping each bug to its check and step. `npm run demo` runs it end to end; 10 bugs are caught today, the rest wait for their steps.
- [ ] **3. Read-only URL scan.** GET/HEAD only, robots.txt, at most 2 requests per second, security headers, cookies, HTTPS/TLS, secrets in bundles and source maps, exposed source maps and endpoints, Supabase/Firebase client config, Lighthouse and axe on up to 5 key pages.
  - Already there: same-origin Playwright crawl (50 pages, screenshots), console and page errors, failed requests, 4xx/5xx, broken links and images, soft 404s, pages slower than 3s, redirect scope guard, reachability check.
- [ ] **4. Agent-docs reader to `features.md`.**
- [ ] **5. Code health** (`CODE-HEALTH.md`).
- [ ] **6. Production-readiness checks** (`PROD-READINESS.md`, Prod Ready score).
- [ ] **7. Report and score** (`index.html`, `report.md`, versioned `results.json`, sub-scores, score card PNG, cloud hooks).
  - Already there: HTML/MD/JSON report, TEA Score with per-area scores, plain-English summary, top issues with screenshot, file and fix prompt, feature map.
- [ ] **8. Fix prompts** (`tea-findings.json`, `FIXES.md`, `FIX-PROMPT.md` per finding, fix modes `report` and `suggest`).
- [ ] **9. Retest** (`tea-qa retest`).
- [ ] **10. Functional tester (AI)** in sandbox mode only.
- [ ] **11. MCP server** (`tea-qa mcp`).
- [ ] **12. GitHub Action and GitLab CI template.**
- [ ] **13. Mobile and desktop runners.**
- [ ] **14. AI design review.**

## Notes

- `tea-qa ui` (`npm run ui` from source) runs the same engine from a local web page on 127.0.0.1 with a one-time token; runs are kept in `tea-report/runs/`.

- One package; `examples/*` is the only npm workspace. `.npmrc` sets `ignore-scripts=true` so dependency install scripts never run. `npm run demo` is the one-command end-to-end run.
- Repo development needs Node 22+ (Vitest 5). The CLI targets Node 20+: CI runs the end-to-end demo on Node 20 and 22.
- Code-only mode starts the target app only with consent (`--start` or a yes at the prompt), and never runs installs.
- Plugins listed in a repo's own `tea.yaml` are not loaded unless the user passes `--config` or `--trust-repo-config`.
