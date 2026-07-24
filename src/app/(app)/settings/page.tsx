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

export default function SettingsPage() {
  const [workspaceName, setWorkspaceName] = useState("");
  const [role, setRole] = useState("member");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <PageHeader
        title="Settings"
        description="Family access and workspace preferences"
      />

      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Workspace</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Name</p>
          <p className="text-lg">{workspaceName}</p>
          <p className="mt-4 text-sm text-[var(--muted)]">Your role</p>
          <p className="capitalize">{role}</p>
        </Card>

        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Members</h2>
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
          <h2 className="font-[family-name:var(--font-display)] text-lg">
            Invite family
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Invite-only access. Share the link with your spouse or family members.
            You can also restrict sign-in with <code>ALLOWED_EMAILS</code> in env.
          </p>

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
              Only workspace owners can send invites.
            </p>
          )}

          {inviteLink ? (
            <div className="mt-4 rounded-lg bg-[var(--accent-soft)] p-3 text-sm">
              <p className="font-medium">Invite link (copy and share):</p>
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

        <Card className="lg:col-span-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Security</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
            <li>Bank logins happen in Plaid Link (OAuth) — we never store passwords.</li>
            <li>Plaid access tokens are encrypted at rest with TOKEN_ENCRYPTION_KEY.</li>
            <li>Webhooks are verified with Plaid JWT signatures.</li>
            <li>This app is read-only: no transfers or bill pay.</li>
            <li>Only owners can link or disconnect banks; members can sync and view.</li>
            <li>
              Production: set ALLOWED_EMAILS, Clerk invite-only, Postgres, and a unique
              TOKEN_ENCRYPTION_KEY.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
