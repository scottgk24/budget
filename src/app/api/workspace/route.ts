import { NextResponse } from "next/server";
import { ensureUserAndWorkspace } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";

export async function GET() {
  try {
    const { user, workspace, membership } = await ensureUserAndWorkspace();
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      workspace: { id: workspace.id, name: workspace.name },
      role: membership.role,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load workspace");
  }
}
