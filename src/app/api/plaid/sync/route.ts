import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncPlaidItem } from "@/lib/sync";
import { isPlaidConfigured } from "@/lib/plaid";

const bodySchema = z.object({
  plaidItemId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    if (!isPlaidConfigured()) {
      return NextResponse.json({ error: "Plaid is not configured" }, { status: 503 });
    }

    const { workspace } = await ensureUserAndWorkspace();
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
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("sync", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
