<p align="center">
  <img src="docs/assets/tea-hero.svg" alt="TEA: Test Everything Automatically. Spill the TEA on your app." width="100%">
</p>

<p align="center"><b>The free, open-source QA tester for apps built with AI.</b><br>
Point TEA at your app. It tells you, in plain English, what's broken and how to fix it.</p>

<p align="center">
  <a href="https://deepbratt.github.io/TEA/"><b>🌐 Website</b></a> ·
  <a href="https://deepbratt.github.io/TEA/demo/"><b>▶ Live demo</b></a> ·
  <a href="#-quick-start">⚡ Quick start</a> ·
  <a href="docs/GUIDE.md">📖 Guide</a>
</p>

<p align="center">
  <a href="https://github.com/deepbratt/TEA/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/deepbratt/TEA/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-b3262c"></a>
  <img alt="Node 20.9+" src="https://img.shields.io/badge/node-20.9%2B-5c5f66">
  <img alt="Status: beta" src="https://img.shields.io/badge/status-beta-f05d61">
</p>

---

## What is TEA?

You built an app with Lovable, Bolt, v0, Replit, Cursor or Claude Code. It *looks* finished. But does it actually work?

TEA tests it for you:

- 🔎 **Finds what's broken.** It opens every page in a real browser and spots crashes, broken links, failing requests and slow pages.
- 🔌 **Checks the connections.** Every button and form in your frontend should reach a working endpoint in your backend. TEA checks that it does.
- ✍️ **Tells you how to fix it.** You get a score, a pass/fail quality gate, and a ready-to-paste fix prompt for your AI coding tool.

TEA is free and open source, runs on your own computer, and never changes your app.

<p align="center">
  <img src="docs/assets/screenshots/04-project-overview.png" alt="The TEA Workbench showing a project's quality gate, score and issues" width="100%">
</p>

## Try it without installing anything

| | |
|---|---|
| 🌐 **[Website](https://deepbratt.github.io/TEA/)** | What TEA does, in two minutes |
| ▶ **[Live demo](https://deepbratt.github.io/TEA/demo/)** | Click through the real app, with a real analysis of an example shop |
| 📄 **[Sample report](https://deepbratt.github.io/TEA/report/report.html)** | The report TEA writes for that shop |

## ⚡ Quick start

You need [Node.js](https://nodejs.org) 20.9 or newer and git.

```bash
git clone https://github.com/deepbratt/TEA.git
cd TEA
npm start
```

That's it. `npm start` installs everything and opens TEA in your browser. The first time takes a few minutes; after that, a few seconds.

Then, in TEA:

1. **Add project → Choose folder and detect.** Pick your app's folder. TEA works out what it is.
2. **Start your app** the way you normally do, and pick its address from TEA's suggestions.
3. **Run analysis.** Read the issues, copy a fix prompt into your AI tool, fix, and run again.

👉 The **[step-by-step guide](docs/GUIDE.md)** walks through every screen, with pictures.

## What TEA checks

| | |
|---|---|
| 🧭 **Pages and features** | Crashes, server errors, missing pages, broken links and images, JavaScript errors, failing API calls |
| ⚡ **Speed** | Pages that take too long to load |
| 🔌 **Frontend ↔ backend** | Calls your backend doesn't answer, and endpoints nothing uses |
| 🧩 **Your own rules** | Anything you add without code, like "no console.log left in the code" or "has a privacy page" |
| 🚦 **Quality gate** | A clear Passed or Failed, which can block a bad deploy |
| 🔜 **Coming soon** | Deeper security checks (other users' data, payments, race conditions), all free |

Every check is free and open source. Nothing is locked.

## Works with your stack

TEA reads your code and figures out your stack on its own:
- **Web frameworks:** Next.js, React, Vue, Svelte, Angular, Astro and more.
- **Backends:** Node, Python, Go, Rust, Java/Kotlin, C#/.NET, PHP, Ruby, Elixir and Swift.
- **Mobile:** Flutter and React Native.
- **Services:** Supabase, Firebase, Prisma, Stripe and many more.

A separate frontend and backend? Add both folders, and TEA connects them.

[See the full list →](docs/HOW-IT-WORKS.md#-works-with-any-stack)

## Screenshots

<table>
<tr>
<td width="50%"><img src="docs/assets/screenshots/02-add-project-detect.png" alt="Adding a project: TEA detects the stack from the folder"><br><sub><b>Add your app</b>: TEA detects the stack</sub></td>
<td width="50%"><img src="docs/assets/screenshots/05-issues.png" alt="Issues with a fix prompt"><br><sub><b>Fix the issues</b>: every one has a fix prompt</sub></td>
</tr>
<tr>
<td><img src="docs/assets/screenshots/06-rules.png" alt="Rules with presets and your own rules"><br><sub><b>Make it yours</b>: presets, switches and your own rules</sub></td>
<td><img src="docs/assets/screenshots/08-quality-gate.png" alt="The quality gate with presets"><br><sub><b>Set the gate</b>: Passed or Failed after every run</sub></td>
</tr>
</table>

## All your settings in one file

You never have to edit a file, because every setting has a page in TEA. But everything is saved in one readable file, `tea.config.yaml`, that you can commit with your code:

```yaml
projects:
  - key: shop
    name: My shop
    url: http://localhost:3000
    sources:
      - { name: web, path: ../shop-web }
      - { name: api, path: ../shop-api }

gate:
  conditions:
    - { metric: critical, op: gt, value: 0 }   # no critical issues
    - { metric: score, op: lt, value: 60 }     # and a score of 60 or more
```

[Every setting, explained →](docs/GUIDE.md#%EF%B8%8F-configuration-guide)

## Use it in CI

Run the same checks on every pull request. The build fails when the quality gate fails:

```bash
node dist/cli/bin.js run --project shop
```

[Example GitHub Actions workflow →](docs/GUIDE.md#-use-it-in-ci)

## Safe by design

- **It only reads.** TEA opens your live app like a visitor and never submits forms or changes data.
- **It never runs your app's install scripts**, which is how supply-chain malware gets in.
- **It masks secrets everywhere:** in the terminal, the report and every file.
- **Only you can reach it.** The TEA app only answers on your own computer, behind a one-time link.

Only test apps you own or are allowed to test. The TEA Score is not a security guarantee, audit or certification. [More on responsible use →](docs/HOW-IT-WORKS.md#%EF%B8%8F-responsible-use)

## Learn more

| | |
|---|---|
| 📖 [Using TEA](docs/GUIDE.md) | The step-by-step guide, every setting, the command line and CI |
| 🔍 [How TEA works](docs/HOW-IT-WORKS.md) | The report and score, every check, every stack, the roadmap, plugins |
| 🗺️ [Roadmap](docs/HOW-IT-WORKS.md#%EF%B8%8F-roadmap) | What's built and what's next ([live status](BUILD-PROGRESS.md)) |
| 📝 [Changelog](CHANGELOG.md) | What changed in each release |

## Contributing

New checks, stack support and better fix prompts are all welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), which also covers the developer commands. Please follow the [code of conduct](CODE_OF_CONDUCT.md). Found a security problem? Report it privately: see [SECURITY.md](SECURITY.md).

## Author

**DeepBratt** created TEA and maintains it · [github.com/deepbratt](https://github.com/deepbratt)

If TEA helped you ship, a ⭐ helps other people find it.

## License

[MIT](LICENSE) © 2026 DeepBratt and TEA contributors. Free forever.
