"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui";
import type { Ledger } from "@/lib/types";

type Props = {
  ledger: Ledger;
  onSuccess?: () => void;
  label?: string;
};

export function PlaidLinkButton({ ledger, onSuccess, label = "Connect account" }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLinkToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledger }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create link token");
      setToken(data.linkToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Plaid Link");
    } finally {
      setLoading(false);
    }
  }, [ledger]);

  useEffect(() => {
    void createLinkToken();
  }, [createLinkToken]);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken, metadata) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            ledger,
            institution: metadata.institution,
            accounts: metadata.accounts,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to link account");
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to link account");
      } finally {
        setLoading(false);
      }
    },
    onExit: (err) => {
      if (err) setError(err.display_message || err.error_message || "Link exited");
    },
  });

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        disabled={!ready || loading || !token}
        onClick={() => open()}
      >
        {loading ? "Working…" : label}
      </Button>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
