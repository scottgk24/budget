import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LedgerProvider } from "@/components/ledger-context";
import { PrivacyProvider } from "@/components/privacy-context";
import {
  DEMO_COOKIE,
  DEMO_COOKIE_VALUE,
  ensureDemoWorkspace,
} from "@/lib/demo";

/**
 * Public demo shell — same AppShell/pages/APIs as the real app, seeded workspace.
 * New app routes: re-export the page under `demo/<route>/page.tsx` and set
 * `demo: true` on the NAV item in `app-shell.tsx` when it should appear here.
 */
export default async function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  if (jar.get(DEMO_COOKIE)?.value !== DEMO_COOKIE_VALUE) {
    redirect("/api/demo");
  }

  try {
    await ensureDemoWorkspace();
  } catch (err) {
    console.error("Demo workspace failed", err);
    redirect("/?demo=error");
  }

  return (
    <LedgerProvider>
      <PrivacyProvider>
        <AppShell>{children}</AppShell>
      </PrivacyProvider>
    </LedgerProvider>
  );
}
