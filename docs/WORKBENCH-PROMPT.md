# Build prompt: TEA Workbench

> Paste this into a coding agent to build (or rebuild) the TEA Workbench. It assumes the TEA engine in this repo: `src/` (core, repo-map, scanner, report, cli) and the check catalog in `checks/`.

## Goal

Make TEA work like SonarQube, but for testing vibe-coded apps end to end: a local web app where a founder registers their projects once, runs an analysis with one click, and sees a pass/fail **quality gate**, the **issues** with fix prompts, and how the app's **frontend and API connect**. TEA is free and open source (MIT); everything here ships in the public repo.

## Requirements

### 1. Projects with several source folders
- A project has a name, a key (URL-safe slug), an optional live URL, and **one or more source folders**, each with a name and a role: `frontend`, `backend` or `fullstack`. Example: `shop-web` (frontend, Next.js) and `shop-api` (backend, Express).
- No GitHub integration. Code comes only from folders on this computer, chosen by typing a path or with a folder picker.
- TEA scans every folder, merges what it finds, and prefixes file paths with the folder name when there is more than one (`api/src/routes/orders.ts`), so every issue still points at a real file.

### 2. One editable workspace config file
- `tea.config.yaml` holds everything: projects, rules (the quality profile) and the quality gate. Default location: the folder where the Workbench starts; override with `tea-qa ui --workspace <file>`.
- The UI reads it on every request and **rewrites it** when the user saves. Writes are validated, atomic (temp file + rename) and keep the file's comments. People can also edit the file by hand; the UI picks up the changes.
- Rules: one entry per check id: `enabled`, `severity` override, and check-specific `params` (for example `crawl.slow.thresholdMs`). Checks missing from the file use the catalog defaults. Pro checks show as locked.
- Quality gate: a list of conditions, each `metric`, `op` (`lt` or `gt`) and `value`; the gate fails when any condition is met. Metrics: `score`, `critical`, `high`, `medium`, `low`, and each area score (`functional`, `api`, `performance`, ...). A project can override the workspace gate.

### 3. SonarQube-style analysis
- **Projects page:** every project with its gate status (Passed / Failed / Not analysed), TEA Score, issue counts by severity and last analysis time.
- **Project overview:** gate status with each condition's actual value, measures (score, issues by severity and by area), "Run analysis" with live progress, and analysis history.
- **Issues page:** filter by severity, area, check and file; each issue shows where it is, what was observed, steps to reproduce and a copy-able fix prompt.
- **Rules page:** every check in the catalog with its category, default severity, enabled switch, severity override and params; saving rewrites the config file.
- **Quality gate page:** add, edit and remove conditions; saving rewrites the config file.
- **Config page:** where the file lives and its current contents.

### 4. Frontend-to-API wiring checks (static, no AI)
- From frontend (and fullstack) folders: every API call in code (`fetch`, `axios`, `$fetch`, `ky`, ...), including template URLs like `` `${API_URL}/orders/${id}` `` and form actions.
- From backend (and fullstack) folders: every route definition (Next.js route handlers and pages API, Express/Fastify/Hono, NestJS, FastAPI/Flask, Django, Rails, SvelteKit, Nuxt, Astro).
- `wiring.orphan-call` (high): the UI calls an endpoint no backend route serves, or with a method the route doesn't handle.
- `wiring.unused-endpoint` (info): a backend route nothing in the frontend calls. Webhooks, health, cron, auth callbacks and OAuth routes are excluded, because outside services call them.
- Both are catalog entries with fix-prompt templates, like every other check.

### 5. Next.js UI with a Node backend
- `web/` is a Next.js (App Router) app. Its route handlers are the Node backend: they call the TEA engine directly (imported at runtime from the built `dist/`, not bundled) and the workspace service in `src/workspace/`.
- `tea-qa ui` starts it with `next start` bound to 127.0.0.1, with a one-time token in the link. A `proxy.ts` checks the token (traded for an HttpOnly, SameSite=Strict cookie), the Host header (DNS rebinding) and the Origin of writes (CSRF). Only one analysis runs at a time.
- The engine and the UI share one design token file (`theme/tea.css`): the blue-and-white porcelain theme, light and dark.

### 6. Quality bar
- Accessible (WCAG 2.2 AA, checked with axe in light and dark mode), keyboard-friendly, responsive to phone width.
- Secrets masked everywhere (config, logs, run records, API responses).
- Tests: workspace config round-trip (with comments), rules and gate evaluation, multi-folder scanning, wiring checks against the example app, and a browser test that creates a project, runs an analysis and reads the gate.
- The example app (`examples/buggy-next-app`) seeds a UI call to a missing route (`/api/wishlist`); `wiring.orphan-call` must catch it.

## Non-goals
- No GitHub, GitLab or cloud integration in the Workbench.
- No writes to the apps under test: analyses stay read-only.
