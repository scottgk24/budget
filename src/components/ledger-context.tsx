"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LEDGER_PARAM,
  LEDGER_STORAGE_KEY,
  parseLedger,
  withLedgerParam,
} from "@/lib/ledger";
import type { Ledger } from "@/lib/types";

type LedgerContextValue = {
  ledger: Ledger;
  setLedger: (ledger: Ledger) => void;
};

const LedgerContext = createContext<LedgerContextValue | null>(null);

function LedgerProviderInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlLedger = parseLedger(searchParams.get(LEDGER_PARAM));

  const [storedLedger, setStoredLedger] = useState<Ledger>("personal");
  const [optimistic, setOptimistic] = useState<Ledger | null>(null);

  useEffect(() => {
    const stored = parseLedger(window.localStorage.getItem(LEDGER_STORAGE_KEY));
    if (stored) setStoredLedger(stored);
  }, []);

  const ledger = optimistic ?? urlLedger ?? storedLedger;

  useEffect(() => {
    if (urlLedger) {
      window.localStorage.setItem(LEDGER_STORAGE_KEY, urlLedger);
      if (urlLedger !== storedLedger) setStoredLedger(urlLedger);
      if (optimistic && optimistic === urlLedger) setOptimistic(null);
      return;
    }
    const next = optimistic ?? storedLedger;
    const current = searchParams.toString();
    const params = new URLSearchParams(current);
    params.set(LEDGER_PARAM, next);
    const qs = params.toString();
    if (qs === current) return;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [urlLedger, storedLedger, optimistic, pathname, router, searchParams]);

  const setLedger = useCallback(
    (next: Ledger) => {
      setOptimistic(next);
      setStoredLedger(next);
      window.localStorage.setItem(LEDGER_STORAGE_KEY, next);
      if (searchParams.get(LEDGER_PARAM) === next) return;
      router.replace(withLedgerParam(`${pathname}?${searchParams.toString()}`, next), {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <LedgerContext.Provider value={{ ledger, setLedger }}>
      {children}
    </LedgerContext.Provider>
  );
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <LedgerContext.Provider
          value={{ ledger: "personal", setLedger: () => undefined }}
        >
          {children}
        </LedgerContext.Provider>
      }
    >
      <LedgerProviderInner>{children}</LedgerProviderInner>
    </Suspense>
  );
}

export function useLedger() {
  const ctx = useContext(LedgerContext);
  if (!ctx) {
    throw new Error("useLedger must be used within LedgerProvider");
  }
  return ctx;
}

export function useOptionalLedger(): Ledger | null {
  return useContext(LedgerContext)?.ledger ?? null;
}

/** True if `requested` is still the active ledger (drop stale fetches). */
export function useLedgerGuard() {
  const { ledger } = useLedger();
  const ref = useRef(ledger);
  useEffect(() => {
    ref.current = ledger;
  }, [ledger]);
  const isCurrent = useCallback((requested: Ledger | string) => ref.current === requested, []);
  return { ledger, isCurrent };
}
