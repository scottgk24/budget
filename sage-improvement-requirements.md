# SAGE improvement requirements

Hand this to Cursor as the spec. Repo: `scottgk24/budget` (SAGE). Live app: https://budget-nu-lyart.vercel.app/

These come from using the signed-in household workspace on 2026-08-21, then checking the code. Personal and Business **are** separate ledgers. Do not "merge" or "dedupe" the two views. The earlier clone critique was wrong.

## Product facts (do not regress)

- Every account, transaction, category, and budget is tagged `personal | business`.
- Dashboard already refetches `/api/dashboard?ledger=` and `/api/metrics?ledger=`.
- Recurring API already filters: `/api/recurring?ledger=`.
- Personal has the envelope/fund system (committed / flexible / reserves). Business does not. Business copy is cash flow / revenue / profit / limits.
- Personal default categories ≠ business default categories (`src/lib/categories.ts`).
- `Fund` is personal-only (`src/lib/funds.ts`).
- **MVP account set is savings, checking, and credit cards.** Mortgage, loans, and additional investment accounts are a later slice. Do not build those in this pass. Existing linked accounts (including any already-connected brokerage/crypto) may be displayed more honestly; do not add new account types or manual liability entry.

## Observed bugs to fix

1. **Stale ledger paint.** `LedgerProvider` (`src/components/ledger-context.tsx`) is client `localStorage` only. Ledger is **not** in the URL. Pages keep the previous payload in React state and render it under the new ledger’s title until the fetch returns (~1s). Pattern: `loading && !data ? skeleton : data` — after the first load, `data` is never cleared, so a toggle shows Personal $143k as Business “Cash on hand.” Same symptom on Recurring (Rocket Mortgage / Netflix appear under Business even though August Business only has 6 transactions). A screenshot or agent taken too early records the wrong ledger.
2. **Recurring `nextDate` can be in the past.** `detectRecurring` (`src/lib/recurring.ts`) adds one cadence step to `lastDate`. Yearly items last charged in 2025 still show next dates in 2025 (Amazon Prime, Creativelive, Zander).
3. **Holdings list duplicates cash.** Personal holdings showed `CUR:USD $72,482.06` twice (49% + 49% on the allocation pie) plus a $0 GOEVQ row. Fix display of holdings that already exist. Do not add new investment account linking.
4. **Headline numbers fight each other.** Personal dashboard net Balance folds credit cards into one number. “Free to spend” can read ~$4.5k while Budgets shows Shopping $1.8k over and Flexible left −$8.4k. August 21 showed one Fed paycheck ($3,494) with no “month incomplete” cue.
5. **Review queue ages into wallpaper.** Personal bell had 8 items back to May 2025/2026; nothing distinguishes “this week” from leftovers.
6. **Business Limits is empty.** Business August had real spend (Software $529, Marketing $100) but Expense limits said “No categories yet.”

---

## Goals

1. A ledger switch or refresh must never show the other ledger’s numbers.
2. Recurring dates and existing holdings must be true.
3. The Personal dashboard’s first row must be an honest picture of **already-linked** savings, checking, and credit cards (cash vs cards vs net), plus whether the month’s income is incomplete.
4. Business Limits should be usable without a blank state when categories/spend already exist.

## Non-goals

- Do not collapse Personal and Business into one ledger.
- Do not auto-pay or move money.
- Do not redesign the landing page or brand.
- Do not change Plaid connect / encryption / Clerk auth model.
- **Do not take Clerk out of Development mode.** That stays as-is.
- **Do not add mortgage, loans, or new investment/brokerage account types.** Those come later. Recurring may still *detect* a Rocket Mortgage payment as a bill; do not turn that into a balance-sheet liability in this pass.
- Do not add manual liability / manual account entry.
- Do not invent a Dave Ramsey “baby steps” product surface unless a requirement below says so.

---

## Requirements

### R1 — Ledger-safe rendering (P0)

**Problem:** Toggle or first paint renders ledger A data under ledger B chrome.

**Must**

- Treat a ledger change as a new page of data. Clear or isolate the previous ledger’s dashboard, metrics, transactions, budgets, accounts, recurring, reports, and review-queue payloads before or as the new request starts.
- While the new ledger is loading, show a skeleton / “Loading…” — never the previous ledger’s KPIs, tables, or charts under the new title (`Cash flow` / `Business · …`).
- Put ledger in the URL (query or path). Refresh, back, and share must open the same ledger. `localStorage` may still remember last used, but URL wins when present.
- All client fetches that already take `ledger` must keep doing so. Any page that does not pass it must start.

**Acceptance**

- Flip Personal → Business on `/dashboard` and take a screenshot at 0ms and at 200ms. The 200ms frame must not show Personal Balance / Flexible / Income / Free-to-spend values under “Cash flow.”
- Business settled cash-on-hand in this workspace is hundreds of dollars, not ~$143k. After load, Business must not show Personal holdings (Robinhood CUR:USD / BTC).
- `/recurring` on Business must not list Rocket Mortgage, Netflix, City of McKinney, or other Personal-only merchants unless those transactions are actually tagged `ledger=business`.
- Reloading a Business URL lands on Business without a Personal flash.

**Likely files:** `src/components/ledger-context.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/recurring/page.tsx`, other `(app)` pages using `useLedger`.

### R2 — Recurring next date is the next future occurrence (P0)

**Must**

- `nextDate` is the first occurrence **on or after today** (workspace local date), not last + one period if that is still in the past.
- Yearly / quarterly items keep rolling forward.
- “Still due this month” and the month calendar use the same rule. Past-due in the current month can still show as due; dates in prior years must not.

**Acceptance**

- A yearly charge last seen 2025-10-01, viewed on 2026-08-21, shows next 2026-10-01 (or the next unpaid future date), not 2025-10-01.
- Monthly items whose next step is still this month stay this month.

**Likely files:** `src/lib/recurring.ts` (`nextOccurrence`, `detectRecurring`).

### R3 — Holdings are unique and hide dust (P1)

Applies only to holdings **already returned** by linked accounts. Do not add investment-account linking or new account types.

**Must**

- Do not list the same cash/currency holding twice (the `CUR:USD` double row at ~$72,482).
- $0 / worthless lots (e.g. GOEVQ) do not appear in the list or the allocation pie unless the user opts into “show zero lots.”
- Allocation percents add to ~100% with no doubled cash slice.

**Acceptance**

- Personal holdings show one USD cash row and BTC. Pie is two slices, not 49/49/0.

**Likely files:** dashboard holdings mapping in `src/app/api/dashboard/route.ts`, holdings UI in `src/app/(app)/dashboard/page.tsx`. Investigate whether Plaid returns two USD securities for the same already-linked Robinhood account.

### R4 — Honest Personal headline numbers (P1)

Dashboard first row today is one net **Balance** (assets minus cards). That hid ~$13k credit-card debt inside the net.

MVP scope: **savings, checking, credit cards** already linked. Split those. Do not add a mortgage/loan line or prompt the user to link more investment accounts.

**Must**

- Personal dashboard shows, at minimum:
  - **Cash** (depository: checking + savings; include other already-linked asset balances in this bucket or a clearly labeled “also linked” total — do not require new account types)
  - **Credit cards** (credit liabilities, as a positive “owe” amount)
  - **Net** (what Balance is today)
- Do not replace the envelope cards (Flexible / Income / Free to spend). Add the split; don’t hide the envelopes.
- If this month’s posted Income is far below the trailing 3-month monthly average (e.g. only one of two paychecks), show a short cue: month incomplete, not a collapsed income story. Do not invent a second paycheck. Use existing posted Income vs recent months.

**Acceptance**

- With current linked checking, savings, and credit cards, the user can see cash, cards owed, and net without opening Accounts.
- On the 21st of a month with one ~$3.5k paycheck vs ~$6–7k trailing monthly income, the income card does not look like income collapsed.
- No empty “Mortgage” or “Add a loan” CTA.

**Likely files:** `src/lib/accounts.ts` (`sumNetBalances`, `isLiabilityAccountType`), `src/app/api/dashboard/route.ts`, dashboard KPI grid.

### R5 — Free-to-spend cannot contradict Budgets (P1)

**Must**

- If Flexible is overspent this month (Budgets “Flexible left” negative, or uncovered flexible overspend in `computeFundMonth`), the dashboard must not present a large positive “Free to spend” as if the month is fine.
- Either:
  - Free-to-spend is `max(0, leftover flexible after overspend)`, or
  - Keep the pace number but pair it with the overspend (e.g. “Flexible over by $X”) so the two pages agree.
- Shopping $2,363 vs $500 budget and “Free to spend $4,544” must not appear together with no explanation.

**Acceptance**

- On the 2026-08 Personal books (Shopping over, Home reserve over, Flexible left negative), Dashboard and Budgets tell the same story about leftover flexible money.

**Likely files:** `spendPace` / `freeToSpend` in `src/app/api/dashboard/route.ts`, `src/lib/funds.ts`, `src/lib/reports.ts` (`buildSpendPace`).

### R6 — Review queue is time-aware (P2)

**Must**

- Queue is sorted newest-first.
- Items older than 30 days are in a collapsed “Older” group (count visible, not in the badge by default) **or** the badge is “N this month” with older available.
- Do not auto-categorize. Just stop treating May leftovers like today’s work.

**Acceptance**

- Badge is not 8 when 5 of those are from May–June. Opening the queue still lets the user clear old ones.

**Likely files:** `src/components/review-queue-widget.tsx`, `src/app/api/review-queue`.

### R7 — Business Limits blank state (P2)

**Must**

- Workspace setup / first Business visit ensures default **business** categories exist (`BUSINESS_CATEGORIES` in `src/lib/categories.ts`), same as Personal categories are seeded.
- Limits page lists those categories even at $0 limit, not “No categories yet,” when the ledger has categories or spend.
- Do not copy Personal envelope groups (Committed / Flexible / Home) onto Business.

**Acceptance**

- Business Limits shows Software, Marketing, Contractors, Meals, Office, etc. User can set a limit without creating categories by hand.

### R8 — Top merchants on Personal dashboard (P2, small)

Reports already has top merchants (Amazon $14k / 315 tx over 6 months). That leak is the useful story and is buried.

**Must**

- Personal dashboard (or the existing Reports deep-link) surfaces top 3 merchants for the selected metrics range.
- Clicking a merchant opens Transactions filtered to that merchant if a filter already exists; otherwise link to Reports.

---

## Later (explicitly out of this pass)

- Mortgage / loans on the balance sheet (Rocket Mortgage stays a recurring Housing bill only).
- Additional investment account linking and a dedicated investments product surface.
- Manual account or manual liability entry.
- Clerk production mode.

## Suggested build order

1. R1 (stops the app from lying on toggle; unblocks every later visual QA)
2. R2, R3 (correctness)
3. R4, R5 (honest Personal home for checking / savings / cards)
4. R7, R6, R8

## Test plan

- Toggle Personal ↔ Business on Dashboard, Transactions, Budgets/Limits, Accounts, Recurring, Reports. No stale numbers under the wrong title.
- Hard refresh on a Business URL; lands on Business.
- Recurring next dates ≥ today for yearly items last seen last year.
- Holdings already on the dashboard: one USD cash row; pie sums to ~100%; no $0 dust. No new “link brokerage” flow.
- Personal KPI row: cash, credit cards, net visible; incomplete-month copy when income is half of recent average. No mortgage row.
- Overspent Flexible month: Dashboard does not look healthier than Budgets.
- New workspace / Business Limits: default business categories present.
