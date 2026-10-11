"use client";

import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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

const TREND = {
  spent: "#d4a857",
  budget: "#8fb396",
  average: "#7a9a6a",
  grid: "#2f5a3c",
  muted: "#8fb396",
} as const;

const LINE_CURSOR = {
  stroke: TREND.muted,
  strokeWidth: 1,
  strokeDasharray: "3 3",
  strokeOpacity: 0.55,
};

export type BudgetTrendPoint = {
  key: string;
  label: string;
  spent: number;
  budget: number;
  average: number;
};

/**
 * Monthly spend vs budget allotment and average — restores the prior
 * actual-vs-pace trend pattern on Budgets (line chart, not over/under bars).
 */
export function BudgetSpendTrendChart({
  data,
  emptyLabel = "Nothing to show yet",
  onSelect,
}: {
  data: BudgetTrendPoint[];
  emptyLabel?: string;
  onSelect?: (point: BudgetTrendPoint) => void;
}) {
  const { formatCompactCurrency, formatCurrency } = useMoneyFormat();
  const hasData = data.some((d) => d.spent !== 0 || d.budget !== 0);

  if (!hasData) {
    return (
      <p className="flex h-72 items-center justify-center text-sm text-[var(--muted)]">
        {emptyLabel}
      </p>
    );
  }

  const interactive = Boolean(onSelect);

  function handleClick(state: {
    activeIndex?: number | string | null;
    activeLabel?: string | number;
  }) {
    if (!onSelect) return;
    const raw = state.activeIndex;
    const index =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw)
          ? Number(raw)
          : -1;
    if (index >= 0 && data[index]) {
      onSelect(data[index]);
      return;
    }
    if (state.activeLabel != null) {
      const byLabel = data.find((d) => d.label === String(state.activeLabel));
      if (byLabel) onSelect(byLabel);
    }
  }

  return (
    <div className={`h-72 w-full ${interactive ? "cursor-pointer" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={handleClick}
        >
          <CartesianGrid stroke={TREND.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: TREND.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: TREND.grid }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: TREND.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCompactCurrency}
            width={48}
          />
          <Tooltip
            cursor={LINE_CURSOR}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const rows = payload.filter(
                (p) =>
                  p.value != null &&
                  p.name !== "Average" &&
                  !(typeof p.value === "number" && Math.abs(p.value) < 0.005),
              );
              if (rows.length === 0) return null;
              return (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm shadow-sm">
                  <p className="mb-1 font-medium">{label}</p>
                  {rows.map((p) => (
                    <p
                      key={String(p.name)}
                      style={{ color: p.color }}
                      className="tabular-nums"
                    >
                      {p.name}: {formatCurrency(p.value as number)}
                    </p>
                  ))}
                </div>
              );
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: TREND.muted, paddingTop: 8 }}
          />
          <Line
            type="monotone"
            dataKey="budget"
            name="Budget"
            stroke={TREND.budget}
            strokeDasharray="6 4"
            strokeWidth={2}
            dot={false}
            connectNulls
            activeDot={false}
          />
          {data.some((d) => d.average > 0) ? (
            <Line
              type="monotone"
              dataKey="average"
              name="Average"
              stroke={TREND.average}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              strokeOpacity={0.85}
              dot={false}
              activeDot={false}
              legendType="plainline"
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="spent"
            name="Actual spend"
            stroke={TREND.spent}
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 0, fill: TREND.spent }}
            connectNulls
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
