# TEA build progress

The build follows 14 steps, one at a time. A step is ticked only when its tests pass and CI is green, and each step is committed as `step N: ...`. A new session reads this file and continues from the first unticked step.

**Repo split.** This repo (`deepbratt/TEA`) is the public, MIT-licensed engine: CLI, scanners, the check catalog with all **free** checks, the report, retest, MCP and the GitHub Action. Paid **pro** checks appear here only as stub catalog entries (`pack: pro`, id and title, no rule, no prompt). Their real rules, the ranked fix prompts and TEA Cloud live in the private `deepbratt/Tea-paid` repo.

**Package map.** `cli`, `core`, `scanner` (URL scan), `repo-map` (repo discovery: stack, routes, endpoints, forms, env var names; added to the plan's map because every later step needs it), `report`, plus `docs-reader`, `spec`, `codehealth`, `prodready`, `fix`, `mcp` and `runners/{web,mobile,desktop}`, each created in its step.

## Steps

- [ ] **1. Repo skeleton and hygiene.** Monorepo, CI (lint, typecheck, test, gitleaks with `.gitleaks.toml` allowlisting only `examples/`), LICENSE, README, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, `.gitignore` with `.env`, check catalog schema and loader (free and pro packs, `TEA_LICENSE_KEY` pack loader), responsible-use notice on first run, badge disclaimer.
  - Already there: pnpm monorepo, TypeScript builds, Vitest, CI for typecheck/test on Node 20 and 22, LICENSE (MIT), README, CONTRIBUTING.md, `.gitignore`, config loader, secret masking, scope guard, plugin API.
- [ ] **2. Example app** `examples/buggy-next-app`, with agent docs (CLAUDE.md, TODO.md) that over-claim, and the seeded bugs from the plan.
  - Already there: `examples/buggy-nextjs` with 8 bugs that the crawl catches, verified end to end in CI.
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

- Repo development needs Node 22.13+ (pnpm 11). The published CLI targets Node 20+, and CI tests both.
- Code-only mode starts the target app only with consent (`--start` or a yes at the prompt), and never runs installs.
- Plugins listed in a repo's own `tea.yaml` are not loaded unless the user passes `--config` or `--trust-repo-plugins`.
