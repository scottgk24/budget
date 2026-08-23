export type LedgerKind = "personal" | "business";
/** Ledger slug. Built-in defaults are `personal` and `business`; extras are named slugs. */
export type Ledger = string;
export type MembershipRole = "owner" | "member";
export type InviteStatus = "pending" | "accepted" | "revoked";

export const LEDGER_KINDS: LedgerKind[] = ["personal", "business"];
export const SYSTEM_LEDGERS = ["personal", "business"] as const;
