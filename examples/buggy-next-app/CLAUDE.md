# Leaf & Kettle: notes for the coding agent

Leaf & Kettle is an online tea shop with a monthly Tea Club subscription.

## Rules for this codebase

- All API routes require auth. Check the session at the top of every handler.
- Never store secrets client-side. Keys stay on the server.
- Every list must have an empty state.

## What's built

- Product catalogue on /shop with search and filters.
- Cart and checkout with Stripe (test mode).
- Tea Club plans on /pricing, loaded from /api/plans.
- Order history on /orders.
- CSV export of orders: done. The "Export" button on /dashboard downloads a CSV.
- Wishlist: done. Saved teas show on the dashboard.
- Login is rate limited (5 attempts per minute).
- Order confirmation emails are sent after checkout.
- AI tea descriptions on product pages (OpenAI), limited to 10 per user per day.
- Health check at /api/health for the uptime monitor.

## Stack

Next.js 15 app router, React 19, Prisma (see prisma/schema.prisma), Stripe.
