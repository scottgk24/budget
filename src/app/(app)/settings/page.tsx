"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, PageHeader } from "@/components/ui";

type Member = {
  id: string;
  role: string;
  user: { id: string; email: string; name: string | null };
};

type Invite = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  token?: string;
};

type LedgerRow = {
  id: string;
  slug: string;
  name: string;
  kind: "personal" | "business";
  isSystem: boolean;
};

export default function SettingsPage() {
  const [workspaceName, setWorkspaceName] = useState("");
  const [role, setRole] = useState("member");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);
  const [newLedgerName, setNewLedgerName] = useState("");
  const [newLedgerKind, setNewLedgerKind] = useState<"personal" | "business">("personal");

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/settings");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load");
      return;
    }
    setWorkspaceName(json.workspace.name);
    setRole(json.role);
    setMembers(json.members);
    setInvites(json.invites);
    const ledgersRes = await fetch("/api/ledgers");
    const ledgersJson = await ledgersRes.json();
    if (ledgersRes.ok) setLedgers(ledgersJson.ledgers ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInviteLink(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Invite failed");
      setInviteLink(json.invite.link);
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(inviteId: string) {
    const res = await fetch("/api/settings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId }),
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Failed to revoke");
      return;
    }
    await load();
  }

  return (
    <div>
      <PageHeader title="Settings" />

      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg">Workspace</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Name</p>
          <p className="text-lg">{workspaceName}</p>
          <p className="mt-4 text-sm text-[var(--muted)]">Your role</p>
          <p className="capitalize">{role}</p>
        </Card>

        <Card>
          <h2 className="font-display text-lg">Members</h2>
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">{m.user.name || m.user.email}</p>
                  <p className="text-[var(--muted)]">{m.user.email}</p>
                </div>
                <span className="capitalize text-[var(--muted)]">{m.role}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-display text-lg">Ledgers</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Split accounts into as many books as you want. Each ledger is either
            personal (household budgets) or business (P&amp;L style).
          </p>
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {ledgers.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <input
                  className="min-w-[10rem] flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5"
                  defaultValue={row.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (!name || name === row.name) return;
                    void fetch("/api/ledgers", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: row.id, name }),
                    }).then((res) => {
                      if (!res.ok) return res.json().then((j) => setError(j.error ?? "Rename failed"));
                      void load();
                    });
                  }}
                />
                <span className="capitalize text-[var(--muted)]">{row.kind}</span>
                {row.isSystem ? (
                  <span className="text-xs text-[var(--muted)]">Default</span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (!confirm(`Delete “${row.name}”? Move its accounts first.`)) return;
                      void fetch("/api/ledgers", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: row.id }),
                      }).then(async (res) => {
                        const json = await res.json();
                        if (!res.ok) setError(json.error ?? "Delete failed");
                        else void load();
                      });
                    }}
                  >
                    Delete
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              void fetch("/api/ledgers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newLedgerName, kind: newLedgerKind }),
              })
                .then(async (res) => {
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error ?? "Could not add ledger");
                  setNewLedgerName("");
                  await load();
                })
                .catch((err) => setError(err instanceof Error ? err.message : "Could not add ledger"))
                .finally(() => setBusy(false));
            }}
          >
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">New ledger</span>
              <Input
                required
                placeholder="Rental property"
                value={newLedgerName}
                onChange={(e) => setNewLedgerName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Treat as</span>
              <select
                className="rounded-md border border-[var(--border)] bg-transparent px-2 py-2"
                value={newLedgerKind}
                onChange={(e) => setNewLedgerKind(e.target.value as "personal" | "business")}
              >
                <option value="personal">Personal</option>
                <option value="business">Business</option>
              </select>
            </label>
            <Button type="submit" disabled={busy || !newLedgerName.trim()}>
              {busy ? "Adding…" : "Add ledger"}
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-display text-lg">
            Invite collaborators
          </h2>

          {role === "owner" ? (
            <form onSubmit={sendInvite} className="mt-4 flex flex-wrap gap-2">
              <Input
                type="email"
                required
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="max-w-sm"
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create invite"}
              </Button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">
              Only owners can send invites.
            </p>
          )}

          {inviteLink ? (
            <div className="mt-4 rounded-lg bg-[var(--accent-soft)] p-3 text-sm">
              <p className="font-medium">Invite link</p>
              <p className="mt-1 break-all">{inviteLink}</p>
            </div>
          ) : null}

          {invites.length > 0 ? (
            <ul className="mt-6 divide-y divide-[var(--border)]">
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{inv.email}</p>
                    <p className="text-[var(--muted)]">
                      Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  {role === "owner" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void revoke(inv.id)}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
