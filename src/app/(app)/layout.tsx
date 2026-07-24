import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LedgerProvider } from "@/components/ledger-context";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Provision user + workspace on first authenticated visit
  try {
    await ensureUserAndWorkspace();
  } catch (err) {
    if (err instanceof AuthError && err.status === 403) {
      redirect("/not-allowed");
    }
    throw err;
  }

  return (
    <LedgerProvider>
      <AppShell>{children}</AppShell>
    </LedgerProvider>
  );
}

