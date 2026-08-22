export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label={label}>
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
