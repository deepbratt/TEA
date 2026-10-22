# Leaf & Kettle (buggy example app)

A small, made-up tea shop built with Next.js, **deliberately full of bugs** so TEA can test it end to end. Every name, product and value in it is invented, and every key in it is fake. **Do not deploy it.**

`tea-seeded-bugs.json` lists every planted bug, the TEA check that should catch it, and the build step that adds that check. CI runs TEA against this app and fails if any bug that an already-built check covers is missed.

From the repo root:

```bash
npm run demo
```
