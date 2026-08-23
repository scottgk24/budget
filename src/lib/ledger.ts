import type { Ledger } from "@/lib/types";

export const LEDGER_PARAM = "ledger";
export const LEDGER_STORAGE_KEY = "budget-ledger";

const SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;

export function parseLedger(value: string | null | undefined): Ledger | null {
  if (!value) return null;
  const slug = value.trim().toLowerCase();
  if (!SLUG.test(slug)) return null;
  return slug;
}

/** Merge `ledger` into a path, preserving any existing query string. */
export function withLedgerParam(path: string, ledger: Ledger): string {
  const [pathnamePart, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(LEDGER_PARAM, ledger);
  const qs = params.toString();
  return qs ? `${pathnamePart}?${qs}` : pathnamePart;
}

export function ledgerQueryFilter(raw: string | null): { ledger: string } | Record<string, never> {
  const slug = parseLedger(raw);
  return slug ? { ledger: slug } : {};
}
