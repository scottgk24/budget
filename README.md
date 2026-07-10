# Budget

Private family + sole-proprietorship budgeting app. Connect Chase and Robinhood via Plaid, track spending in **Personal** and **Business** views, and share access with household members.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Clerk (invite-only auth)
- Prisma + SQLite (local) / Postgres (production)
- Plaid Link (Transactions + Investments)

## Quick start

1. **Install & database**

```bash
npm install
cp .env.example .env
cp .env.example .env.local
npx prisma migrate dev --name init
```

2. **Clerk** — create an application at [dashboard.clerk.com](https://dashboard.clerk.com). Copy publishable + secret keys into `.env` and `.env.local`. Enable email magic link and/or Google. For production, restrict sign-ups (invitations only) in Clerk and/or set `ALLOWED_EMAILS`.

3. **Plaid** — create a sandbox app at [dashboard.plaid.com](https://dashboard.plaid.com). Enable **Transactions** and **Investments**. Set `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`.

4. **Run**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Security model

- Bank credentials are entered only in **Plaid Link** (OAuth for Chase). This app never sees passwords.
- Plaid `access_token` values are **encrypted at rest** (`TOKEN_ENCRYPTION_KEY`).
- Read-only: no ACH, transfers, or bill pay products.
- Invite-only: family invites from Settings + optional `ALLOWED_EMAILS` allowlist.
- Webhook endpoint: `/api/plaid/webhook` (optional `PLAID_WEBHOOK_SECRET` header check).

## Personal vs Business

Use the toggle in the header. New Plaid connections inherit the active ledger. You can reassign accounts and individual transactions later.

## Deploy (Vercel)

Deploy requires a one-time `npx vercel login` on your machine (CLI deploy from this environment is not authenticated). Full steps: [docs/DEPLOY.md](docs/DEPLOY.md).

Summary:

1. Push this repo and import in Vercel (or run `npx vercel`).
2. Create a Neon (or other) Postgres database. Set `DATABASE_URL` to the Postgres URL.
3. Change Prisma datasource provider from `sqlite` to `postgresql` in `prisma/schema.prisma`, then run `npx prisma migrate deploy`.
4. Set production env vars (Clerk, Plaid, `TOKEN_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, `ALLOWED_EMAILS`, `PLAID_WEBHOOK_URL`).
5. Point Plaid webhook to `https://YOUR_DOMAIN/api/plaid/webhook`.

### Plaid production checklist

See [docs/PLAID_PRODUCTION.md](docs/PLAID_PRODUCTION.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local Next.js server |
| `npm run build` | Production build |
| `npm run db:migrate` | Create/apply migrations |
| `npm run db:studio` | Browse data |

## Project layout

- `src/app/(app)/` — Dashboard, Transactions, Budgets, Accounts, Settings
- `src/app/api/plaid/` — Link token, exchange, sync, webhook
- `src/lib/sync.ts` — Plaid → DB sync for bank + investment data
- `prisma/schema.prisma` — data model
