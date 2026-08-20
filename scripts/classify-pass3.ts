/**
 * Classify remaining personal Review transactions from statement uploads.
 * Family workspace only — never the demo.
 *
 * Usage: npx tsx scripts/classify-pass3.ts [--apply]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { defaultFundSlugForCategoryName } from "../src/lib/categories";

const APPLY = process.argv.includes("--apply");

const u = new URL(process.env.DATABASE_URL!);
u.searchParams.set("connection_limit", "3");
u.searchParams.set("pool_timeout", "60");
u.searchParams.set("connect_timeout", "30");
const prisma = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const PASS3: Array<{ re: RegExp; cat: string }> = [
  { re: /capital one\s+online pmt|atm withdrawal/i, cat: "Transfers" },
  { re: /purchase interest charge|\blate fee\b|annual membership fee/i, cat: "Other" },
  { re: /simple e tax|protect my ministry|texas\.gov|department of information resources|dispute adjustment/i, cat: "Other" },

  { re: /travelers\s+.*insur|per insur/i, cat: "Insurance" },
  { re: /stonebridge ranc assn|association dues/i, cat: "Housing" },

  { re: /brello|contact lens|csi laboratories|centennial asc|devilleneuve|fusion\s*family consult|fusionfamilyconsult|allergy and asthma|baylor scott|children'?s health|legacy er|oph - plano|hill dental|allen dental|sharkey'?s cuts|floyd'?s 99|soi brow|pin cushion/i, cat: "Healthcare" },
  { re: /animal hospital|cathy'?s critters/i, cat: "Pets" },

  { re: /pressure washing|leslie'?s pool|1-800-got-junk|got-junk|smallwoodhome|wayfair|john creel ac/i, cat: "Home Improvement" },

  { re: /collin vehreg|meineke|oil x[- ]?change|gulf\b|sunoco|murphy express|spothero|idg parking|laz parking|taxi service|miriam'?s auto/i, cat: "Transport" },

  { re: /great wolf|delta airlines|united express|booking\.com|primrose inn|chadwick bed|trapp family|trappfamilylodg|henry hotels|osib boston|wacopedaltours|newport mansions|coastal maine botanical|salemwitch|town of bar harbor|white mountains|americas natl parks|nhstateparks|best lockers|gwl grapevine|ric airp/i, cat: "Travel" },

  { re: /sprouts|central market|united supermarkets|honeyville|brazos valley cheese|cabot creamery|taylor food/i, cat: "Groceries" },

  { re: /\bintuit\b|\bcanva\b|yousician|playstation|nba league pass|oura ring|abcmouse|crunch mckinney|google \*x|google \* x|^google$|\bgoogle\b/i, cat: "Subscriptions" },

  { re: /cottonwood creek chur|zeffy|gofundme|cheddar ?up|scouting|girl scouts|american heart|gmf school fundraiser|comstockpta|allen isd council|calendar fundraiser|little village gifts/i, cat: "Gifts" },

  { re: /seatgeek|mckinney soccer|puttery|louisville slugger|epic sports|state fair|st fair tx|coupons-state fair|music & arts|nerdvana|stonebridge sc|oak hollow academy|hometown ticketing|six flags|topgolf|plano parks|point venture golf|scout shop|frisco roughriders|gotsoccer|rebecca ruth|marc robins|jake olson|frisco independent|i3v\*frisco|sol & sage/i, cat: "Entertainment" },

  { re: /skechers|tjmaxx|tj maxx|sephora|under armour|sur la table|shutterfly|aeropostale|maurices|bath & body|sierra trading|sample house|home team prints|school pack|earringsbye|half price books|hobby-lobby|sun and ski|paypal\s+inst xfer|sweethoney|cheeky plum|lou marks/i, cat: "Shopping" },

  { re: /myschoolbucks|schlpay|^allen\s+allen$/i, cat: "Dining" },
  { re: /zen hibachi|carrabba|cracker barrel|denny'?s|wendy'?s|maple street biscuit|bottle & bond|blackfriar|swig\b|silos baking|dillas|kona ice|pop'?s lemonade|nothing bundt|peach cobbler|zenna thai|kyoto sushi|wild eggs|andy'?s old port|andy'?s - the colony|happiest hour|burger boy|burger street|baja street|smallcakes|top catch|bavette|chop shop|stix icehouse|la chasse|boat house|hemenways|marker cellars|hy-life|bourbon academy|blue ostrich|waco waffle|gwl grapevine hungry|gwl grapevine magiques|jimmy dogs|bbq\b|the bench|the yard|sacred grounds|eddie deen|texas concessions|dfw tgif|fazoli|mi cocina|smoothie king|taco delite|arby'?s|kfc|sbarro|chicken express|sonic\b|pie bar|dr pepper soda|ben & jerry|aha donuts|kate weiser|clementine|flo'?s clam|portland beer|the brass tap|westham tavern|good view bar|great outdoor sub|legacy hall|tupelo honey|fuego tortilla|spice village|scotty ps|pinkitzel|little czech|oasis texas brew|oak highlands brew|dulce vida|andys treat|fun times at milo|86 commercial|casco variety|scoop dawg|chatham pier|frisco square peach|the american bottling|mr\. all worlds|greek lover|valerie'?s taco|dry rub|\bljs\b|vintage house|cicis|sweet cravings/i, cat: "Dining" },
];

async function main() {
  const ws = await prisma.workspace.findFirstOrThrow({ where: { name: "Family" } });
  const cats = await prisma.category.findMany({
    where: { workspaceId: ws.id, ledger: "personal" },
  });
  const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  const funds = await prisma.fund.findMany({
    where: { workspaceId: ws.id, ledger: "personal" },
    select: { id: true, slug: true },
  });
  const fundIdBySlug = Object.fromEntries(funds.map((f) => [f.slug, f.id]));

  const review = await prisma.transaction.findMany({
    where: {
      workspaceId: ws.id,
      ledger: "personal",
      category: { name: "Review" },
    },
    select: {
      id: true,
      name: true,
      merchantName: true,
      amount: true,
      fundSource: true,
    },
  });

  const byCat = new Map<string, string[]>();
  const samples = new Map<string, string[]>();
  const leftover: string[] = [];

  for (const tx of review) {
    const text = `${tx.merchantName || ""} ${tx.name}`;
    const hit = PASS3.find((p) => p.re.test(text));
    if (!hit || !catId[hit.cat]) {
      leftover.push(`${(tx.merchantName || tx.name).slice(0, 50)}  $${tx.amount.toFixed(0)}`);
      continue;
    }
    const list = byCat.get(hit.cat) ?? [];
    list.push(tx.id);
    byCat.set(hit.cat, list);
    const shown = samples.get(hit.cat) ?? [];
    if (shown.length < 4) {
      shown.push((tx.merchantName || tx.name).slice(0, 40));
      samples.set(hit.cat, shown);
    }
  }

  console.log(`personal Review: ${review.length}`);
  console.log(APPLY ? "APPLYING" : "DRY RUN (pass --apply to write)");
  let updated = 0;
  for (const [cat, ids] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${cat}: ${ids.length}  e.g. ${(samples.get(cat) ?? []).join(", ")}`);
    if (!APPLY) continue;
    const slug = defaultFundSlugForCategoryName(cat);
    const fundId = slug ? (fundIdBySlug[slug] ?? null) : null;
    const res = await prisma.transaction.updateMany({
      where: {
        id: { in: ids },
        OR: [{ fundSource: null }, { fundSource: { not: "user" } }],
      },
      data: {
        categoryId: catId[cat],
        categorySource: "user",
        fundId,
        fundSource: fundId ? "category" : null,
      },
    });
    const locked = await prisma.transaction.updateMany({
      where: { id: { in: ids }, fundSource: "user" },
      data: { categoryId: catId[cat], categorySource: "user" },
    });
    updated += res.count + locked.count;
  }
  if (APPLY) console.log(`updated ${updated}`);
  console.log(`left in Review: ${leftover.length}`);
  for (const row of leftover) console.log(`  ${row}`);
}

main().finally(() => prisma.$disconnect());
