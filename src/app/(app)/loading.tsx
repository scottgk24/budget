export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-8 w-40 rounded-md bg-[var(--border)]/60" />
        <div className="h-4 w-64 max-w-full rounded-md bg-[var(--border)]/60" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-[var(--border)] bg-[var(--surface)]"
          />
        ))}
      </div>
      <div className="h-72 rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
    </div>
  );
}
