import { NextResponse } from "next/server";
import { z } from "zod";
import { assertNotDemo, ensureUserAndWorkspace } from "@/lib/auth";
import { handleApiError, rateLimitedResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { syncPlaidItem } from "@/lib/sync";
import { isPlaidConfigured } from "@/lib/plaid";

const bodySchema = z.object({
  plaidItemId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const limited = rateLimit(`plaid-sync:${clientIp(req)}`, 30, 60_000);
    if (!limited.ok) return rateLimitedResponse(limited.retryAfter);

    if (!isPlaidConfigured()) {
      return NextResponse.json({ error: "Plaid is not configured" }, { status: 503 });
    }

    const { workspace, isDemo } = await ensureUserAndWorkspace();
    assertNotDemo(isDemo);
    const body = bodySchema.parse(await req.json());

    const item = await prisma.plaidItem.findFirst({
      where: { id: body.plaidItemId, workspaceId: workspace.id },
    });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const result = await syncPlaidItem(item.id);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return handleApiError(err, "Sync failed");
  }
}
