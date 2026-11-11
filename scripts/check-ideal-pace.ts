/**
 * Sanity checks for mortgage-aware ideal pace + projected pace math.
 * Run: npx tsx scripts/check-ideal-pace.ts
 */
import {
  idealPaceAmount,
  projectedPaceAmount,
  spendPaceYDomain,
} from "../src/lib/spend-pace";

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
// Day-1 Actual far below mortgage floor (posts day 2) must NOT collapse to $0.
// Floor is Housing (~$3456), not all committed+reserves (~$6–10k).
{
  const housing = 3456;
  const [yMin, yMax] = spendPaceYDomain({
    budgetTotal: 14073,
    ideals: [housing + 50, 4000, 14073],
    actuals: [666.5, 4408.76, 7651],
    frontLoadedAmount: housing,
    elevateFloor: true,
  });
  assertClose(
    yMin,
    housing - Math.max(housing * 0.04, 25),
    "Y min near Housing mortgage, not full committed+reserves",
  );
  assertClose(yMax, 14073, "Y max at Family-scale ceiling");
  if (yMin > 4000) {
    throw new Error(`floor too high (looks like all-committed): ${yMin}`);
  }
  console.log(`ok  mortgage-only floor despite tiny day-1 actual: [${yMin}, ${yMax}]`);
}

// Projected pace: Flexible (no front-load) = classic daily burn.
{
  const daysElapsed = 10;
  const spent = 1000;
  assertClose(
    projectedPaceAmount({
      dayIndex: daysElapsed - 1,
      dayCount,
      daysElapsed,
      spentToDate: spent,
      frontLoadedAmount: 0,
    })!,
    spent,
    "projected meets actual on today (flexible)",
  );
  assertClose(
    projectedPaceAmount({
      dayIndex: dayCount - 1,
      dayCount,
      daysElapsed,
      spentToDate: spent,
      frontLoadedAmount: 0,
    })!,
    (spent * dayCount) / daysElapsed,
    "flexible month-end = spent × days / elapsed",
  );
  if (
    projectedPaceAmount({
      dayIndex: 0,
      dayCount,
      daysElapsed,
      spentToDate: spent,
    }) != null
  ) {
    throw new Error("projected should be null before today");
  }
  console.log("ok  projected null before today");
  if (
    projectedPaceAmount({
      dayIndex: 20,
      dayCount,
      daysElapsed: dayCount,
      spentToDate: spent,
    }) != null
  ) {
    throw new Error("projected should be null when month complete");
  }
  console.log("ok  projected null when month complete");
}

// All-funds: do NOT treat mortgage as daily burn.
{
  const daysElapsed = 11;
  const housing = 3456;
  const spent = 5646; // housing already in + ~2190 smooth
  const smooth = spent - housing;
  const monthEnd = housing + (smooth * dayCount) / daysElapsed;
  assertClose(
    projectedPaceAmount({
      dayIndex: daysElapsed - 1,
      dayCount,
      daysElapsed,
      spentToDate: spent,
      frontLoadedAmount: housing,
    })!,
    spent,
    "mortgage-aware projected meets actual today",
  );
  assertClose(
    projectedPaceAmount({
      dayIndex: dayCount - 1,
      dayCount,
      daysElapsed,
      spentToDate: spent,
      frontLoadedAmount: housing,
    })!,
    monthEnd,
    "mortgage-aware month-end = Housing + smooth × days/elapsed",
  );
  // Naive spent×days/elapsed would be ~15.4k; must stay well below that.
  const naive = (spent * dayCount) / daysElapsed;
  if (monthEnd >= naive - 1) {
    throw new Error(
      `mortgage-aware projection too high (${monthEnd}); looks like naive ${naive}`,
    );
  }
  console.log(
    `ok  mortgage-aware beats naive burn (${monthEnd.toFixed(0)} << ${naive.toFixed(0)})`,
  );
}

// Pre-mortgage day-1 Actual must not invent a burn rate.
{
  const daysElapsed = 1;
  const housing = 3456;
  const spent = 667;
  assertClose(
    projectedPaceAmount({
      dayIndex: dayCount - 1,
      dayCount,
      daysElapsed,
      spentToDate: spent,
      frontLoadedAmount: housing,
    })!,
    housing,
    "pre-mortgage projects to Housing floor, not 667×30",
  );
}

// Y max includes projected overshoot
{
  const [, yMax] = spendPaceYDomain({
    budgetTotal: 6000,
    ideals: [3100, 6000],
    actuals: [4000],
    projected: [4000, 12000],
    frontLoadedAmount: 3000,
    elevateFloor: true,
  });
  assertClose(yMax, 12000, "Y max includes projected month-end");
}

console.log("\nAll ideal-pace checks passed.");
