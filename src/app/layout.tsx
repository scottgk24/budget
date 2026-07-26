import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Bodoni_Moda, Outfit } from "next/font/google";
import { isClerkConfigured } from "@/lib/env";
import "./globals.css";

/** Brand kit “SAGE Serif” — high-contrast Didot/Bodoni for headlines. */
const sageSerif = Bodoni_Moda({
  variable: "--font-sage-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/** Brand kit “SAGE Sans” — geometric sans for UI + wordmark. */
const sageSans = Outfit({
  variable: "--font-sage-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SAGE",
  description: "Household and business money, privately",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
};

const clerkAppearance = {
  variables: {
    colorPrimary: "#d4a857",
    colorBackground: "#1c3828",
    colorInputBackground: "#122618",
    colorInputText: "#eef5ea",
    colorText: "#eef5ea",
    colorTextSecondary: "#8fb396",
    colorNeutral: "#8fb396",
    colorDanger: "#d4655a",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-sage-sans), ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    card: "bg-[var(--surface)] border border-[var(--border)] shadow-none",
    headerTitle: "text-[var(--fg)] font-[family-name:var(--font-sage-serif)]",
    headerSubtitle: "text-[var(--muted)]",
    socialButtonsBlockButton:
      "border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)]",
    formButtonPrimary: "bg-[var(--accent)] text-[var(--on-accent)] hover:opacity-90",
    footerActionLink: "text-[var(--accent)]",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkReady = isClerkConfigured();

  return (
    <html
      lang="en"
      className={`${sageSerif.variable} ${sageSans.variable} h-full`}
    >
      <body className="min-h-full font-sans antialiased">
        {clerkReady ? (
          <ClerkProvider appearance={clerkAppearance}>{children}</ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
