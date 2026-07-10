import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { syncPlaidItem } from "@/lib/sync";

/**
 * Plaid webhook receiver.
 * In production, verify JWT signatures per https://plaid.com/docs/api/webhooks/webhook-verification/
 * We verify a shared secret header when PLAID_WEBHOOK_SECRET is set, and always
 * look up the Item by plaid item_id before syncing.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const secret = process.env.PLAID_WEBHOOK_SECRET;

    if (secret) {
      const provided = req.headers.get("x-budget-webhook-secret") ?? "";
      const expected = createHash("sha256").update(secret).digest("hex");
      const got = createHash("sha256").update(provided).digest("hex");
      if (expected !== got) {
        return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
      }
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
      "DEFAULT_UPDATE",
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
