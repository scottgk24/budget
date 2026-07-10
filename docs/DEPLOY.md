# Deploy Budget to Vercel

## Prerequisites

1. [Vercel](https://vercel.com) account
2. [Clerk](https://dashboard.clerk.com) application (production keys)
3. [Plaid](https://dashboard.plaid.com) app (sandbox first, then production)
4. Postgres database ([Neon](https://neon.tech) recommended)

## Steps

### 1. Switch database to Postgres for production

In `prisma/schema.prisma`, change:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Keep SQLite for local `.env` if you prefer; use a separate production `DATABASE_URL`.

Then generate a migration against Postgres (or run `npx prisma db push` once against Neon).

### 2. Create the Vercel project

```bash
npx vercel login
npx vercel link
npx vercel env add DATABASE_URL
# …add remaining secrets (see below)
npx vercel --prod
```

Or import the GitHub repo in the Vercel dashboard.

### 3. Environment variables

Set these in Vercel → Project → Settings → Environment Variables:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk |
| `CLERK_SECRET_KEY` | Clerk |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/dashboard` |
| `ALLOWED_EMAILS` | Comma-separated family emails |
| `PLAID_CLIENT_ID` | Plaid |
| `PLAID_SECRET` | Plaid (match `PLAID_ENV`) |
| `PLAID_ENV` | `sandbox` then `production` |
| `PLAID_PRODUCTS` | `transactions,investments` |
| `PLAID_COUNTRY_CODES` | `US` |
| `PLAID_WEBHOOK_URL` | `https://YOUR_DOMAIN/api/plaid/webhook` |
| `PLAID_WEBHOOK_SECRET` | Optional shared secret |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR_DOMAIN` |
| `TOKEN_ENCRYPTION_KEY` | Long random string (32+ chars) |

### 4. Post-deploy

1. Run migrations: `npx prisma migrate deploy` with production `DATABASE_URL`
2. In Clerk, add your production domain to allowed origins
3. Follow [Plaid production checklist](./PLAID_PRODUCTION.md)
4. Invite family from **Settings**

### 5. Local without deploying

```bash
npm install
npx prisma migrate dev
# fill .env.local with Clerk + Plaid sandbox keys
npm run dev
```
