"use client";

import { usePathname } from "next/navigation";
import { useOptionalLedger } from "@/components/ledger-context";
import { withLedgerParam } from "@/lib/ledger";

/** Prefix app paths with `/demo` when browsing the public demo. */
export function useAppBasePath() {
  const pathname = usePathname();
  const ledger = useOptionalLedger();
  const isDemo = pathname === "/demo" || pathname.startsWith("/demo/");
  const basePath = isDemo ? "/demo" : "";

  function href(path: string) {
    const [pathnamePart, query = ""] = path.split("?");
    const normalized = pathnamePart.startsWith("/")
      ? pathnamePart
      : `/${pathnamePart}`;
    const full = `${basePath}${normalized}`;
    const withQuery = query ? `${full}?${query}` : full;
    return ledger ? withLedgerParam(withQuery, ledger) : withQuery;
  }

  return { isDemo, basePath, href };
}
