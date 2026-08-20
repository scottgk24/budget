# SAGE QA checklists

Use with [SKILL.md](SKILL.md). Only the items that apply to the current diff.

## Product intent

SAGE is a **private** household + sole-proprietorship budget. Connect Chase and Robinhood via Plaid, track **Personal** vs **Business** ledgers, share with invited family. It is not a public consumer bank app.

| Surface | Intent |
|---------|--------|
| `/` | Marketing landing; signed-in users go to dashboard |
| `/demo/*` | Public sample workspace; no bank link, no invites |
| `/dashboard` | Snapshot of spend, budgets, review queue |
| `/transactions` | Categorize, ledger-assign, search/filter |
| `/budgets` | Period budgets vs actuals |
| `/accounts` | Linked accounts; disconnect fails closed |
| `/recurring` | Recurring spend patterns |
| `/reports` | Trends and breakdowns |
| `/goals` | Savings/payoff targets |
| `/settings` | Workspace, invites (owners), member access |
| `/setup` | Local Clerk-not-configured onboarding |
| `/invite/[token]` | Accept invite; email must match |
| `/api/plaid/*` | Link token, exchange, sync, webhook |
| `/brand` | Internal brand gallery |

## Security

- No secrets, `.env`, Plaid `access_token` plaintext, or `TOKEN_ENCRYPTION_KEY` in the diff.
- Bank passwords never collected in-app; only Plaid Link / OAuth.
- Plaid tokens encrypted at rest (`src/lib/crypto.ts`); placeholders rejected.
- `/api/*` (except public webhook + demo entry) require Clerk session or valid demo cookie.
- `assertNotDemo` on link/invite/destructive bank actions.
- Webhook `/api/plaid/webhook`: Plaid JWT verification; do not weaken.
- Production `ALLOWED_EMAILS` empty ⇒ invite-only, not open signup.
- Owners-only invite create/revoke. Rate limits on invite create/accept.
- Zod on mutating APIs; `handleApiError` must not echo upstream errors.
- Keep `next.config.ts` security headers (frame deny, nosniff, referrer, permissions, COOP).
- No ACH, transfers, or bill-pay products.
- Disconnect: fail closed if Plaid `item/remove` fails.
- `NEXT_PUBLIC_*` must not expose server secrets.

## UX / UI

- Forest theme tokens only; gold for primary actions and highlights.
- Page titles: `PageHeader` + `font-display`. Body/UI: Outfit sans.
- Primary buttons: `--accent` on `--on-accent`. Destructive: `--danger`.
- Loading, empty, and error states on new data views.
- Privacy mode hides amounts wherever new money UI is added.
- Mobile: drawer nav, no horizontal overflow, tap targets ≥ ~40px on new controls.
- Charts readable on `--surface` (Recharts); legends/tooltips use theme colors.
- Demo: persistent banner; copy must not imply the user is in a real workspace.
