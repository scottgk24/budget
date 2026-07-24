import { createHash, timingSafeEqual } from "crypto";
import * as jose from "jose";
import { getPlaidClient, isPlaidConfigured } from "@/lib/plaid";

type CachedKey = { jwk: jose.JWK; fetchedAt: number };

const keyCache = new Map<string, CachedKey>();
const KEY_TTL_MS = 24 * 60 * 60 * 1000;

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

async function getVerificationJwk(kid: string): Promise<jose.JWK | null> {
  const cached = keyCache.get(kid);
  if (cached && Date.now() - cached.fetchedAt < KEY_TTL_MS) {
    return cached.jwk;
  }

  if (!isPlaidConfigured()) return null;

  try {
    const client = getPlaidClient();
    const res = await client.webhookVerificationKeyGet({ key_id: kid });
    const jwk = res.data.key as unknown as jose.JWK;
    keyCache.set(kid, { jwk, fetchedAt: Date.now() });
    return jwk;
  } catch (err) {
    console.error("webhookVerificationKeyGet failed", err);
    return null;
  }
}

/**
 * Verify Plaid-Verification JWT (ES256) + body SHA-256 claim.
 * @see https://plaid.com/docs/api/webhooks/webhook-verification/
 */
export async function verifyPlaidWebhookJwt(
  rawBody: string,
  plaidVerification: string | null,
): Promise<boolean> {
  if (!plaidVerification) return false;

  try {
    const headerPart = plaidVerification.split(".")[0];
    if (!headerPart) return false;

    const header = JSON.parse(
      Buffer.from(headerPart, "base64url").toString("utf8"),
    ) as { alg?: string; kid?: string };

    if (header.alg !== "ES256" || !header.kid) return false;

    const jwk = await getVerificationJwk(header.kid);
    if (!jwk) return false;

    const key = await jose.importJWK(jwk, "ES256");
    const { payload } = await jose.jwtVerify(plaidVerification, key, {
      algorithms: ["ES256"],
      maxTokenAge: "5 min",
    });

    const claimed = payload.request_body_sha256;
    if (typeof claimed !== "string") return false;

    const bodyHash = createHash("sha256").update(rawBody).digest("hex");
    return timingSafeStringEqual(bodyHash, claimed);
  } catch (err) {
    console.error("plaid webhook JWT verify failed", err);
    return false;
  }
}

/** Optional defense-in-depth shared secret (e.g. from a reverse proxy). */
export function verifyOptionalWebhookSecret(
  providedHeader: string | null,
): boolean {
  const secret = process.env.PLAID_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!providedHeader) return false;

  const expected = createHash("sha256").update(secret).digest();
  const got = createHash("sha256").update(providedHeader).digest();
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}
