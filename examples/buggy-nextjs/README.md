# buggy-nextjs: TradeQuote

A small, deliberately buggy Next.js app that TEA tests end to end. **Do not deploy it.**

CI builds it, starts it, runs TEA against it, and fails if TEA misses any bug planted for the milestones shipped so far (`scripts/verify-example.mjs`).

## Planted bugs

| Bug | Where | Caught in |
|---|---|---|
| Paywall shows "No plans available": `/api/plans` returns 500 | `app/pricing/page.tsx`, `app/api/plans/route.ts` | M1 ✅ |
| Account page crashes (500) for signed-out visitors | `app/account/page.tsx` | M1 ✅ |
| Uncaught JavaScript error and leftover `console.error` | `app/about/page.tsx` | M1 ✅ |
| Nav links to `/blog`, which doesn't exist | `app/layout.tsx` | M1 ✅ |
| Footer links to a missing Terms page | `app/layout.tsx` | M1 ✅ |
| Dashboard takes 3.5s to load | `app/dashboard/page.tsx` | M1 ✅ |
| Missing logo image | `app/page.tsx` | M1 ✅ |
| Admin page nothing links to (and nothing protects) | `app/admin/page.tsx` | M1 maps it, M3 flags it |
| Sign-up accepts any text as an email, no double-submit guard, posts to a missing API | `app/signup/page.tsx` | M2 |
| Any user's data readable by changing the id (IDOR) | `app/api/users/[id]/route.ts` | M3 |

## Run it

```bash
pnpm install
pnpm example:build
PORT=3000 pnpm example:start
pnpm tea run http://localhost:3000 --repo examples/buggy-nextjs
```
