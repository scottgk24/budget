"use client";

import { useCallback, useEffect, useState } from "react";
import { useLedger } from "@/components/ledger-context";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { Button, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { signedAccountBalance } from "@/lib/accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { ledgerCopy } from "@/lib/ledger-copy";

type Account = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  ledger: string;
  currentBalance: number | null;
  plaidItem: {
    id: string;
    institutionName: string | null;
    status: string;
    lastSyncedAt: string | null;
    errorCode: string | null;
  } | null;
  holdings: Array<{ id: string; name: string; symbol: string | null; value: number | null }>;
};

type Item = {
  id: string;
  institutionName: string | null;
  status: string;
  lastSyncedAt: string | null;
  errorCode: string | null;
  products: string;
  defaultLedger: string;
};

export default function AccountsPage() {
  const { ledger } = useLedger();
  const copy = ledgerCopy(ledger);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [plaidConfigured, setPlaidConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const accountsRes = await fetch(`/api/accounts?ledger=${ledger}`);
    const json = await accountsRes.json();
    if (!accountsRes.ok) {
      setError(json.error ?? "Failed to load");
      return;
    }
    setAccounts(json.accounts);
    setItems(json.items);
    setPlaidConfigured(json.plaidConfigured);
  }, [ledger]);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncItem(plaidItemId: string) {
    setSyncing(plaidItemId);
    setError(null);
    try {
      const res = await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaidItemId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  }

  async function disconnect(plaidItemId: string, force = false) {
    if (
      !confirm(
        force
          ? "Force remove locally even if Plaid revoke failed? Confirm the Item is removed in Plaid first."
          : "Disconnect this institution and remove its accounts?",
      )
    ) {
      return;
    }
    const res = await fetch("/api/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plaidItemId, force }),
    });
    const json = await res.json();
    if (!res.ok) {
      if (json.code === "PLAID_ITEM_REMOVE_FAILED") {
        const retry = confirm(
          `${json.error}\n\nForce local disconnect anyway?`,
        );
        if (retry) {
          await disconnect(plaidItemId, true);
          return;
        }
      }
      setError(json.error ?? "Failed to disconnect");
      return;
    }
    await load();
  }

  async function setAccountLedger(id: string, nextLedger: string) {
    const res = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ledger: nextLedger }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to update");
      return;
    }
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Accounts"
        description={copy.accountsDescription}
        actions={
          plaidConfigured ? (
            <PlaidLinkButton ledger={ledger} onSuccess={() => void load()} />
          ) : null
        }
      />

      {!plaidConfigured ? (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <p className="font-medium">Plaid not configured</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Add <code>PLAID_CLIENT_ID</code> and <code>PLAID_SECRET</code> to{" "}
            <code>.env.local</code> (sandbox keys from the Plaid dashboard) to enable
            bank connections.
          </p>
        </Card>
      ) : null}

      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

      {accounts.length === 0 ? (
        <EmptyState
          title="No linked accounts"
          description={copy.accountsEmpty}
          action={
            plaidConfigured ? (
              <PlaidLinkButton ledger={ledger} onSuccess={() => void load()} />
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {accounts.map((acct) => (
            <Card key={acct.id} className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-display text-lg">
                  {acct.name}
                  {acct.mask ? ` ···${acct.mask}` : ""}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {acct.plaidItem?.institutionName ?? "Institution"}
                  {" · "}
                  {acct.type}
                  {acct.subtype ? ` / ${acct.subtype}` : ""}
                  {acct.plaidItem?.lastSyncedAt
                    ? ` · synced ${formatDate(acct.plaidItem.lastSyncedAt)}`
                    : ""}
                </p>
                {acct.plaidItem?.status === "login_required" ? (
                  <p className="mt-1 text-sm text-[var(--danger)]">
                    Re-authentication required
                  </p>
                ) : null}
                {acct.holdings.length > 0 ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {acct.holdings.length} holdings
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className="font-display text-xl">
                  {acct.currentBalance != null
                    ? formatCurrency(
                        signedAccountBalance(acct.type, acct.currentBalance),
                      )
                    : "—"}
                </p>
                <Select
                  value={acct.ledger}
                  onChange={(e) => void setAccountLedger(acct.id, e.target.value)}
                >
                  <option value="personal">Personal</option>
                  <option value="business">Business</option>
                </Select>
              </div>
            </Card>
          ))}

          {items.length > 0 ? (
            <Card>
              <h2 className="mb-3 font-display text-lg">
                Connected institutions
              </h2>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">
                        {item.institutionName ?? "Institution"}
                      </p>
                      <p className="text-sm text-[var(--muted)]">
                        {item.products} · {item.status}
                        {item.lastSyncedAt
                          ? ` · ${formatDate(item.lastSyncedAt)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={syncing === item.id}
                        onClick={() => void syncItem(item.id)}
                      >
                        {syncing === item.id ? "Syncing…" : "Sync"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void disconnect(item.id)}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
