import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  AuthError,
  acceptInviteByToken,
  requireAuth,
} from "@/lib/auth";
import { handleApiError, rateLimitedResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  token: z.string().min(16),
});

export async function POST(req: Request) {
  try {
    const limited = rateLimit(`invite-accept:${clientIp(req)}`, 20, 60_000);
    if (!limited.ok) return rateLimitedResponse(limited.retryAfter);

    const session = await requireAuth();
    const clerkUser = await currentUser();
    if (!clerkUser) throw new AuthError("Unauthorized", 401);

    const email =
      clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) throw new AuthError("No email on account", 400);

    const { token } = bodySchema.parse(await req.json());

    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
      clerkUser.username ||
      email;

    let user = await prisma.user.findUnique({ where: { clerkId: session.userId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          clerkId: session.userId,
          email: email.toLowerCase(),
          name,
        },
      });
    }

    // Already in a workspace — still bind/accept this invite if it matches.
    const existingMembership = await prisma.membership.findFirst({
      where: { userId: user.id },
    });
    if (existingMembership) {
      // Accept invite marking only; do not move workspaces.
      try {
        await acceptInviteByToken(user.id, email, token);
      } catch {
        // Ignore if token invalid when already a member of another workspace.
      }
      return NextResponse.json({
        ok: true,
        workspaceId: existingMembership.workspaceId,
      });
    }

    const membership = await acceptInviteByToken(user.id, email, token);
    return NextResponse.json({
      ok: true,
      workspaceId: membership.workspaceId,
    });
  } catch (err) {
    return handleApiError(err, "Failed to accept invite");
  }
}
