import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  verifyOptionalWebhookSecret,
  verifyPlaidWebhookJwt,
} from "@/lib/plaid-webhook";
import { isPlaidConfigured } from "@/lib/plaid";
import { syncPlaidItem } from "@/lib/sync";

/**
 * Plaid webhook receiver.
 * Requires Plaid-Verification JWT (ES256) + body hash.
 * Optional PLAID_WEBHOOK_SECRET as defense-in-depth via x-budget-webhook-secret.
 * @see https://plaid.com/docs/api/webhooks/webhook-verification/
 */
export async function POST(req: Request) {
  try {
    const limited = rateLimit(`webhook:${clientIp(req)}`, 60, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    if (!isPlaidConfigured()) {
      return NextResponse.json({ error: "Plaid not configured" }, { status: 503 });
    }

    const raw = await req.text();

    if (!verifyOptionalWebhookSecret(req.headers.get("x-budget-webhook-secret"))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jwtOk = await verifyPlaidWebhookJwt(
      raw,
      req.headers.get("plaid-verification"),
    );
    if (!jwtOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = JSON.parse(raw) as {
      webhook_type?: string;
      webhook_code?: string;
      item_id?: string;
      error?: { error_code?: string } | null;
    };

    if (!body.item_id) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const item = await prisma.plaidItem.findUnique({
      where: { itemId: body.item_id },
    });

    if (!item) {
      return NextResponse.json({ ok: true, unknownItem: true });
    }

    if (body.error?.error_code) {
      await prisma.plaidItem.update({
        where: { id: item.id },
        data: {
          status: "error",
          errorCode: body.error.error_code,
        },
      });
    }

    const syncCodes = new Set([
      "SYNC_UPDATES_AVAILABLE",
      "DEFAULT_UPDATE",
      "HISTORICAL_UPDATE",
      "INITIAL_UPDATE",
      "TRANSACTIONS_REMOVED",
    ]);

    if (body.webhook_code && syncCodes.has(body.webhook_code)) {
      await syncPlaidItem(item.id);
    }

    if (body.webhook_code === "ITEM_LOGIN_REQUIRED") {
      await prisma.plaidItem.update({
        where: { id: item.id },
        data: { status: "login_required", errorCode: "ITEM_LOGIN_REQUIRED" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("plaid webhook", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
