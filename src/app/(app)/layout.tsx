import { AppShell } from "@/components/app-shell";
import { LedgerProvider } from "@/components/ledger-context";
import { ensureUserAndWorkspace } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Provision user + workspace on first authenticated visit
  try {
    await ensureUserAndWorkspace();
  } catch {
    // Middleware already protects routes; invite gate handled in pages/API
  }

  return (
    <LedgerProvider>
      <AppShell>{children}</AppShell>
    </LedgerProvider>
  );
}
