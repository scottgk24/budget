import { NextResponse } from "next/server";
import { z } from "zod";
import { assertNotDemo, ensureUserAndWorkspace } from "@/lib/auth";
import { handleApiError, rateLimitedResponse } from "@/lib/api-response";
import { encryptToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getPlaidClient, isPlaidConfigured } from "@/lib/plaid";
import { syncPlaidItem } from "@/lib/sync";

const bodySchema = z.object({
  publicToken: z.string().min(1),
  ledger: z.enum(["personal", "business"]).default("personal"),
  institution: z
    .object({
      institution_id: z.string().optional(),
      name: z.string().optional(),
    })
    .nullable()
    .optional(),
  accounts: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        mask: z.string().nullable().optional(),
        type: z.string().optional(),
        subtype: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

export async function POST(req: Request) {
  try {
    const limited = rateLimit(`plaid-exchange:${clientIp(req)}`, 20, 60_000);
    if (!limited.ok) return rateLimitedResponse(limited.retryAfter);

    if (!isPlaidConfigured()) {
      return NextResponse.json({ error: "Plaid is not configured" }, { status: 503 });
    }

    const { workspace, isDemo } = await ensureUserAndWorkspace();
    assertNotDemo(isDemo);
    const body = bodySchema.parse(await req.json());
    const client = getPlaidClient();

    const exchange = await client.itemPublicTokenExchange({
      public_token: body.publicToken,
    });

    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const accountsRes = await client.accountsGet({ access_token: accessToken });
    const itemRes = await client.itemGet({ access_token: accessToken });
    const products = (itemRes.data.item.products ?? []).join(",") || "transactions";

    const plaidItem = await prisma.plaidItem.create({
      data: {
        workspaceId: workspace.id,
        itemId,
        accessTokenEnc: encryptToken(accessToken),
        institutionId: body.institution?.institution_id ?? itemRes.data.item.institution_id ?? null,
        institutionName: body.institution?.name ?? null,
        products,
        defaultLedger: body.ledger,
        status: "active",
      },
    });

    for (const acct of accountsRes.data.accounts) {
      await prisma.account.create({
        data: {
          workspaceId: workspace.id,
          plaidItemId: plaidItem.id,
          plaidAccountId: acct.account_id,
          name: acct.name,
          officialName: acct.official_name ?? null,
          mask: acct.mask ?? null,
          type: acct.type,
          subtype: acct.subtype ?? null,
          ledger: body.ledger,
          currentBalance: acct.balances.current ?? null,
          availableBalance: acct.balances.available ?? null,
          isoCurrencyCode: acct.balances.iso_currency_code ?? "USD",
        },
      });
    }

    try {
      await syncPlaidItem(plaidItem.id);
    } catch (syncErr) {
      console.error("initial sync failed", syncErr);
    }

    return NextResponse.json({
      itemId: plaidItem.id,
      accounts: accountsRes.data.accounts.length,
    });
  } catch (err) {
    return handleApiError(err, "Failed to connect account");
  }
}
