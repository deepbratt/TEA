# Changelog

All notable changes to TEA are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and TEA uses [semantic versioning](https://semver.org/) from its first npm release.

TEA is created and maintained by [DeepBratt](https://github.com/deepbratt).

## [Unreleased]

### Changed
- **Everything is open source; nothing is locked.** The licence-key gating and the "pro pack" loader are gone. The checks that were pro stubs are now ordinary catalog entries, shown as *Coming soon* until their sandbox detectors exist. `TEA_CHECKS` loads community check packs.

### Added
- **Your own rules, no code.** `customRules` in `tea.config.yaml`, with four types: `forbid-text`, `require-text`, `require-file` and `require-route`.
  - In the Workbench, add one-click ideas (no console.log, no test keys, has a privacy page…) or use the three-step rule builder.
  - They run in every analysis, the CLI included.
- **Rules a non-technical person can manage.**
  - Every check has a plain-English description.
  - Relaxed / Balanced / Strict presets for the rules and for the quality gate.
  - Switches for whole groups of checks, "How serious" in plain words, and "Reset all to defaults".
- **Config file page:** download, import and reset to defaults.
- **Motion and illustrations.**
  - An animated tea cup that fills to each project's score and brews while an analysis runs.
  - An animated score ring, illustrated empty states, content easing in, and a progress bar.
  - Everything stays still for people who prefer reduced motion.
- **README guides:** a step-by-step guide with screenshots (regenerate with `node scripts/screenshots.mjs`) and a full configuration guide.
- **Ash and ember theme.** The Workbench, the HTML report and the README graphics use one dark theme: charcoal and ash greys with a red accent. Every page passes WCAG AA contrast checks (axe).
- **Author and repo information.** The Workbench footer, the report footer and the package metadata name DeepBratt.
- **Templates.** GitHub issue templates (bug, feature, new check or stack), a pull-request checklist and CODEOWNERS.
- **Folder picker path box.** The folder picker has a path box you can type into.

### Fixed
- **Folder picker race.** A slow first listing could overwrite a path you had already typed (seen on Linux CI).

## [0.1.0] - 2026-10-22

First public build, run from source with `npm start`.

### Added
- **One command.** `npm start` installs dependencies (install scripts disabled), builds only what changed, installs headless Chromium and opens the TEA Workbench.
- **TEA Workbench** (`tea-qa ui`), a local Next.js app with SonarQube-style projects, live analyses, an issues browser, rules (a quality profile) and a quality gate. Settings live in one editable `tea.config.yaml` that keeps your comments. It runs on 127.0.0.1 only, with a one-time token and Host and Origin checks.
- **Any stack, any language.**
  - Manifests are read for JS/TS, Python, Go, Rust, Java/Kotlin, C#, PHP, Ruby, Elixir, Dart and Swift.
  - Routes are read from about 30 backend frameworks.
  - API calls are found in clients in every one of those languages.
- **Auto-detect.** Monorepos are split into their apps. Each folder's role (frontend, backend or fullstack) comes from its code, and the local URL to test is suggested.
- **Frontend-to-API wiring checks.**
  - `wiring.orphan-call` flags a call nothing serves, or one with a method the route doesn't handle.
  - `wiring.unused-endpoint` flags an endpoint nothing calls.
- **CLI.**
  - `--source [role=]path` (repeatable) scans several folders.
  - `--project <key>` runs a saved project with its rules and gate; the gate decides the exit code.
- **Core features:**
  - zero-config discovery;
  - a read-only Playwright crawl;
  - the TEA Score;
  - HTML, Markdown and JSON reports with fix prompts;
  - the check catalog with free checks and pro stubs;
  - secret masking everywhere;
  - a scope guard for live URLs.

### Removed
- GitHub connect and the old static UI. Projects point at local folders.

### Security
- Removed malware injected into the repository's branches (an `api.js` loader, a payload in `eslint.config.mjs`, a fake font and npm script hooks).
- The code scanner's regular expressions are bounded, so hostile code in a scanned repo can't cause catastrophic backtracking.

[Unreleased]: https://github.com/deepbratt/TEA/compare/main...HEAD
[0.1.0]: https://github.com/deepbratt/TEA/commits/main
