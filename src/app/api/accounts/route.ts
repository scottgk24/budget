import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { decryptToken } from "@/lib/crypto";
import { getPlaidClient, isPlaidConfigured } from "@/lib/plaid";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = searchParams.get("ledger") as "personal" | "business" | null;

    const accounts = await prisma.account.findMany({
      where: {
        workspaceId: workspace.id,
        isHidden: false,
        ...(ledger === "personal" || ledger === "business" ? { ledger } : {}),
      },
      include: {
        plaidItem: {
          select: {
            id: true,
            institutionName: true,
            status: true,
            lastSyncedAt: true,
            errorCode: true,
            products: true,
          },
        },
        holdings: true,
      },
      orderBy: { name: "asc" },
    });

    const items = await prisma.plaidItem.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      accounts,
      items: items.map((i) => ({
        id: i.id,
        institutionName: i.institutionName,
        status: i.status,
        lastSyncedAt: i.lastSyncedAt,
        errorCode: i.errorCode,
        products: i.products,
        defaultLedger: i.defaultLedger,
      })),
      plaidConfigured: isPlaidConfigured(),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load accounts");
  }
}

const patchSchema = z.object({
  id: z.string(),
  ledger: z.enum(["personal", "business"]).optional(),
  isHidden: z.boolean().optional(),
  name: z.string().min(1).optional(),
});

export async function PATCH(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.account.findFirst({
      where: { id: body.id, workspaceId: workspace.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const account = await prisma.account.update({
      where: { id: body.id },
      data: {
        ledger: body.ledger,
        isHidden: body.isHidden,
        name: body.name,
      },
    });

    if (body.ledger) {
      await prisma.transaction.updateMany({
        where: { accountId: account.id, workspaceId: workspace.id },
        data: { ledger: body.ledger },
      });
    }

    return NextResponse.json({ account });
  } catch (err) {
    return handleApiError(err, "Failed to update account");
  }
}

const deleteSchema = z.object({
  plaidItemId: z.string(),
  /** Only when Plaid itemRemove already succeeded elsewhere / force cleanup. */
  force: z.boolean().optional(),
});

export async function DELETE(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();

    const body = deleteSchema.parse(await req.json());

    const item = await prisma.plaidItem.findFirst({
      where: { id: body.plaidItemId, workspaceId: workspace.id },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (isPlaidConfigured()) {
      try {
        const client = getPlaidClient();
        await client.itemRemove({ access_token: decryptToken(item.accessTokenEnc) });
      } catch (err) {
        console.error("itemRemove failed", err);
        if (!body.force) {
          return NextResponse.json(
            {
              error:
                "Could not revoke bank access at Plaid. Try again, or disconnect with force after confirming in the Plaid dashboard.",
              code: "PLAID_ITEM_REMOVE_FAILED",
            },
            { status: 502 },
          );
        }
      }
    }

    await prisma.plaidItem.delete({ where: { id: item.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return handleApiError(err, "Failed to disconnect");
  }
}
