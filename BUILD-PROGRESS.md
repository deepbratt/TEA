# TEA build progress

The build follows 14 steps, one at a time. A step is ticked only when its tests pass and CI is green, and each step is committed as `step N: ...`. A new session reads this file and continues from the first unticked step.

**Everything is open source.** This repo (`deepbratt/TEA`, MIT) holds the whole product: CLI, scanners, every check in the catalog, the Workbench, the report, retest, MCP and the GitHub Action. There are no locked or licensed checks (decided 2026-10-23; the former "pro" checks are ordinary catalog entries, listed as planned until their sandbox detectors exist). Business planning docs stay in the private `deepbratt/Tea-paid` repo.

**Code map.** One npm package (`tea-qa`), one folder per part of the plan's package map: `src/cli`, `src/core`, `src/scanner` (URL scan), `src/repo-map` (repo discovery: stack, routes, endpoints, forms, env var names; added because every later step needs it), `src/report`, `src/wiring` (frontend-to-API wiring checks), `src/workspace` (Workbench backend), `web/` (the Next.js Workbench, added on request), plus `src/docs-reader`, `src/spec`, `src/codehealth`, `src/prodready`, `src/fix`, `src/mcp` and `src/runners/{web,mobile,desktop}`, each created in its step. The check catalog lives in `checks/`.

## Steps

- [x] **1. Repo skeleton and hygiene.** Monorepo, CI (lint, typecheck, test, gitleaks with `.gitleaks.toml` allowlisting only `examples/`), LICENSE, README, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, `.gitignore` with `.env`, check catalog schema and loader (free and pro packs, `TEA_LICENSE_KEY` pack loader), responsible-use notice on first run, badge disclaimer.
  - Done: npm workspaces monorepo, TypeScript builds, Vitest, CI for typecheck/test on Node 20 and 22, LICENSE (MIT), README, CONTRIBUTING.md, `.gitignore`, config loader, secret masking, scope guard, plugin API.
- [ ] **2. Example app** `examples/buggy-next-app`, with agent docs (CLAUDE.md, TODO.md) that over-claim, and the seeded bugs from the plan.
  - Done in this step: Leaf & Kettle (made-up tea shop) on Next.js 16 with 56 seeded bugs from the plan (2.4a–2.4f, 2.5), CLAUDE.md/TODO.md that over-claim, and `tea-seeded-bugs.json` mapping each bug to its check and step. `npm run demo` runs it end to end; 10 bugs are caught today, the rest wait for their steps.
- [ ] **3. Read-only URL scan.** GET/HEAD only, robots.txt, at most 2 requests per second, security headers, cookies, HTTPS/TLS, secrets in bundles and source maps, exposed source maps and endpoints, Supabase/Firebase client config, Lighthouse and axe on up to 5 key pages.
  - Already there: same-origin Playwright crawl (50 pages, screenshots), console and page errors, failed requests, 4xx/5xx, broken links and images, soft 404s, pages slower than 3s, redirect scope guard, reachability check.
- [ ] **4. Agent-docs reader to `features.md`.**
  - Done (`src/features`): feature inventory from the code (pages, API routes and calls, forms, models, services, grouped by route); agent docs read (CLAUDE.md, AGENTS.md, GEMINI.md, Cursor/Windsurf/Cline rules, Copilot instructions, README, TODO, ROADMAP, PRD, SPEC); claims checked against paths, capabilities and unserved calls (`features.claimed-missing`, `features.not-built-yet`); a Given/When/Then plan and verdict per feature in `features.md`, `features.json`, the report and the Workbench Features tab; `tea-qa features`; gate metrics `broken-features` and `feature-coverage`. The example's 5 docs bugs plus 2 more (rate limits, shop search) are caught.
  - Left: "built but undocumented" as its own label, a hand-edited features file as the source of truth.
- [ ] **5. Code health** (`CODE-HEALTH.md`).
- [ ] **6. Production-readiness checks** (`PROD-READINESS.md`, Prod Ready score).
- [ ] **7. Report and score** (`index.html`, `report.md`, versioned `results.json`, sub-scores, score card PNG, cloud hooks).
  - Already there: HTML/MD/JSON report, TEA Score with per-area scores, plain-English summary, top issues with screenshot, file and fix prompt, feature map.
- [ ] **8. Fix prompts** (`tea-findings.json`, `FIXES.md`, `FIX-PROMPT.md` per finding, fix modes `report` and `suggest`).
- [ ] **9. Retest** (`tea-qa retest`).
- [ ] **10. Functional tester (AI)** in sandbox mode only.
  - Done: `--sandbox` / project `sandbox: true` (localhost only): forms submitted with valid test data and an invalid email, GET API routes called signed out (`features.form-fails`, `features.form-accepts-invalid`, `features.api-open`, `features.api-error`); card, identity and file fields and destructive buttons never touched. `npm run demo` runs and verifies a sandbox pass.
  - Left: IDOR with two test accounts, persistence after reload, saved Playwright tests (`tea-tests/`), the optional AI explorer (`features.ai-explorer`, planned).
- [ ] **11. MCP server** (`tea-qa mcp`).
- [ ] **12. GitHub Action and GitLab CI template.**
- [ ] **13. Mobile and desktop runners.**
- [ ] **14. AI design review.**

## Notes

- `tea-qa ui` (`npm run ui` from source) starts the TEA Workbench, a Next.js app on 127.0.0.1 with a one-time token: SonarQube-style projects (several source folders each, e.g. a separate frontend and backend), analyses, issues, rules and a quality gate, all stored in one editable `tea.config.yaml` that the Workbench rewrites keeping comments. Analyses are kept in `.tea/runs/`. GitHub connect was removed: point a project at local folders. Spec: `docs/WORKBENCH-PROMPT.md`.
- Frontend-to-API wiring (`wiring.orphan-call`, `wiring.unused-endpoint`) runs whenever the code has both a calling and a serving side; the example's orphan `/api/wishlist` and `/api/signup` calls are caught.
- `tea-qa run --project <key>` runs a workspace project with its rules and gate; the gate decides the exit code.
- Any stack and language: manifests for JS, Python, Go, Rust, Java/Kotlin, C#, PHP, Ruby, Elixir, Dart and Swift; route discovery for Go, Rust, Spring/JAX-RS/Micronaut/Ktor, ASP.NET Core, Laravel/Symfony/Slim, Phoenix, Sinatra and Vapor (`src/repo-map/plugins/polyglot.ts`); API calls from clients in every one of those languages. Folder roles default to `auto` (`inferRole`), and `detectProject` splits monorepos into apps and suggests the local URL.
- `npm start` (`scripts/start.mjs`) is the one command from source: installs, builds what changed, installs Chromium, opens the Workbench.

- One package; `examples/*` and `web` are the npm workspaces. `.npmrc` sets `ignore-scripts=true` so dependency install scripts never run. `npm run demo` is the one-command end-to-end run.
- Repo development needs Node 22+ (Vitest 5). The CLI targets Node 20+: CI runs the end-to-end demo on Node 20 and 22.
- Code-only mode starts the target app only with consent (`--start` or a yes at the prompt), and never runs installs.
- Plugins listed in a repo's own `tea.yaml` are not loaded unless the user passes `--config` or `--trust-repo-config`.
