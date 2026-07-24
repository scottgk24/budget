# Plaid production checklist

Use this when moving Budget from sandbox to live Chase / Robinhood data.

## 1. Plaid Dashboard

1. Open [Plaid Dashboard](https://dashboard.plaid.com) → your team.
2. Request **Production** access (and Development if not already approved).
3. Under **Products**, ensure **Transactions** and **Investments** are enabled for this app.
4. Under **API** / **Team settings**, copy Production `client_id` and `secret`.

## 2. OAuth (Chase)

1. In Plaid, configure **OAuth redirect URI(s)** for your app:
   - Local (if testing OAuth locally): `http://localhost:3000/api/plaid/oauth-return` (only if you add that route) or the URI Plaid documents for Link.
   - Production: your Vercel URL as required by Plaid’s OAuth setup for Chase.
2. Complete any Chase / JPMorgan OAuth registration steps Plaid prompts for.
3. Set optional `PLAID_REDIRECT_URI` in Vercel env if your Link flow requires it.

## 3. Webhooks

1. Set `PLAID_WEBHOOK_URL=https://YOUR_DOMAIN/api/plaid/webhook` in env **and** in the Link token create call (already wired via env).
2. **JWT verification is required** — the app verifies the `Plaid-Verification` header (ES256 + body SHA-256) on every webhook. Unsigned webhooks are rejected.
3. Optionally set `PLAID_WEBHOOK_SECRET` and send the same value as header `x-budget-webhook-secret` from a reverse proxy for defense-in-depth (Plaid itself does not send this header).
4. Confirm sandbox webhooks with a tunnel (ngrok) before production.

## 4. App env (Vercel)

```
PLAID_CLIENT_ID=...
PLAID_SECRET=...          # production secret
PLAID_ENV=production
PLAID_PRODUCTS=transactions,investments
PLAID_COUNTRY_CODES=US
PLAID_WEBHOOK_URL=https://YOUR_DOMAIN/api/plaid/webhook
TOKEN_ENCRYPTION_KEY=...  # long random; do not reuse sandbox
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN
ALLOWED_EMAILS=you@example.com,spouse@example.com
```

## 5. Robinhood

1. Confirm Robinhood is available under Investments for your Plaid client.
2. Link with a real Robinhood login in Development first, then Production.
3. Expect holdings + investment transactions (schema differs from bank transactions).

## 6. Go-live smoke test

1. Sign in with an allowlisted email.
2. Connect Chase (checking or credit) on Personal ledger → Sync → see transactions.
3. Connect Robinhood → see holdings on Dashboard / Accounts.
4. Switch to Business, connect or reassign an account, set budgets.
5. Invite spouse from Settings; accept invite on another browser/profile.
6. Disconnect an Item and confirm tokens are removed from Plaid (`item/remove`).

## 7. Ops

- Rotate Clerk and Plaid secrets if leaked.
- Monitor Plaid Item errors (`login_required`) on the Accounts page.
- Back up the Postgres database (Neon point-in-time recovery recommended).
