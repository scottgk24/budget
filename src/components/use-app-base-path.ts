"use client";

import { usePathname } from "next/navigation";

/** Prefix app paths with `/demo` when browsing the public demo. */
export function useAppBasePath() {
  const pathname = usePathname();
  const isDemo = pathname === "/demo" || pathname.startsWith("/demo/");
  const basePath = isDemo ? "/demo" : "";

  function href(path: string) {
    const [pathnamePart, query = ""] = path.split("?");
    const normalized = pathnamePart.startsWith("/")
      ? pathnamePart
      : `/${pathnamePart}`;
    const full = `${basePath}${normalized}`;
    return query ? `${full}?${query}` : full;
  }

  return { isDemo, basePath, href };
}
