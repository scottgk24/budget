import { NextResponse } from "next/server";
import { z } from "zod";
import { assertNotDemo, ensureUserAndWorkspace } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import {
  createWorkspaceLedger,
  deleteWorkspaceLedger,
  ensureWorkspaceLedgers,
  ledgerKindSchema,
  renameWorkspaceLedger,
} from "@/lib/workspace-ledgers";

export async function GET() {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const ledgers = await ensureWorkspaceLedgers(workspace.id);
    return NextResponse.json({ ledgers });
  } catch (err) {
    return handleApiError(err, "Failed to load ledgers");
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: ledgerKindSchema,
});

export async function POST(req: Request) {
  try {
    const { workspace, isDemo } = await ensureUserAndWorkspace();
    assertNotDemo(isDemo);
    const body = createSchema.parse(await req.json());
    const ledger = await createWorkspaceLedger({
      workspaceId: workspace.id,
      name: body.name,
      kind: body.kind,
    });
    return NextResponse.json({ ledger });
  } catch (err) {
    if (err instanceof Error && /at most|1–40|characters/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return handleApiError(err, "Failed to create ledger");
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(40),
});

export async function PATCH(req: Request) {
  try {
    const { workspace, isDemo } = await ensureUserAndWorkspace();
    assertNotDemo(isDemo);
    const body = patchSchema.parse(await req.json());
    const ledger = await renameWorkspaceLedger({
      workspaceId: workspace.id,
      id: body.id,
      name: body.name,
    });
    return NextResponse.json({ ledger });
  } catch (err) {
    if (err instanceof Error && /not found|1–40/i.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return handleApiError(err, "Failed to rename ledger");
  }
}

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function DELETE(req: Request) {
  try {
    const { workspace, isDemo } = await ensureUserAndWorkspace();
    assertNotDemo(isDemo);
    const body = deleteSchema.parse(await req.json());
    await deleteWorkspaceLedger({ workspaceId: workspace.id, id: body.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && /cannot be deleted|Move accounts|not found/i.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return handleApiError(err, "Failed to delete ledger");
  }
}
