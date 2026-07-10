"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Ledger } from "@/lib/types";

type LedgerContextValue = {
  ledger: Ledger;
  setLedger: (ledger: Ledger) => void;
};

const LedgerContext = createContext<LedgerContextValue | null>(null);

const STORAGE_KEY = "budget-ledger";

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [ledger, setLedgerState] = useState<Ledger>("personal");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "personal" || stored === "business") {
      setLedgerState(stored);
    }
  }, []);

  function setLedger(next: Ledger) {
    setLedgerState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <LedgerContext.Provider value={{ ledger, setLedger }}>
      {children}
    </LedgerContext.Provider>
  );
}

export function useLedger() {
  const ctx = useContext(LedgerContext);
  if (!ctx) {
    throw new Error("useLedger must be used within LedgerProvider");
  }
  return ctx;
}
