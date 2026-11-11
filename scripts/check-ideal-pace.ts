/**
 * Sanity checks for mortgage-aware ideal pace math.
 * Run: npx tsx scripts/check-ideal-pace.ts
 */
import { idealPaceAmount } from "../src/lib/spend-pace";

function assertClose(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.011) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`ok  ${label}: ${actual}`);
}

const dayCount = 30;
const mortgage = 3000;
const flexible = 3000;
const budgetTotal = mortgage + flexible;

// Day 1 (index 0): full mortgage + 1/30 flexible
assertClose(
  idealPaceAmount({
    dayIndex: 0,
    dayCount,
    budgetTotal,
    frontLoadedAmount: mortgage,
  }),
  mortgage + flexible / dayCount,
  "day 1 with mortgage front-load",
);

// Mid-month: mortgage + half flexible
assertClose(
  idealPaceAmount({
    dayIndex: 14,
    dayCount,
    budgetTotal,
    frontLoadedAmount: mortgage,
  }),
  mortgage + (flexible * 15) / dayCount,
  "day 15 with mortgage front-load",
);

// Month end: full budget
assertClose(
  idealPaceAmount({
    dayIndex: 29,
    dayCount,
    budgetTotal,
    frontLoadedAmount: mortgage,
  }),
  budgetTotal,
  "day 30 with mortgage front-load",
);

// Classic even burn (no front-load) still works
assertClose(
  idealPaceAmount({
    dayIndex: 0,
    dayCount,
    budgetTotal,
    frontLoadedAmount: 0,
  }),
  budgetTotal / dayCount,
  "day 1 even burn",
);

// Committed-only: flat ideal at ceiling
assertClose(
  idealPaceAmount({
    dayIndex: 0,
    dayCount,
    budgetTotal: mortgage,
    frontLoadedAmount: mortgage,
  }),
  mortgage,
  "committed flat day 1",
);
assertClose(
  idealPaceAmount({
    dayIndex: 29,
    dayCount,
    budgetTotal: mortgage,
    frontLoadedAmount: mortgage,
  }),
  mortgage,
  "committed flat day 30",
);

console.log("\nAll ideal-pace checks passed.");
