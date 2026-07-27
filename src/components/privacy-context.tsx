"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  formatCompactCurrency as formatCompactCurrencyRaw,
  formatCurrency as formatCurrencyRaw,
  formatSignedCurrency as formatSignedCurrencyRaw,
} from "@/lib/format";

const STORAGE_KEY = "sage-privacy-hidden";
export const HIDDEN_MONEY = "$••••";

type PrivacyContextValue = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  toggleHidden: () => void;
};

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHiddenState] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setHiddenState(true);
  }, []);

  function setHidden(next: boolean) {
    setHiddenState(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  function toggleHidden() {
    setHidden(!hidden);
  }

  return (
    <PrivacyContext.Provider value={{ hidden, setHidden, toggleHidden }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  const ctx = useContext(PrivacyContext);
  if (!ctx) {
    throw new Error("usePrivacy must be used within PrivacyProvider");
  }
  return ctx;
}

/** Currency helpers that respect the privacy hide toggle. */
export function useMoneyFormat() {
  const { hidden } = usePrivacy();

  return {
    formatCurrency: (amount: number, currency = "USD") =>
      hidden ? HIDDEN_MONEY : formatCurrencyRaw(amount, currency),
    formatSignedCurrency: (amount: number, currency = "USD") =>
      hidden ? HIDDEN_MONEY : formatSignedCurrencyRaw(amount, currency),
    formatCompactCurrency: (amount: number) =>
      hidden ? HIDDEN_MONEY : formatCompactCurrencyRaw(amount),
  };
}
