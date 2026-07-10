import { NextResponse } from "next/server";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";

export async function GET() {
  try {
    const { user, workspace, membership } = await ensureUserAndWorkspace();
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      workspace: { id: workspace.id, name: workspace.name },
      role: membership.role,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to load workspace" }, { status: 500 });
  }
}
