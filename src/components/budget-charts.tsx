"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/format";

export type CategorySlice = {
  id: string;
  name: string;
  value: number;
};

/** Earthy greens / warm neutrals aligned with the app palette (avoid purple bias). */
const SLICE_COLORS = [
  "#1a5f4a",
  "#2d7a5f",
  "#3d8b6e",
  "#c4a574",
  "#a67c52",
  "#8b6914",
  "#5f6f67",
  "#b42318",
  "#1f6b4a",
  "#6b8f71",
  "#9a7b4f",
  "#4a6b5c",
];

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: CategorySlice & { pct: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{row.name}</p>
      <p className="tabular-nums text-[var(--muted)]">
        {formatCurrency(row.value)} · {row.payload.pct.toFixed(0)}%
      </p>
    </div>
  );
}

export function CategoryPieChart({
  data,
  emptyLabel = "Nothing to show yet",
}: {
  data: CategorySlice[];
  emptyLabel?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  if (slices.length === 0 || total <= 0) {
    return (
      <p className="flex h-56 items-center justify-center text-sm text-[var(--muted)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(140px,180px)] sm:items-center">
      <div className="h-56 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="48%"
              outerRadius="78%"
              paddingAngle={1.5}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {slices.map((entry, i) => (
                <Cell
                  key={entry.id}
                  fill={SLICE_COLORS[i % SLICE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
        {slices.slice(0, 8).map((s, i) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
              />
              <span className="truncate">{s.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-[var(--muted)]">
              {s.pct.toFixed(0)}%
            </span>
          </li>
        ))}
        {slices.length > 8 ? (
          <li className="text-xs text-[var(--muted)]">
            +{slices.length - 8} more
          </li>
        ) : null}
      </ul>
    </div>
  );
}
