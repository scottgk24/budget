/**
 * Classify imported transactions using existing rules, learned merchant
 * patterns, and high-confidence heuristics. Uncertain → Review.
 *
 * Usage: npx tsx scripts/classify-imported.ts [--apply]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import {
  loadCategoryRules,
  matchRuleCategoryId,
} from "../src/lib/categorize";
import { normalizeMatchValue } from "../src/lib/categories";
import type { Ledger } from "../src/lib/types";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

type Decision = {
  id: string;
  name: string;
  ledger: string;
  from: string;
  to: string;
  reason: string;
  confidence: "high" | "medium" | "review";
};

/** High-confidence substring → category (personal). Longer keys checked first. */
const PERSONAL_HINTS: Array<{ re: RegExp; cat: string; reason: string }> = [
  // Income / transfers first
  { re: /federal reserve\s+payroll|allen independe.*payroll|payroll/i, cat: "Income", reason: "payroll" },
  { re: /interest payment|interest earned/i, cat: "Income", reason: "interest" },
  { re: /automatic payment|payment - thank|credit crd autopay|chase credit crd/i, cat: "Transfers", reason: "cc payment" },
  { re: /robinhood\s+debits|fid bkg svc|moneyline|online transfer|fidelity/i, cat: "Transfers", reason: "transfer/investment move" },
  { re: /trump account debits/i, cat: "Transfers", reason: "transfer" },
  { re: /credit card.*payment|instant balance payment/i, cat: "Transfers", reason: "card payment" },

  // Subscriptions
  { re: /\bnetflix\b/i, cat: "Subscriptions", reason: "streaming" },
  { re: /\bhbo max\b|\bmax\.com\b|\bwbd /i, cat: "Subscriptions", reason: "streaming" },
  { re: /\bdisney\b|\bhulu\b|\bparamount\b|\bpeacock\b|\bapple\.com\/bill\b|\bapple tv\b/i, cat: "Subscriptions", reason: "streaming" },
  { re: /\bamazon music\b|\bamazon prime video\b|\baudible\b/i, cat: "Subscriptions", reason: "amazon sub" },
  { re: /\bgoogle one\b|\bgoogle storage\b|\bgoogle\s*\*?\s*gsuite|\bgoogle workspace\b/i, cat: "Subscriptions", reason: "google sub" },
  { re: /\bcursor\b|\bopenai\b|\bchatgpt\b|\banthropic\b/i, cat: "Subscriptions", reason: "software sub" },
  { re: /\bcricut\b|\bbackblaze\b|\bcreativelive\b|\bzander\b|\bpura\.com\b|\btwitter\b|\bx\.com\b/i, cat: "Subscriptions", reason: "subscription" },
  { re: /\bred pocket\b|\bkami vision\b/i, cat: "Subscriptions", reason: "subscription/mobile" },

  // Utilities / housing
  { re: /coserv|electric|atmos|oncor|txu energy/i, cat: "Utilities", reason: "utility" },
  { re: /t-?mobile|at&t|att\b|verizon|spectrum|comcast|isp /i, cat: "Utilities", reason: "telecom" },
  { re: /city of mckinney|utility/i, cat: "Utilities", reason: "city utility" },
  { re: /rocket mortgage|mortgage/i, cat: "Housing", reason: "mortgage" },
  { re: /all-safe pest|pest\b/i, cat: "Home Improvement", reason: "pest control" },
  { re: /pinch a penny|pool /i, cat: "Home Improvement", reason: "pool supply" },
  { re: /lowe'?s|home depot|cititurf/i, cat: "Home Improvement", reason: "home improvement" },

  // Transport
  { re: /north texas tollway|ntta|tollway|toll\b/i, cat: "Transport", reason: "tolls" },
  { re: /\buber\b|\blyft\b/i, cat: "Transport", reason: "rideshare" },
  { re: /exxon|shell\b|racetrac|race trac|circle k|7 eleven|7-eleven|qt \d|maverik|conoco|pilot_|love'?s|marathon|allsup/i, cat: "Transport", reason: "gas/convenience" },
  { re: /carnation auto|car wash/i, cat: "Transport", reason: "auto" },

  // Groceries
  { re: /\bcostco\b|\bh-?e-?b\b|\bmarket street\b|\bhungryroot\b|\bheb\b|\bimprintp2\b|\bheb imprint\b/i, cat: "Groceries", reason: "grocery" },
  { re: /\bwalmart\b|\bwing aviation\b/i, cat: "Groceries", reason: "grocery (existing pattern)" },

  // Dining
  { re: /frb dallas cafe|mcdonald|sonic drive|twin peaks|braum|whataburger|domino|chick-fil|starbucks|panda express|taco bell|shipley|chuy|pizza|cafe|coffee|restaurant|wetzel|dutch bros|canes|raising cane|golden chick|brewery|golden block/i, cat: "Dining", reason: "dining" },
  { re: /schoolcafe/i, cat: "Dining", reason: "school meals" },

  // Shopping
  { re: /\bamazon\b|\bamzn\b/i, cat: "Shopping", reason: "amazon (existing pattern)" },
  { re: /hobby lobby|michaels|five below|kohl'?s|target\b|etsy|best buy|ikea|nordstrom|once upon a child|homesense|home goods|groupon|casely|crunchlabs|wmt plus|walmart\+/i, cat: "Shopping", reason: "retail" },
  { re: /\busps\b|united states postal|fedex|ups store/i, cat: "Shopping", reason: "shipping/postage" },

  // Healthcare
  { re: /pharmacy|walgreens|cvs|orthodont|sigoda|texashealth|texas health|cook children|auvi|pl pharmacy|pediatric|dentistry|dentist|anesthe/i, cat: "Healthcare", reason: "healthcare" },

  // Entertainment / travel
  { re: /seaworld|apexcentre|scoggins|purgatory|magic springs|movie|amc |cinemark|stadium|world cup|performing arts|soccer association|smarte ?carte/i, cat: "Entertainment", reason: "entertainment" },
  { re: /\bviator\b|\bvrbo\b|\bvacasa\b|\bairbnb\b|\bhotel\b|\bmarriott\b|\bhilton\b/i, cat: "Travel", reason: "travel" },

  // Insurance
  { re: /lincoln nation|allstate|state farm|geico|insurance/i, cat: "Insurance", reason: "insurance" },
];

const BUSINESS_HINTS: Array<{ re: RegExp; cat: string; reason: string }> = [
  { re: /facebk|facebook|busrask|bushra/i, cat: "Marketing", reason: "ads" },
  { re: /adobe|honeybook|pictime|pic-time|backblaze|porkbun|google workspace|gsuite_porchli|evoto/i, cat: "Software", reason: "software" },
  { re: /mpb|uprint|backdrop|avezano|luneberry|hello little|newborn|hobby lobby|etsy|homesense|manly/i, cat: "Supplies", reason: "supplies" },
  { re: /automatic payment|online transfer|payment - thank/i, cat: "Transfers", reason: "transfer" },
];

function pickHint(
  text: string,
  hints: Array<{ re: RegExp; cat: string; reason: string }>,
): { cat: string; reason: string } | null {
  for (const h of hints) {
    if (h.re.test(text)) return { cat: h.cat, reason: h.reason };
  }
  return null;
}

async function main() {
  const ws = await prisma.workspace.findFirstOrThrow({ where: { name: "Family" } });
  const wid = ws.id;

  const categories = await prisma.category.findMany({ where: { workspaceId: wid } });
  const catId = (ledger: string, name: string) =>
    categories.find((c) => c.ledger === ledger && c.name === name)?.id;

  const personalRules = await loadCategoryRules(wid, "personal");
  const businessRules = await loadCategoryRules(wid, "business");

  // Learn from non-imported classified txs
  const classified = await prisma.transaction.findMany({
    where: {
      workspaceId: wid,
      categoryId: { not: null },
      category: { name: { notIn: ["Other", "Review"] } },
      NOT: [
        { plaidTransactionId: { startsWith: "export:" } },
        { plaidTransactionId: { startsWith: "rhcc-export:" } },
      ],
    },
    select: {
      name: true,
      merchantName: true,
      ledger: true,
      category: { select: { name: true } },
    },
  });

  const learned = new Map<string, { cat: string; n: number }>();
  const voteBuckets = new Map<string, Map<string, number>>();
  for (const t of classified) {
    const key = normalizeMatchValue(t.merchantName || t.name).slice(0, 36);
    if (key.length < 4) continue;
    const lk = `${t.ledger}|${key}`;
    if (!voteBuckets.has(lk)) voteBuckets.set(lk, new Map());
    const m = voteBuckets.get(lk)!;
    const cat = t.category!.name;
    m.set(cat, (m.get(cat) || 0) + 1);
  }
  for (const [lk, m] of voteBuckets) {
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const [cat, n] = sorted[0];
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    if (n >= 2 && n / total >= 0.7) learned.set(lk, { cat, n });
  }

  // Prefix index for soft learned match
  function learnedCat(ledger: string, merchant: string | null, name: string): string | null {
    const key = normalizeMatchValue(merchant || name).slice(0, 36);
    const exact = learned.get(`${ledger}|${key}`);
    if (exact) return exact.cat;
    // try shorter prefixes of learned keys contained in this key / vice versa
    let best: { cat: string; n: number; len: number } | null = null;
    for (const [lk, v] of learned) {
      if (!lk.startsWith(`${ledger}|`)) continue;
      const mk = lk.slice(ledger.length + 1);
      if (mk.length < 5) continue;
      if (key.includes(mk) || mk.includes(key)) {
        if (!best || v.n > best.n || (v.n === best.n && mk.length > best.len)) {
          best = { cat: v.cat, n: v.n, len: mk.length };
        }
      }
    }
    return best && best.n >= 3 ? best.cat : null;
  }

  const imported = await prisma.transaction.findMany({
    where: {
      workspaceId: wid,
      OR: [
        { plaidTransactionId: { startsWith: "export:" } },
        { plaidTransactionId: { startsWith: "rhcc-export:" } },
      ],
    },
    include: { category: { select: { name: true } } },
  });

  const decisions: Decision[] = [];
  let skipLocked = 0;

  for (const tx of imported) {
    const current = tx.category?.name ?? "(none)";
    // Leave intentional non-Other user locks (Porchlight business classifications etc.)
    if (
      tx.categorySource === "user" &&
      current !== "Other" &&
      current !== "Review" &&
      current !== "(none)"
    ) {
      skipLocked++;
      continue;
    }
    // Only rework Other / Review / none (and rule-assigned Other)
    if (current !== "Other" && current !== "Review" && current !== "(none)") {
      // Also fix known bad autopay→Shopping if from import rule application
      const text = `${tx.merchantName || ""} ${tx.name}`;
      if (!/chase credit crd autopay|automatic payment|federal reserve.*payroll|allen independe.*payroll/i.test(text)) {
        continue;
      }
    }

    const ledger = tx.ledger as Ledger;
    const rules = ledger === "business" ? businessRules : personalRules;
    const text = `${tx.merchantName || ""} ${tx.name}`;

    let to: string | null = null;
    let reason = "";
    let confidence: Decision["confidence"] = "review";

    // 1) Existing rules
    const ruleId = matchRuleCategoryId(rules, tx.merchantName, tx.name);
    if (ruleId) {
      const cat = categories.find((c) => c.id === ruleId);
      if (cat && cat.name !== "Other") {
        to = cat.name;
        reason = "existing rule";
        confidence = "high";
      }
    }

    // 2) Learned patterns
    if (!to) {
      const lc = learnedCat(ledger, tx.merchantName, tx.name);
      if (lc) {
        to = lc;
        reason = "learned from your classifications";
        confidence = "high";
      }
    }

    // 3) Heuristics
    if (!to) {
      const hints = ledger === "business" ? BUSINESS_HINTS : PERSONAL_HINTS;
      const hit = pickHint(text, hints);
      if (hit) {
        // Walgreens matched Healthcare after Shopping in list - check order.
        // Pharmacy keywords in Healthcare pattern also include walgreens - PERSONAL_HINTS has walgreens in Shopping first.
        // Fix: for walgreens/cvs prefer Healthcare
        if (/walgreens|cvs\b/i.test(text)) {
          to = "Healthcare";
          reason = "pharmacy";
          confidence = "high";
        } else {
          to = hit.cat;
          reason = hit.reason;
          confidence = "high";
        }
      }
    }

    // 4) Ambiguous → Review
    if (!to) {
      // Clear income-like credits on personal
      if (ledger === "personal" && tx.amount < 0 && /zelle|venmo/i.test(text)) {
        to = "Review";
        reason = "peer payment — income or transfer?";
        confidence = "review";
      } else if (/zelle|venmo|paypal|cash app/i.test(text)) {
        to = "Review";
        reason = "peer payment — needs your call";
        confidence = "review";
      } else if (/check #|check\s+\d/i.test(text)) {
        to = "Review";
        reason = "check — unknown payee";
        confidence = "review";
      } else {
        to = "Review";
        reason = "no confident match";
        confidence = "review";
      }
    }

    // Validate category exists for ledger
    const id = catId(ledger, to);
    if (!id) {
      to = "Review";
      reason = `missing category ${to} on ${ledger}`;
      confidence = "review";
    }

    if (to === current && confidence !== "review") continue;
    // Always move Other → Review even if "same uncertainty" helps user filter
    if (to === current && to === "Review") continue;

    decisions.push({
      id: tx.id,
      name: tx.name.slice(0, 60),
      ledger,
      from: current,
      to,
      reason,
      confidence,
    });
  }

  const byTo: Record<string, number> = {};
  const byConf: Record<string, number> = {};
  for (const d of decisions) {
    byTo[d.to] = (byTo[d.to] || 0) + 1;
    byConf[d.confidence] = (byConf[d.confidence] || 0) + 1;
  }

  console.log(`Imported scanned: ${imported.length}`);
  console.log(`Skipped locked non-Other: ${skipLocked}`);
  console.log(`To update: ${decisions.length}`);
  console.log("By confidence:", byConf);
  console.log("By target category:", byTo);

  console.log("\nSample HIGH:");
  for (const d of decisions.filter((x) => x.confidence === "high").slice(0, 25)) {
    console.log(`  ${d.from} → ${d.to} | ${d.name} (${d.reason})`);
  }
  console.log("\nSample REVIEW:");
  for (const d of decisions.filter((x) => x.confidence === "review").slice(0, 25)) {
    console.log(`  ${d.from} → ${d.to} | ${d.name} (${d.reason})`);
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write.");
    return;
  }

  let updated = 0;
  for (const d of decisions) {
    const categoryId = catId(d.ledger, d.to);
    if (!categoryId) continue;
    await prisma.transaction.update({
      where: { id: d.id },
      data: {
        categoryId,
        categorySource: d.confidence === "review" ? "user" : "user",
        // keep notes; optionally tag
      },
    });
    updated++;
  }
  console.log(`\nApplied updates: ${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
