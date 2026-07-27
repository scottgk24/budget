import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LedgerProvider } from "@/components/ledger-context";
import { PrivacyProvider } from "@/components/privacy-context";
import { AuthError, getWorkspaceContext } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Provision user + workspace on first authenticated visit
  try {
    await getWorkspaceContext();
  } catch (err) {
    if (err instanceof AuthError && err.status === 403) {
      redirect("/not-allowed");
    }
    throw err;
  }

  return (
    <LedgerProvider>
      <PrivacyProvider>
        <AppShell>{children}</AppShell>
      </PrivacyProvider>
    </LedgerProvider>
  );
}

