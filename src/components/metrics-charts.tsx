"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

export type MetricsPoint = {
  key: string;
  label: string;
  spend: number;
  income: number;
  savings: number;
  balance?: number;
};

type ChartProps = {
  data: MetricsPoint[];
  onSelectPeriod?: (point: MetricsPoint) => void;
  selectedKey?: string | null;
};

const COLORS = {
  spend: "#d4655a",
  income: "#7a9a6a",
  savingsPos: "#7a9a6a",
  savingsNeg: "#d4655a",
  balance: "#d4a857",
  grid: "#3c403a",
  muted: "#9aa396",
  surface: "#2a2b2e",
  selected: "#2c5f2b",
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm shadow-sm">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="tabular-nums">
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
      <p className="mt-1 text-xs text-[var(--muted)]">Click to break down</p>
    </div>
  );
}

function handleChartClick(
  state: {
    activeIndex?: number | string | null | undefined;
    activeLabel?: string | number | undefined;
  },
  data: MetricsPoint[],
  onSelectPeriod?: (point: MetricsPoint) => void,
) {
  if (!onSelectPeriod) return;
  const raw = state.activeIndex;
  const index =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^\d+$/.test(raw)
        ? Number(raw)
        : -1;
  if (index >= 0 && data[index]) {
    onSelectPeriod(data[index]);
    return;
  }
  if (state.activeLabel != null) {
    const byLabel = data.find((d) => d.label === String(state.activeLabel));
    if (byLabel) onSelectPeriod(byLabel);
  }
}

export function SpendIncomeChart({ data, onSelectPeriod, selectedKey }: ChartProps) {
  const hasData = data.some((d) => d.spend > 0 || d.income > 0);

  if (!hasData) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        No activity in this period yet.
      </p>
    );
  }

  return (
    <div className={`h-72 w-full ${onSelectPeriod ? "cursor-pointer" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={(state) => handleChartClick(state, data, onSelectPeriod)}
        >
          <defs>
            <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.income} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COLORS.income} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.spend} stopOpacity={0.22} />
              <stop offset="100%" stopColor={COLORS.spend} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCompactCurrency}
            width={48}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: COLORS.muted, paddingTop: 8 }}
          />
          <Area
            type="monotone"
            dataKey="income"
            name="Income"
            stroke={COLORS.income}
            fill="url(#incomeFill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Area
            type="monotone"
            dataKey="spend"
            name="Spend"
            stroke={selectedKey ? COLORS.selected : COLORS.spend}
            fill="url(#spendFill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SavingsChart({ data, onSelectPeriod, selectedKey }: ChartProps) {
  const hasData = data.some((d) => d.spend > 0 || d.income > 0);

  if (!hasData) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        No savings data in this period yet.
      </p>
    );
  }

  return (
    <div className={`h-72 w-full ${onSelectPeriod ? "cursor-pointer" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={(state) => handleChartClick(state, data, onSelectPeriod)}
        >
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCompactCurrency}
            width={48}
          />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="savings" name="Savings" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((entry) => (
              <Cell
                key={entry.key}
                fill={
                  entry.key === selectedKey
                    ? COLORS.selected
                    : entry.savings >= 0
                      ? COLORS.savingsPos
                      : COLORS.savingsNeg
                }
                cursor="pointer"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BalanceChart({ data, onSelectPeriod, selectedKey }: ChartProps) {
  const series = data.map((d) => ({ ...d, balance: d.balance ?? 0 }));
  const hasData = series.some((d) => d.balance !== 0 || d.spend > 0 || d.income > 0);

  if (!hasData) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        No balance history in this period yet.
      </p>
    );
  }

  return (
    <div className={`h-72 w-full ${onSelectPeriod ? "cursor-pointer" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={series}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={(state) => handleChartClick(state, series, onSelectPeriod)}
        >
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.balance} stopOpacity={0.3} />
              <stop offset="100%" stopColor={COLORS.balance} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: COLORS.grid }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCompactCurrency}
            width={52}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="balance"
            name="Balance"
            stroke={selectedKey ? COLORS.selected : COLORS.balance}
            fill="url(#balanceFill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
