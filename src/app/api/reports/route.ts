import { NextResponse } from "next/server";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { buildReports } from "@/lib/reports";
import { parseMetricsRangeId } from "@/lib/format";
import type { Ledger } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = (searchParams.get("ledger") as Ledger) || "personal";
    const range = parseMetricsRangeId(searchParams.get("range"));

    const data = await buildReports({
      workspaceId: workspace.id,
      ledger,
      range,
    });

    return NextResponse.json({ ledger, ...data });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("reports", err);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}
