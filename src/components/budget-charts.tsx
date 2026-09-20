"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMoneyFormat } from "@/components/privacy-context";

export type CategorySlice = {
  id: string;
  name: string;
  value: number;
};

/** Hunter / olive / gold family aligned with SAGE forest theme. */
const SLICE_COLORS = [
  "#2c5f2b",
  "#5c6b46",
  "#7a9a6a",
  "#d4a857",
  "#3d5c40",
  "#8fa38c",
  "#6b8f71",
  "#d4655a",
  "#4a6b4e",
  "#b8975c",
  "#243528",
  "#9bb892",
];

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: CategorySlice & { pct: number } }>;
}) {
  const { formatCurrency } = useMoneyFormat();
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
  onSelectSlice,
}: {
  data: CategorySlice[];
  emptyLabel?: string;
  onSelectSlice?: (slice: CategorySlice) => void;
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

  const interactive = Boolean(onSelectSlice);

  function selectSlice(slice: CategorySlice & { pct: number }) {
    onSelectSlice?.({ id: slice.id, name: slice.name, value: slice.value });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(140px,180px)] sm:items-center">
      <div className={`h-56 w-full min-w-0 ${interactive ? "cursor-pointer" : ""}`}>
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
                  cursor={interactive ? "pointer" : undefined}
                  onClick={
                    interactive
                      ? () => {
                          selectSlice(entry);
                        }
                      : undefined
                  }
                />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
        {slices.slice(0, 8).map((s, i) => (
          <li key={s.id}>
            {interactive ? (
              <button
                type="button"
                onClick={() => selectSlice(s)}
                className="flex w-full items-center justify-between gap-2 rounded-md text-left transition hover:bg-[var(--bg)]"
              >
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
              </button>
            ) : (
              <div className="flex items-center justify-between gap-2">
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
              </div>
            )}
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

export type BudgetVarianceRow = {
  id: string;
  name: string;
  budget: number;
  spent: number;
};

const VARIANCE_OVER = "#d4655a";
const VARIANCE_UNDER = "#7ec07a";
const VARIANCE_GRID = "#2f5a3c";
const VARIANCE_MUTED = "#8fb396";

/**
 * Dollars over / under budget per category (sorted by absolute overage).
 * Replaces the old percentage-point share-mix chart.
 */
export function BudgetVarianceChart({
  data,
  emptyLabel = "Nothing to show yet",
  onSelect,
}: {
  data: BudgetVarianceRow[];
  emptyLabel?: string;
  onSelect?: (row: BudgetVarianceRow) => void;
}) {
  const { formatCurrency, formatCompactCurrency } = useMoneyFormat();
  const usable = data.filter((d) => d.budget > 0 || d.spent > 0);

  if (usable.length === 0) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        {emptyLabel}
      </p>
    );
  }

  const ranked = [...usable].sort(
    (a, b) => Math.max(b.budget, b.spent) - Math.max(a.budget, a.spent),
  );
  const top = ranked.slice(0, 8);
  const rest = ranked.slice(8);
  const rows: Array<BudgetVarianceRow & { variance: number }> = [];
  for (const row of top) {
    rows.push({
      ...row,
      variance: Math.round((row.spent - row.budget) * 100) / 100,
    });
  }
  if (rest.length > 0) {
    const budget = rest.reduce((sum, d) => sum + d.budget, 0);
    const spent = rest.reduce((sum, d) => sum + d.spent, 0);
    rows.push({
      id: "__other__",
      name: "Other",
      budget,
      spent,
      variance: Math.round((spent - budget) * 100) / 100,
    });
  }

  rows.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const maxAbs = Math.max(50, ...rows.map((r) => Math.abs(r.variance)));
  const interactive = Boolean(onSelect);
  const chartHeight = Math.max(240, rows.length * 40 + 40);

  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid
            stroke={VARIANCE_GRID}
            strokeDasharray="3 3"
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[-maxAbs, maxAbs]}
            tick={{ fill: VARIANCE_MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: VARIANCE_GRID }}
            tickFormatter={(v: number) => formatCompactCurrency(v)}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={108}
            tick={{ fill: VARIANCE_MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine x={0} stroke={VARIANCE_MUTED} strokeOpacity={0.45} />
          <Tooltip
            cursor={{ fill: "rgba(238, 245, 234, 0.04)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              const over = row.variance > 0;
              return (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm shadow-sm">
                  <p className="font-medium">{row.name}</p>
                  <p className="tabular-nums text-[var(--muted)]">
                    Budget {formatCurrency(row.budget)} · spent{" "}
                    {formatCurrency(row.spent)}
                  </p>
                  <p
                    className="tabular-nums"
                    style={{ color: over ? VARIANCE_OVER : VARIANCE_UNDER }}
                  >
                    {over ? "Over by " : "Under by "}
                    {formatCurrency(Math.abs(row.variance))}
                  </p>
                </div>
              );
            }}
          />
          <Bar
            dataKey="variance"
            name="Over / under budget"
            maxBarSize={18}
            cursor={interactive ? "pointer" : undefined}
            onClick={(entry) => {
              if (!onSelect) return;
              const row = (entry as { payload?: BudgetVarianceRow }).payload;
              if (!row || row.id === "__other__") return;
              onSelect(row);
            }}
          >
            {rows.map((row) => (
              <Cell
                key={row.id}
                fill={row.variance > 0 ? VARIANCE_OVER : VARIANCE_UNDER}
                cursor={interactive && row.id !== "__other__" ? "pointer" : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
