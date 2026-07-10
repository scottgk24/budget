/** True when Clerk publishable + secret keys look real (not placeholders). */
export function isClerkConfigured(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  const looksReal = (key: string, prefix: string) =>
    key.startsWith(prefix) &&
    key.length > 20 &&
    !key.includes("placeholder");
  return looksReal(pk, "pk_") && looksReal(sk, "sk_");
}
