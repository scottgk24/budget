import { NextResponse } from "next/server";
import {
  AuthError,
  ensureMissingDefaultCategories,
  ensureUserAndWorkspace,
} from "@/lib/auth";
import { ensureDefaultFunds } from "@/lib/funds";
import { prisma } from "@/lib/db";
import { parseLedger } from "@/lib/ledger";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    await ensureMissingDefaultCategories(workspace.id);
    await ensureDefaultFunds(workspace.id);
    const { searchParams } = new URL(req.url);
    const ledger = parseLedger(searchParams.get("ledger"));

    const categories = await prisma.category.findMany({
      where: {
        workspaceId: workspace.id,
        ...(ledger ? { ledger } : {}),
      },
      orderBy: [{ ledger: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ categories });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
  }
}
