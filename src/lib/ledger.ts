import type { Ledger } from "@/lib/types";

export const LEDGER_PARAM = "ledger";
export const LEDGER_STORAGE_KEY = "budget-ledger";

export function parseLedger(value: string | null | undefined): Ledger | null {
  if (value === "personal" || value === "business") return value;
  return null;
}

/** Merge `ledger` into a path, preserving any existing query string. */
export function withLedgerParam(path: string, ledger: Ledger): string {
  const [pathnamePart, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(LEDGER_PARAM, ledger);
  const qs = params.toString();
  return qs ? `${pathnamePart}?${qs}` : pathnamePart;
}
