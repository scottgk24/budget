"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useEffect, useState, type ReactNode, type SVGProps } from "react";
import { BrandMark } from "@/components/brand-mark";
import { useLedger } from "@/components/ledger-context";
import { cn } from "@/lib/format";
import { ledgerCopy } from "@/lib/ledger-copy";

const NAV_COLLAPSED_KEY = "sage-nav-collapsed";

type NavIcon = (props: SVGProps<SVGSVGElement>) => ReactNode;

function iconClass(className?: string) {
  return cn("h-[1.125rem] w-[1.125rem] shrink-0", className);
}

function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props} className={iconClass(props.className)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function IconTransactions(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props} className={iconClass(props.className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h12l-2.5-2.5M17 17H5l2.5 2.5" />
      <path strokeLinecap="round" d="M5 7h.01M19 17h.01" />
    </svg>
  );
}

function IconBudgets(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props} className={iconClass(props.className)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path strokeLinecap="round" d="M3 10h18" />
      <path strokeLinecap="round" d="M8 14h3M8 17h5" />
    </svg>
  );
}

function IconAccounts(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props} className={iconClass(props.className)}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path strokeLinecap="round" d="M2.5 10h19" />
      <circle cx="16.5" cy="14.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props} className={iconClass(props.className)}>
      <circle cx="12" cy="12" r="3" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3.5v1.6M12 18.9v1.6M4.9 6.5l1.15 1.15M17.95 16.35l1.15 1.15M3.5 12h1.6M18.9 12h1.6M4.9 17.5l1.15-1.15M17.95 7.65l1.15-1.15"
      />
    </svg>
  );
}

function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props} className={iconClass(props.className)}>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconCollapse(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props} className={iconClass(props.className)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path strokeLinecap="round" d="M9 4.5v15" />
    </svg>
  );
}

function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden {...props} className={iconClass(props.className)}>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const NAV: Array<{
  href: string;
  icon: NavIcon;
  label: (copy: ReturnType<typeof ledgerCopy>) => string;
}> = [
  { href: "/dashboard", icon: IconDashboard, label: (c) => c.navDashboard },
  { href: "/transactions", icon: IconTransactions, label: () => "Transactions" },
  { href: "/budgets", icon: IconBudgets, label: (c) => c.navBudgets },
  { href: "/accounts", icon: IconAccounts, label: () => "Accounts" },
  { href: "/settings", icon: IconSettings, label: () => "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ledger, setLedger } = useLedger();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(NAV_COLLAPSED_KEY);
    if (stored === "1") setCollapsed(true);
    setHydrated(true);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  const sidebar = (
    <SidebarPanel
      pathname={pathname}
      collapsed={false}
      hydrated={hydrated}
      ledger={ledger}
      setLedger={setLedger}
      onToggleCollapsed={toggleCollapsed}
      onCloseMobile={() => setMobileOpen(false)}
      showCloseMobile
    />
  );

  return (
    <div className="flex h-svh overflow-hidden text-[var(--fg)]">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative z-30 hidden h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width] duration-200 ease-out md:flex",
          hydrated && collapsed ? "w-[var(--sidebar-collapsed)]" : "w-[var(--sidebar-expanded)]",
        )}
      >
        <SidebarPanel
          pathname={pathname}
          collapsed={hydrated && collapsed}
          hydrated={hydrated}
          ledger={ledger}
          setLedger={setLedger}
          onToggleCollapsed={toggleCollapsed}
          showCloseMobile={false}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[var(--sidebar-expanded)] flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-lg">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 md:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--fg)]"
              aria-label="Open navigation"
            >
              <IconMenu />
            </button>
            <BrandMark variant="mark" href="/dashboard" className="h-8 w-auto" />
          </div>
          <UserButton />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarPanel({
  pathname,
  collapsed,
  hydrated,
  ledger,
  setLedger,
  onToggleCollapsed,
  onCloseMobile,
  showCloseMobile,
}: {
  pathname: string;
  collapsed: boolean;
  hydrated: boolean;
  ledger: "personal" | "business";
  setLedger: (ledger: "personal" | "business") => void;
  onToggleCollapsed: () => void;
  onCloseMobile?: () => void;
  showCloseMobile: boolean;
}) {
  const copy = ledgerCopy(ledger);
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex shrink-0 border-b border-[var(--border)] px-3 py-3",
          collapsed ? "flex-col items-center gap-2" : "items-center justify-between gap-2",
        )}
      >
        <BrandMark
          variant="mark"
          href="/dashboard"
          className={collapsed ? "h-8 w-auto" : "h-9 w-auto"}
        />

        {showCloseMobile ? (
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-2 text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--fg)]"
            aria-label="Close navigation"
          >
            <IconClose />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              "rounded-md p-2 text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--fg)]",
              !hydrated && "invisible",
            )}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <IconCollapse />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          const label = item.label(copy);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md text-sm transition-colors",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                active
                  ? "bg-[var(--accent-soft)] text-[var(--gold)]"
                  : "text-[var(--muted)] hover:bg-[var(--accent-soft)]/50 hover:text-[var(--fg)]",
              )}
            >
              <Icon />
              {!collapsed ? <span>{label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "shrink-0 space-y-3 border-t border-[var(--border)] p-3",
          collapsed && "flex flex-col items-center",
        )}
      >
        {collapsed ? (
          <div className="flex flex-col gap-1" title={ledger === "personal" ? "Personal" : "Business"}>
            <button
              type="button"
              onClick={() => setLedger("personal")}
              aria-label="Personal ledger"
              className={cn(
                "rounded-md px-2 py-1 text-[0.65rem] font-medium uppercase tracking-wide transition-colors",
                ledger === "personal"
                  ? "bg-[var(--accent)] text-[var(--on-accent)]"
                  : "text-[var(--muted)] hover:text-[var(--fg)]",
              )}
            >
              P
            </button>
            <button
              type="button"
              onClick={() => setLedger("business")}
              aria-label="Business ledger"
              className={cn(
                "rounded-md px-2 py-1 text-[0.65rem] font-medium uppercase tracking-wide transition-colors",
                ledger === "business"
                  ? "bg-[var(--accent)] text-[var(--on-accent)]"
                  : "text-[var(--muted)] hover:text-[var(--fg)]",
              )}
            >
              B
            </button>
          </div>
        ) : (
          <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setLedger("personal")}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 transition-colors",
                ledger === "personal"
                  ? "bg-[var(--accent)] text-[var(--on-accent)]"
                  : "text-[var(--muted)] hover:text-[var(--fg)]",
              )}
            >
              Personal
            </button>
            <button
              type="button"
              onClick={() => setLedger("business")}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 transition-colors",
                ledger === "business"
                  ? "bg-[var(--accent)] text-[var(--on-accent)]"
                  : "text-[var(--muted)] hover:text-[var(--fg)]",
              )}
            >
              Business
            </button>
          </div>
        )}

        {!showCloseMobile ? (
          <div className={cn("flex items-center", collapsed ? "justify-center" : "px-1")}>
            <UserButton />
          </div>
        ) : null}
      </div>
    </div>
  );
}
