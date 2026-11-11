/**
 * Sanity checks for mortgage-aware ideal pace math.
 * Run: npx tsx scripts/check-ideal-pace.ts
 */
import { idealPaceAmount, spendPaceYDomain } from "../src/lib/spend-pace";

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

// Y-axis: elevate only when asked (All-funds); otherwise $0
{
  const [y0] = spendPaceYDomain({
    budgetTotal: 6000,
    ideals: [3100, 3200],
    actuals: [3100, 3200],
    frontLoadedAmount: 3000,
    elevateFloor: false,
  });
  assertClose(y0, 0, "Y min stays 0 without elevateFloor");
}
{
  const [yMin, yMax] = spendPaceYDomain({
    budgetTotal: 6000,
    ideals: [3100, 4500, 6000],
    actuals: [3100, 4200],
    frontLoadedAmount: 3000,
    elevateFloor: true,
  });
  if (!(yMin > 2000 && yMin < 3000)) {
    throw new Error(`elevated Y min expected near mortgage floor, got ${yMin}`);
  }
  assertClose(yMax, 6000, "Y max at budget ceiling");
  console.log(`ok  elevated Y domain: [${yMin}, ${yMax}]`);
}

console.log("\nAll ideal-pace checks passed.");
