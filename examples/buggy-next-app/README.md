# Leaf & Kettle (buggy example app)

A small, made-up tea shop built with Next.js, **deliberately full of bugs** so TEA can test it end to end. Every name, product and value in it is invented, and every key in it is fake. **Do not deploy it.**

`tea-seeded-bugs.json` lists every planted bug, the TEA check that should catch it, and the build step that adds that check. Some bugs live in the agent docs: `CLAUDE.md` claims features that were never built (CSV export, rate limits, search, a health check…), and `TODO.md` lists planned ones that TEA must show as *not built yet*, not as failures. A few only show up when TEA submits forms and calls APIs, so they're marked `caughtBySandbox`.

CI runs TEA against this app twice, read-only and then with `--sandbox`, and fails if any bug that an already-built check covers is missed, or if TEA reports a bug that isn't there.

From the repo root:

```bash
npm run demo
```
