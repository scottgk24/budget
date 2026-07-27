/** Decorative product previews for the landing page — fictional sample data only. */

function Frame({
  children,
  className,
  title = "SAGE",
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--border)_85%,transparent)] bg-[var(--bg)] shadow-[0_28px_80px_rgb(0_0_0_/_45%)] ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#d4655a]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--positive)]/70" />
        <span className="ml-2 truncate text-[11px] text-[var(--muted)]">{title}</span>
      </div>
      {children}
    </div>
  );
}

function MiniCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "danger";
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-[10px] text-[var(--muted)] sm:text-[11px]">{label}</p>
      <p
        className={`mt-1 font-display text-base tabular-nums sm:text-lg ${
          tone === "positive"
            ? "text-[var(--positive)]"
            : tone === "danger"
              ? "text-[var(--danger)]"
              : "text-[var(--fg)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Progress({ pct, over }: { pct: number; over?: boolean }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg)]">
      <div
        className={`h-full rounded-full ${over ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export function LandingDashboardMock() {
  return (
    <Frame title="app.sage · Dashboard · Personal">
      <div className="flex min-h-[280px] sm:min-h-[340px]">
        <aside className="hidden w-[7.5rem] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-2.5 sm:flex">
          <p className="px-1.5 font-wordmark text-[10px] text-[var(--gold)]">SAGE</p>
          <nav className="mt-4 space-y-0.5 text-[11px]">
            {[
              { label: "Dashboard", active: true },
              { label: "Transactions", active: false },
              { label: "Budgets", active: false },
              { label: "Accounts", active: false },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-md px-2 py-1.5 ${
                  item.active
                    ? "bg-[var(--accent-soft)] text-[var(--gold)]"
                    : "text-[var(--muted)]"
                }`}
              >
                {item.label}
              </div>
            ))}
          </nav>
          <div className="mt-auto rounded-md border border-[var(--border)] p-0.5 text-[10px]">
            <div className="rounded bg-[var(--accent)] px-1.5 py-1 text-center text-[var(--on-accent)]">
              Personal
            </div>
            <div className="px-1.5 py-1 text-center text-[var(--muted)]">Business</div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 p-3 sm:p-4">
          <div>
            <p className="font-display text-lg text-[var(--fg)] sm:text-xl">Dashboard</p>
            <p className="text-[11px] text-[var(--muted)]">Personal · 2026-03</p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <MiniCard label="Balance" value="$14,832.40" />
            <MiniCard label="Spent this month" value="$3,218.12" />
            <MiniCard label="Income this month" value="$7,450.00" tone="positive" />
            <MiniCard label="Budget remaining" value="$1,641.88" />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="font-display text-sm">Top categories</p>
              <ul className="mt-2 space-y-2.5">
                {[
                  { name: "Groceries", spent: "$642", limit: "$800", pct: 80 },
                  { name: "Dining", spent: "$318", limit: "$350", pct: 91 },
                  { name: "Transport", spent: "$210", limit: "$300", pct: 70 },
                  { name: "Subscriptions", spent: "$96", limit: "$120", pct: 80 },
                ].map((row) => (
                  <li key={row.name}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span>{row.name}</span>
                      <span className="tabular-nums text-[var(--muted)]">
                        {row.spent} / {row.limit}
                      </span>
                    </div>
                    <Progress pct={row.pct} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="font-display text-sm">Recent activity</p>
              <ul className="mt-2 divide-y divide-[var(--border)]">
                {[
                  { name: "River Market Co-op", meta: "Mar 12 · Groceries", amt: "-$84.22" },
                  { name: "Northline Transit", meta: "Mar 11 · Transport", amt: "-$36.00" },
                  { name: "Acme Payroll", meta: "Mar 10 · Income", amt: "+$3,725.00", pos: true },
                  { name: "Harbor Coffee", meta: "Mar 9 · Dining", amt: "-$14.50" },
                ].map((tx) => (
                  <li
                    key={tx.name}
                    className="flex items-center justify-between gap-2 py-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{tx.name}</p>
                      <p className="text-[var(--muted)]">{tx.meta}</p>
                    </div>
                    <span
                      className={`shrink-0 tabular-nums ${
                        tx.pos ? "text-[var(--positive)]" : "text-[var(--fg)]"
                      }`}
                    >
                      {tx.amt}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function LandingAccountsMock() {
  return (
    <Frame title="app.sage · Accounts · Business" className="h-full">
      <div className="p-3 sm:p-4">
        <div>
          <p className="font-display text-lg text-[var(--fg)]">Accounts</p>
          <p className="text-[11px] text-[var(--muted)]">Business</p>
        </div>

        <ul className="mt-3 space-y-2">
          {[
            {
              name: "Operating Checking",
              meta: "First Oak Bank · ····4410",
              bal: "$28,640.18",
            },
            {
              name: "Client Trust",
              meta: "First Oak Bank · ····7729",
              bal: "$6,120.00",
            },
            {
              name: "Business Card",
              meta: "Summit Card · ····1194",
              bal: "-$1,084.55",
              danger: true,
            },
          ].map((acct) => (
            <li
              key={acct.name}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{acct.name}</p>
                <p className="text-[11px] text-[var(--muted)]">{acct.meta}</p>
              </div>
              <p
                className={`shrink-0 font-display text-base tabular-nums ${
                  acct.danger ? "text-[var(--danger)]" : "text-[var(--fg)]"
                }`}
              >
                {acct.bal}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniCard label="Cash on hand" value="$34,760" />
          <MiniCard label="Expenses" value="$4,892" />
          <MiniCard label="Profit" value="$2,410" tone="positive" />
        </div>
      </div>
    </Frame>
  );
}

export function LandingProductPreview() {
  return (
    <section className="relative z-10 border-t border-[color-mix(in_srgb,var(--border)_70%,transparent)]">
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
        <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--fg)] sm:text-3xl">
          What it looks like day to day
        </h2>

        <div className="relative mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)] lg:gap-8">
          <div className="sage-rise relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_30%_20%,color-mix(in_srgb,var(--gold)_14%,transparent),transparent_55%)] blur-xl"
            />
            <LandingDashboardMock />
          </div>
          <div className="sage-rise sage-rise-delay-2 lg:mt-12">
            <LandingAccountsMock />
          </div>
        </div>
      </div>
    </section>
  );
}
