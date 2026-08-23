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
import type { Ledger, LedgerKind } from "@/lib/types";

export type LedgerOption = {
  id: string;
  slug: string;
  name: string;
  kind: LedgerKind;
  isSystem: boolean;
  sortOrder: number;
};

type LedgerContextValue = {
  ledger: Ledger;
  kind: LedgerKind;
  name: string;
  ledgers: LedgerOption[];
  setLedger: (ledger: Ledger) => void;
};

const DEFAULT_LEDGERS: LedgerOption[] = [
  { id: "personal", slug: "personal", name: "Personal", kind: "personal", isSystem: true, sortOrder: 0 },
  { id: "business", slug: "business", name: "Business", kind: "business", isSystem: true, sortOrder: 1 },
];

const LedgerContext = createContext<LedgerContextValue | null>(null);

function metaFor(ledgers: LedgerOption[], slug: string): LedgerOption {
  return (
    ledgers.find((row) => row.slug === slug) ??
    ledgers[0] ??
    DEFAULT_LEDGERS[0]!
  );
}

function LedgerProviderInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlLedger = parseLedger(searchParams.get(LEDGER_PARAM));

  const [storedLedger, setStoredLedger] = useState<Ledger>("personal");
  const [optimistic, setOptimistic] = useState<Ledger | null>(null);
  const [ledgers, setLedgers] = useState<LedgerOption[]>(DEFAULT_LEDGERS);

  useEffect(() => {
    const stored = parseLedger(window.localStorage.getItem(LEDGER_STORAGE_KEY));
    if (stored) setStoredLedger(stored);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ledgers")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { ledgers?: LedgerOption[] } | null) => {
        if (cancelled || !json?.ledgers?.length) return;
        setLedgers(json.ledgers);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const requested = optimistic ?? urlLedger ?? storedLedger;
  const current = metaFor(ledgers, requested);
  const ledger = current.slug;

  useEffect(() => {
    if (urlLedger) {
      window.localStorage.setItem(LEDGER_STORAGE_KEY, urlLedger);
      if (urlLedger !== storedLedger) setStoredLedger(urlLedger);
      if (optimistic && optimistic === urlLedger) setOptimistic(null);
      return;
    }
    const next = optimistic ?? storedLedger;
    const currentQs = searchParams.toString();
    const params = new URLSearchParams(currentQs);
    params.set(LEDGER_PARAM, next);
    const qs = params.toString();
    if (qs === currentQs) return;
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
    <LedgerContext.Provider
      value={{ ledger, kind: current.kind, name: current.name, ledgers, setLedger }}
    >
      {children}
    </LedgerContext.Provider>
  );
}

const fallbackValue: LedgerContextValue = {
  ledger: "personal",
  kind: "personal",
  name: "Personal",
  ledgers: DEFAULT_LEDGERS,
  setLedger: () => undefined,
};

export function LedgerProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LedgerContext.Provider value={fallbackValue}>{children}</LedgerContext.Provider>}>
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

export function useLedgerGuard() {
  const { ledger, kind, name, ledgers } = useLedger();
  const ref = useRef(ledger);
  useEffect(() => {
    ref.current = ledger;
  }, [ledger]);
  const isCurrent = useCallback((requested: Ledger | string) => ref.current === requested, []);
  return { ledger, kind, name, ledgers, isCurrent };
}
