import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureUserAndWorkspace, requireOwner } from "@/lib/auth";
import { handleApiError, rateLimitedResponse } from "@/lib/api-response";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  getPlaidClient,
  getPlaidCountryCodes,
  getPlaidProducts,
  isPlaidConfigured,
} from "@/lib/plaid";
import { CountryCode, Products } from "plaid";

const bodySchema = z.object({
  ledger: z.enum(["personal", "business"]).default("personal"),
});

export async function POST(req: Request) {
  try {
    const limited = rateLimit(`plaid-link:${clientIp(req)}`, 20, 60_000);
    if (!limited.ok) return rateLimitedResponse(limited.retryAfter);

    if (!isPlaidConfigured()) {
      return NextResponse.json(
        {
          error:
            "Plaid is not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to your environment.",
        },
        { status: 503 },
      );
    }

    const { user, workspace, membership } = await ensureUserAndWorkspace();
    requireOwner(membership.role);
    const json = await req.json().catch(() => ({}));
    bodySchema.parse(json);

    const client = getPlaidClient();
    const products = getPlaidProducts();
    const countryCodes = getPlaidCountryCodes();
    const webhook = process.env.PLAID_WEBHOOK_URL || undefined;

    const response = await client.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "SAGE",
      products: products.length ? products : [Products.Transactions, Products.Investments],
      country_codes: countryCodes.length ? countryCodes : [CountryCode.Us],
      language: "en",
      webhook,
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
      // Max Plaid allows. Only applies on first link of an Item — reconnect to change.
      transactions: { days_requested: 730 },
    });

    void workspace;

    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (err) {
    return handleApiError(err, "Failed to create link token");
  }
}
