import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { getPlaidClient, getPlaidCountryCodes, getPlaidProducts, isPlaidConfigured } from "@/lib/plaid";
import { CountryCode, Products } from "plaid";

const bodySchema = z.object({
  ledger: z.enum(["personal", "business"]).default("personal"),
});

export async function POST(req: Request) {
  try {
    if (!isPlaidConfigured()) {
      return NextResponse.json(
        {
          error:
            "Plaid is not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to your environment.",
        },
        { status: 503 },
      );
    }

    const { user, workspace } = await ensureUserAndWorkspace();
    const json = await req.json().catch(() => ({}));
    bodySchema.parse(json);

    const client = getPlaidClient();
    const products = getPlaidProducts();
    const countryCodes = getPlaidCountryCodes();
    const webhook = process.env.PLAID_WEBHOOK_URL || undefined;

    const response = await client.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "Budget",
      products: products.length ? products : [Products.Transactions, Products.Investments],
      country_codes: countryCodes.length ? countryCodes : [CountryCode.Us],
      language: "en",
      webhook,
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
    });

    // Attach workspace id in client metadata via products only — ledger is sent on exchange
    void workspace;

    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("create-link-token", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create link token" },
      { status: 500 },
    );
  }
}
